"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

export function Dialog({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const t = useTranslations("books.common");
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className={`max-h-[92vh] w-full overflow-y-auto rounded-t-[22px] p-6 sm:rounded-[22px] ${wide ? "sm:max-w-4xl" : "sm:max-w-xl"}`} style={{ background: "var(--base, var(--surface))", boxShadow: "var(--shadow)" }}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          <button type="button" onClick={onClose} className="text-xl leading-none text-muted" aria-label={t("close")}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
