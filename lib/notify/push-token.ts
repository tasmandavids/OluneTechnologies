// ============================================================================
//  lib/notify/push-token.ts
//
//  PURE validation for Expo push tokens — no IO, fully unit-testable.
//
//  Kept out of providers.ts so the registration route can reject a malformed
//  token at the door without importing the whole delivery layer (and its
//  service-role dependencies) into a request path.
//
//  The point of validating here is not security — a caller can only register a
//  token against their own account either way. It is that an unvalidated token
//  is stored, then fails at Expo hours later, and the parent's first missed
//  notification is the first anyone hears about it.
// ============================================================================

/**
 * Expo issues both spellings. `ExponentPushToken[…]` is what current SDKs
 * return; `ExpoPushToken[…]` appears in older projects and Expo still accepts
 * it, so rejecting it would strand those installs.
 */
const EXPO_PUSH_TOKEN = /^Expo(nent)?PushToken\[[^\s[\]]+\]$/;

export function isExpoPushToken(value: unknown): value is string {
  return typeof value === "string" && EXPO_PUSH_TOKEN.test(value.trim());
}

export type DevicePlatform = "ios" | "android";

export function isDevicePlatform(value: unknown): value is DevicePlatform {
  return value === "ios" || value === "android";
}

/**
 * Trim a free-text field to something a diagnostics column can hold, or null.
 *
 * `device_name` and `app_version` come straight from the client and exist only
 * to answer "which phone, which build" — so they are bounded rather than
 * validated. An empty string becomes null so the RPC's coalesce doesn't
 * overwrite a real earlier value with a blank one.
 */
export function boundedText(value: unknown, max = 120): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}
