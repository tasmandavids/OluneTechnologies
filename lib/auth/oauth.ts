/** Google account recovery — shown when Google sign-in fails on the login page. */
export const GOOGLE_ACCOUNT_RECOVERY_URL = "https://accounts.google.com/signin/recovery";

export function sanitizeNextPath(path: string | null | undefined, fallback = "/portal"): string {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return fallback;
  return path;
}
