/** Google account recovery — shown when Google sign-in fails on the login page. */
export const GOOGLE_ACCOUNT_RECOVERY_URL = "https://accounts.google.com/signin/recovery";

/** CR, LF, NUL, tab and friends — never legal in a path we are about to navigate to. */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * Reduce a caller-supplied `?next=` to a same-origin path, or fall back.
 *
 * Every post-sign-in redirect runs through here — the OAuth start, the OAuth
 * callback, and the email + password form. `next` is attacker-controlled (it is
 * just a query param on a public /login URL), so anything that is not a plain
 * absolute path is dropped:
 *
 *   - "http://127.0.0.1:3000/portal", "https://evil.example/x" — an absolute
 *     URL navigates the freshly signed-in user off this origin entirely. On a
 *     live studio site that strands them on a dead localhost tab; from a
 *     crafted link it hands them to someone else's page straight out of our
 *     login form.
 *   - "//evil.example/x" — protocol-relative, same effect.
 *   - "/\evil.example/x" — browsers normalise the backslash to "/", so this is
 *     protocol-relative too and a bare startsWith("//") check misses it.
 *   - anything carrying a control character, which can split a Location header
 *     when the value is echoed back server-side.
 */
export function sanitizeNextPath(path: string | null | undefined, fallback = "/portal"): string {
  if (!path || CONTROL_CHARS.test(path)) return fallback;
  // Browsers treat backslashes in the authority position as slashes.
  const normalized = path.replace(/\\/g, "/");
  if (!normalized.startsWith("/") || normalized.startsWith("//")) return fallback;
  return path;
}
