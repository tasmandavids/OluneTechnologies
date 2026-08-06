"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { PLATFORM_META } from "@/lib/advertising/config";
import type { SocialConnection, SocialPlatform } from "@/lib/advertising/types";
import { TelegramWizard } from "./TelegramWizard";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";

const PLATFORM_ICONS: Record<SocialPlatform, ReactNode> = {
  facebook: (
    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  ),
  instagram: (
    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  ),
  telegram: (
    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  ),
  tiktok: (
    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </svg>
  ),
};

function ConnectionStatus({ connected }: { connected: boolean }) {
  const t = useTranslations("admin.advertising.social");
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide ${
      connected ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
    }`}>
      <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-500" : "bg-slate-400"}`} />
      {connected ? t("connected") : t("notConnected")}
    </span>
  );
}

function MetaConnectCard({
  fbConn,
  igConn,
  metaConfigured,
  onDisconnect,
}: {
  fbConn?: SocialConnection;
  igConn?: SocialConnection;
  metaConfigured: boolean;
  onDisconnect: (p: SocialPlatform) => void;
}) {
  const t = useTranslations("admin.advertising");
  const connected = Boolean(fbConn || igConn);

  return (
    <GlassPanel className="relative overflow-hidden !p-6">
      <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br from-[#1877F2]/10 to-[#E4405F]/10" />
      <div className="relative">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex -space-x-2">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#1877F2] text-white shadow-md">
              {PLATFORM_ICONS.facebook}
            </span>
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-[#f09433] via-[#e6683c] to-[#bc1888] text-white shadow-md">
              {PLATFORM_ICONS.instagram}
            </span>
          </div>
          <ConnectionStatus connected={connected} />
        </div>
        <h3 className="text-lg font-black text-ink">{t("connect.metaTitle")}</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted">{t("connect.metaDescription")}</p>

        {connected ? (
          <div className="mt-5 space-y-3">
            {fbConn && (
              <div className="box flex items-center justify-between rounded-xl px-4 py-3">
                <div>
                  <p className="text-xs font-bold text-ink">Facebook</p>
                  <p className="truncate text-xs text-muted">{fbConn.accountName ?? fbConn.accountId}</p>
                </div>
                <button type="button" onClick={() => onDisconnect("facebook")} className="text-xs font-semibold text-red-600 hover:underline">
                  {t("social.disconnect")}
                </button>
              </div>
            )}
            {igConn ? (
              <div className="box flex items-center justify-between rounded-xl px-4 py-3">
                <div>
                  <p className="text-xs font-bold text-ink">Instagram</p>
                  <p className="truncate text-xs text-muted">{igConn.accountName ?? igConn.accountId}</p>
                </div>
                <button type="button" onClick={() => onDisconnect("instagram")} className="text-xs font-semibold text-red-600 hover:underline">
                  {t("social.disconnect")}
                </button>
              </div>
            ) : (
              <p className="text-xs text-amber-700">{t("connect.noInstagram")}</p>
            )}
          </div>
        ) : metaConfigured ? (
          <a
            href={PLATFORM_META.facebook.connectPath}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#1877F2] to-[#E4405F] px-5 py-3 text-sm font-bold text-white shadow-md transition hover:brightness-105"
          >
            {t("connect.metaButton")}
          </a>
        ) : (
          <p className="mt-4 text-xs text-muted">{t("social.oauthNotConfigured")}</p>
        )}
      </div>
    </GlassPanel>
  );
}

function TelegramConnectCard({
  conn,
  onConnect,
  onDisconnect,
}: {
  conn?: SocialConnection;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const t = useTranslations("admin.advertising");
  const connected = Boolean(conn);

  return (
    <GlassPanel className="relative overflow-hidden !p-6">
      <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-[#26A5E4]/10" />
      <div className="relative">
        <div className="mb-4 flex items-start justify-between gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#26A5E4] text-white shadow-md">
            {PLATFORM_ICONS.telegram}
          </span>
          <ConnectionStatus connected={connected} />
        </div>
        <h3 className="text-lg font-black text-ink">{t("connect.telegramTitle")}</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted">{t("connect.telegramDescription")}</p>

        {connected ? (
          <div className="box mt-5 flex items-center justify-between rounded-xl px-4 py-3">
            <div>
              <p className="text-xs font-bold text-ink">{conn?.accountName}</p>
              <p className="text-[0.65rem] text-muted">{t("connect.telegramChannel")}</p>
            </div>
            <button type="button" onClick={onDisconnect} className="text-xs font-semibold text-red-600 hover:underline">
              {t("social.disconnect")}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onConnect}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#26A5E4] px-5 py-3 text-sm font-bold text-white shadow-md transition hover:brightness-105"
          >
            {t("connect.telegramButton")}
          </button>
        )}
      </div>
    </GlassPanel>
  );
}

function TiktokConnectCard({
  conn,
  tiktokConfigured,
  onDisconnect,
}: {
  conn?: SocialConnection;
  tiktokConfigured: boolean;
  onDisconnect: () => void;
}) {
  const t = useTranslations("admin.advertising");
  const connected = Boolean(conn);

  return (
    <GlassPanel className="!p-6 opacity-90">
      <div className="mb-4 flex items-start justify-between gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-black text-white shadow-md">
          {PLATFORM_ICONS.tiktok}
        </span>
        <ConnectionStatus connected={connected} />
      </div>
      <h3 className="text-lg font-black text-ink">{PLATFORM_META.tiktok.label}</h3>
      <p className="mt-1 text-sm text-muted">{PLATFORM_META.tiktok.description}</p>
      {connected ? (
        <div className="box mt-5 flex items-center justify-between rounded-xl px-4 py-3">
          <p className="truncate text-xs text-ink">{conn?.accountName ?? conn?.accountId}</p>
          <button type="button" onClick={onDisconnect} className="text-xs font-semibold text-red-600 hover:underline">
            {t("social.disconnect")}
          </button>
        </div>
      ) : tiktokConfigured ? (
        <a href={PLATFORM_META.tiktok.connectPath} className="mt-5 inline-flex rounded-xl bg-black px-5 py-3 text-sm font-bold text-white hover:brightness-110">
          {t("social.connect", { platform: "TikTok" })}
        </a>
      ) : (
        <p className="mt-4 text-xs text-muted">{t("social.oauthNotConfigured")}</p>
      )}
    </GlassPanel>
  );
}

export function ConnectHub({
  connections,
  metaConfigured,
  tiktokConfigured,
  onDisconnect,
  onRefresh,
}: {
  connections: SocialConnection[];
  metaConfigured: boolean;
  tiktokConfigured: boolean;
  onDisconnect: (p: SocialPlatform) => void;
  onRefresh: () => void;
}) {
  const t = useTranslations("admin.advertising");
  const [telegramOpen, setTelegramOpen] = useState(false);
  const connMap = new Map(connections.map((c) => [c.platform, c]));
  const connectedCount = connections.length;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-brand/20 bg-gradient-to-br from-brand/5 to-transparent p-5">
        <p className="text-sm font-semibold text-ink">
          {connectedCount === 0
            ? t("connect.getStarted")
            : t("connect.connectedCount", { count: connectedCount })}
        </p>
        <p className="mt-1 text-xs text-muted">{t("connect.getStartedHint")}</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <MetaConnectCard
          fbConn={connMap.get("facebook")}
          igConn={connMap.get("instagram")}
          metaConfigured={metaConfigured}
          onDisconnect={onDisconnect}
        />
        <TelegramConnectCard
          conn={connMap.get("telegram")}
          onConnect={() => setTelegramOpen(true)}
          onDisconnect={() => onDisconnect("telegram")}
        />
      </div>

      <details
        className="group rounded-[22px] border"
        style={{
          background: "linear-gradient(148deg, var(--refract), transparent 42%), var(--glass)",
          borderColor: "var(--edge)",
          backdropFilter: "blur(var(--blur)) saturate(1.85)",
          WebkitBackdropFilter: "blur(var(--blur)) saturate(1.85)",
          boxShadow: "var(--shadow-s), inset 0 1px 0 var(--sheen), inset 0 -1px 0 var(--sheen2), inset 1px 0 0 var(--sheen2)",
        }}
      >
        <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-muted marker:content-none group-open:text-ink">
          {t("connect.morePlatforms")}
        </summary>
        <div className="border-t border-[--hair] p-5">
          <TiktokConnectCard
            conn={connMap.get("tiktok")}
            tiktokConfigured={tiktokConfigured}
            onDisconnect={() => onDisconnect("tiktok")}
          />
        </div>
      </details>

      <TelegramWizard open={telegramOpen} onClose={() => setTelegramOpen(false)} onConnected={onRefresh} />
    </div>
  );
}
