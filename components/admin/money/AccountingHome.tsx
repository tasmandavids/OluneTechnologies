"use client";

// ============================================================================
//  Money → Accounting. The one place a studio decides where its books live —
//  Xero or Olune Books — sees that it's working, and changes its mind.
//
//  Three states:
//    not chosen  — two cards, pick one
//    Xero        — org + sync health, Xero numbers below (children)
//    Olune Books — country + sync health, shortcuts into Books
//  Switching always takes the current system down first (disconnect Xero /
//  pause Books) so a studio can never end up feeding two ledgers.
// ============================================================================

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { confirmDialog } from "@/lib/feedback";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";
import { openInXeroUrl } from "@/lib/xero/links";
import { formatSyncTime } from "@/lib/xero/format";
import { pauseBooks, resumeBooks, stopUsingXero } from "@/app/portal/admin/money/accounting-actions";

const XERO_CONNECT = "/api/xero/oauth/connect";
const BOOKS_SETUP = "/portal/admin/books/setup";

export type AccountingHomeProps = {
  choice: "xero" | "olune" | null;
  xero: { tenantName: string | null; orgShortCode: string | null; syncError: string | null; lastSyncAt: string | null } | null;
  books: { label: string; lastSyncedAt: string | null; lastSyncError: string | null } | null;
  xeroConfigured: boolean;
  bannerConnected: string | null;
  bannerError: string | null;
  children?: ReactNode;
};

const brandButton = "btn-brand inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50";
const quietButton = "inline-flex items-center justify-center rounded-xl border px-4 py-2.5 text-sm font-semibold text-ink disabled:opacity-50";
const quietStyle = { borderColor: "var(--hair)" } as const;

