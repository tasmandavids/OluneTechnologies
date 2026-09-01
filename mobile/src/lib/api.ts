// ============================================================================
//  mobile/src/lib/api.ts — calls to the Next.js routes that hold secrets.
//
//  Reads go straight to Supabase (RLS already scopes every parent row). This is
//  only for the things the app cannot do itself: Stripe intents, pass signing,
//  device registration. Those routes accept the same access token via
//  `Authorization: Bearer` — see lib/api/caller.ts on the web.
// ============================================================================

import Constants from "expo-constants";
import { accessToken } from "./supabase";

const BASE = (Constants.expoConfig?.extra?.apiBaseUrl as string) ?? "";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(
  path: string,
  init: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const { auth = true, headers, ...rest } = init;

  const merged: Record<string, string> = {
    "Content-Type": "application/json",
    ...((headers as Record<string, string>) ?? {}),
  };

  if (auth) {
    const token = await accessToken();
    // No token means signed out. Sending the request anyway would return a 401
    // the caller has to interpret; saying so here is unambiguous.
    if (!token) throw new ApiError("Not signed in", 401);
    merged.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${path}`, { ...rest, headers: merged });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    let message = `Request failed (${res.status})`;
    try {
      const parsed = JSON.parse(detail) as { error?: string };
      if (parsed.error) message = parsed.error;
    } catch {
      /* not JSON — keep the generic message rather than dumping HTML */
    }
    throw new ApiError(message, res.status);
  }

  return (await res.json()) as T;
}
