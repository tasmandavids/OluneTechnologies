"use client";

import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import type { PlatformStudioSummary } from "@/lib/platform/types";
import {
  updateStudioStatus,
  deleteStudio,
  updateStudioVertical,
  setStudioComped,
  extendStudioTrial,
} from "@/app/platform/studios/actions";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";
import { RippleButton } from "@/components/portal/admin/glass/RippleButton";
import { InitialTile, PlatformPageHeader, Segmented, StatusPill, fieldClass, initialsOf, type PillTone } from "./glass/ui";

const STATUS_TONE: Record<string, PillTone> = { trial: "brand", active: "success", suspended: "danger" };
const PLAN_TONE: Record<string, PillTone> = { trialing: "brand", active: "success", past_due: "danger", canceled: "neutral", comped: "warm" };

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

  function toggleComp(studio: PlatformStudioSummary) {
    const comped = !studio.plan?.comped;
    const reason = comped
      ? (window.prompt(t("plan.compReasonPrompt", { name: studio.name })) ?? "")
      : "";
    // An empty string from Cancel is indistinguishable from an empty answer, so
    // treat both as "don't".
    if (comped && !reason.trim()) return;

    startTransition(async () => {
      const res = await setStudioComped({ studioId: studio.id, comped, reason: reason.trim() });
      if (res.ok) {
        setItems((p) =>
          p.map((s) =>
            s.id === studio.id && s.plan
              ? { ...s, plan: { ...s.plan, comped, status: comped ? "comped" : "trialing" } }
              : s,
          ),
        );
      }
      setStatusMsg(res.ok ? t("updated") : res.error);
      setTimeout(() => setStatusMsg(null), 3000);
    });
  }

  function extendTrial(studio: PlatformStudioSummary) {
    startTransition(async () => {
      const res = await extendStudioTrial({ studioId: studio.id, days: 14 });
      setStatusMsg(res.ok ? t("plan.trialExtended") : res.error);
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

  const counts = {
    all: items.length,
    trial: items.filter((s) => s.status === "trial").length,
    active: items.filter((s) => s.status === "active").length,
    suspended: items.filter((s) => s.status === "suspended").length,
  };
  const th = "px-3 pb-3 pt-4 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-muted";

  return (
    <div className="py-2">
      <PlatformPageHeader
        eyebrow={t("subtitle")}
        title={t("title")}
        actions={
          <>
            {statusMsg && <span className="text-xs text-muted" role="status">{statusMsg}</span>}
            <Segmented
              label={t("title")}
              value={filter}
              onChange={setFilter}
              options={filterKeys.map((f) => ({
                value: f,
                label: (
                  <>
                    {t(`filters.${f}`)} <span className="ml-1 font-medium text-muted">{counts[f]}</span>
                  </>
                ),
              }))}
            />
          </>
        }
      />

      <GlassPanel className="!p-0">
        <motion.div layout className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead>
              <tr className="border-b border-(--hair)">
                <th className={`${th} pl-5`}>{t("tableStudio")}</th>
                <th className={th}>{t("tableOwner")}</th>
                <th className={`${th} text-right`}>{t("tableStudents")}</th>
                <th className={th}>{t("vertical")}</th>
                <th className={th}>{t("plan.column")}</th>
                <th className={th}>{t("tableStatus")}</th>
                <th className={th}>{t("tableJoined")}</th>
                <th className={`${th} pr-5 text-right`}>{t("tableActions")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="border-b border-(--hair) align-top transition-colors last:border-0 hover:bg-(--t1)">
                  <td className="py-3 pl-5 pr-3">
                    <div className="flex items-start gap-3">
                      <InitialTile text={initialsOf(s.name).slice(0, 1)} />
                      <div className="min-w-0">
                        <p className="font-semibold text-ink">{s.name}</p>
                        <p className="text-xs text-muted">
                          {s.slug}.{ROOT}
                          {s.customDomain && ` · ${s.customDomain}`}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          <StatusPill tone={s.stripeConnected ? "success" : "neutral"}>
                            {s.stripeConnected ? t("stripeConnected") : t("stripeNotConnected")}
                          </StatusPill>
                          <StatusPill tone={s.xeroConnected ? "success" : "neutral"}>
                            {s.xeroConnected ? t("xeroConnected") : t("xeroNotConnected")}
                          </StatusPill>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="p-3">
                    <p className="text-ink">{s.ownerName ?? "—"}</p>
                    <p className="text-xs text-muted">{s.ownerEmail ?? ""}</p>
                  </td>
                  <td className="p-3 text-right tabular-nums text-ink">{s.studentCount}</td>
                  <td className="p-3">
                    {verticals.length > 0 ? (
                      <select
                        disabled={pending}
                        value={s.vertical}
                        onChange={(e) => setVertical(s.id, e.target.value)}
                        aria-label={t("vertical")}
                        className={`${fieldClass} !w-auto !py-1.5 text-xs`}
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
                  <td className="p-3">
                    {s.plan ? (
                      <>
                        <p className="font-semibold capitalize text-ink">{s.plan.key}</p>
                        <div className="mt-1">
                          <StatusPill tone={PLAN_TONE[s.plan.status] ?? "neutral"}>
                            {t(`plan.status.${s.plan.status}`)}
                            {s.plan.status === "trialing" && s.plan.trialEndsAt
                              ? ` · ${new Date(s.plan.trialEndsAt).toLocaleDateString(locale)}`
                              : ""}
                          </StatusPill>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <RippleButton size="sm" onClick={() => toggleComp(s)} disabled={pending}>
                            {s.plan.comped ? t("plan.uncomp") : t("plan.comp")}
                          </RippleButton>
                          {s.plan.status !== "active" && !s.plan.comped && (
                            <RippleButton size="sm" onClick={() => extendTrial(s)} disabled={pending}>
                              {t("plan.extend")}
                            </RippleButton>
                          )}
                        </div>
                      </>
                    ) : (
                      // After the 0119 backfill every studio has a row, so a gap
                      // here is a real anomaly rather than an empty state.
                      <StatusPill tone="danger">{t("plan.missing")}</StatusPill>
                    )}
                  </td>
                  <td className="p-3">
                    <StatusPill tone={STATUS_TONE[s.status] ?? "neutral"}>
                      <span className="capitalize">{t.has(`filters.${s.status}`) ? t(`filters.${s.status}`) : s.status}</span>
                    </StatusPill>
                  </td>
                  <td className="whitespace-nowrap p-3 text-muted">{new Date(s.createdAt).toLocaleDateString(locale)}</td>
                  <td className="py-3 pl-3 pr-5">
                    <div className="flex items-center justify-end gap-2">
                      <select
                        disabled={pending}
                        value={s.status}
                        onChange={(e) => setStatus(s.id, e.target.value)}
                        aria-label={t("tableStatus")}
                        className={`${fieldClass} !w-auto !py-1.5 text-xs capitalize`}
                      >
                        <option value="trial">{t("filters.trial")}</option>
                        <option value="active">{t("filters.active")}</option>
                        <option value="suspended">{t("filters.suspended")}</option>
                      </select>
                      <RippleButton size="sm" onClick={() => remove(s)} disabled={pending} style={{ color: "var(--error, #dc2626)" }}>
                        {t("delete")}
                      </RippleButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <p className="p-8 text-center text-sm text-muted">{t("noMatch")}</p>}
        </motion.div>
      </GlassPanel>
    </div>
  );
}
