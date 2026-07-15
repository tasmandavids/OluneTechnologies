// ============================================================================
//  /portal/admin/payment-plans — merged into the Billing hub (1.6.1 IA).
//  Route kept as a redirect so old links and bookmarks keep working; the
//  type exports below are still imported by TermPaymentPlansManager.
// ============================================================================

import { redirect } from "next/navigation";

export type TermPlan = {
  id: string;
  payerId: string;
  payerName: string | null;
  totalCents: number;
  installmentCount: number;
  installmentAmounts: number[];
  installmentsPaid: number;
  amountPaidCents: number;
  nextDueDate: string | null;
  status: "active" | "completed" | "cancelled";
  createdAt: string;
};

export type PayerOption = { id: string; name: string; email: string | null };
export type UnpaidInvoice = { id: string; invoiceNumber: number; amountCents: number; payerId: string; description: string | null };

export default function PaymentPlansPage() {
  redirect("/portal/admin/billing?tab=payment-plans");
}
