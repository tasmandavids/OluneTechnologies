// ============================================================================
//  ProviderMark — the brand tile on a connection card.
//
//  Real logos would mean shipping (and licensing) two dozen SVGs for systems
//  that mostly aren't connected yet. A tinted monogram in the provider's brand
//  colour reads as a logo grid at card size and costs nothing to add a new
//  provider to — which is the whole point of the catalog.
// ============================================================================

function monogram(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9 ]/g, " ").trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function ProviderMark({
  name,
  color,
  size = 40,
  dimmed = false,
}: {
  name: string;
  color: string;
  size?: number;
  dimmed?: boolean;
}) {
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-[12px] font-bold tracking-tight"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        color,
        background: `color-mix(in srgb, ${color} 16%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 32%, transparent)`,
        opacity: dimmed ? 0.55 : 1,
      }}
    >
      {monogram(name)}
    </span>
  );
}
