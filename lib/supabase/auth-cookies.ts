// Shared Supabase auth cookie helpers for middleware + OAuth route handlers.

import { isChunkLike } from "@supabase/ssr/dist/module/utils";
import type { CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

/** `sb-<project-ref>-auth-token` — matches @supabase/ssr / auth-js defaults. */
export function supabaseAuthStorageKey(): string {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0];
  return `sb-${ref}-auth-token`;
}

export function authCookieOptions(request: NextRequest, maxAge: number): CookieOptions {
  return {
    path: "/",
    sameSite: "lax",
    httpOnly: false,
    maxAge,
    ...(request.nextUrl.protocol === "https:" ? { secure: true } : {}),
  };
}

/** Max chunked session cookies @supabase/ssr may write (0 = unsuffixed). */
const MAX_AUTH_CHUNKS = 8;

/**
 * Tell the browser to delete every Supabase auth cookie variant for this
 * project — including orphaned `.0`/`.1` chunks that may linger after a
 * partial overwrite and poison the next session read.
 */
export function purgeAuthCookies(
  response: NextResponse,
  request: NextRequest,
  opts?: { keepVerifier?: boolean },
): void {
  const storageKey = supabaseAuthStorageKey();
  const clear = authCookieOptions(request, 0);

  for (const cookie of request.cookies.getAll()) {
    if (isChunkLike(cookie.name, storageKey)) {
      response.cookies.set(cookie.name, "", clear);
    }
    if (cookie.name === `${storageKey}-user`) {
      response.cookies.set(cookie.name, "", clear);
    }
    if (!opts?.keepVerifier && cookie.name === `${storageKey}-code-verifier`) {
      response.cookies.set(cookie.name, "", clear);
    }
  }

  for (let i = 0; i < MAX_AUTH_CHUNKS; i++) {
    const name = i === 0 ? storageKey : `${storageKey}.${i}`;
    response.cookies.set(name, "", clear);
  }
  response.cookies.set(`${storageKey}-user`, "", clear);
  if (!opts?.keepVerifier) {
    response.cookies.set(`${storageKey}-code-verifier`, "", clear);
  }
}

/** Remove stale session chunks from the request jar; keep the PKCE verifier. */
export function stripSessionFromRequest(request: NextRequest): void {
  const storageKey = supabaseAuthStorageKey();
  for (const cookie of request.cookies.getAll()) {
    if (isChunkLike(cookie.name, storageKey)) {
      request.cookies.delete(cookie.name);
    }
    if (cookie.name === `${storageKey}-user`) {
      request.cookies.delete(cookie.name);
    }
  }
}
