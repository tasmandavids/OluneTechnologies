"use client";

// ============================================================================
//  ConnectionsHub — Settings → Connections.
//
//  The single place a studio owner connects anything. Money, the Inbox and
//  Advertising used to each carry their own connect UI; they now show the data
//  and point here. Providers that don't exist yet are listed too, greyed, so
//  the roadmap is visible instead of being a support question.
// ============================================================================

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { confirmDialog } from "@/lib/feedback";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";
import { TelegramWizard } from "@/components/admin/advertising/TelegramWizard";
import {
  CATEGORY_META,
  INTEGRATIONS,
  getIntegration,
} from "@/lib/integrations/catalog";
import {
  INTEGRATION_CATEGORIES,
  type IntegrationCategory,
  type IntegrationProvider,
  type IntegrationStateMap,
} from "@/lib/integrations/types";
import { disconnectIntegration } from "@/app/portal/admin/settings/connections/actions";
import { ApiKeyDialog } from "./ApiKeyDialog";
import { ConnectionCard } from "./ConnectionCard";
import { ImapConnectDialog, type ImapProviderId } from "./ImapConnectDialog";

type Filter = "all" | "connected" | "available" | "planned";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "connected", label: "Connected" },
  { id: "available", label: "Available" },
  { id: "planned", label: "Coming soon" },
];

