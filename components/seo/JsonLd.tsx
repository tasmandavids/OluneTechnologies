// ============================================================================
//  components/seo/JsonLd.tsx — renders a JSON-LD <script> tag for structured
//  data. Server component; safe to drop into any page's output.
// ============================================================================

export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
