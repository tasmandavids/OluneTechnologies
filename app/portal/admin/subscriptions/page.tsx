// ============================================================================
//  /portal/admin/subscriptions — merged into Money's Plans tab. Route kept
//  as a redirect so old links and bookmarks keep working; the type exports
//  below are still imported by SubscriptionsManager.
// ============================================================================

import { redirect } from "next/navigation";

export type SubscriptionRow = {
  id: string;
  stripeSubscriptionId: string | null;
  planLabel: string | null;
  amountCents: number;
  monthlyAmountCents: number;
  billingInterval: string;
  interval: string;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  adminCreated: boolean;
  payerName: string | null;
  studentName: string | null;
  className: string | null;
};

export type ParentOption = {
  id: string;
  name: string;
  students: { id: string; name: string }[];
};

export type ClassOption = {
  id: string;
  name: string;
  priceCents: number;
};

export type ProductOption = {
  id: string;
  name: string;
  priceCents: number;
};

export default function SubscriptionsPage() {
  redirect("/portal/admin/money?tab=plans");
}