export function ConnectionsHub({
  states,
  missingEnv,
  metadata,
  bannerConnected,
  bannerError,
}: {
  states: IntegrationStateMap;
  /** providerId → env vars the deployment is missing. */
  missingEnv: Record<string, string[]>;
  /** providerId → non-secret stored values (plus `<key>Tail` for secrets). */
  metadata: Record<string, Record<string, string>>;
  bannerConnected: string | null;
  bannerError: string | null;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [apiKeyProvider, setApiKeyProvider] = useState<IntegrationProvider | null>(null);
  const [imapProvider, setImapProvider] = useState<ImapProviderId | null>(null);
  const [telegramOpen, setTelegramOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyProvider, setBusyProvider] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // A freshly connected mailbox has no threads until the first sync runs. The
  // inbox used to kick this off when the OAuth callback landed on it; the
  // callback lands here now, so this does.
  const syncFired = useRef(false);
  useEffect(() => {
    if (syncFired.current) return;
    const mailProviders = ["gmail", "microsoft", "icloud", "mailru"];
    if (!bannerConnected || !mailProviders.includes(bannerConnected)) return;
    syncFired.current = true;
    void fetch("/api/email/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).catch(() => {});
  }, [bannerConnected]);

  const connectedTotal = useMemo(
    () => Object.values(states).filter((s) => s.connected).length,
    [states],
  );
  const attentionTotal = useMemo(
    () => Object.values(states).filter((s) => s.status === "error" || s.status === "pending").length,
    [states],
  );

  // Which provider currently holds each exclusive slot (one ledger per studio).
  const exclusiveHolder = useMemo(() => {
    const held: Record<string, string> = {};
    for (const provider of INTEGRATIONS) {
      if (!provider.exclusiveGroup) continue;
      if (states[provider.id]?.connected) held[provider.exclusiveGroup] = provider.name;
    }
    return held;
  }, [states]);

  const matchesFilter = (provider: IntegrationProvider): boolean => {
    const state = states[provider.id];
    if (filter === "connected") return Boolean(state?.connected);
    if (filter === "planned") return provider.stage === "planned";
    if (filter === "available") {
      return provider.stage !== "planned" && !state?.connected && Boolean(state?.configured);
    }
    return true;
  };

  const onConnect = (provider: IntegrationProvider) => {
    setActionError(null);
    if (provider.auth.kind === "api_key") {
      setApiKeyProvider(provider);
      return;
    }
    if (provider.auth.kind === "credentials") {
      if (provider.auth.dialog === "telegram-bot") setTelegramOpen(true);
      else setImapProvider(provider.id as ImapProviderId);
      return;
    }
    if (provider.auth.kind === "oauth") {
      window.location.href = provider.auth.connectPath;
    }
  };

  const onDisconnect = async (provider: IntegrationProvider) => {
    setActionError(null);
    const confirmed = await confirmDialog({
      title:
        provider.category === "inbox"
          ? `Disconnect every ${provider.name} mailbox?`
          : `Disconnect ${provider.name}?`,
      destructive: true,
    });
    if (!confirmed) return;
    setBusyProvider(provider.id);
    startTransition(async () => {
      const res = await disconnectIntegration(provider.id);
      setBusyProvider(null);
      if (!res.ok) setActionError(res.error);
      else router.refresh();
    });
  };

  const connectedBanner = bannerConnected
    ? (getIntegration(bannerConnected)?.name ?? bannerConnected)
    : null;
  const displayError = actionError ?? bannerError;

  const visibleCategories = INTEGRATION_CATEGORIES.map((category) => ({
    category,
    providers: INTEGRATIONS.filter((p) => p.category === category && matchesFilter(p)),
  })).filter((group) => group.providers.length > 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="mx-auto max-w-[1080px] pb-16 pt-3.5"
    >
      <header className="mb-5">
        <Link
          href="/portal/admin/settings"
          className="mb-1.5 inline-block text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-muted transition hover:text-ink"
        >
          ← Settings
        </Link>
        <h1 className="font-display text-[32px] font-medium leading-[1.03] tracking-tight text-ink md:text-[36px]">
          Connections
        </h1>
        <p className="mt-2 max-w-[62ch] text-sm text-muted">
          Every system Olune can talk to — accounting, payments, email, social and the rest.
          Connect them once here and they show up wherever the studio needs them.
        </p>
      </header>

      <GlassPanel className="mb-5 !p-5">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <div>
            <p className="font-display text-[26px] font-medium leading-none text-ink">
              {connectedTotal}
            </p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
              Connected
            </p>
          </div>
          <div>
            <p
              className="font-display text-[26px] font-medium leading-none"
              style={{ color: attentionTotal > 0 ? "#f59e0b" : "var(--ink, var(--text))" }}
            >
              {attentionTotal}
            </p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
              Need attention
            </p>
          </div>
          <div>
            <p className="font-display text-[26px] font-medium leading-none text-ink">
              {INTEGRATIONS.length}
            </p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
              In the catalog
            </p>
          </div>
          <div className="ml-auto flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className="rounded-[10px] px-3 py-1.5 text-[12px] font-semibold transition-colors"
                style={{
                  color: filter === f.id ? "var(--ink, var(--text))" : "var(--muted)",
                  background: filter === f.id ? "var(--t3)" : "transparent",
                  border: filter === f.id ? "1px solid var(--tb)" : "1px solid transparent",
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </GlassPanel>

      {connectedBanner && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {connectedBanner} connected.
        </div>
      )}
      {displayError && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {displayError}
        </div>
      )}

      <div className="flex flex-col gap-5">
        {visibleCategories.map(({ category, providers }) => (
          <CategorySection
            key={category}
            category={category}
            providers={providers}
            states={states}
            missingEnv={missingEnv}
            exclusiveHolder={exclusiveHolder}
            busyProvider={busyProvider}
            onConnect={onConnect}
            onManage={setApiKeyProvider}
            onDisconnect={onDisconnect}
          />
        ))}
        {visibleCategories.length === 0 && (
          <GlassPanel className="!p-12 text-center">
            <p className="text-sm text-muted">Nothing matches that filter.</p>
          </GlassPanel>
        )}
      </div>

      <ApiKeyDialog
        provider={apiKeyProvider}
        metadata={apiKeyProvider ? (metadata[apiKeyProvider.id] ?? {}) : {}}
        connected={Boolean(apiKeyProvider && states[apiKeyProvider.id]?.connected)}
        onClose={() => setApiKeyProvider(null)}
        onSaved={() => {
          setApiKeyProvider(null);
          router.refresh();
        }}
      />

      <ImapConnectDialog
        provider={imapProvider}
        color={imapProvider ? (getIntegration(imapProvider)?.color ?? "#3B82F6") : "#3B82F6"}
        onClose={() => setImapProvider(null)}
        onConnected={() => {
          setImapProvider(null);
          router.refresh();
        }}
      />

      <TelegramWizard
        open={telegramOpen}
        onClose={() => setTelegramOpen(false)}
        onConnected={() => {
          setTelegramOpen(false);
          router.refresh();
        }}
      />
    </motion.div>
  );
}

function CategorySection({
  category,
  providers,
  states,
  missingEnv,
  exclusiveHolder,
  busyProvider,
  onConnect,
  onManage,
  onDisconnect,
}: {
  category: IntegrationCategory;
  providers: IntegrationProvider[];
  states: IntegrationStateMap;
  missingEnv: Record<string, string[]>;
  exclusiveHolder: Record<string, string>;
  busyProvider: string | null;
  onConnect: (p: IntegrationProvider) => void;
  onManage: (p: IntegrationProvider) => void;
  onDisconnect: (p: IntegrationProvider) => void;
}) {
  const meta = CATEGORY_META[category];
  return (
    <GlassPanel className="!p-6">
      <div className="mb-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
          {meta.label}
        </h2>
        <p className="mt-1 max-w-[64ch] text-sm text-muted">{meta.blurb}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {providers.map((provider) => {
          const state = states[provider.id];
          if (!state) return null;
          const holder = provider.exclusiveGroup
            ? exclusiveHolder[provider.exclusiveGroup]
            : undefined;
          return (
            <ConnectionCard
              key={provider.id}
              provider={provider}
              state={state}
              missingEnv={missingEnv[provider.id] ?? []}
              blockedBy={holder && holder !== provider.name ? holder : null}
              busy={busyProvider === provider.id}
              onConnect={() => onConnect(provider)}
              onManage={() => onManage(provider)}
              onDisconnect={() => onDisconnect(provider)}
            />
          );
        })}
      </div>
    </GlassPanel>
  );
}
