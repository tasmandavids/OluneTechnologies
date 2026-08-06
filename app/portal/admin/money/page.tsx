// ============================================================================
//  /portal/admin/money — Studio owner finance hub: overview, invoices,
//  collections, plans, ledger, reconciliation, payouts, reports. One door for
//  "how's the money doing" — tab state lives in ?tab= for deep links.
//
//  Replaces /portal/admin/billing, /accounting, /payments, /payment-plans and
//  /subscriptions, which now redirect here. Every tab is wired to real data
//  except Reconcile (bank-feed matching), which doesn't exist anywhere in the
//  app yet — it gets an honest "still being built" panel, not fabricated
//  transactions. See ComingSoonTab.
// ============================================================================

import Link from "next/link";
import { getTranslations } from "@/lib/i18n/server";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";
import { OverviewTab } from "./overview-tab";
import { InvoicesTab } from "./invoices-tab";
import { CollectionsTab } from "./collections-tab";
import { PlansTab } from "./plans-tab";
import { PayoutsTab } from "./payouts-tab";
import { ReportsTab } from "./reports-tab";
import { LedgerTab } from "./ledger-tab";

const TABS = [
  "overview",
  "invoices",
  "collections",
  "plans",
  "ledger",
  "reconcile",
  "payouts",
  "reports",
] as const;
export type MoneyTabId = (typeof TABS)[number];

function resolveTab(tab: string | undefined): MoneyTabId {
  return TABS.includes(tab as MoneyTabId) ? (tab as MoneyTabId) : "overview";
}

function ComingSoonTab({ title, body, note }: { title: string; body: string; note?: string }) {
  return (
    <div className="mx-auto max-w-6xl p-6">
      <GlassPanel className="!p-14 text-center">
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{body}</p>
        {note && <p className="mx-auto mt-4 max-w-md text-xs text-muted">{note}</p>}
      </GlassPanel>
    </div>
  );
}

export default async function MoneyPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; invoice?: string; error?: string }>;
}) {
  const params = await searchParams;
  const tab = resolveTab(params.tab);
  const t = await getTranslations("admin.money");

  const tabs: { id: MoneyTabId; href: string; label: string }[] = TABS.map((id) => ({
    id,
    href: id === "overview" ? "/portal/admin/money" : `/portal/admin/money?tab=${id}`,
    label: t(`tabs.${id}`),
  }));

  const comingSoonTitle = t("comingSoon.title");
  const comingSoonBody = t("comingSoon.body");
  const reconcileTitle = t("reconcile.title");
  const reconcileBody = t("reconcile.body");
  const reconcileNote = t("reconcile.note");

  return (
    <div>
      <div className="mx-auto max-w-6xl px-6 pt-6">
        <div
          className="flex w-fit flex-wrap gap-1 rounded-[14px] border p-1.5"
          style={{
            background: "linear-gradient(148deg, var(--refract), transparent 42%), var(--glass)",
            borderColor: "var(--edge)",
            backdropFilter: "blur(var(--blur)) saturate(1.85)",
            WebkitBackdropFilter: "blur(var(--blur))",
          }}
        >
          {tabs.map(({ id, href, label }) => (
            <Link
              key={id}
              href={href}
              scroll={false}
              className="rounded-[10px] px-4 py-1.5 text-xs font-semibold transition-all"
              style={{
                color: tab === id ? "var(--ink, var(--text))" : "var(--muted)",
                background: tab === id ? "var(--t3)" : "transparent",
                border: tab === id ? "1px solid var(--tb)" : "1px solid transparent",
              }}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      {tab === "overview" && <OverviewTab />}
      {tab === "invoices" && <InvoicesTab initialInvoiceId={params.invoice ?? null} />}
      {tab === "collections" && <CollectionsTab />}
      {tab === "plans" && <PlansTab />}
      {tab === "ledger" && <LedgerTab />}
      {tab === "reconcile" && (
        <ComingSoonTab title={reconcileTitle} body={reconcileBody} note={reconcileNote} />
      )}
      {tab === "payouts" && <PayoutsTab bannerError={params.error ?? null} />}
      {tab === "reports" && <ReportsTab />}
    </div>
  );
}
