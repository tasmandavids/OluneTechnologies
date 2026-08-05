"use client";

import { confirmDialog, toast } from "@/lib/feedback";
import { useCallback, useEffect, useMemo, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { IconSearch, IconPlus, IconX } from "@/components/admin/dashboard/icons";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";
import { RippleButton } from "@/components/portal/admin/glass/RippleButton";
import { onGlowMove, onGlowLeave } from "@/components/portal/admin/glass/useMicroInteractions";
import type { EmailAccountRow, EmailMessageRow, EmailThreadRow } from "@/lib/email/types";
import { PROVIDER_META } from "@/lib/email/types";
import {
  connectImapAccount,
  disconnectEmailAccount,
  markThreadReadAction,
  summarizeThreadAction,
} from "@/app/portal/admin/email/actions";
import { oauthConnectPath } from "@/lib/email/oauth-paths";
import type { ContactMatch } from "@/lib/email/identify-contact";
import { contactTypeLabel } from "@/lib/email/identify-contact";

async function runEmailSync(accountId?: string): Promise<{ ok: true; synced: number } | { ok: false; error: string }> {
  const res = await fetch("/api/email/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(accountId ? { accountId } : {}),
  });
  const data = (await res.json()) as { synced?: number; error?: string };
  if (!res.ok) return { ok: false, error: data.error ?? "" };
  return { ok: true, synced: data.synced ?? 0 };
}

type Account = Pick<
  EmailAccountRow,
  "id" | "provider" | "email_address" | "display_name" | "last_sync_at" | "sync_error"
>;

type Thread = EmailThreadRow;

function formatWhen(iso: string | null, locale: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString(locale, { month: "short", day: "numeric" });
}

function providerLabel(provider: Account["provider"]) {
  return PROVIDER_META[provider].label;
}

