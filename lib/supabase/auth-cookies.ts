// Shared Supabase auth cookie helpers for middleware + OAuth route handlers.

import {
  createChunks,
  isChunkLike,
  stringToBase64URL,
} from "@supabase/ssr/dist/module/utils";
import type { CookieOptions } from "@supabase/ssr";
import type { Session } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { withAuthCookieDomain } from "@/lib/auth/cookie-domain";

const BASE64_PREFIX = "base64-";

/** `sb-<project-ref>-auth-token` — matches @supabase/ssr / auth-js defaults. */
export function supabaseAuthStorageKey(): string {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0];
  return `sb-${ref}-auth-token`;
}

/**
 * Must apply the same `Domain` the cookie was originally set with (see
 * lib/auth/cookie-domain.ts) — otherwise a clear/rewrite here (Max-Age=0 or a
 * fresh value) creates a SEPARATE host-only cookie of the same name instead of
 * touching the original domain-scoped one. The browser then keeps sending the
 * untouched original on every request: purgeAuthCookies looks like it worked
 * (a 200/302 with Set-Cookie headers) but the poisoned session cookie survives,
 * so every subsequent request re-fails the same way — an infinite redirect
 * loop between /login and the page that required auth. Only reproduces when
 * NEXT_PUBLIC_ROOT_DOMAIN is set (i.e. whenever the studio-subdomain cookie
 * sharing this env var exists for is actually configured — prod/ttest, and any
 * local env that mirrors it).
 */
export function authCookieOptions(request: NextRequest, maxAge: number): CookieOptions {
  return withAuthCookieDomain({
    path: "/",
    sameSite: "lax",
    httpOnly: false,
    maxAge,
    ...(request.nextUrl.protocol === "https:" ? { secure: true } : {}),
  });
}

/** Max chunked session cookies @supabase/ssr may write (0 = `.0`). */
const MAX_AUTH_CHUNKS = 8;

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
  Expires: "0",
  Pragma: "no-cache",
} as const;

/**
 * Tell the browser to delete every Supabase auth cookie variant for this
 * project — unsuffixed single-chunk name AND `.0`…`.N` multi-chunk names.
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

  response.cookies.set(storageKey, "", clear);
  for (let i = 0; i < MAX_AUTH_CHUNKS; i++) {
    response.cookies.set(`${storageKey}.${i}`, "", clear);
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

/** Read session JSON from request cookies — same chunk resolution as @supabase/ssr. */
export function readSessionJsonFromRequest(request: NextRequest): string | null {
  const storageKey = supabaseAuthStorageKey();
  const cookies = request.cookies.getAll();
  const getChunk = (name: string) => cookies.find((c) => c.name === name)?.value ?? null;

  const single = getChunk(storageKey);
  if (single) return single;

  const parts: string[] = [];
  for (let i = 0; ; i++) {
    const chunk = getChunk(`${storageKey}.${i}`);
    if (!chunk) break;
    parts.push(chunk);
  }
  return parts.length > 0 ? parts.join("") : null;
}

/** Write a fresh session onto a response (same encoding/chunking as @supabase/ssr). */
export function writeSessionCookies(
  response: NextResponse,
  request: NextRequest,
  session: Session,
): void {
  const storageKey = supabaseAuthStorageKey();
  // Match auth-js main storage: tokens only (user is not needed for routing).
  const { user: _user, ...main } = session;
  const encoded = BASE64_PREFIX + stringToBase64URL(JSON.stringify(main));
  const chunks = createChunks(storageKey, encoded);
  const setOpts = authCookieOptions(request, 400 * 24 * 60 * 60);

  for (const chunk of chunks) {
    response.cookies.set(chunk.name, chunk.value, setOpts);
  }
}

function applyNoStoreHeaders(response: NextResponse): void {
  for (const [key, value] of Object.entries(NO_STORE_HEADERS)) {
    response.headers.set(key, value);
  }
}

/**
 * OAuth success handoff: purge orphans, write session, return a 200 HTML page
 * that navigates to `redirectUrl`. Safari is more reliable committing Set-Cookie
 * on a 200 document response than on a 303 redirect chain.
 */
export function buildSessionCompleteResponse(
  request: NextRequest,
  redirectUrl: string,
  session: Session,
): NextResponse {
  const response = new NextResponse(
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${redirectUrl}"><title>Signing in…</title><script>location.replace(${JSON.stringify(redirectUrl)})</script></head><body><p>Signing you in…</p></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
  purgeAuthCookies(response, request);
  writeSessionCookies(response, request, session);
  applyNoStoreHeaders(response);
  return response;
}

/** @deprecated Prefer buildSessionCompleteResponse for OAuth callbacks. */
export function buildSessionRedirect(
  request: NextRequest,
  redirectUrl: string,
  session: Session,
): NextResponse {
  return buildSessionCompleteResponse(request, redirectUrl, session);
}
