// ============================================================================
//  Small shared pieces for the operator console's Aurora Glass pages, so the
//  eleven screens use one header, one pill, one field style and one segmented
//  control instead of each restyling its own. Panels and buttons come
//  straight from the studio portal's glass kit (GlassPanel, RippleButton).
// ============================================================================

import type { ReactNode } from "react";

/** Page header: tiny uppercase eyebrow, display title, muted subtitle, actions on the right. */
export function PlatformPageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-[22px] mt-3.5 flex flex-wrap items-end justify-between gap-5">
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-2.5 text-[9.5px] font-semibold uppercase tracking-[0.2em] text-muted">{eyebrow}</div>
        )}
        <h1 className="font-display text-[34px] font-medium leading-[1.03] tracking-tight text-ink md:text-[42px]">{title}</h1>
        {subtitle && <p className="mt-2 max-w-[60ch] text-[14.5px] leading-[1.5] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </header>
  );
}

/** Uppercase section label used above lists and inside panels. */
export function SectionLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={`text-[10px] font-semibold uppercase tracking-[0.16em] text-muted ${className}`}>{children}</h2>
  );
}

export type PillTone = "brand" | "success" | "danger" | "warm" | "neutral";

const TONE_DOT: Record<PillTone, string> = {
  brand: "var(--brand)",
  success: "var(--success, #16a34a)",
  danger: "var(--error, #dc2626)",
  warm: "#f2b788",
  neutral: "var(--muted)",
};

/** Status pill: a coloured dot plus a word, so state never relies on colour alone. */
export function StatusPill({ tone = "neutral", children }: { tone?: PillTone; children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11.5px] font-semibold text-ink"
      style={{ background: "var(--t1)", borderColor: "var(--hair)" }}
    >
      <span className="h-[7px] w-[7px] rounded-full" style={{ background: TONE_DOT[tone] }} />
      {children}
    </span>
  );
}

/** Tailwind classes for inputs, selects and textareas on glass. */
export const fieldClass =
  "w-full rounded-xl border border-(--hair) bg-(--glass2) px-3 py-2 text-sm text-ink outline-none transition focus:border-(--tb) focus:bg-surface";

/** Pill-shaped segmented control (filters, thread status). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  disabled,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex flex-wrap gap-1 rounded-full border p-1"
      style={{
        borderColor: "var(--edge)",
        background: "var(--glass2)",
        backdropFilter: "blur(var(--blur))",
        WebkitBackdropFilter: "blur(var(--blur))",
        boxShadow: "var(--shadow-s), inset 0 1px 0 var(--sheen)",
      }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className="h-8 rounded-full border px-3.5 text-[12.5px] font-semibold capitalize transition disabled:opacity-50"
            style={{
              borderColor: on ? "var(--tb)" : "transparent",
              background: on ? "var(--surface)" : "transparent",
              color: on ? "var(--text)" : "var(--muted)",
              boxShadow: on ? "0 6px 16px -10px var(--tg)" : "none",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** On/off switch with a real role="switch". */
export function GlassSwitch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative h-7 w-[46px] shrink-0 rounded-full border transition disabled:opacity-50"
      style={{
        borderColor: checked ? "transparent" : "var(--ring)",
        background: checked ? "var(--brand)" : "var(--glass2)",
        boxShadow: checked ? "0 6px 16px -8px var(--tg)" : "none",
      }}
    >
      <span
        className="absolute top-[3px] h-5 w-5 rounded-full bg-white transition-[left] duration-200"
        style={{ left: checked ? 21 : 3, boxShadow: "0 1px 3px rgba(0,0,0,.25)" }}
      />
    </button>
  );
}

/** Initial tile in the brand gradient (studios, owners). */
export function InitialTile({ text, size = 34 }: { text: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center font-display font-semibold text-white"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size / 3),
        fontSize: Math.round(size * 0.4),
        background: "linear-gradient(150deg, var(--tg), var(--brand) 55%, var(--brand-deep))",
      }}
    >
      {text}
    </span>
  );
}

export function initialsOf(name: string | null | undefined, fallback = "?") {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}
