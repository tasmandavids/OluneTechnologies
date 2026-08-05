"use client";

import { confirmDialog } from "@/lib/feedback";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { deleteCampaign, publishCampaign } from "@/app/portal/admin/advertising/actions";
import { PLATFORM_META } from "@/lib/advertising/config";
import type { AdCampaign } from "@/lib/advertising/types";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";

function StatusBadge({ status }: { status: AdCampaign["status"] }) {
  const colors: Record<AdCampaign["status"], string> = {
    draft: "bg-slate-100 text-slate-600",
    scheduled: "bg-blue-100 text-blue-700",
    active: "bg-emerald-100 text-emerald-700",
    paused: "bg-amber-100 text-amber-700",
    completed: "bg-indigo-100 text-indigo-700",
    failed: "bg-red-100 text-red-700",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide ${colors[status]}`}>
      {status}
    </span>
  );
}

export function CampaignsPanel({
  campaigns,
  onRefresh,
}: {
  campaigns: AdCampaign[];
  onRefresh: () => void;
}) {
  const t = useTranslations("admin.advertising");
  const tCommon = useTranslations("common");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handlePublish(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await publishCampaign(id);
      if (!res.ok) setError(res.error);
      else onRefresh();
    });
  }

  async function handleDelete(id: string) {
    if (!(await confirmDialog({ title: t("campaigns.deleteConfirm"), destructive: true }))) return;
    startTransition(async () => {
      await deleteCampaign(id);
      onRefresh();
    });
  }

  if (campaigns.length === 0) {
    return (
      <GlassPanel className="!py-16 text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand/10 text-2xl">📣</div>
        <p className="text-sm font-semibold text-ink">{t("campaigns.emptyTitle")}</p>
        <p className="mt-1 text-sm text-muted">{t("campaigns.empty")}</p>
      </GlassPanel>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {campaigns.map((c) => (
        <GlassPanel key={c.id} className="!p-5 transition hover:border-brand/20">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold text-ink">{c.name}</h3>
                <StatusBadge status={c.status} />
                {c.aiGenerated && (
                  <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[0.58rem] font-bold uppercase text-brand">{t("campaigns.aiBadge")}</span>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {c.platforms.map((p) => (
                  <span
                    key={p}
                    className="rounded-full px-2 py-0.5 text-[0.62rem] font-semibold text-white"
                    style={{ background: PLATFORM_META[p].color }}
                  >
                    {PLATFORM_META[p].label}
                  </span>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted">{c.objective}</p>
              {c.headline && <p className="mt-2 text-sm text-ink">{c.headline}</p>}
              {c.publishError && <p className="mt-1 text-xs text-red-600">{c.publishError}</p>}
            </div>
            <div className="flex gap-2">
              {(c.status === "draft" || c.status === "scheduled" || c.status === "failed") && (
                <button
                  type="button"
                  onClick={() => handlePublish(c.id)}
                  disabled={pending}
                  className="rounded-xl bg-brand px-3 py-1.5 text-xs font-bold text-white hover:brightness-105 disabled:opacity-50"
                >
                  {t("campaigns.publish")}
                </button>
              )}
              <button
                type="button"
                onClick={() => handleDelete(c.id)}
                disabled={pending}
                className="rounded-xl border border-[--hair] px-3 py-1.5 text-xs font-semibold text-muted hover:text-red-600 disabled:opacity-50"
              >
                {tCommon("delete")}
              </button>
            </div>
          </div>
        </GlassPanel>
      ))}
    </div>
  );
}
