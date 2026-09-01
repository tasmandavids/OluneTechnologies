// ============================================================================
//  middleware.ts — role-based portal routing, Edge runtime.
//  Runs on page routes to:
//    1. Refresh the Supabase session (or clear stale auth cookies).
//    2. On /portal/**, /platform/**, /login, /join, / — enforce auth routing.
//  Row-level access is still enforced in Postgres (RLS); this is just routing.
//
//  Profile data (role, studio_id, account_kind) is read from the JWT claims
//  embedded by custom_access_token_hook — zero DB round-trips per request.
//  Enable the hook in: Supabase Dashboard → Auth → Hooks → Custom Access Token
// ============================================================================

export const runtime = "experimental-edge";

import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { portalHomeForAccount } from "@/lib/account/memberships";
import type { AccountKind } from "@/lib/account/kinds";
import { checkPlatformOperator } from "@/lib/platform/operator-edge";
import { canAccessPortalPath } from "@/lib/portal/office-access";
import { mergeSessionCookies, redirectWithSession, refreshSession } from "@/lib/supabase/middleware";
import { isTenantHost } from "@/lib/tenant-host";
import type { Role } from "@/lib/types";

type ProfileAccess = {
  role: Role;
  studioId: string | null;
  accountKind: AccountKind | null;
};

/** Decode profile fields from the JWT claims set by custom_access_token_hook. */
function profileFromJwt(accessToken: string | undefined): ProfileAccess | null {
  if (!accessToken) return null;
  try {
    const payload = JSON.parse(atob(accessToken.split(".")[1]));
    const role = payload.user_role as Role | undefined;
    if (!role) return null;
    return {
      role,
      studioId: (payload.studio_id as string | null) ?? null,
      accountKind: (payload.account_kind as AccountKind | null) ?? null,
    };
  } catch {
    return null;
  }
}

function resolveHome(profile: ProfileAccess): string {
  return portalHomeForAccount(profile.accountKind, profile.role);
}

function isSafeRelativePath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//");
}

/**
 * Where a signed-in user with no studio belongs. On a studio host (slug
 * subdomain / custom domain) that is the studio's own /join registration —
 * NEVER the create-your-own-studio wizard, which is a platform-site concept.
 */
function noStudioDestination(request: NextRequest): string {
  return isTenantHost(request.headers.get("host")) ? "/join" : "/onboarding";
}

/** DB fallback for sessions that pre-date the JWT claims hook being enabled. */
async function getProfileFromDb(
  supabase: SupabaseClient,
  userId: string,
): Promise<ProfileAccess | null> {
  const { data } = await supabase
    .from("profiles")
    .select("role, studio_id, account_kind")
    .eq("id", userId)
    .single();
  if (!data?.role) return null;
  return {
    role: data.role as Role,
    studioId: (data.studio_id as string | null) ?? null,
    accountKind: (data.account_kind as AccountKind | null) ?? null,
  };
}

/**
 * Resolve the user's access profile. JWT claims are authoritative ONLY when they
 * carry a studio_id; otherwise the token is likely stale (minted at signup,
 * before the user joined/created a studio — profiles.role defaults to 'parent',
 * so the JWT has a role but no studio_id), and we must consult the DB. Trusting
 * a studio-less JWT here short-circuited the DB fallback and caused
 * post-registration redirect loops (/portal/* → /onboarding → /portal/* → …).
 */
async function resolveProfileAccess(
  supabase: SupabaseClient,
  accessToken: string | undefined,
  userId: string,
): Promise<ProfileAccess | null> {
  const fromJwt = profileFromJwt(accessToken);
  if (fromJwt?.studioId) return fromJwt;
  return getProfileFromDb(supabase, userId);
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

  const { supabase, response, user: sessionUser, accessToken } = await refreshSession(request);

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
      const profile = await resolveProfileAccess(supabase, accessToken ?? undefined, user.id);
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
    const profile = await resolveProfileAccess(supabase, accessToken ?? undefined, user.id);

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