function initialsFromLabel(label: string) {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

function formatFullWhen(iso: string | null, locale: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function contactBadgeClass(type: ContactMatch["type"]): string {
  switch (type) {
    case "parent":
      return "bg-sky-100 text-sky-800 border-sky-200";
    case "student":
      return "bg-violet-100 text-violet-800 border-violet-200";
    case "teacher":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "lead":
      return "bg-amber-100 text-amber-900 border-amber-200";
    default:
      return "bg-base text-muted border-[--hair]";
  }
}

function ContactBadge({ contact }: { contact: ContactMatch }) {
  const className = `inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${contactBadgeClass(contact.type)}`;
  const inner = (
    <>
      <span>{contact.label}</span>
      <span className="font-normal opacity-75">· {contactTypeLabel(contact.type)}</span>
    </>
  );
  if (contact.href) {
    return (
      <Link href={contact.href} className={`${className} transition hover:opacity-90`}>
        {inner}
      </Link>
    );
  }
  return <span className={className}>{inner}</span>;
}

function resolveContact(
  email: string | null | undefined,
  contacts: Record<string, ContactMatch>,
): ContactMatch | null {
  if (!email) return null;
  return contacts[email.toLowerCase()] ?? null;
}

function threadPrimaryLabel(
  thread: Thread,
  accountEmails: Set<string>,
  contacts: Record<string, ContactMatch>,
  unknownSenderLabel: string,
): string {
  const external = thread.participant_addresses?.find((p) => !accountEmails.has(p.toLowerCase()));
  const key = (external ?? thread.participant_addresses?.[0])?.toLowerCase();
  if (key && contacts[key]) return contacts[key].label;
  return external ?? thread.participant_addresses?.[0] ?? unknownSenderLabel;
}

function avatarStyle(size: number): CSSProperties {
  return {
    background: "linear-gradient(150deg, color-mix(in srgb, var(--n) 32%, var(--surface)), color-mix(in srgb, var(--n) 12%, var(--surface)))",
    color: "var(--brand-deep)",
    width: size,
    height: size,
    fontSize: size > 34 ? 13 : 11.5,
  };
}

function EmailBody({ message }: { message: EmailMessageRow }) {
  const tShared = useTranslations("admin.shared");

  if (message.body_html) {
    const wrappedHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><base target="_blank"><style>
      body { margin: 0; padding: 24px; font-family: ui-sans-serif, system-ui, sans-serif; font-size: 15px; line-height: 1.65; color: #111; }
      img { max-width: 100%; height: auto; }
      a { color: #2563eb; }
    </style></head><body>${message.body_html}</body></html>`;
    return (
      <iframe
        title={tShared("emailContentTitle")}
        sandbox=""
        srcDoc={wrappedHtml}
        className="min-h-[28rem] w-full rounded-2xl border border-[--hair] bg-white shadow-sm"
      />
    );
  }
  return (
    <div className="min-h-[12rem] whitespace-pre-wrap rounded-2xl border border-[--hair] bg-base px-6 py-5 text-[15px] leading-relaxed text-ink">
      {message.body_text ?? tShared("noContent")}
    </div>
  );
}

function ConnectPanel({ onConnected }: { onConnected: () => void }) {
  const t = useTranslations("admin.email");
  const tShared = useTranslations("admin.shared");
  const tCommon = useTranslations("common");
  const [imapProvider, setImapProvider] = useState<"icloud" | "mailru" | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submitImap = () => {
    if (!imapProvider) return;
    setError(null);
    startTransition(async () => {
      const result = await connectImapAccount({ provider: imapProvider, email, password });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPassword("");
      setImapProvider(null);
      onConnected();
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-black text-ink">{t("title")}</h1>
        <p className="text-sm text-muted">{t("connectDescription")}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {(["gmail", "microsoft"] as const).map((provider) => (
          <Link
            key={provider}
            href={oauthConnectPath(provider)}
            className="rounded-2xl border border-[--hair] bg-surface p-5 text-left transition hover:border-brand/40"
          >
            <p className="font-semibold text-ink">{PROVIDER_META[provider].label}</p>
            <p className="mt-1 text-xs text-muted">{PROVIDER_META[provider].description}</p>
            <p className="mt-3 text-xs font-semibold text-brand">{t("connectOAuth")}</p>
          </Link>
        ))}
        {(["icloud", "mailru"] as const).map((provider) => (
          <button
            key={provider}
            type="button"
            onClick={() => setImapProvider(provider)}
            className="rounded-2xl border border-[--hair] bg-surface p-5 text-left transition hover:border-brand/40"
          >
            <p className="font-semibold text-ink">{PROVIDER_META[provider].label}</p>
            <p className="mt-1 text-xs text-muted">{PROVIDER_META[provider].description}</p>
            <p className="mt-3 text-xs font-semibold text-brand">{t("connectPassword")}</p>
          </button>
        ))}
      </div>

      <AnimatePresence>
        {imapProvider && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="rounded-2xl border border-[--hair] bg-surface p-5"
          >
            <h2 className="mb-4 font-black text-ink">
              {t("connectTitle", { provider: PROVIDER_META[imapProvider].label })}
            </h2>
            <div className="space-y-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("emailAddress")}
                className="w-full rounded-xl border border-[--hair] bg-base px-4 py-2.5 text-sm"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={imapProvider === "icloud" ? t("appPassword") : t("password")}
                className="w-full rounded-xl border border-[--hair] bg-base px-4 py-2.5 text-sm"
              />
              {error && <p className="text-sm text-red-500">{error}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={submitImap}
                  disabled={pending || !email || !password}
                  className="rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                  style={{ background: "var(--brand)" }}
                >
                  {pending ? tShared("connecting") : t("connect")}
                </button>
                <button type="button" onClick={() => setImapProvider(null)} className="text-sm text-muted">
                  {tCommon("cancel")}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const GLASS_ROW = {
  background: "linear-gradient(148deg, var(--refract), transparent 42%), var(--glass2)",
  backdropFilter: "blur(var(--blur)) saturate(1.85)",
  WebkitBackdropFilter: "blur(var(--blur)) saturate(1.85)",
  boxShadow: "inset 0 1px 0 var(--sheen), inset 0 -1px 0 var(--sheen2)",
} as const;

function QuietPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <RippleButton
      type="button"
      size="sm"
      variant={active ? "solid" : "glass"}
      onClick={onClick}
      style={{ borderRadius: 999 }}
    >
      {children}
    </RippleButton>
  );
}

export function EmailInbox({
  accounts: initialAccounts,
  threads: initialThreads,
  contacts: initialContacts,
  bannerError,
  bannerConnected,
}: {
  accounts: Account[];
  threads: Thread[];
  contacts: Record<string, ContactMatch>;
  bannerError?: string | null;
  bannerConnected?: string | null;
}) {
  const t = useTranslations("admin.email");
  const tShared = useTranslations("admin.shared");
  const locale = useLocale();
  const [accounts, setAccounts] = useState(initialAccounts);
  const [threads, setThreads] = useState(initialThreads);
  const [contacts, setContacts] = useState(initialContacts);
  const [selectedAccountId, setSelectedAccountId] = useState<string | "all">("all");
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<EmailMessageRow[]>([]);
  const [activeThread, setActiveThread] = useState<Thread | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [pending, startTransition] = useTransition();
  const [showConnect, setShowConnect] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [initialSyncDone, setInitialSyncDone] = useState(!bannerConnected);

  const [composeOpen, setComposeOpen] = useState(false);
  const [composeAccountId, setComposeAccountId] = useState<string | null>(null);
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeSending, setComposeSending] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);

  useEffect(() => {
    if (!bannerConnected || initialSyncDone) return;

    let cancelled = false;
    void (async () => {
      const result = await runEmailSync();
      if (cancelled) return;
      if (!result.ok) setSyncError(result.error || t("syncFailed"));
      window.history.replaceState(null, "", "/portal/admin/messages?tab=email");
      window.location.reload();
    })();

    return () => {
      cancelled = true;
    };
  }, [bannerConnected, initialSyncDone, t]);

  useEffect(() => {
    setAccounts(initialAccounts);
    setThreads(initialThreads);
    setContacts(initialContacts);
  }, [initialAccounts, initialThreads, initialContacts]);

  const accountEmails = useMemo(
    () => new Set(accounts.map((a) => a.email_address.toLowerCase())),
    [accounts],
  );

  const unreadByAccount = useMemo(() => {
    const map = new Map<string, number>();
    for (const thread of threads) {
      if (thread.is_read) continue;
      map.set(thread.account_id, (map.get(thread.account_id) ?? 0) + 1);
    }
    return map;
  }, [threads]);

  const totalUnread = useMemo(() => threads.filter((t2) => !t2.is_read).length, [threads]);

  const filteredThreads = useMemo(() => {
    return threads
      .filter((thread) => selectedAccountId === "all" || thread.account_id === selectedAccountId)
      .filter((thread) => filter !== "unread" || !thread.is_read)
      .filter((thread) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          (thread.subject ?? "").toLowerCase().includes(q) ||
          (thread.snippet ?? "").toLowerCase().includes(q) ||
          thread.participant_addresses.some((p) => p.includes(q))
        );
      });
  }, [threads, selectedAccountId, filter, search]);

  const loadThread = useCallback(
    async (threadId: string) => {
      setLoadingThread(true);
      try {
        const res = await fetch(`/api/email/threads/${threadId}`);
        const data = await res.json();
        if (!res.ok) {
          setSyncError(data.error ?? t("loadError"));
          return;
        }
        setActiveThread(data.thread ?? null);
        setMessages(data.messages ?? []);
        if (data.contacts) {
          setContacts((prev) => ({ ...prev, ...data.contacts }));
        }
        void markThreadReadAction(threadId).then(() => {
          setThreads((prev) => prev.map((thread) => (thread.id === threadId ? { ...thread, is_read: true } : thread)));
        });
      } finally {
        setLoadingThread(false);
      }
    },
    [t],
  );

  const selectThread = (threadId: string) => {
    setSelectedThreadId(threadId);
    setDraft("");
    loadThread(threadId);
  };

  const refresh = () => {
    setSyncError(null);
    startTransition(async () => {
      const accountId = selectedAccountId === "all" ? undefined : selectedAccountId;
      const result = await runEmailSync(accountId);
      if (!result.ok) {
        setSyncError(result.error || t("syncFailed"));
        return;
      }
      window.location.reload();
    });
  };

  const summarize = () => {
    if (!selectedThreadId) return;
    startTransition(async () => {
      const result = await summarizeThreadAction(selectedThreadId);
      if (result.ok && result.data?.summary) {
        setActiveThread((prev) => (prev ? { ...prev, summary: result.data!.summary } : prev));
        setThreads((prev) =>
          prev.map((thread) => (thread.id === selectedThreadId ? { ...thread, summary: result.data!.summary } : thread)),
        );
      }
    });
  };

  const sendReply = async () => {
    if (!selectedThreadId || !activeThread || !draft.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: activeThread.account_id,
          threadId: selectedThreadId,
          bodyText: draft.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("sendFailed"));
      setDraft("");
      await loadThread(selectedThreadId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("sendFailed"));
    } finally {
      setSending(false);
    }
  };

  const disconnect = async (accountId: string) => {
    if (!(await confirmDialog({ title: t("disconnectConfirm"), destructive: true }))) return;
    startTransition(async () => {
      await disconnectEmailAccount(accountId);
      window.location.reload();
    });
  };

  const toggleChecked = (threadId: string) => {
    setChecked((prev) => (prev.includes(threadId) ? prev.filter((id) => id !== threadId) : prev.concat(threadId)));
  };

  const bulkMarkRead = () => {
    const ids = [...checked];
    if (!ids.length) return;
    startTransition(async () => {
      await Promise.all(ids.map((id) => markThreadReadAction(id)));
      setThreads((prev) => prev.map((thread) => (ids.includes(thread.id) ? { ...thread, is_read: true } : thread)));
      setChecked([]);
    });
  };

  const openCompose = () => {
    setComposeError(null);
    setComposeAccountId((selectedAccountId !== "all" ? selectedAccountId : accounts[0]?.id) ?? null);
    setComposeTo("");
    setComposeSubject("");
    setComposeBody("");
    setComposeOpen(true);
  };

  const sendCompose = async () => {
    const account = accounts.find((a) => a.id === composeAccountId);
    const to = composeTo
      .split(/[,\s]+/)
      .map((v) => v.trim())
      .filter(Boolean);
    if (!account || !to.length || !composeSubject.trim() || !composeBody.trim()) return;

    setComposeError(null);
    setComposeSending(true);
    try {
      const res = await fetch("/api/email/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: account.id,
          to,
          subject: composeSubject.trim(),
          bodyText: composeBody.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("composeFailed"));
      toast.success(t("composeSuccess"));
      setComposeOpen(false);
      window.location.reload();
    } catch (err) {
      setComposeError(err instanceof Error ? err.message : t("composeFailed"));
    } finally {
      setComposeSending(false);
    }
  };

  if (accounts.length === 0) {
    return (
      <>
        {bannerError && (
          <div className="border-b border-red-200 bg-red-50 px-6 py-3 text-sm text-red-700">{bannerError}</div>
        )}
        <ConnectPanel onConnected={() => window.location.reload()} />
      </>
    );
  }

  const activeAccount = accounts.find((a) => a.id === activeThread?.account_id) ?? null;
  const activeExternal = (activeThread?.participant_addresses ?? []).filter((p) => !accountEmails.has(p.toLowerCase()));
  const activePrimaryContact = activeExternal.map((e) => resolveContact(e, contacts)).find(Boolean) ?? null;

  const QUICK_REPLIES = [
    { label: t("quickReplyThanks"), text: t("quickReplyThanksText") },
    { label: t("quickReplyFollowUp"), text: t("quickReplyFollowUpText") },
    { label: t("quickReplyCall"), text: t("quickReplyCallText") },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {(bannerError || syncError || (bannerConnected && !initialSyncDone)) && (
        <div
          className={`shrink-0 rounded-2xl border px-5 py-3 text-sm ${
            bannerError || syncError
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-green-200 bg-green-50 text-green-800"
          }`}
        >
          {bannerError ??
            syncError ??
            (bannerConnected && !initialSyncDone ? t("connectedSyncing") : null)}
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-3">
        {/* Nav column — which inbox */}
        <div className="hidden w-[204px] shrink-0 lg:flex">
          <GlassPanel className="flex h-full w-full min-h-0 flex-col !p-0 overflow-hidden">
            <div className="shrink-0 border-b border-[--hair] px-4 py-4">
              <p className="font-display text-lg font-semibold tracking-tight text-ink">{t("title")}</p>
              <p className="mt-0.5 text-[11px] uppercase tracking-widest text-muted">
                {totalUnread > 0 ? t("unreadCount", { count: totalUnread }) : t("allCaughtUp")}
              </p>
            </div>

            <div className="shrink-0 px-3 pb-2 pt-3">
              <RippleButton variant="solid" sweep className="w-full !justify-center" onClick={openCompose}>
                <IconPlus className="h-4 w-4" />
                {t("composeButton")}
              </RippleButton>
            </div>

            <nav className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-3">
              <p className="mb-1.5 px-2 pt-2 text-[10.5px] font-semibold uppercase tracking-widest text-muted">
                {t("inboxesSection")}
              </p>
              <div className="flex flex-col gap-0.5">
                {accounts.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setSelectedAccountId("all")}
                    className="flex items-center justify-between gap-2 rounded-2xl px-2.5 py-2 text-left text-[13px] font-medium transition-colors"
                    style={{
                      color: selectedAccountId === "all" ? "var(--ink, var(--text))" : "var(--muted)",
                      background: selectedAccountId === "all" ? "var(--t3)" : "transparent",
                    }}
                  >
                    <span className="truncate">{t("allInboxes")}</span>
                    {totalUnread > 0 && (
                      <span className="shrink-0 text-[11px] font-semibold" style={{ color: "var(--brand-deep)" }}>
                        {totalUnread}
                      </span>
                    )}
                  </button>
                )}
                {accounts.map((a) => {
                  const active = selectedAccountId === a.id;
                  const unread = unreadByAccount.get(a.id) ?? 0;
                  return (
                    <div key={a.id} className="group relative">
                      <button
                        type="button"
                        onClick={() => setSelectedAccountId(a.id)}
                        title={a.email_address}
                        className="flex w-full items-center gap-2 rounded-2xl px-2.5 py-2 text-left text-[13px] font-medium transition-colors"
                        style={{
                          color: active ? "var(--ink, var(--text))" : "var(--muted)",
                          background: active ? "var(--t3)" : "transparent",
                        }}
                      >
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: a.sync_error ? "var(--error)" : "var(--success)" }}
                        />
                        <span className="min-w-0 flex-1 truncate pr-4">{a.email_address}</span>
                        {unread > 0 && (
                          <span className="shrink-0 text-[11px] font-semibold" style={{ color: "var(--brand-deep)" }}>
                            {unread}
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => disconnect(a.id)}
                        title={t("disconnectConfirm")}
                        className="absolute right-1.5 top-1/2 hidden h-5 w-5 -translate-y-1/2 place-items-center rounded-full text-muted hover:text-red-500 group-hover:grid"
                      >
                        <IconX className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="mt-3 border-t border-[--hair] pt-3">
                <button
                  type="button"
                  onClick={() => setShowConnect(true)}
                  className="flex w-full items-center gap-2 rounded-2xl px-2.5 py-2 text-left text-[12.5px] font-medium text-muted transition-colors hover:text-ink"
                >
                  <IconPlus className="h-3.5 w-3.5" />
                  {t("connectMore")}
                </button>
              </div>
            </nav>
          </GlassPanel>
        </div>

        {/* List column — which thread */}
        <div className="flex w-full min-w-[300px] shrink-0 lg:w-[360px]">
          <GlassPanel className="flex h-full w-full min-h-0 flex-col !p-0 overflow-hidden">
            <div className="shrink-0 space-y-2.5 border-b border-[--hair] px-3.5 py-3">
              <div className="flex items-center gap-2">
                <label
                  className="flex flex-1 items-center gap-2 rounded-2xl px-3 py-2"
                  style={GLASS_ROW}
                >
                  <IconSearch className="h-3.5 w-3.5 shrink-0 text-muted" />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t("searchPlaceholder")}
                    className="w-full min-w-0 border-none bg-transparent text-[13px] text-ink outline-none placeholder:text-muted"
                  />
                </label>
                <RippleButton variant="glass" size="sm" onClick={refresh} disabled={pending}>
                  {pending ? tShared("syncing") : t("syncNow")}
                </RippleButton>
              </div>
              <div className="flex items-center gap-1.5 lg:hidden">
                <select
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-[--hair] bg-base px-2.5 py-1.5 text-xs text-ink"
                >
                  <option value="all">{t("allInboxes")}</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {t("accountOption", { email: a.email_address, provider: providerLabel(a.provider) })}
                    </option>
                  ))}
                </select>
                <RippleButton variant="solid" size="sm" onClick={openCompose}>
                  {t("composeButton")}
                </RippleButton>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <QuietPill active={filter === "all"} onClick={() => setFilter("all")}>
                  {t("filterAll")}
                </QuietPill>
                <QuietPill active={filter === "unread"} onClick={() => setFilter("unread")}>
                  {t("filterUnread")}
                </QuietPill>
              </div>
            </div>

            {checked.length > 0 && (
              <div
                className="flex shrink-0 items-center gap-2 border-b border-[--hair] px-3.5 py-2"
                style={{ background: "var(--t2)" }}
              >
                <span className="text-[12px] text-muted">{t("selectedCount", { count: checked.length })}</span>
                <div className="ml-auto flex items-center gap-1.5">
                  <RippleButton variant="glass" size="sm" onClick={bulkMarkRead} disabled={pending}>
                    {pending ? t("markingRead") : t("markRead")}
                  </RippleButton>
                  <RippleButton variant="quiet" size="sm" onClick={() => setChecked([])}>
                    <IconX className="h-3.5 w-3.5" />
                  </RippleButton>
                </div>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {filteredThreads.length === 0 ? (
                <p className="p-4 text-sm leading-relaxed text-muted">{t("noConversations")}</p>
              ) : (
                filteredThreads.map((thread) => {
                  const primary = threadPrimaryLabel(thread, accountEmails, contacts, tShared("unknownSender"));
                  const external = thread.participant_addresses?.find((p) => !accountEmails.has(p.toLowerCase()));
                  const contact = resolveContact(external, contacts);
                  const open = selectedThreadId === thread.id;
                  const isChecked = checked.includes(thread.id);

                  return (
                    <div
                      key={thread.id}
                      onClick={() => selectThread(thread.id)}
                      onMouseMove={onGlowMove}
                      onMouseLeave={onGlowLeave}
                      className="relative mb-1 flex cursor-pointer items-start gap-2.5 overflow-hidden rounded-2xl px-2.5 py-2.5 transition-shadow duration-300"
                      style={{
                        background: open ? "var(--glass2)" : isChecked ? "var(--t1)" : "transparent",
                        backdropFilter: open ? "blur(var(--blur))" : "none",
                        boxShadow: open ? "inset 0 1px 0 var(--sheen), 0 14px 30px -22px var(--tg)" : "none",
                      }}
                    >
                      <div
                        className="pointer-events-none absolute inset-0 transition-opacity duration-[1300ms] ease-out"
                        style={{
                          opacity: "var(--glow-o, 0)",
                          background: "radial-gradient(220px circle at var(--mx, -200px) var(--my, -200px), var(--t2), transparent 72%)",
                        }}
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleChecked(thread.id);
                        }}
                        className="relative mt-[7px] grid h-4 w-4 shrink-0 place-items-center rounded-[6px] text-[9px]"
                        style={{
                          border: `1px solid ${isChecked ? "var(--brand)" : "var(--hair)"}`,
                          background: isChecked ? "var(--brand)" : "transparent",
                          color: "#fff",
                        }}
                      >
                        {isChecked ? "✓" : ""}
                      </button>
                      <span
                        className="relative grid shrink-0 place-items-center rounded-xl font-bold"
                        style={avatarStyle(32)}
                      >
                        {initialsFromLabel(contact?.label ?? primary)}
                      </span>
                      <div className="relative min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <p className={`min-w-0 truncate text-[13px] ${thread.is_read ? "font-medium text-ink" : "font-bold text-ink"}`}>
                            {primary}
                          </p>
                          <span className="ml-auto shrink-0 text-[10.5px] text-muted">{formatWhen(thread.last_message_at, locale)}</span>
                        </div>
                        <p className={`truncate text-[13px] ${thread.is_read ? "text-muted" : "font-semibold text-ink"}`}>
                          {thread.subject ?? tShared("noSubject")}
                        </p>
                        <p className="mt-0.5 line-clamp-1 text-[12px] text-muted">
                          {thread.snippet ?? thread.participant_addresses.join(", ")}
                        </p>
                        {(contact || thread.summary) && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            {contact && <ContactBadge contact={contact} />}
                            {thread.summary && (
                              <span className="line-clamp-1 text-[11px] text-brand">{thread.summary.split("\n")[0]}</span>
                            )}
                          </div>
                        )}
                      </div>
                      {!thread.is_read && (
                        <span
                          className="relative mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: "var(--brand)", boxShadow: "0 0 0 3px var(--t2)" }}
                          aria-hidden
                        />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </GlassPanel>
        </div>

        {/* Thread column */}
        <div className="hidden min-w-0 flex-1 md:flex">
          <GlassPanel className="flex h-full w-full min-h-0 flex-col !p-0 overflow-hidden">
            {!selectedThreadId ? (
              <div className="grid flex-1 place-items-center px-8 text-center">
                <div>
                  <p className="text-lg font-semibold text-ink">{t("selectConversation")}</p>
                  <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">{t("selectDescription")}</p>
                </div>
              </div>
            ) : loadingThread && !messages.length ? (
              <div className="grid flex-1 place-items-center text-sm text-muted">{tShared("loadingConversation")}</div>
            ) : (
              <>
                <div className="shrink-0 border-b border-[--hair] px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-2">
                      <h2 className="font-display text-xl font-semibold tracking-tight text-ink">
                        {activeThread?.subject ?? tShared("conversation")}
                      </h2>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {activeAccount && (
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                            style={{ background: "var(--t2)", color: "var(--brand-deep)" }}
                          >
                            {providerLabel(activeAccount.provider)}
                          </span>
                        )}
                        {activeExternal.map((email) => {
                          const contact = resolveContact(email, contacts);
                          return contact ? (
                            <ContactBadge key={email} contact={contact} />
                          ) : (
                            <span key={email} className="inline-flex rounded-full border border-[--hair] bg-base px-2.5 py-0.5 text-xs text-muted">
                              {email}
                            </span>
                          );
                        })}
                        {activeThread && (
                          <span className="text-[12px] text-muted">{t("messageCount", { count: activeThread.message_count })}</span>
                        )}
                      </div>
                    </div>
                    <RippleButton variant="glass" size="sm" onClick={summarize} disabled={pending}>
                      {pending ? tShared("summarizing") : t("summarize")}
                    </RippleButton>
                  </div>
                  {activeThread?.summary && (
                    <div className="mt-3 rounded-2xl border border-brand/20 bg-brand/5 px-4 py-3">
                      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-brand">{tShared("summary")}</p>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{activeThread.summary}</p>
                    </div>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-6 lg:px-8">
                  <div className="mx-auto flex max-w-3xl flex-col gap-6">
                    {messages.map((msg) => {
                      const contact = resolveContact(msg.from_address, contacts);
                      return (
                        <article
                          key={msg.id}
                          className="overflow-hidden rounded-[20px] border"
                          style={{
                            borderColor: msg.is_outbound ? "color-mix(in srgb, var(--brand) 30%, var(--hair))" : "var(--hair)",
                            background: msg.is_outbound ? "color-mix(in srgb, var(--brand) 5%, var(--surface))" : "var(--surface)",
                          }}
                        >
                          <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[--hair]/70 px-5 py-3.5">
                            <div className="flex items-center gap-2.5">
                              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-xs font-bold" style={avatarStyle(32)}>
                                {initialsFromLabel(contact?.label ?? msg.from_name ?? msg.from_address ?? "?")}
                              </span>
                              <div className="space-y-0.5">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-sm font-semibold text-ink">
                                    {contact?.label ?? msg.from_name ?? msg.from_address ?? tShared("unknown")}
                                    {msg.is_outbound && <span className="ml-1.5 text-xs font-normal text-muted">({tShared("you")})</span>}
                                  </p>
                                  {contact && !msg.is_outbound && <ContactBadge contact={contact} />}
                                </div>
                                {msg.from_address && <p className="text-xs text-muted">{msg.from_address}</p>}
                              </div>
                            </div>
                            <time className="text-xs text-muted">{formatFullWhen(msg.sent_at, locale)}</time>
                          </header>
                          <div className="px-4 py-4 sm:px-5">
                            {msg.subject && msg.subject !== activeThread?.subject && (
                              <p className="mb-3 text-sm font-medium text-muted">{msg.subject}</p>
                            )}
                            <EmailBody message={msg} />
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>

                <div className="shrink-0 border-t border-[--hair] px-4 py-3.5 lg:px-6">
                  <div className="mx-auto flex max-w-3xl flex-col gap-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10.5px] font-semibold uppercase tracking-widest text-muted">{t("quickReplies")}</span>
                      {QUICK_REPLIES.map((qr) => (
                        <RippleButton key={qr.label} variant="glass" size="sm" onClick={() => setDraft(qr.text)}>
                          {qr.label}
                        </RippleButton>
                      ))}
                    </div>
                    <div className="rounded-2xl px-3.5 py-3" style={GLASS_ROW}>
                      <textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder={t("replyPlaceholder")}
                        rows={3}
                        className="w-full resize-none border-none bg-transparent text-sm text-ink outline-none placeholder:text-muted"
                      />
                      <div className="flex items-center gap-2.5 border-t pt-2" style={{ borderColor: "var(--t2)" }}>
                        <span className="flex items-center gap-1.5 text-[11px] text-muted">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--success)" }} />
                          {activeAccount && t("sendsFrom", { email: activeAccount.email_address })}
                        </span>
                        <RippleButton
                          variant="solid"
                          size="sm"
                          className="ml-auto"
                          onClick={sendReply}
                          disabled={sending || !draft.trim()}
                        >
                          {sending ? tShared("sending") : t("sendReply")}
                        </RippleButton>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </GlassPanel>
        </div>

        {/* Context column — about the person */}
        {selectedThreadId && activeThread && (
          <div className="hidden w-[236px] shrink-0 xl:flex">
            <GlassPanel className="flex h-full w-full min-h-0 flex-col !p-0 overflow-hidden">
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <p className="mb-2.5 text-[10.5px] font-semibold uppercase tracking-widest text-muted">{t("about")}</p>
                {activePrimaryContact ? (
                  <div className="mb-5 flex items-center gap-2.5">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-sm font-bold" style={avatarStyle(40)}>
                      {initialsFromLabel(activePrimaryContact.label)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-bold text-ink">{activePrimaryContact.label}</p>
                      <p className="text-[11.5px] text-muted">{contactTypeLabel(activePrimaryContact.type)}</p>
                    </div>
                  </div>
                ) : (
                  <p className="mb-5 text-[12.5px] leading-relaxed text-muted">{t("noContactMatch")}</p>
                )}

                {activePrimaryContact?.href && (
                  <Link href={activePrimaryContact.href} className="mb-5 block">
                    <RippleButton variant="glass" size="sm" className="w-full !justify-center">
                      {t("viewProfile")}
                    </RippleButton>
                  </Link>
                )}

                <div className="mb-5">
                  <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-widest text-muted">{t("threadInfo")}</p>
                  <div className="flex flex-col gap-1.5 rounded-2xl px-3 py-2.5" style={GLASS_ROW}>
                    <p className="text-[12px] text-ink">{t("messageCount", { count: activeThread.message_count })}</p>
                    {activeThread.last_message_at && (
                      <p className="text-[12px] text-muted">{t("lastActive", { time: formatFullWhen(activeThread.last_message_at, locale) })}</p>
                    )}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-widest text-muted">{t("participants")}</p>
                  <div className="flex flex-col gap-1.5">
                    {(activeThread.participant_addresses ?? []).map((email) => {
                      const contact = resolveContact(email, contacts);
                      return (
                        <div key={email} className="rounded-2xl px-3 py-2" style={GLASS_ROW}>
                          {contact ? <ContactBadge contact={contact} /> : <span className="text-[12px] text-muted">{email}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </GlassPanel>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showConnect && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-12 backdrop-blur-sm"
            onClick={() => setShowConnect(false)}
          >
            <motion.div
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 16, opacity: 0 }}
              className="w-full max-w-3xl rounded-2xl border border-[--hair] bg-base shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <ConnectPanel
                onConnected={() => {
                  setShowConnect(false);
                  window.location.reload();
                }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {composeOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
            onClick={() => setComposeOpen(false)}
          >
            <motion.div
              initial={{ y: 16, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 16, opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-xl overflow-hidden rounded-[24px] border"
              style={{ background: "var(--surface)", borderColor: "var(--edge)", boxShadow: "var(--shadow)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2.5 border-b border-[--hair] px-5 py-3.5">
                <span className="font-display text-base font-semibold text-ink">{t("composeTitle")}</span>
                {accounts.length > 1 ? (
                  <select
                    value={composeAccountId ?? ""}
                    onChange={(e) => setComposeAccountId(e.target.value)}
                    className="ml-2 rounded-full border border-[--hair] bg-base px-2.5 py-1 text-[11px] font-semibold text-ink"
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.email_address}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: "var(--t2)", color: "var(--brand-deep)" }}>
                    {accounts[0]?.email_address}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setComposeOpen(false)}
                  className="ml-auto grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted transition hover:bg-[--t2] hover:text-ink"
                >
                  <IconX className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-col gap-3 px-5 py-4">
                <div className="flex items-center gap-2.5 border-b border-[--hair] pb-3">
                  <span className="w-14 shrink-0 text-xs text-muted">{t("composeTo")}</span>
                  <input
                    value={composeTo}
                    onChange={(e) => setComposeTo(e.target.value)}
                    placeholder={t("composeToPlaceholder")}
                    className="flex-1 border-none bg-transparent text-sm text-ink outline-none placeholder:text-muted"
                  />
                </div>
                <input
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  placeholder={t("composeSubjectPlaceholder")}
                  className="border-b border-[--hair] bg-transparent pb-3 text-sm font-semibold text-ink outline-none placeholder:text-muted placeholder:font-normal"
                />
                <textarea
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  placeholder={t("composeBodyPlaceholder")}
                  rows={7}
                  className="resize-none border-none bg-transparent text-sm leading-relaxed text-ink outline-none placeholder:text-muted"
                />
                {composeError && <p className="text-sm text-red-500">{composeError}</p>}
              </div>
              <div className="flex items-center gap-2.5 border-t border-[--hair] px-5 py-3.5" style={{ background: "var(--glass2)" }}>
                <span className="ml-auto flex gap-2">
                  <RippleButton variant="glass" size="md" onClick={() => setComposeOpen(false)}>
                    {tShared("close")}
                  </RippleButton>
                  <RippleButton
                    variant="solid"
                    size="md"
                    onClick={sendCompose}
                    disabled={composeSending || !composeTo.trim() || !composeSubject.trim() || !composeBody.trim()}
                  >
                    {composeSending ? tShared("sending") : t("composeSend")}
                  </RippleButton>
                </span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
