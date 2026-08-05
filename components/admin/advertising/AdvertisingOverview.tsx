"use client";

import { useTranslations } from "next-intl";
import { PLATFORM_META } from "@/lib/advertising/config";
import type { AdCampaign, SocialConnection } from "@/lib/advertising/types";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";

export function AdvertisingOverview({
  connections,
  campaigns,
}: {
  connections: SocialConnection[];
  campaigns: AdCampaign[];
}) {
  const t = useTranslations("admin.advertising.overview");
  const activeCampaigns = campaigns.filter((c) => c.status === "active").length;
  const draftCampaigns = campaigns.filter((c) => c.status === "draft").length;
  const connectedNames = connections.map((c) => PLATFORM_META[c.platform].label);

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <GlassPanel className="!p-5">
        <p className="text-[0.62rem] font-semibold uppercase tracking-widest text-muted">{t("platforms")}</p>
        <p className="mt-1 text-3xl font-black text-ink">{connections.length}</p>
        <p className="mt-1 truncate text-xs text-muted">
          {connectedNames.length > 0 ? connectedNames.join(" · ") : t("noneConnected")}
        </p>
      </GlassPanel>
      <GlassPanel className="!p-5">
        <p className="text-[0.62rem] font-semibold uppercase tracking-widest text-muted">{t("active")}</p>
        <p className="mt-1 text-3xl font-black text-emerald-600">{activeCampaigns}</p>
        <p className="mt-1 text-xs text-muted">{t("liveCampaigns")}</p>
      </GlassPanel>
      <GlassPanel className="!p-5">
        <p className="text-[0.62rem] font-semibold uppercase tracking-widest text-muted">{t("drafts")}</p>
        <p className="mt-1 text-3xl font-black text-ink">{draftCampaigns}</p>
        <p className="mt-1 text-xs text-muted">{t("readyToPublish")}</p>
      </GlassPanel>
    </div>
  );
}
