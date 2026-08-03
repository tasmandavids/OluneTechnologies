// ============================================================================
//  /portal/admin/billing — merged into Money (invoices/collections/plans/
//  ledger/reconcile/payouts/reports). Route kept as a redirect so old links
//  and bookmarks keep working; the type exports below are still imported by
//  BillingDashboard, InvoiceDetailModal, InvoiceTemplatesModal and
//  money/invoices-tab.tsx.
// ============================================================================

import { redirect } from "next/navigation";

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

const MONEY_TAB: Record<string, string> = {
  invoices: "invoices",
  subscriptions: "plans",
  "payment-plans": "plans",
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; invoice?: string }>;
}) {
  const params = await searchParams;
  const tab = MONEY_TAB[params.tab ?? "invoices"] ?? "invoices";
  const qs = new URLSearchParams({ tab });
  if (params.invoice) qs.set("invoice", params.invoice);
  redirect(`/portal/admin/money?${qs.toString()}`);
}
