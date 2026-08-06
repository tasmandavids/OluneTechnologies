"use client";

import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { AdCampaign, SocialConnection } from "@/lib/advertising/types";
import { CONNECTIONS_PATH } from "@/lib/integrations/routes";
import { AdComposer } from "./AdComposer";
import { AdvertisingOverview } from "./AdvertisingOverview";
import { CampaignsPanel } from "./CampaignsPanel";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";

type Tab = "create" | "campaigns";

export function AdvertisingHub({
  connections,
  campaigns,
}: {
  connections: SocialConnection[];
  campaigns: AdCampaign[];
}) {
  const t = useTranslations("admin.advertising");
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("create");

  function refresh() {
    router.refresh();
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "create", label: t("tabs.create") },
    { id: "campaigns", label: t("tabs.campaigns") },
  ];

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
      className="mx-auto max-w-6xl space-y-6 p-6"
    >
      <motion.header variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}>
        <h1 className="text-2xl font-black tracking-tight text-ink">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
      </motion.header>

      <motion.div variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}>
        <AdvertisingOverview connections={connections} campaigns={campaigns} />
      </motion.div>

      {/* Connecting Facebook/Instagram/TikTok/Telegram moved to
          Settings → Connections; this page composes and publishes. */}
      <motion.div variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}>
        <GlassPanel className="flex flex-wrap items-center justify-between gap-3 !p-5">
          <p className="text-sm text-muted">
            {connections.length === 0
              ? t("connect.noneConnected")
              : t("connect.connectedCount", { count: connections.length })}
          </p>
          <Link
            href={CONNECTIONS_PATH}
            className="shrink-0 rounded-full border px-4 py-2 text-sm font-semibold text-ink transition hover:bg-[--t2]"
            style={{ borderColor: "var(--ring)" }}
          >
            {t("connect.manageInSettings")}
          </Link>
        </GlassPanel>
      </motion.div>

      <motion.div variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}>
        <GlassPanel className="flex gap-1 overflow-x-auto !p-1">
          {tabs.map((tabItem) => (
            <button
              key={tabItem.id}
              type="button"
              onClick={() => setTab(tabItem.id)}
              className={`shrink-0 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
                tab === tabItem.id ? "bg-brand text-white shadow-sm" : "text-muted hover:text-ink"
              }`}
            >
              {tabItem.label}
            </button>
          ))}
        </GlassPanel>
      </motion.div>

      <AnimatePresence mode="wait">
        {tab === "create" && (
          <motion.div key="create" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <AdComposer connections={connections} onCreated={refresh} />
          </motion.div>
        )}

        {tab === "campaigns" && (
          <motion.div key="campaigns" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <CampaignsPanel campaigns={campaigns} onRefresh={refresh} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
