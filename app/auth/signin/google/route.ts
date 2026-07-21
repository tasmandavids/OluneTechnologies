import { NextRequest, NextResponse } from "next/server";
import { sanitizeNextPath } from "@/lib/auth/oauth";
import { mergeSessionCookies } from "@/lib/supabase/middleware";
import { createServerClient } from "@supabase/ssr";
import { purgeAuthCookies } from "@/lib/supabase/auth-cookies";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Server-initiated Google OAuth — see comments in prior revisions for Safari/ITP context.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const origin = url.origin;
  const next = sanitizeNextPath(url.searchParams.get("next"));

  const loginOnError = `${origin}/login?error=auth_callback_error&next=${encodeURIComponent(next)}`;

  let response = NextResponse.redirect(origin);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll(cookiesToSet, cacheHeaders) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.redirect(origin);
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, {
              ...options,
              ...(request.nextUrl.protocol === "https:" ? { secure: true } : {}),
            });
          });
          if (cacheHeaders) {
            for (const [key, value] of Object.entries(cacheHeaders)) {
              response.headers.set(key, value);
            }
          }
        },
      },
      auth: { autoRefreshToken: false },
    },
  );

  purgeAuthCookies(response, request);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      queryParams: { prompt: "select_account" },
      skipBrowserRedirect: true,
    },
  });

  if (error || !data?.url) {
    return NextResponse.redirect(loginOnError);
  }

  const providerRedirect = NextResponse.redirect(data.url);
  return mergeSessionCookies(providerRedirect, response);
}
