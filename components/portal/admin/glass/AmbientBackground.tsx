// ============================================================================
//  AmbientBackground — direct port of the design system's AuroraField
//  (components/surfaces/AuroraField.jsx in the Claude Design "Studio
//  Settings" bundle): same blob geometry/weighting, blur(70px), grain
//  texture, and auroraDrift/auroraBreathe timing. Pure decoration
//  (aria-hidden, pointer-events: none). Opacity is controlled by --amb
//  (Appearance panel's "Ambience" slider); colour by --a1/--a2/--a3.
// ============================================================================

const BLOBS = [
  { top: "2%", left: "-6%", w: "46%", h: "52%", color: "var(--a1)", delay: "0s", durMult: 1 },
  { top: "24%", left: "52%", w: "54%", h: "60%", color: "var(--a2)", delay: "-8s", durMult: 1.25 },
  { top: "58%", left: "12%", w: "44%", h: "48%", color: "var(--a3)", delay: "-16s", durMult: 0.85 },
] as const;

export function AmbientBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" style={{ opacity: "var(--amb)" }}>
      <div className="absolute -inset-[20%]" style={{ filter: "blur(70px)" }}>
        {BLOBS.map((b, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              top: b.top,
              left: b.left,
              width: b.w,
              height: b.h,
              background: `radial-gradient(circle at 50% 50%, ${b.color}, transparent 70%)`,
              animation: `auroraDrift calc(var(--dur-drift) * ${b.durMult}) ease-in-out infinite, auroraBreathe var(--dur-breathe) ease-in-out infinite`,
              animationDelay: `${b.delay}, ${b.delay}`,
            }}
          />
        ))}
      </div>
      <div
        className="absolute inset-0"
        style={{
          opacity: "var(--grain)",
          backgroundImage: "radial-gradient(rgba(10,10,10,.5) .5px, transparent .5px)",
          backgroundSize: "3px 3px",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(120% 90% at 50% 0%, transparent 40%, rgba(10,10,10,1) 160%)",
          opacity: "var(--vignette)",
        }}
      />
    </div>
  );
}
