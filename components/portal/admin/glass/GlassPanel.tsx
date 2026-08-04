// ============================================================================
//  GlassPanel — the reusable frosted-card chrome used throughout the admin
//  glass shell (Today/People/Money). Content inside keeps using solid
//  --surface rows/cards, exactly like the Claude Design import — the glass
//  treatment is the outer panel, not every inner element.
// ============================================================================

import type { ReactNode } from "react";

export function GlassPanel({
  children,
  className = "",
  dark = false,
}: {
  children: ReactNode;
  className?: string;
  /** The Today screen's "Cash in" card uses an inverted, solid --ink panel
   *  instead of glass — this flag reproduces that without a second component. */
  dark?: boolean;
}) {
  if (dark) {
    return (
      <div
        className={`relative overflow-hidden rounded-[22px] p-[18px] ${className}`}
        style={{ background: "var(--ink, var(--text))", color: "var(--base)", boxShadow: "var(--shadow)" }}
      >
        <div
          className="pointer-events-none absolute -right-12 -top-12 h-[190px] w-[190px] rounded-full animate-[admin-halo_9s_ease-in-out_infinite]"
          style={{ background: "radial-gradient(circle, var(--tg), transparent 68%)" }}
        />
        <div className="relative">{children}</div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-[22px] border p-[18px] ${className}`}
      style={{
        background: "linear-gradient(148deg, var(--refract), transparent 42%), var(--glass)",
        borderColor: "var(--edge)",
        backdropFilter: "blur(var(--blur)) saturate(1.85)",
        WebkitBackdropFilter: "blur(var(--blur)) saturate(1.85)",
        boxShadow: "var(--shadow-s), inset 0 1px 0 var(--sheen), inset 0 -1px 0 var(--sheen2), inset 1px 0 0 var(--sheen2)",
      }}
    >
      {children}
    </div>
  );
}
