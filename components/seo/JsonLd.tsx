// ============================================================================
//  components/seo/JsonLd.tsx — renders a JSON-LD <script> tag for structured
//  data. Server component; safe to drop into any page's output.
//
//  The payload is escaped, not just stringified: these tags carry studio-admin
//  free text onto a public page. See lib/seo/json-ld.ts for why.
// ============================================================================

import { escapeJsonForScript } from "@/lib/seo/json-ld";

export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: escapeJsonForScript(data) }}
    />
  );
}
