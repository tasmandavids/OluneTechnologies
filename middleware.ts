// ============================================================================
//  middleware.ts — role-based portal routing, Edge runtime.
//  Runs on page routes to:
//    1. Refresh the Supabase session (or clear stale auth cookies).
//    2. On /portal/**, /platform/**, /login, /join, / — enforce auth routing.
//  Row-level access is still enforced in Postgres (RLS); this is just routing.
//
//  Workspace and role are checked against current database rows so revoked
//  memberships and workspace changes do not wait for JWT expiry.
//  Enable the hook in: Supabase Dashboard → Auth → Hooks → Custom Access Token
// ============================================================================

export const runtime = "experimental-edge";

import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { portalHomeForAccount } from "@/lib/account/memberships";
import type { AccountKind } from "@/lib/account/kinds";
import { checkPlatformOperator } from "@/lib/platform/operator-edge";
import { canAccessPortalPath } from "@/lib/portal/office-access";
import { sanitizeNextPath } from "@/lib/auth/oauth";
import { mergeSessionCookies, redirectWithSession, refreshSession } from "@/lib/supabase/middleware";
import { isTenantHost } from "@/lib/tenant-host";
import { userRoleForStudio } from "@/lib/account/studio-role";
import type { Role } from "@/lib/types";

type ProfileAccess = {
  role: Role;
  studioId: string | null;
  accountKind: AccountKind | null;
};

function resolveHome(profile: ProfileAccess): string {
  return portalHomeForAccount(profile.accountKind, profile.role);
}

/**
 * A `?next=` we are willing to redirect to. Same rule as the auth routes — see
 * sanitizeNextPath, which also rejects "/\\evil.example": new URL() normalises
 * the backslash to a slash, so that resolves to a different ORIGIN, not a path.
 */
function isSafeRelativePath(path: string): boolean {
  return sanitizeNextPath(path, "") === path;
}

/**
 * Where a signed-in user with no studio belongs. On a studio host (slug
 * subdomain / custom domain) that is the studio's own /join registration —
 * NEVER the create-your-own-studio wizard, which is a platform-site concept.
 */
function noStudioDestination(request: NextRequest): string {
  return isTenantHost(request.headers.get("host")) ? "/join" : "/onboarding";
}

/** Current workspace permissions; JWTs establish identity, not mutable roles. */
async function getProfileFromDb(
  supabase: SupabaseClient,
  userId: string,
): Promise<ProfileAccess | null> {
  const { data } = await supabase
    .from("profiles")
    .select("role, studio_id, active_studio_id, account_kind")
    .eq("id", userId)
    .single();
  if (!data?.role) return null;
  const studioId = data.active_studio_id ?? data.studio_id;
  const role = studioId ? await userRoleForStudio(supabase, userId, data, studioId) : data.role;
  if (!role) return null;
  return {
    role: role as Role,
    studioId,
    accountKind: (data.account_kind as AccountKind | null) ?? null,
  };
}

export async function middleware(request: NextRequest) {
  // The OAuth callback must complete its PKCE code exchange untouched. Running
  // the session refresh here signs out any stale prior session, and signOut()
  // deletes the in-flight `sb-*-auth-token-code-verifier` cookie — which makes
  // exchangeCodeForSession fail and breaks Google sign-in for returning users.
  // Leave the whole /auth/ handshake alone. (Matcher below also skips it.)
  if (request.nextUrl.pathname.startsWith("/auth/")) {
    return NextResponse.next();
  }

  const { supabase, response, user: sessionUser } = await refreshSession(request);

  const { pathname } = request.nextUrl;
  const inPortal   = pathname === "/portal" || pathname.startsWith("/portal/");
  const inPlatform = pathname === "/platform" || pathname.startsWith("/platform/");
  const inLogin    = pathname === "/login";
  const inJoin     = pathname === "/join";
  const inRoot     = pathname === "/";

  // Session refresh only — no routing rules needed on other public pages.
  if (!inPortal && !inPlatform && !inLogin && !inJoin && !inRoot) {
    return response;
  }

  const user = sessionUser;

  // Platform console — Olune operators only.
  if (inPlatform) {
    if (!user) return redirectWithSession(request, "/login", response, { next: pathname });
    const isOperator = await checkPlatformOperator(supabase, user.id, user.email);
    if (!isOperator) {
      const profile = await getProfileFromDb(supabase, user.id);
      const dest = profile?.studioId ? resolveHome(profile) : noStudioDestination(request);
      return mergeSessionCookies(NextResponse.redirect(new URL(dest, request.url)), response);
    }
    return response;
  }

  // Unauthenticated → can't be in a portal.
  if (inPortal && !user) {
    return redirectWithSession(request, "/login", response, { next: pathname });
  }

  if (user) {
    const profile = await getProfileFromDb(supabase, user.id);

    if (!profile?.studioId) {
      if (inJoin) return response;
      if (inPortal || inLogin || inRoot) {
        return mergeSessionCookies(
          NextResponse.redirect(new URL(noStudioDestination(request), request.url)),
          response,
        );
      }
      return response;
    }

    const home = resolveHome(profile);

    // On /login, bare /portal, or root → send to the intended destination.
    if (inLogin || pathname === "/portal" || pathname === "/portal/" || inRoot) {
      const next = request.nextUrl.searchParams.get("next");
      let dest = home;

      if (next && isSafeRelativePath(next)) {
        if (next.startsWith("/platform")) {
          const isOperator = await checkPlatformOperator(supabase, user.id, user.email);
          dest = isOperator ? next : home;
        } else if (next.startsWith("/portal")) {
          dest = canAccessPortalPath(profile.role, next) ? next : home;
        }
      }

      return mergeSessionCookies(NextResponse.redirect(new URL(dest, request.url)), response);
    }

    // Wandered into another role's portal → bounce to their own.
    if (inPortal && !canAccessPortalPath(profile.role, pathname)) {
      return mergeSessionCookies(NextResponse.redirect(new URL(home, request.url)), response);
    }
  }

  return response;
}

export const config = {
  // Page routes only — skip Next.js internals, static assets, and API routes.
  //
  // `.well-known` is excluded explicitly: Apple requires the association file
  // to be served with no extension and no redirect, and the extension-based
  // exclusions above would not have caught `apple-app-site-association`.
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|api/|auth/|\\.well-known/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|json)$).*)",
  ],
};
