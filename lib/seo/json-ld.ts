// ============================================================================
//  Escaping for JSON-LD payloads embedded in a <script> tag.
//
//  Lives in lib/ rather than beside the component so it can be unit-tested:
//  the harness is node-only and cannot parse JSX. See tests/jsonld-escape.
// ============================================================================

// Written as \u escapes rather than literal characters: U+2028 and U+2029 are
// invisible in an editor, and a "blank-looking" character class is the kind of
// thing a later edit silently deletes.
const SCRIPT_UNSAFE = /[<>&\u2028\u2029]/g;

const SCRIPT_ESCAPES: Record<string, string> = {
  "<": "\\u003c",
  ">": "\\u003e",
  "&": "\\u0026",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
};

/**
 * Escape a JSON payload for embedding inside a <script> element.
 *
 * JSON.stringify does NOT escape `<`, so a studio-controlled string containing
 * `</script>` closes the tag early and everything after it parses as HTML —
 * stored XSS on that studio's public homepage, aimed at the families visiting
 * it. The fields reaching this function (studio name, tagline, contact email,
 * region label) are all free text a studio admin types into Settings, so the
 * payload is never trustworthy just because it is our own object.
 *
 * `<` and `>` cover tag breakout; `&` keeps entities from being re-interpreted;
 * U+2028/U+2029 are legal in JSON but are line terminators in JavaScript and
 * break the parse. Every replacement is a \u escape that is still valid JSON,
 * so the structured data a crawler reads is equivalent.
 */
export function escapeJsonForScript(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(SCRIPT_UNSAFE, (c) => SCRIPT_ESCAPES[c]);
}
