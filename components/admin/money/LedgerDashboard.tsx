"use client";

import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { formatMoney } from "@/lib/currency";
import { formatShortDate } from "@/lib/xero/format";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";

export type LedgerRow = {
  id: string;
  amountCents: number;
  status: string;
  description: string | null;
  createdAt: string;
  invoiceNumber: number | null;
  payerName: string | null;
  runningTotalCents: number;
};

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <GlassPanel className="!p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p
        className="mt-1 tabular-nums tracking-tight text-ink"
        style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "1.9rem" }}
      >
        {value}
      </p>
    </GlassPanel>
  );
}

export function LedgerDashboard({ rows, totalCount, netCents }: { rows: LedgerRow[]; totalCount: number; netCents: number }) {
  const t = useTranslations("admin.money.ledger");
  const tStatus = useTranslations("admin.shared.status");



  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-6xl space-y-6 p-6"
    >
      <header>
        <h1
          className="text-2xl font-black tracking-tight text-ink"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label={t("stats.net")} value={formatMoney(netCents)} />
        <StatCard label={t("stats.count")} value={String(totalCount)} />
      </div>

      {rows.length === 0 ? (
        <GlassPanel className="!p-14 text-center">
          <p className="text-sm font-semibold text-ink">{t("empty.title")}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{t("empty.body")}</p>
        </GlassPanel>
      ) : (
        <GlassPanel className="!p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-[--hair]">
                  {[t("table.date"), t("table.description"), t("table.family"), t("table.amount"), t("table.runningTotal")].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-[0.62rem] font-semibold uppercase tracking-wider text-muted"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isNegative = r.amountCents < 0;
                  const label =
                    r.description ||
                    (r.invoiceNumber
                      ? t("table.invoiceRef", { number: r.invoiceNumber })
                      : t(r.status === "refunded" ? "table.refund" : "table.payment"));
                  return (
                    <tr key={r.id} className="border-b border-[--hair] last:border-0">
                      <td className="px-4 py-3 text-muted">{formatShortDate(r.createdAt.slice(0, 10))}</td>
                      <td className="px-4 py-3 text-ink">
                        {label}
                        {r.status && r.status !== "succeeded" && (
                          <span className="ml-2 text-[0.65rem] font-semibold uppercase tracking-wider text-muted">
                            {(["paid", "sent", "overdue", "draft", "void", "refunded"] as readonly string[]).includes(r.status)
                              ? tStatus(r.status as "paid" | "sent" | "overdue" | "draft" | "void" | "refunded")
                              : r.status}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted">{r.payerName ?? "—"}</td>
                      <td
                        className={`px-4 py-3 text-right font-semibold tabular-nums ${isNegative ? "text-red-600" : "text-ink"}`}
                      >
                        {isNegative ? "−" : ""}
                        {formatMoney(Math.abs(r.amountCents))}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted">
                        {formatMoney(r.runningTotalCents)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </GlassPanel>
      )}
    </motion.div>
  );
}
