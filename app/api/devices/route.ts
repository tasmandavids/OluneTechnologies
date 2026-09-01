// ============================================================================
//  POST   /api/devices  — register (or refresh) this install's push token
//  DELETE /api/devices  — revoke it on sign-out
//
//  The native app's first authenticated call, and the reference implementation
//  for every route the app will use: it takes its caller from lib/api/caller,
//  so the same handler serves a cookie session from the web and a bearer token
//  from the phone with no branching.
//
//  ── Why POST goes through an RPC
//  Claiming a device is "retire whoever held this token, then take it" — two
//  writes over a unique index. Doing that here would be a read-modify-write
//  that two racing app launches can lose. `register_device_token` (0120) does
//  it in one transaction and is the only thing allowed to move a token between
//  accounts. See the migration for why that needs SECURITY DEFINER.
//
//  ── Why DELETE does not
//  Revoking your own registration is a single update the owner is already
//  permitted to make: RLS narrows it to their rows, and the update guard admits
//  'signed_out' as the one reason a client may claim for itself.
//
//  Auth: Supabase session cookie, or `Authorization: Bearer <access_token>`.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { resolveCaller } from "@/lib/api/caller";
import { boundedText, isDevicePlatform, isExpoPushToken } from "@/lib/notify/push-token";
import { isUuid } from "@/lib/validation/uuid";

export const dynamic = "force-dynamic";

type RegisterBody = {
  token?: unknown;
  platform?: unknown;
  deviceName?: unknown;
  appVersion?: unknown;
  studioId?: unknown;
};

export async function POST(req: NextRequest) {
  const caller = await resolveCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: RegisterBody;
  try {
    body = (await req.json()) as RegisterBody;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  if (!isExpoPushToken(body.token)) {
    return NextResponse.json(
      { error: "token must be an Expo push token, e.g. ExponentPushToken[…]" },
      { status: 400 },
    );
  }
  if (!isDevicePlatform(body.platform)) {
    return NextResponse.json({ error: 'platform must be "ios" or "android"' }, { status: 400 });
  }
  // A bad studio id is a client bug, not something to store and puzzle over
  // later — but it is optional, so absent is fine and present-and-wrong is not.
  const studioId = body.studioId ?? null;
  if (studioId !== null && !(typeof studioId === "string" && isUuid(studioId))) {
    return NextResponse.json({ error: "studioId must be a UUID" }, { status: 400 });
  }

  const { data, error } = await caller.supabase.rpc("register_device_token", {
    p_token: body.token.trim(),
    p_platform: body.platform,
    p_device_name: boundedText(body.deviceName),
    p_app_version: boundedText(body.appVersion, 40),
    p_studio_id: studioId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data as string });
}

export async function DELETE(req: NextRequest) {
  const caller = await resolveCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { token?: unknown };
  try {
    body = (await req.json()) as { token?: unknown };
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  if (!isExpoPushToken(body.token)) {
    return NextResponse.json({ error: "token must be an Expo push token" }, { status: 400 });
  }

  const { error } = await caller.supabase
    .from("device_tokens")
    .update({ revoked_at: new Date().toISOString(), revoked_reason: "signed_out" })
    .eq("token", body.token.trim())
    .is("revoked_at", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Deliberately not 404 when nothing matched. Sign-out runs on a best-effort
  // path in the app and may retry; "the registration is gone" is the outcome
  // the caller wanted either way.
  return NextResponse.json({ ok: true });
}
