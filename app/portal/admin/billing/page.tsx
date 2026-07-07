// ============================================================================
//  /portal/admin/billing — Finance hub: invoices, subscriptions, payment plans.
//  One door for "did they pay?" — tab state lives in ?tab= so deep links from
//  the old /subscriptions and /payment-plans routes keep working.
// ============================================================================

import Link from "next/link";
import { getTranslations } from "@/lib/i18n/server";
import { InvoicesTab } from "./invoices-tab";
import { SubscriptionsTab } from "./subscriptions-tab";
import { PaymentPlansTab } from "./payment-plans-tab";

export type InvoiceLineItem = {
  id: string;
  description: string;
  quantity: number;
  unitCents: number;
  lineTotalCents: number;
  sortOrder: number;
};

export type InvoiceRow = {
  id: string;
  invoiceNumber: number;
  payerId: string;
  studentId: string | null;
  amountCents: number;
  status: string;
  description: string | null;
  dueDate: string | null;
  issuedAt: string | null;
  paidAt: string | null;
  studentName: string | null;
  payerName: string | null;
  stripePaymentIntentId: string | null;
  xeroInvoiceId: string | null;
  lineItems: InvoiceLineItem[];
};

export type TemplateLineItem = {
  description: string;
  quantity: number;
  unitCents: number;
};

export type InvoiceTemplate = {
  id: string;
  name: string;
  description: string | null;
  defaultDueDays: number;
  lineItems: TemplateLineItem[];
};

export type ParentOption = {
  id: string;
  name: string;
  email: string | null;
  students: { id: string; name: string }[];
};

export type UnpaidAccount = {
  payerId: string;
  payerName: string;
  totalCents: number;
  overdueCents: number;
  invoiceCount: number;
  oldestDueDate: string | null;
};

export type RevenueSeries = { month: string; revenueCents: number }[];

export type SourceBreakdown = {
  tuitionCents: number;
  shopCents: number;
  eventsCents: number;
};

export type BillingSubscriptionRow = {
  id: string;
  stripeSubscriptionId: string | null;
  planLabel: string | null;
  payerName: string | null;
  studentName: string | null;
  monthlyAmountCents: number;
  billingInterval: string;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

const TABS = ["invoices", "subscriptions", "payment-plans"] as const;
export type BillingTabId = (typeof TABS)[number];

function resolveTab(tab: string | undefined): BillingTabId {
  return TABS.includes(tab as BillingTabId) ? (tab as BillingTabId) : "invoices";
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; invoice?: string }>;
}) {
  const params = await searchParams;
  const tab = resolveTab(params.tab);
  const t = await getTranslations("admin.billing");

  const tabs: { id: BillingTabId; href: string; label: string }[] = [
    { id: "invoices", href: "/portal/admin/billing", label: t("tabs.invoices") },
    {
      id: "subscriptions",
      href: "/portal/admin/billing?tab=subscriptions",
      label: t("tabs.subscriptions"),
    },
    {
      id: "payment-plans",
      href: "/portal/admin/billing?tab=payment-plans",
      label: t("tabs.paymentPlans"),
    },
  ];

  return (
    <div>
      <div className="mx-auto max-w-6xl px-6 pt-6">
        <div className="flex w-fit gap-1 rounded-xl border border-[--hair] bg-surface p-1">
          {tabs.map(({ id, href, label }) => (
            <Link
              key={id}
              href={href}
              scroll={false}
              className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition ${
                tab === id ? "bg-ink text-paper" : "text-muted hover:text-ink"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      {tab === "invoices" && <InvoicesTab initialInvoiceId={params.invoice ?? null} />}
      {tab === "subscriptions" && <SubscriptionsTab />}
      {tab === "payment-plans" && <PaymentPlansTab />}
    </div>
  );
}
