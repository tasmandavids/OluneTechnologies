// ============================================================================
//  Shared Stripe event processor.
//
//  Called from both /api/webhooks/stripe (platform events — payments,
//  refunds, subscriptions) and /api/webhooks/stripe-connect (Connect
//  events — account.updated). Destination charges mean PaymentIntents,
//  Charges and Refunds stay platform-side, so the existing payment/refund
//  cases never need `event.account` — only account.updated is new.
// ============================================================================

import type Stripe from "stripe";
import type { ServiceSupabase } from "@/lib/webhooks/service-supabase";
import { CURRENCY, gstComponentCents } from "@/lib/currency";
import { recordTermInstallmentPaid } from "@/lib/term-payment-plan-service";
import {
  classifyPaymentIntent,
  subscriptionIdFromInvoice,
  paymentIntentIdFromInvoice,
  invoiceAmountCents,
  subscriptionStatusFor,
  subscriptionPeriodEndIso,
  refundDescriptor,
} from "@/lib/webhooks/stripe-events";
import {
  xeroSyncAfterPayment,
  xeroSyncAfterRefund,
  xeroSyncTicketByPaymentIntent,
} from "@/lib/xero/webhook-sync";
import { syncStripeAccountStatus } from "@/lib/stripe/connect";

export async function processStripeEvent(event: Stripe.Event, supabase: ServiceSupabase): Promise<void> {
  switch (event.type) {
    case "payment_intent.succeeded": {
      const intent = event.data.object as Stripe.PaymentIntent;
      const target = classifyPaymentIntent(intent.metadata);

      // ── Term payment plan installment ──────────────────────────────────
      if (target.kind === "term_plan") {
        if (!target.installmentNumber) {
          console.warn("[stripe-webhook] term_plan missing installment_number");
          break;
        }

        const { completed, plan } = await recordTermInstallmentPaid(
          supabase,
          target.planId,
          intent.amount_received,
          target.installmentNumber,
        );

        await supabase.from("payments").insert({
          studio_id: target.studioId ?? plan.studio_id,
          payer_id: target.payerId ?? plan.payer_id,
          amount_cents: intent.amount_received,
          currency: intent.currency,
          stripe_payment_intent_id: intent.id,
          term_payment_plan_id: target.planId,
          status: "succeeded",
          description: intent.description,
        });

        if (completed) {
          const { data: links } = await supabase
            .from("term_payment_plan_invoices")
            .select("invoice_id")
            .eq("plan_id", target.planId);
          for (const link of links ?? []) {
            await xeroSyncAfterPayment(supabase, "invoice", link.invoice_id as string);
          }
        }

        console.log(
          `[stripe-webhook] term_plan ${target.planId} installment ${target.installmentNumber}${completed ? " (complete)" : ""}`,
        );
        break;
      }

      // ── Invoice payment ────────────────────────────────────────────────
      if (target.kind === "invoice") {
        const { data: updatedInvoices, error: invUpdateErr } = await supabase
          .from("invoices")
          .update({
            status: "paid",
            paid_at: new Date().toISOString(),
            stripe_payment_intent_id: intent.id,
          })
          .eq("id", target.invoiceId)
          .eq("stripe_payment_intent_id", intent.id)
          .select("id");

        if (invUpdateErr || !updatedInvoices?.length) {
          console.warn(
            `[stripe-webhook] payment_intent.succeeded — invoice ${target.invoiceId} PI mismatch or not found`,
          );
          break;
        }

        await supabase.from("payments").insert({
          studio_id: target.studioId,
          payer_id: target.payerId,
          invoice_id: target.invoiceId,
          amount_cents: intent.amount_received,
          currency: intent.currency,
          stripe_payment_intent_id: intent.id,
          status: "succeeded",
          description: intent.description,
        });

        await xeroSyncAfterPayment(supabase, "invoice", target.invoiceId);

        console.log(`[stripe-webhook] payment_intent.succeeded — invoice ${target.invoiceId} marked paid`);
        break;
      }

      // ── Shop order payment ─────────────────────────────────────────────
      // Setting status='paid' fires the stock-decrement DB trigger.
      if (target.kind === "order") {
        const { data: updatedOrders, error: orderUpdateErr } = await supabase
          .from("orders")
          .update({
            status: "paid",
            stripe_payment_intent_id: intent.id,
          })
          .eq("id", target.orderId)
          .eq("stripe_payment_intent_id", intent.id)
          .select("id");

        if (orderUpdateErr || !updatedOrders?.length) {
          console.warn(
            `[stripe-webhook] payment_intent.succeeded — order ${target.orderId} PI mismatch or not found`,
          );
          break;
        }

        await xeroSyncAfterPayment(supabase, "order", target.orderId);

        console.log(`[stripe-webhook] payment_intent.succeeded — order ${target.orderId} marked paid`);
        break;
      }

      // ── Event ticket payment ───────────────────────────────────────────
      // Promote the reserved ticket to 'paid'; the sync trigger keeps
      // events.sold_tickets accurate.
      if (target.kind === "ticket") {
        let q = supabase
          .from("event_tickets")
          .update({ status: "paid" })
          .eq("event_id", target.eventId)
          .eq("stripe_payment_intent_id", intent.id);
        if (target.userId) q = q.eq("user_id", target.userId);
        await q;

        await xeroSyncTicketByPaymentIntent(supabase, target.eventId, intent.id, target.userId);

        console.log(`[stripe-webhook] payment_intent.succeeded — event ticket (${target.eventId}) marked paid`);
        break;
      }

      // ── Class pass payment ─────────────────────────────────────────────
      if (target.kind === "class_pass") {
        const { data: updated, error } = await supabase
          .from("class_passes")
          .update({ status: "paid" })
          .eq("id", target.passId)
          .eq("stripe_payment_intent_id", intent.id)
          .eq("status", "reserved")
          .select("id, studio_id, student_id");

        if (error || !updated?.length) {
          console.warn(
            `[stripe-webhook] payment_intent.succeeded — class_pass ${target.passId} PI mismatch or not found`,
          );
          break;
        }

        const pass = updated[0];

        await supabase.from("payments").insert({
          studio_id: pass.studio_id,
          payer_id: pass.student_id,
          invoice_id: null,
          amount_cents: intent.amount_received,
          currency: intent.currency,
          stripe_payment_intent_id: intent.id,
          status: "succeeded",
          description: "Adult ballet class pass",
        });

        await supabase.from("notifications").insert({
          studio_id: pass.studio_id,
          user_id: pass.student_id,
          type: "class_pass_paid",
          title: "Your class pass is ready",
          body: "Show the QR code at the studio to redeem it for any single adult ballet class.",
          link: "/portal/student",
        });

        console.log(`[stripe-webhook] payment_intent.succeeded — class_pass ${target.passId} marked paid`);
        break;
      }

      console.log("[stripe-webhook] payment_intent.succeeded — no matching metadata, ignored");
      break;
    }

    case "invoice.paid": {
      const stripeInvoice = event.data.object as Stripe.Invoice & {
        subscription?: string | Stripe.Subscription | null;
        payment_intent?: string | Stripe.PaymentIntent | null;
      };
      const stripeInvoiceId = stripeInvoice.id;

      // 1. Try to finalise an existing invoices row (one-off Billing flow).
      const { data: updated } = await supabase
        .from("invoices")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          stripe_invoice_id: stripeInvoiceId,
        })
        .eq("stripe_invoice_id", stripeInvoiceId)
        .select("id");

      if (updated && updated.length) {
        console.log(`[stripe-webhook] invoice.paid — updated existing invoice ${stripeInvoiceId}`);
        break;
      }

      // 2. Recurring auto-pay charge → mirror a per-charge invoices + payments
      //    row so billing/revenue reporting includes subscription income.
      const subId = subscriptionIdFromInvoice(stripeInvoice);

      if (!subId) {
        console.log(`[stripe-webhook] invoice.paid — ${stripeInvoiceId} (no subscription, ignored)`);
        break;
      }

      // Idempotency: skip if we've already mirrored this Stripe invoice.
      const { data: existing } = await supabase
        .from("invoices")
        .select("id")
        .eq("stripe_invoice_id", stripeInvoiceId)
        .limit(1);
      if (existing && existing.length) {
        console.log(`[stripe-webhook] invoice.paid — ${stripeInvoiceId} already mirrored`);
        break;
      }

      const { data: subRow } = await supabase
        .from("subscriptions")
        .select("studio_id, payer_id, student_id, plan_label")
        .eq("stripe_subscription_id", subId)
        .single();

      if (!subRow) {
        console.log(`[stripe-webhook] invoice.paid — no subscription row for ${subId}, skipped`);
        break;
      }

      const amount = invoiceAmountCents(stripeInvoice);
      const piId = paymentIntentIdFromInvoice(stripeInvoice);

      const { data: newInvoice } = await supabase
        .from("invoices")
        .insert({
          studio_id: subRow.studio_id,
          payer_id: subRow.payer_id,
          student_id: subRow.student_id,
          amount_cents: amount,
          gst_cents: gstComponentCents(amount),
          status: "paid",
          stripe_invoice_id: stripeInvoiceId,
          stripe_payment_intent_id: piId,
          paid_at: new Date().toISOString(),
          issued_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      await supabase.from("payments").insert({
        studio_id: subRow.studio_id,
        payer_id: subRow.payer_id,
        invoice_id: newInvoice?.id ?? null,
        amount_cents: amount,
        currency: stripeInvoice.currency ?? CURRENCY,
        stripe_payment_intent_id: piId,
        status: "succeeded",
        description: subRow.plan_label
          ? `Auto-pay — ${subRow.plan_label}`
          : "Auto-pay subscription charge",
      });

      if (newInvoice?.id) {
        await xeroSyncAfterPayment(supabase, "invoice", newInvoice.id);
      }

      console.log(`[stripe-webhook] invoice.paid — mirrored subscription charge ${stripeInvoiceId}`);
      break;
    }

    case "invoice.payment_failed": {
      const stripeInvoice = event.data.object as Stripe.Invoice & {
        subscription?: string | Stripe.Subscription | null;
      };

      // If this maps to one of our invoice rows, flag it overdue (the 0008
      // trigger already emits an invoice_overdue notification on that change).
      if (stripeInvoice.id) {
        await supabase
          .from("invoices")
          .update({ status: "overdue" })
          .eq("stripe_invoice_id", stripeInvoice.id)
          .neq("status", "paid");
      }

      // Resolve who to notify. Subscription invoices won't match an invoices
      // row, so fall back to the subscriptions table by Stripe subscription id.
      let studioId: string | null = null;
      let userId: string | null = null;

      const subId = subscriptionIdFromInvoice(stripeInvoice);

      if (subId) {
        const { data: subRow } = await supabase
          .from("subscriptions")
          .select("studio_id, payer_id")
          .eq("stripe_subscription_id", subId)
          .single();
        studioId = subRow?.studio_id ?? null;
        userId = subRow?.payer_id ?? null;
      }

      if ((!studioId || !userId) && stripeInvoice.id) {
        const { data: invRow } = await supabase
          .from("invoices")
          .select("studio_id, payer_id")
          .eq("stripe_invoice_id", stripeInvoice.id)
          .single();
        studioId = studioId ?? invRow?.studio_id ?? null;
        userId = userId ?? invRow?.payer_id ?? null;
      }

      if (studioId && userId) {
        await supabase.from("notifications").insert({
          studio_id: studioId,
          user_id: userId,
          type: "payment_failed",
          title: "Payment failed",
          body: "We couldn't process your payment. Please update your payment method.",
          link: "/portal/parent",
        });
      }

      console.log(`[stripe-webhook] invoice.payment_failed — ${stripeInvoice.id}`);
      break;
    }

    case "charge.refunded": {
      // Reconcile refunds — whether issued via our admin action or directly
      // in the Stripe Dashboard. Find the local sale row by payment intent,
      // flip it to 'refunded' (fires restock / capacity-release triggers),
      // and record a negative ledger row. Idempotent on stripe_refund_id.
      const charge = event.data.object as Stripe.Charge;
      const { paymentIntentId: piId, refundId, refundedCents } = refundDescriptor(charge);

      if (!piId) {
        console.log("[stripe-webhook] charge.refunded — no payment_intent, ignored");
        break;
      }

      // Already recorded by our admin action (or a previous delivery)?
      const { data: ledgered } = await supabase
        .from("payments")
        .select("id")
        .eq("stripe_refund_id", refundId)
        .limit(1);
      if (ledgered && ledgered.length) {
        console.log(`[stripe-webhook] charge.refunded — ${refundId} already recorded`);
        break;
      }

      const nowIso = new Date().toISOString();
      const refundPatch = {
        status: "refunded",
        refunded_at: nowIso,
        refund_amount_cents: refundedCents,
        stripe_refund_id: refundId,
      };

      // Try each sale table in turn; only one will match the payment intent.
      let refStudioId: string | null = null;
      let refPayerId: string | null = null;
      let refInvoiceId: string | null = null;
      let refOrderId: string | null = null;
      let refTicketId: string | null = null;

      const { data: inv } = await supabase
        .from("invoices")
        .update(refundPatch)
        .eq("stripe_payment_intent_id", piId)
        .neq("status", "refunded")
        .select("id, studio_id, payer_id");
      if (inv && inv.length) {
        refStudioId = inv[0].studio_id;
        refPayerId = inv[0].payer_id;
        refInvoiceId = inv[0].id;
      }

      if (!refStudioId) {
        const { data: ord } = await supabase
          .from("orders")
          .update(refundPatch)
          .eq("stripe_payment_intent_id", piId)
          .neq("status", "refunded")
          .select("id, studio_id, user_id");
        if (ord && ord.length) {
          refStudioId = ord[0].studio_id;
          refPayerId = ord[0].user_id;
          refOrderId = ord[0].id;
        }
      }

      if (!refStudioId) {
        const { data: tkt } = await supabase
          .from("event_tickets")
          .update(refundPatch)
          .eq("stripe_payment_intent_id", piId)
          .neq("status", "refunded")
          .select("id, user_id, events ( studio_id )");
        if (tkt && tkt.length) {
          const ev = tkt[0].events as unknown as { studio_id: string } | null;
          refStudioId = ev?.studio_id ?? null;
          refPayerId = tkt[0].user_id;
          refTicketId = tkt[0].id;
        }
      }

      if (!refStudioId) {
        const { data: refundedPass } = await supabase
          .from("class_passes")
          .update(refundPatch)
          .eq("stripe_payment_intent_id", piId)
          .eq("status", "paid")
          .select("id, student_id, studio_id");
        if (refundedPass && refundedPass.length) {
          refStudioId = refundedPass[0].studio_id;
          refPayerId = refundedPass[0].student_id;
        } else {
          const { data: redeemedPass } = await supabase
            .from("class_passes")
            .select("id, student_id, studio_id")
            .eq("stripe_payment_intent_id", piId)
            .eq("status", "redeemed")
            .maybeSingle();
          if (redeemedPass) {
            refStudioId = redeemedPass.studio_id;
            refPayerId = redeemedPass.student_id;
          }
        }
      }

      if (refStudioId) {
        await supabase.from("payments").insert({
          studio_id: refStudioId,
          payer_id: refPayerId,
          invoice_id: refInvoiceId,
          amount_cents: -refundedCents,
          currency: charge.currency ?? CURRENCY,
          stripe_payment_intent_id: piId,
          stripe_refund_id: refundId,
          status: "refunded",
          description: "Refund (Stripe)",
        });

        if (refInvoiceId) {
          await xeroSyncAfterRefund(supabase, "invoice", refInvoiceId, refundedCents);
        } else if (refOrderId) {
          await xeroSyncAfterRefund(supabase, "order", refOrderId, refundedCents);
        } else if (refTicketId) {
          await xeroSyncAfterRefund(supabase, "ticket", refTicketId, refundedCents);
        }

        console.log(`[stripe-webhook] charge.refunded — reconciled ${refundId} (${piId})`);
      } else {
        console.log(`[stripe-webhook] charge.refunded — no matching sale for ${piId}`);
      }
      break;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      // Sync the subscriptions row (Phase 3.2 auto-pay).
      const sub = event.data.object as Stripe.Subscription & {
        current_period_end?: number | null;
      };

      const status = subscriptionStatusFor(event.type, sub);

      await supabase
        .from("subscriptions")
        .update({
          status,
          current_period_end: subscriptionPeriodEndIso(sub),
          cancel_at_period_end: sub.cancel_at_period_end ?? false,
        })
        .eq("stripe_subscription_id", sub.id);

      console.log(`[stripe-webhook] ${event.type} — subscription ${sub.id} → ${status}`);
      break;
    }

    case "account.updated": {
      // Connect: keep stripe_connect_accounts' charges_enabled/payouts_enabled/
      // disabled_reason fresh even outside the onboarding return_url redirect
      // (e.g. Stripe later restricts an account for a compliance reason).
      const account = event.data.object as Stripe.Account;
      const updated = await syncStripeAccountStatus(supabase, account.id);
      if (updated) {
        console.log(
          `[stripe-webhook] account.updated — ${account.id} charges_enabled=${updated.charges_enabled}`,
        );
      } else {
        console.log(`[stripe-webhook] account.updated — ${account.id} not tracked, ignored`);
      }
      break;
    }

    default:
      // Unhandled event type — return 200 so Stripe doesn't retry
      break;
  }
}
