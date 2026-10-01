// Shared bits for the Olune Books screens. Server- and client-safe (no hooks).

import type { ReactNode } from "react";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";
import { formatLedgerMoney } from "@/lib/ledger/money";

export const fieldClass =
  "w-full rounded-xl border px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-muted focus:border-[--brand] disabled:opacity-60";
export const fieldStyle = { background: "var(--surface)", borderColor: "var(--hair)" } as const;
export const smallFieldClass =
  "w-full rounded-lg border px-2.5 py-1.5 text-sm text-ink outline-none transition placeholder:text-muted focus:border-[--brand] disabled:opacity-60";

export const primaryButton = "btn-brand rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50";
export const secondaryButton = "rounded-xl border px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50";
export const secondaryButtonStyle = { borderColor: "var(--hair)" } as const;
export const dangerButton = "rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-50";
export const dangerButtonStyle = { borderColor: "var(--hair)", color: "var(--danger, #c0392b)" } as const;

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="text-xs font-semibold text-muted">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs" style={{ color: "var(--danger, #c0392b)" }} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-ink" style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "1.6rem" }}>
          {title}
        </h1>
        {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatCard({ label, value, sub, href }: { label: string; value: string; sub?: ReactNode; href?: string }) {
  const body = (
    <GlassPanel className="!p-5 h-full">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 tabular-nums tracking-tight text-ink" style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "1.7rem" }}>
        {value}
      </p>
      {sub ? <div className="mt-0.5 text-xs text-muted">{sub}</div> : null}
    </GlassPanel>
  );
  return href ? (
    <a href={href} className="block transition hover:opacity-90">
      {body}
    </a>
  ) : (
    body
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "bad" }) {
  const colors: Record<string, string> = {
    neutral: "var(--muted)",
    good: "var(--success, #1e8e5a)",
    warn: "var(--warning, #b7791f)",
    bad: "var(--danger, #c0392b)",
  };
  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold"
      style={{ color: colors[tone], borderColor: "var(--hair)" }}
    >
      {children}
    </span>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <GlassPanel className="!p-12 text-center">
      <p className="text-sm font-semibold text-ink">{title}</p>
      {body ? <p className="mx-auto mt-1 max-w-md text-sm text-muted">{body}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </GlassPanel>
  );
}

export function Notice({ tone = "neutral", children }: { tone?: "neutral" | "warn" | "bad" | "good"; children: ReactNode }) {
  const border: Record<string, string> = {
    neutral: "var(--hair)",
    warn: "var(--warning, #b7791f)",
    bad: "var(--danger, #c0392b)",
    good: "var(--success, #1e8e5a)",
  };
  return (
    <div className="rounded-xl border px-4 py-3 text-sm text-ink" style={{ borderColor: border[tone], background: "var(--surface)" }}>
      {children}
    </div>
  );
}

/** Money cell: tabular, negatives in brackets the way accountants read them. */
export function Amount({ cents, currency, locale, blankZero = false, strong = false }: { cents: number; currency: string; locale: string; blankZero?: boolean; strong?: boolean }) {
  if (blankZero && cents === 0) return <span className="text-muted">—</span>;
  const text = formatLedgerMoney(Math.abs(cents), currency, locale);
  return <span className={`tabular-nums ${strong ? "font-semibold text-ink" : ""}`}>{cents < 0 ? `(${text})` : text}</span>;
}

export const tableClass = "w-full text-sm";
export const thClass = "whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted";
export const tdClass = "whitespace-nowrap px-3 py-2.5 text-ink";
export const rowStyle = { borderTop: "1px solid var(--hair)" } as const;
