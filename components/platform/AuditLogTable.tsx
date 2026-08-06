"use client";

import { useLocale, useTranslations } from "next-intl";
import type { AuditEntry } from "@/lib/platform/types";

export function AuditLogTable({ entries }: { entries: AuditEntry[] }) {
  const t = useTranslations("platform.audit");
  const locale = useLocale();

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-black text-ink">{t("title")}</h1>
        <p className="text-sm text-muted">{t("subtitle")}</p>
      </header>

      <div className="box overflow-x-auto rounded-2xl">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-[--hair] text-xs uppercase tracking-widest text-muted">
              <th className="p-4">{t("when")}</th>
              <th className="p-4">{t("operator")}</th>
              <th className="p-4">{t("action")}</th>
              <th className="p-4">{t("target")}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-b border-[--hair]/60 last:border-0">
                <td className="p-4 text-muted whitespace-nowrap">
                  {new Date(e.createdAt).toLocaleString(locale)}
                </td>
                <td className="p-4">{e.operatorName ?? "—"}</td>
                <td className="p-4 font-mono text-xs">{e.action}</td>
                <td className="p-4 text-muted">
                  {e.targetType && (
                    <>
                      {e.targetType}
                      {e.targetId && `: ${e.targetId.slice(0, 8)}…`}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {entries.length === 0 && (
          <p className="p-8 text-center text-sm text-muted">{t("noEntries")}</p>
        )}
      </div>
    </div>
  );
}