export function AccountingHome(props: AccountingHomeProps) {
  const t = useTranslations("admin.money.accounting");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const booksPaused = props.choice !== "olune" && props.books !== null;

  // Anticipated failures arrive as keys (from the actions or the Xero OAuth
  // redirect); anything else is already a sentence, e.g. Xero's own message.
  const explain = (e: string) => (t.has(`errors.${e}`) ? t(`errors.${e}`) : e);

  const run = (fn: typeof pauseBooks, then: () => void) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error);
      else then();
    });
  };

  const startBooks = () => {
    if (booksPaused) run(resumeBooks, () => router.push("/portal/admin/books"));
    else router.push(BOOKS_SETUP);
  };

  const switchToBooks = async () => {
    const ok = await confirmDialog({
      title: t("switch.toBooksTitle"),
      body: t("switch.toBooksBody"),
      confirmLabel: t("switch.toBooksConfirm"),
      destructive: true,
    });
    if (!ok) return;
    run(stopUsingXero, startBooks);
  };

  const disconnectXero = async () => {
    const ok = await confirmDialog({
      title: t("switch.disconnectXeroTitle"),
      body: t("switch.disconnectXeroBody"),
      confirmLabel: t("switch.disconnectXeroConfirm"),
      destructive: true,
    });
    if (!ok) return;
    run(stopUsingXero, () => router.refresh());
  };

  const switchToXero = async () => {
    const ok = await confirmDialog({
      title: t("switch.toXeroTitle"),
      body: t("switch.toXeroBody"),
      confirmLabel: t("switch.toXeroConfirm"),
      destructive: true,
    });
    if (!ok) return;
    run(pauseBooks, () => {
      window.location.href = XERO_CONNECT;
    });
  };

  const pauseOnly = async () => {
    const ok = await confirmDialog({
      title: t("switch.pauseBooksTitle"),
      body: t("switch.pauseBooksBody"),
      confirmLabel: t("switch.pauseBooksConfirm"),
      destructive: true,
    });
    if (!ok) return;
    run(pauseBooks, () => router.refresh());
  };

  const shownError = error ?? props.bannerError;
  const shownErrorText = shownError ? explain(shownError) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-black tracking-tight text-ink" style={{ fontFamily: "var(--font-display)" }}>
          {t("title")}
        </h1>
        <p className="mt-1 max-w-[70ch] text-sm text-muted">{t("subtitle")}</p>
      </header>

      {props.bannerConnected === "xero" && props.choice === "xero" && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {t("banner.xeroConnected")}
        </div>
      )}
      {shownErrorText && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {shownErrorText}
        </div>
      )}

      {props.choice === null && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <OptionCard
              accent="#5B4BDB"
              name={t("books.name")}
              tag={t("books.tag")}
              chooseIf={t("books.chooseIf")}
              points={[t("books.p1"), t("books.p2"), t("books.p3"), t("books.p4")]}
              limits={t("books.limits")}
              action={
                <button type="button" className={brandButton} disabled={pending} onClick={startBooks}>
                  {booksPaused ? t("books.resume") : t("books.setUp")}
                </button>
              }
              note={booksPaused ? t("books.pausedNote") : null}
            />
            <OptionCard
              accent="#13B5EA"
              name={t("xero.name")}
              tag={t("xero.tag")}
              chooseIf={t("xero.chooseIf")}
              points={[t("xero.p1"), t("xero.p2"), t("xero.p3")]}
              limits={t("xero.limits")}
              action={
                props.xeroConfigured ? (
                  <a href={XERO_CONNECT} className={quietButton} style={quietStyle}>
                    {t("xero.connect")}
                  </a>
                ) : (
                  <span className="text-xs text-muted">{t("xero.notConfigured")}</span>
                )
              }
              note={null}
            />
          </div>
          <p className="text-xs text-muted">{t("switchLater")}</p>
          {booksPaused && <PausedExports label={t("books.exportPaused")} />}
        </>
      )}

      {props.choice === "xero" && (
        <>
          <GlassPanel className="!p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">{t("current")}</p>
                <p className="mt-1 text-lg font-semibold text-ink">
                  {t("xero.name")}
                  {props.xero?.tenantName ? <span className="text-muted"> · {props.xero.tenantName}</span> : null}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {props.xero?.lastSyncAt
                    ? t("lastSent", { time: formatSyncTime(props.xero.lastSyncAt) })
                    : t("nothingSentYet")}
                </p>
              </div>
              <a
                href={openInXeroUrl(props.xero?.orgShortCode ?? null, "dashboard")}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-xl bg-[#13B5EA] px-4 py-2.5 text-sm font-bold text-white"
              >
                {t("xero.open")}
              </a>
            </div>
            {props.xero?.syncError && (
              <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {t("xero.syncError", { error: props.xero.syncError })}
              </p>
            )}
            <p className="mt-4 text-sm text-muted">{t("xero.how")}</p>
          </GlassPanel>

          {props.children}

          <ChangePanel title={t("switch.title")}>
            <button type="button" className={quietButton} style={quietStyle} disabled={pending} onClick={switchToBooks}>
              {t("switch.toBooks")}
            </button>
            <button type="button" className="text-xs font-semibold text-muted underline-offset-2 hover:underline" disabled={pending} onClick={disconnectXero}>
              {t("switch.disconnectXero")}
            </button>
          </ChangePanel>
        </>
      )}

      {props.choice === "olune" && (
        <>
          <GlassPanel className="!p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">{t("current")}</p>
                <p className="mt-1 text-lg font-semibold text-ink">
                  {t("books.name")}
                  {props.books ? <span className="text-muted"> · {props.books.label}</span> : null}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {props.books?.lastSyncedAt
                    ? t("lastPosted", { time: formatSyncTime(props.books.lastSyncedAt) })
                    : t("nothingPostedYet")}
                </p>
              </div>
              <Link href="/portal/admin/books" className={brandButton}>
                {t("books.open")}
              </Link>
            </div>
            {props.books?.lastSyncError && (
              <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {props.books.lastSyncError}
              </p>
            )}
            <p className="mt-4 text-sm text-muted">{t("books.how")}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                { href: "/portal/admin/books/bank", label: t("books.links.bank") },
                { href: "/portal/admin/books/tax", label: t("books.links.tax") },
                { href: "/portal/admin/books/reports?report=pl", label: t("books.links.pl") },
                { href: "/portal/admin/books/reports?report=bs", label: t("books.links.bs") },
                { href: "/portal/admin/books/bills", label: t("books.links.bills") },
              ].map((l) => (
                <Link key={l.href} href={l.href} className="rounded-xl border px-3 py-1.5 text-xs font-semibold text-ink" style={quietStyle}>
                  {l.label}
                </Link>
              ))}
            </div>
          </GlassPanel>

          <ChangePanel title={t("switch.title")}>
            {props.xeroConfigured && (
              <button type="button" className={quietButton} style={quietStyle} disabled={pending} onClick={switchToXero}>
                {t("switch.toXero")}
              </button>
            )}
            <button type="button" className="text-xs font-semibold text-muted underline-offset-2 hover:underline" disabled={pending} onClick={pauseOnly}>
              {t("switch.pauseBooks")}
            </button>
          </ChangePanel>
        </>
      )}
    </div>
  );
}

function OptionCard({
  accent,
  name,
  tag,
  chooseIf,
  points,
  limits,
  action,
  note,
}: {
  accent: string;
  name: string;
  tag: string;
  chooseIf: string;
  points: string[];
  limits: string;
  action: ReactNode;
  note: string | null;
}) {
  return (
    <GlassPanel className="flex flex-col !p-6">
      <div className="flex items-center gap-2">
        <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: accent }} />
        <p className="text-lg font-semibold text-ink">{name}</p>
        <span className="rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold text-muted" style={quietStyle}>
          {tag}
        </span>
      </div>
      <p className="mt-3 text-sm font-medium text-ink">{chooseIf}</p>
      <ul className="mt-3 space-y-1.5 text-sm text-muted">
        {points.map((p) => (
          <li key={p} className="flex gap-2">
            <span aria-hidden>✓</span>
            <span>{p}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">{limits}</p>
      {note && <p className="mt-3 text-xs text-amber-700">{note}</p>}
      <div className="mt-auto pt-5">{action}</div>
    </GlassPanel>
  );
}

function ChangePanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <GlassPanel className="!p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">{title}</p>
      <div className="mt-3 flex flex-wrap items-center gap-4">{children}</div>
    </GlassPanel>
  );
}

function PausedExports({ label }: { label: string }) {
  return (
    <p className="text-xs text-muted">
      {label}{" "}
      <a className="font-semibold text-ink underline" href="/api/books/export?report=journals">
        CSV
      </a>
    </p>
  );
}
