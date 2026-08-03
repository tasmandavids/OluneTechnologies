"use client";

import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import type { PlatformStudioSummary } from "@/lib/platform/types";
import {
  updateStudioStatus,
  deleteStudio,
  updateStudioVertical,
} from "@/app/platform/studios/actions";

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "olune.app";

export type VerticalOption = { key: string; label: string; status: string };

export function StudiosManager({
  studios,
  verticals = [],
}: {
  studios: PlatformStudioSummary[];
  verticals?: VerticalOption[];
}) {
  const t = useTranslations("platform.studios");
  const locale = useLocale();
  const [items, setItems] = useState(studios);
  const [filter, setFilter] = useState<string>("all");
  const [pending, startTransition] = useTransition();
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const filterKeys = ["all", "trial", "active", "suspended"] as const;
  const filtered = filter === "all" ? items : items.filter((s) => s.status === filter);

  function setStatus(studioId: string, status: string) {
    startTransition(async () => {
      const res = await updateStudioStatus({ studioId, status });
      setStatusMsg(res.ok ? t("updated") : res.error);
      setTimeout(() => setStatusMsg(null), 2000);
    });
  }

  function setVertical(studioId: string, vertical: string) {
    startTransition(async () => {
      const res = await updateStudioVertical({ studioId, vertical });

      // The action refuses on the first attempt when the switch would orphan
      // data, and hands back what would be hidden. Confirm, then retry with the
      // acknowledgement — never auto-acknowledge on the studio's behalf.
      if (!res.ok && "needsAcknowledgement" in res) {
        if (!window.confirm(`${res.error}\n\nSwitch anyway?`)) {
          setStatusMsg(null);
          return;
        }
        const retry = await updateStudioVertical({
          studioId,
          vertical,
          acknowledgeDataLoss: true,
        });
        if (retry.ok) setItems((p) => p.map((s) => (s.id === studioId ? { ...s, vertical } : s)));
        setStatusMsg(retry.ok ? t("updated") : retry.error);
        setTimeout(() => setStatusMsg(null), 3000);
        return;
      }

      if (res.ok) setItems((p) => p.map((s) => (s.id === studioId ? { ...s, vertical } : s)));
      setStatusMsg(res.ok ? t("updated") : res.error);
      setTimeout(() => setStatusMsg(null), 3000);
    });
  }

  function remove(studio: PlatformStudioSummary) {
    const typed = window.prompt(t("confirmDelete", { name: studio.name }));
    if (typed !== studio.name) return;
    startTransition(async () => {
      const res = await deleteStudio({ studioId: studio.id });
      if (res.ok) {
        setItems((prev) => prev.filter((s) => s.id !== studio.id));
      }
      setStatusMsg(res.ok ? t("deleted") : res.error);
      setTimeout(() => setStatusMsg(null), 2500);
    });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-black text-ink">{t("title")}</h1>
        <p className="text-sm text-muted">{t("subtitle")}</p>
      </header>

      <div className="flex flex-wrap gap-2">
        {filterKeys.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors ${
              filter === f ? "bg-brand text-white" : "border border-[--hair] text-muted hover:text-ink"
            }`}
          >
            {t(`filters.${f}`)}
          </button>
        ))}
        {statusMsg && <span className="self-center text-xs text-muted">{statusMsg}</span>}
      </div>

      <motion.div layout className="overflow-x-auto rounded-2xl border border-[--hair] bg-surface">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-[--hair] text-xs uppercase tracking-widest text-muted">
              <th className="p-4">{t("tableStudio")}</th>
              <th className="p-4">{t("tableOwner")}</th>
              <th className="p-4">{t("tableStudents")}</th>
              <th className="p-4">Vertical</th>
              <th className="p-4">{t("tableStatus")}</th>
              <th className="p-4">{t("tableJoined")}</th>
              <th className="p-4">{t("tableActions")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id} className="border-b border-[--hair]/60 last:border-0">
                <td className="p-4">
                  <p className="font-semibold text-ink">{s.name}</p>
                  <p className="text-xs text-muted">
                    {s.slug}.{ROOT}
                    {s.customDomain && ` · ${s.customDomain}`}
                  </p>
                  <div className="mt-1 flex gap-1.5">
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide ${
                        s.stripeConnected
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-base text-muted"
                      }`}
                    >
                      Stripe {s.stripeConnected ? "connected" : "not connected"}
                    </span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide ${
                        s.xeroConnected ? "bg-emerald-100 text-emerald-700" : "bg-base text-muted"
                      }`}
                    >
                      Xero {s.xeroConnected ? "connected" : "not connected"}
                    </span>
                  </div>
                </td>
                <td className="p-4">
                  <p className="text-ink">{s.ownerName ?? "—"}</p>
                  <p className="text-xs text-muted">{s.ownerEmail ?? ""}</p>
                </td>
                <td className="p-4 text-ink">{s.studentCount}</td>
                <td className="p-4">
                  {verticals.length > 0 ? (
                    <select
                      disabled={pending}
                      value={s.vertical}
                      onChange={(e) => setVertical(s.id, e.target.value)}
                      className="rounded-lg border border-[--hair] bg-base px-2 py-1 text-xs"
                    >
                      {/* A studio may sit on a vertical that has since been
                          hidden; keep it selectable so the value is not
                          silently rewritten by the picker. */}
                      {!verticals.some((v) => v.key === s.vertical) && (
                        <option value={s.vertical}>{s.vertical}</option>
                      )}
                      {verticals.map((v) => (
                        <option key={v.key} value={v.key}>
                          {v.label}
                          {v.status === "beta" ? " (beta)" : ""}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-xs text-muted">{s.vertical}</span>
                  )}
                </td>
                <td className="p-4">
                  <span className="rounded-full bg-base px-2 py-0.5 text-[0.65rem] uppercase tracking-wide">
                    {s.status}
                  </span>
                </td>
                <td className="p-4 text-muted">
                  {new Date(s.createdAt).toLocaleDateString(locale)}
                </td>
                <td className="p-4">
                  <div className="flex items-center gap-2">
                    <select
                      disabled={pending}
                      value={s.status}
                      onChange={(e) => setStatus(s.id, e.target.value)}
                      className="rounded-lg border border-[--hair] bg-base px-2 py-1 text-xs"
                    >
                      <option value="trial">{t("filters.trial")}</option>
                      <option value="active">{t("filters.active")}</option>
                      <option value="suspended">{t("filters.suspended")}</option>
                    </select>
                    <button
                      onClick={() => remove(s)}
                      disabled={pending}
                      className="rounded-full border border-[--hair] px-3 py-1 text-xs font-bold uppercase text-red-600 hover:border-red-500"
                    >
                      {t("delete")}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="p-8 text-center text-sm text-muted">{t("noMatch")}</p>
        )}
      </motion.div>
    </div>
  );
}
