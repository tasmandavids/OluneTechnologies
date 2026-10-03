"use client";

import { useLocale, useTranslations } from "next-intl";
import type { AuditEntry } from "@/lib/platform/types";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";
import { PlatformPageHeader } from "./glass/ui";

export function AuditLogTable({ entries }: { entries: AuditEntry[] }) {
  const t = useTranslations("platform.audit");
  const locale = useLocale();

  const th = "px-3 pb-3 pt-4 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-muted";

  return (
    <div className="py-2">
      <PlatformPageHeader title={t("title")} subtitle={t("subtitle")} />

      <GlassPanel className="!p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-[--hair]">
                <th className={`${th} pl-5`}>{t("when")}</th>
                <th className={th}>{t("operator")}</th>
                <th className={th}>{t("action")}</th>
                <th className={`${th} pr-5`}>{t("target")}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-[--hair] transition-colors last:border-0 hover:bg-[--t1]">
                  <td className="whitespace-nowrap py-3 pl-5 pr-3 tabular-nums text-muted">
                    {new Date(e.createdAt).toLocaleString(locale)}
                  </td>
                  <td className="p-3 text-ink">{e.operatorName ?? "—"}</td>
                  <td className="p-3">
                    <code
                      className="rounded-lg border px-2 py-0.5 font-mono text-xs text-ink"
                      style={{ background: "var(--t1)", borderColor: "var(--hair)" }}
                    >
                      {e.action}
                    </code>
                  </td>
                  <td className="py-3 pl-3 pr-5 text-muted">
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
          {entries.length === 0 && <p className="p-8 text-center text-sm text-muted">{t("noEntries")}</p>}
        </div>
      </GlassPanel>
    </div>
  );
}
