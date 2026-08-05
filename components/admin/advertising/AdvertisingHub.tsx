"use client";

import { confirmDialog } from "@/lib/feedback";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { disconnectSocialPlatform } from "@/app/portal/admin/advertising/actions";
import { PLATFORM_META } from "@/lib/advertising/config";
import type { AdCampaign, SocialConnection, SocialPlatform } from "@/lib/advertising/types";
import { AdComposer } from "./AdComposer";
import { AdvertisingOverview } from "./AdvertisingOverview";
import { CampaignsPanel } from "./CampaignsPanel";
import { ConnectHub } from "./ConnectHub";

type Tab = "connect" | "create" | "campaigns";

export function AdvertisingHub({
  connections,
  campaigns,
  metaConfigured,
  tiktokConfigured,
  bannerError,
  bannerConnected,
}: {
  connections: SocialConnection[];
  campaigns: AdCampaign[];
  metaConfigured: boolean;
  tiktokConfigured: boolean;
  bannerError: string | null;
  bannerConnected: string | null;
}) {
  const t = useTranslations("admin.advertising");
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(connections.length === 0 ? "connect" : "create");
  const [actionError, setActionError] = useState<string | null>(null);
  const [, startDisconnect] = useTransition();

  function refresh() {
    router.refresh();
  }

  async function handleDisconnect(platform: SocialPlatform) {
    if (!(await confirmDialog({ title: t("disconnectConfirm", { platform: PLATFORM_META[platform].label }), destructive: true }))) return;
    setActionError(null);
    startDisconnect(async () => {
      const res = await disconnectSocialPlatform(platform);
      if (!res.ok) setActionError(res.error);
      else refresh();
    });
  }

  const displayError = bannerError ?? actionError;

  const tabs: { id: Tab; label: string }[] = [
    { id: "connect", label: t("tabs.connect") },
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

      {(displayError || bannerConnected) && (
        <motion.div variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}>
          {bannerConnected && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {bannerConnected === "meta"
                ? t("metaConnected")
                : bannerConnected === "telegram"
                  ? t("telegramConnected")
                  : t("platformConnected", {
                      platform: `${bannerConnected.charAt(0).toUpperCase()}${bannerConnected.slice(1)}`,
                    })}
            </div>
          )}
          {displayError && (
            <div className={`rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 ${bannerConnected ? "mt-2" : ""}`}>
              {displayError}
            </div>
          )}
        </motion.div>
      )}

      <motion.div
        variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
        className="flex gap-1 overflow-x-auto rounded-xl border border-[--hair] bg-surface p-1"
      >
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
      </motion.div>

      <AnimatePresence mode="wait">
        {tab === "connect" && (
          <motion.div key="connect" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <ConnectHub
              connections={connections}
              metaConfigured={metaConfigured}
              tiktokConfigured={tiktokConfigured}
              onDisconnect={handleDisconnect}
              onRefresh={refresh}
            />
          </motion.div>
        )}

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
