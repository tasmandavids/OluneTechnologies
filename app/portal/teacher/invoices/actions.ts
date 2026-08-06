"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/notify/providers";
import {
  formatAmount,
  renderContractorInvoiceEmail,
  type ContractorInvoiceLine,
} from "@/lib/invoices/contractor-invoice-email";

const LineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unit_cents: z.number().int().nonnegative(),
});

const InvoiceSchema = z.object({
  recipient_label: z.string().min(1).max(120),
  studio_id: z.string().uuid().optional().nullable(),
  private_client_id: z.string().uuid().optional().nullable(),
  description: z.string().min(1).max(500),
  line_items: z.array(LineItemSchema),
  amount_cents: z.number().int().nonnegative(),
  due_date: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

async function requireTeacher() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  return { supabase, userId: user.id };
}

export async function createContractorInvoice(data: z.infer<typeof InvoiceSchema>) {
  const { supabase, userId } = await requireTeacher();
  const parsed = InvoiceSchema.parse(data);
  const { error } = await supabase.from("contractor_invoices").insert({
    instructor_id: userId,
    ...parsed,
    status: "draft",
  });
  if (error) return { error: error.message };
  return { ok: true };
}

export async function updateContractorInvoice(id: string, data: z.infer<typeof InvoiceSchema>) {
  const { supabase } = await requireTeacher();
  const parsed = InvoiceSchema.parse(data);
  const { error } = await supabase.from("contractor_invoices").update({
    ...parsed,
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) return { error: error.message };
  return { ok: true };
}

/**
 * Record an invoice as sent WITHOUT sending it — for an instructor who handed
 * it over in person or emailed it themselves. Kept alongside
 * `sendContractorInvoice` because both are real workflows; what matters is
 * that the two are not confused with each other in the UI.
 */
export async function markInvoiceSent(id: string) {
  const { supabase, userId } = await requireTeacher();
  const { error } = await supabase.from("contractor_invoices")
    .update({ status: "sent", updated_at: new Date().toISOString() })
    .eq("id", id).eq("instructor_id", userId).eq("status", "draft");
  if (error) return { error: error.message };
  return { ok: true };
}

/**
 * Actually deliver the invoice, then mark it sent.
 *
 * The ordering is the point: `status` only becomes 'sent' if something was
 * genuinely delivered. Flipping the status first and best-effort emailing
 * afterwards would leave an instructor believing a studio had been invoiced
 * when nothing ever arrived — which is exactly the failure that makes people
 * stop trusting the number on their dashboard.
 *
 * Two recipient shapes:
 *  • private client — not an Olune user, so email is the only channel
 *  • studio — email its admins AND drop an in-app notification, because the
 *    admin needs this in their queue, not just their inbox
 */
export async function sendContractorInvoice(id: string) {
  const { supabase, userId } = await requireTeacher();

  const { data: invoice, error: loadErr } = await supabase
    .from("contractor_invoices")
    .select(
      "id, studio_id, private_client_id, recipient_label, description, line_items, amount_cents, currency, invoice_number, due_date, notes, status",
    )
    .eq("id", id)
    .eq("instructor_id", userId)
    .maybeSingle();

  if (loadErr) return { error: loadErr.message };
  if (!invoice) return { error: "Invoice not found." };
  if (invoice.status !== "draft") return { error: "Only a draft invoice can be sent." };

  const { data: me } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();
  const fromName = (me?.full_name as string | null)?.trim() || "Your instructor";

  // ── Resolve who this goes to ───────────────────────────────────────────────
  let recipients: string[] = [];
  let studioAdminIds: string[] = [];

  if (invoice.private_client_id) {
    const { data: client } = await supabase
      .from("private_clients")
      .select("email")
      .eq("id", invoice.private_client_id)
      .maybeSingle();
    const email = (client?.email as string | null)?.trim();
    if (!email) {
      return { error: `${invoice.recipient_label} has no email address — add one on the client, or use "Mark sent".` };
    }
    recipients = [email];
  } else if (invoice.studio_id) {
    const { data: admins } = await supabase
      .from("profiles")
      .select("id, email")
      .eq("studio_id", invoice.studio_id)
      .eq("role", "admin");
    studioAdminIds = (admins ?? []).map((a) => a.id as string);
    recipients = (admins ?? [])
      .map((a) => (a.email as string | null)?.trim())
      .filter((e): e is string => Boolean(e));
    if (recipients.length === 0) {
      return { error: "That studio has no admin email address on file — use \"Mark sent\" instead." };
    }
  } else {
    return { error: "This invoice has no recipient — edit it and choose a studio or client." };
  }

  const rendered = renderContractorInvoiceEmail(
    {
      invoiceNumber: (invoice.invoice_number as number | null) ?? null,
      recipientLabel: invoice.recipient_label as string,
      description: invoice.description as string,
      lineItems: Array.isArray(invoice.line_items)
        ? (invoice.line_items as ContractorInvoiceLine[])
        : [],
      amountCents: invoice.amount_cents as number,
      currency: (invoice.currency as string) ?? "nzd",
      dueDate: (invoice.due_date as string | null) ?? null,
      notes: (invoice.notes as string | null) ?? null,
    },
    fromName,
  );

  // ── Deliver ────────────────────────────────────────────────────────────────
  const results = await Promise.all(
    recipients.map((to) =>
      sendEmail({ to, subject: rendered.subject, html: rendered.html, text: rendered.text }),
    ),
  );
  const delivered = results.filter((r) => r.ok).length;

  if (delivered === 0) {
    const skipped = results.some((r) => r.skipped);
    return {
      error: skipped
        ? "Email isn't configured on this deployment, so the invoice wasn't sent. Use \"Mark sent\" if you've sent it yourself."
        : `The invoice couldn't be emailed: ${results.map((r) => (!r.ok && !r.skipped ? r.error : "")).filter(Boolean).join("; ")}`,
    };
  }

  // In-app copy for studio admins. The type routes to no outbound channel, so
  // the delivery cron won't email this a second time.
  if (studioAdminIds.length > 0 && invoice.studio_id) {
    await supabase.from("notifications").insert(
      studioAdminIds.map((adminId) => ({
        studio_id: invoice.studio_id as string,
        user_id: adminId,
        type: "contractor_invoice_received",
        title: `Invoice from ${fromName}`,
        body: `${formatAmount(invoice.amount_cents as number, (invoice.currency as string) ?? "nzd")} — ${invoice.description as string}`,
        link: "/portal/admin/money?tab=invoices",
        payload: { contractor_invoice_id: invoice.id },
      })),
    );
  }

  const { error: statusErr } = await supabase
    .from("contractor_invoices")
    .update({ status: "sent", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("instructor_id", userId)
    .eq("status", "draft");

  if (statusErr) return { error: statusErr.message };
  return { ok: true, delivered };
}

export async function markInvoicePaid(id: string) {
  const { supabase } = await requireTeacher();
  const { error } = await supabase.from("contractor_invoices")
    .update({ status: "paid", paid_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id).in("status", ["sent", "draft"]);
  if (error) return { error: error.message };
  return { ok: true };
}

export async function voidContractorInvoice(id: string) {
  const { supabase } = await requireTeacher();
  const { error } = await supabase.from("contractor_invoices")
    .update({ status: "void", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  return { ok: true };
}

export async function deleteContractorInvoice(id: string) {
  const { supabase } = await requireTeacher();
  const { error } = await supabase.from("contractor_invoices")
    .delete().eq("id", id).eq("status", "draft");
  if (error) return { error: error.message };
  return { ok: true };
}
