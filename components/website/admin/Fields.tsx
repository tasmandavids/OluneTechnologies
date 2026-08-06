"use client";

// ============================================================================
//  components/website/admin/Fields.tsx — the labelled text inputs the
//  customizer's Content tab is built out of. Glass-admin styling, kept in one
//  place so hero copy and per-section copy look identical.
// ============================================================================

import type { CSSProperties } from "react";

const FIELD_STYLE: CSSProperties = {
  borderColor: "var(--hair)",
  background: "var(--surface)",
};

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 text-[0.62rem] uppercase tracking-[0.1em] text-muted">{children}</div>;
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="w-full rounded-xl border px-3 py-2 text-[13px] text-ink outline-none focus:border-[var(--brand)]"
        style={FIELD_STYLE}
      />
    </label>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
}) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
        className="w-full resize-y rounded-xl border px-3 py-2 text-[13px] leading-[1.5] text-ink outline-none focus:border-[var(--brand)]"
        style={FIELD_STYLE}
      />
    </label>
  );
}
