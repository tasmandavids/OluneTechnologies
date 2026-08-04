"use client";

// ============================================================================
//  RippleButton — Aurora Glass V2's everyday button: a tint ripple from the
//  click point, with glass/solid/quiet variants. GlowButton (marketing/hero
//  CTAs) is unaffected — this is for actions inside the admin glass shell.
//  Reuses the admin-rip/admin-sweep keyframes already defined in
//  app/globals.css (.admin-glass block) — no new keyframes needed.
// ============================================================================

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { onRipple } from "./useMicroInteractions";

type Variant = "glass" | "solid" | "quiet";
type Size = "sm" | "md" | "lg";

const SIZES: Record<Size, { height: number; padding: string; radius: number; font: string }> = {
  sm: { height: 28, padding: "0 11px", radius: 9, font: "600 11.5px/1 var(--font-body)" },
  md: { height: 34, padding: "0 14px", radius: 10, font: "600 12.5px/1 var(--font-body)" },
  lg: { height: 42, padding: "0 20px", radius: 13, font: "600 14px/1 var(--font-body)" },
};

const VARIANT_STYLE: Record<Variant, React.CSSProperties> = {
  glass: {
    background: "linear-gradient(148deg, var(--refract), transparent 42%), var(--glass2)",
    border: "1px solid var(--edge)",
    color: "var(--text)",
    backdropFilter: "blur(var(--blur)) saturate(1.9)",
    WebkitBackdropFilter: "blur(var(--blur)) saturate(1.9)",
    boxShadow: "var(--shadow-s), inset 0 1px 0 var(--sheen), inset 0 -1px 0 var(--sheen2), inset 1px 0 0 var(--sheen2)",
  },
  solid: {
    background: "var(--ink, var(--text))",
    color: "var(--base)",
    border: "1px solid transparent",
    boxShadow: "0 8px 20px -12px var(--tg)",
  },
  quiet: {
    background: "transparent",
    color: "var(--muted)",
    border: "1px solid transparent",
  },
};

export interface RippleButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Specular sweep loop — primary action only, one per view. */
  sweep?: boolean;
  /** Click-point tint ripple. */
  ripple?: boolean;
}

export const RippleButton = forwardRef<HTMLButtonElement, RippleButtonProps>(function RippleButton(
  { variant = "glass", size = "md", sweep = false, ripple = true, disabled, onClick, style, className = "", children, ...rest },
  ref,
) {
  const s = SIZES[size];

  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      onClick={(e) => {
        if (ripple && !disabled) onRipple(e);
        onClick?.(e);
      }}
      className={`relative inline-flex items-center justify-center gap-[7px] overflow-hidden transition-transform duration-300 disabled:cursor-not-allowed disabled:opacity-45 ${
        !disabled ? "hover:-translate-y-px active:translate-y-0 active:scale-[.97]" : ""
      } ${className}`}
      style={{
        height: s.height,
        padding: s.padding,
        borderRadius: s.radius,
        font: s.font,
        boxSizing: "border-box",
        ...VARIANT_STYLE[variant],
        ...style,
      }}
      {...rest}
    >
      {sweep && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -translate-x-[130%] bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.4),transparent)] animate-[admin-sweep_4.6s_ease-in-out_infinite]"
        />
      )}
      <span className="relative">{children}</span>
    </button>
  );
});
