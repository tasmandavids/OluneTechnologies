// Shared Supabase auth cookie helpers for middleware + OAuth route handlers.

import { createChunks, isChunkLike, stringToBase64URL } from "@supabase/ssr/dist/module/utils";
import type { CookieOptions } from "@supabase/ssr";
import type { Session } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const BASE64_PREFIX = "base64-";

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

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
  Expires: "0",
  Pragma: "no-cache",
} as const;

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

export function requestHasAuthCookies(request: NextRequest): boolean {
  const storageKey = supabaseAuthStorageKey();
  return request.cookies.getAll().some(
    (c) =>
      isChunkLike(c.name, storageKey) ||
      c.name === `${storageKey}-code-verifier` ||
      c.name === `${storageKey}-user`,
  );
}

/** Write a fresh session onto a response (same encoding/chunking as @supabase/ssr). */
export function writeSessionCookies(
  response: NextResponse,
  request: NextRequest,
  session: Session,
): void {
  const storageKey = supabaseAuthStorageKey();
  const encoded = BASE64_PREFIX + stringToBase64URL(JSON.stringify(session));
  const chunks = createChunks(storageKey, encoded);
  const setOpts = authCookieOptions(request, 400 * 24 * 60 * 60);

  for (const chunk of chunks) {
    response.cookies.set(chunk.name, chunk.value, setOpts);
  }
}

/**
 * OAuth success redirect: purge every stale/orphan chunk, then write the new
 * session on the SAME response object (setAll recreates would drop purges).
 */
export function buildSessionRedirect(
  request: NextRequest,
  redirectUrl: string,
  session: Session,
): NextResponse {
  const response = NextResponse.redirect(redirectUrl, 303);
  purgeAuthCookies(response, request);
  writeSessionCookies(response, request, session);
  for (const [key, value] of Object.entries(NO_STORE_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}
