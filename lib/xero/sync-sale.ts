import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Contact,
  CreditNote,
  CreditNotes,
  CurrencyCode,
  Invoice,
  Invoices,
  LineAmountTypes,
  LineItem,
  Payment,
} from "xero-node";
import { loadStudioXeroClient } from "./client";
import { formatInvoiceNumber } from "@/lib/invoices/format-invoice-number";
import { dollarsFromCents } from "./reports";
import type { XeroConnectionSettings, XeroSyncSourceType } from "./types";
import { DEFAULT_XERO_SETTINGS } from "./types";

type SyncResult = { ok: true; xeroInvoiceId: string } | { ok: false; error: string };

function settings(raw: unknown): XeroConnectionSettings {
  return { ...DEFAULT_XERO_SETTINGS, ...(raw as XeroConnectionSettings) };
}

async function ensureSyncLog(
  supabase: SupabaseClient,
  studioId: string,
  sourceType: XeroSyncSourceType,
  sourceId: string,
): Promise<{ skip: true; xeroInvoiceId: string } | { skip: false }> {
  const { data: existing } = await supabase
    .from("xero_sync_log")
    .select("xero_invoice_id, status")
    .eq("source_type", sourceType)
    .eq("source_id", sourceId)
    .maybeSingle();

  if (existing?.status === "success" && existing.xero_invoice_id) {
    return { skip: true, xeroInvoiceId: existing.xero_invoice_id };
  }

  await supabase.from("xero_sync_log").upsert(
    {
      studio_id: studioId,
      source_type: sourceType,
      source_id: sourceId,
      status: "pending",
      error: null,
    },
    { onConflict: "source_type,source_id" },
  );

  return { skip: false };
}

async function markSyncResult(
  supabase: SupabaseClient,
  sourceType: XeroSyncSourceType,
  sourceId: string,
  result: SyncResult,
) {
  await supabase
    .from("xero_sync_log")
    .update({
      status: result.ok ? "success" : "failed",
      xero_invoice_id: result.ok ? result.xeroInvoiceId : null,
      error: result.ok ? null : result.error,
    })
    .eq("source_type", sourceType)
    .eq("source_id", sourceId);
}

async function resolveContact(
  supabase: SupabaseClient,
  loaded: Awaited<ReturnType<typeof loadStudioXeroClient>>,
  profileId: string,
): Promise<Contact> {
  if (!loaded) throw new Error("Xero not connected");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email, xero_contact_id")
    .eq("id", profileId)
    .single();

  if (!profile) throw new Error("Payer profile not found");

  if (profile.xero_contact_id) {
    return { contactID: profile.xero_contact_id };
  }

  const contactPayload: Contact = {
    name: profile.full_name ?? profile.email ?? "Olune customer",
    emailAddress: profile.email ?? undefined,
  };

  const res = await loaded.client.accountingApi.createContacts(loaded.tenantId, {
    contacts: [contactPayload],
  });
  const created = res.body.contacts?.[0];
  if (!created?.contactID) throw new Error("Failed to create Xero contact");

  await supabase
    .from("profiles")
    .update({ xero_contact_id: created.contactID })
    .eq("id", profileId);

  return { contactID: created.contactID };
}

async function createOutstandingInvoice(
  loaded: NonNullable<Awaited<ReturnType<typeof loadStudioXeroClient>>>,
  contact: Contact,
  lineItems: LineItem[],
  reference: string,
  dueDate: string,
  issueDate: string,
): Promise<string> {
  const invoicePayload: Invoice = {
    type: Invoice.TypeEnum.ACCREC,
    contact,
    lineItems,
    date: issueDate,
    dueDate,
    reference,
    // Mirror Olune's own invoice number onto Xero's invoiceNumber field too —
    // otherwise Xero auto-assigns its own separate sequence and the two
    // systems show different numbers for the same invoice.
    invoiceNumber: reference,
    lineAmountTypes: LineAmountTypes.Inclusive,
    // Draft, not Authorised: keeps it out of Xero reporting/emailable-to-contact
    // until a bookkeeper reviews it, so nobody in Xero can send the customer a
    // copy that looks different from the one Olune already sent them.
    status: Invoice.StatusEnum.DRAFT,
    currencyCode: CurrencyCode.NZD,
  };

  const invRes = await loaded.client.accountingApi.createInvoices(loaded.tenantId, {
    invoices: [invoicePayload],
  });
  const invoice = invRes.body.invoices?.[0];
  if (!invoice?.invoiceID) throw new Error("Failed to create Xero invoice");
  return invoice.invoiceID;
}

/**
 * Payments can only be recorded against an Authorised (or Paid) Xero invoice —
 * ours start life as Draft (see createOutstandingInvoice), so flip it over
 * first if a payment is about to land on it.
 */
async function ensureXeroInvoiceAuthorised(
  loaded: NonNullable<Awaited<ReturnType<typeof loadStudioXeroClient>>>,
  xeroInvoiceId: string,
): Promise<void> {
  const res = await loaded.client.accountingApi.getInvoice(loaded.tenantId, xeroInvoiceId);
  const status = res.body.invoices?.[0]?.status;
  if (status === Invoice.StatusEnum.DRAFT || status === Invoice.StatusEnum.SUBMITTED) {
    await loaded.client.accountingApi.updateInvoice(loaded.tenantId, xeroInvoiceId, {
      invoices: [{ invoiceID: xeroInvoiceId, status: Invoice.StatusEnum.AUTHORISED }],
    } as Invoices);
  }
}

async function recordXeroPayment(
  loaded: NonNullable<Awaited<ReturnType<typeof loadStudioXeroClient>>>,
  cfg: XeroConnectionSettings,
  xeroInvoiceId: string,
  amountCents: number,
  reference: string,
) {
  await ensureXeroInvoiceAuthorised(loaded, xeroInvoiceId);
  const today = new Date().toISOString().slice(0, 10);
  const payment: Payment = {
    invoice: { invoiceID: xeroInvoiceId },
    account: { code: cfg.payment_account_code ?? DEFAULT_XERO_SETTINGS.payment_account_code },
    date: today,
    amount: dollarsFromCents(amountCents),
    reference: `Olune — ${reference}`,
  };
  await loaded.client.accountingApi.createPayment(loaded.tenantId, payment);
}

async function createPaidInvoice(
  loaded: NonNullable<Awaited<ReturnType<typeof loadStudioXeroClient>>>,
  cfg: XeroConnectionSettings,
  contact: Contact,
  lineItems: LineItem[],
  reference: string,
  amountCents: number,
): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  const invoicePayload: Invoice = {
    type: Invoice.TypeEnum.ACCREC,
    contact,
    lineItems,
    date: today,
    dueDate: today,
    reference,
    // See createOutstandingInvoice — keep Xero's own invoiceNumber aligned
    // with Olune's reference instead of letting Xero auto-assign its own.
    invoiceNumber: reference,
    lineAmountTypes: LineAmountTypes.Inclusive,
    status: Invoice.StatusEnum.AUTHORISED,
    currencyCode: CurrencyCode.NZD,
  };

  const invRes = await loaded.client.accountingApi.createInvoices(loaded.tenantId, {
    invoices: [invoicePayload],
  });
  const invoice = invRes.body.invoices?.[0];
  if (!invoice?.invoiceID) throw new Error("Failed to create Xero invoice");

  await recordXeroPayment(loaded, cfg, invoice.invoiceID, amountCents, reference);
  return invoice.invoiceID;
}

async function loadInvoiceRecord(
  supabase: SupabaseClient,
  invoiceId: string,
): Promise<{
  studioId: string;
  payerId: string;
  amountCents: number;
  dueDate: string | null;
  issuedAt: string | null;
  xeroInvoiceId: string | null;
  lineDescription: string;
  reference: string;
  lineItems: LineItem[];
  /** True when lineItems came from real invoice_line_items rows, not a synthesized fallback. */
  hasLineItems: boolean;
}> {
  const { data: inv } = await supabase
    .from("invoices")
    .select(`
      id, studio_id, payer_id, amount_cents, due_date, issued_at, xero_invoice_id, invoice_number, description,
      student:profiles!student_id ( full_name ),
      invoice_line_items ( description, quantity, unit_cents, sort_order, account_code, item_code )
    `)
    .eq("id", invoiceId)
    .single();

  if (!inv) throw new Error("Invoice not found");

  const student = inv.student as unknown as { full_name: string | null } | null;
  const fallbackDescription =
    (inv.description as string | null)?.trim() ||
    (student?.full_name ? `Tuition & fees — ${student.full_name}` : "Tuition & fees");

  const rawLineItems = (
    (inv.invoice_line_items ?? []) as {
      description: string;
      quantity: number;
      unit_cents: number;
      sort_order: number;
      account_code: string | null;
      item_code: string | null;
    }[]
  )
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order);

  // Mirror each real invoice_line_items row into Xero — never flatten an
  // itemized invoice into one generic line, or the copy in Xero silently
  // stops matching what the parent was actually billed for. Leave
  // accountCode unset here (rather than hardcoding the studio default) so
  // callers' `li.accountCode ?? cfg.sales_account_code ?? DEFAULT...` fallback
  // chain can actually take effect for a line item with its own code.
  // itemCode (a Xero Products & Services item, distinct from the ledger
  // account) is only ever set when present — Xero rejects an itemCode that
  // doesn't exist in its catalog, so never send a placeholder.
  const lineItems: LineItem[] =
    rawLineItems.length > 0
      ? rawLineItems.map((li) => ({
          description: li.description,
          quantity: li.quantity,
          unitAmount: dollarsFromCents(li.unit_cents),
          accountCode: li.account_code ?? undefined,
          itemCode: li.item_code ?? undefined,
          taxType: "OUTPUT2",
        }))
      : [
          {
            description: fallbackDescription,
            quantity: 1,
            unitAmount: dollarsFromCents(inv.amount_cents as number),
            taxType: "OUTPUT2",
          },
        ];

  return {
    studioId: inv.studio_id as string,
    payerId: inv.payer_id as string,
    amountCents: inv.amount_cents as number,
    dueDate: (inv.due_date as string | null) ?? null,
    issuedAt: (inv.issued_at as string | null) ?? null,
    xeroInvoiceId: (inv.xero_invoice_id as string | null) ?? null,
    reference: formatInvoiceNumber(inv.invoice_number as number),
    lineDescription: fallbackDescription,
    lineItems,
    hasLineItems: rawLineItems.length > 0,
  };
}

async function loadInvoiceSale(
  supabase: SupabaseClient,
  invoiceId: string,
): Promise<{ studioId: string; payerId: string; amountCents: number; lineItems: LineItem[]; reference: string }> {
  const inv = await loadInvoiceRecord(supabase, invoiceId);
  if (inv.xeroInvoiceId) throw new Error("Already synced");

  return {
    studioId: inv.studioId,
    payerId: inv.payerId,
    amountCents: inv.amountCents,
    reference: inv.reference,
    lineItems: inv.lineItems,
  };
}

async function loadOrderSale(
  supabase: SupabaseClient,
  orderId: string,
  salesAccountCode: string,
): Promise<{ studioId: string; payerId: string; amountCents: number; lineItems: LineItem[]; reference: string }> {
  const { data: order } = await supabase
    .from("orders")
    .select("id, studio_id, user_id, total_cents, xero_invoice_id")
    .eq("id", orderId)
    .single();

  if (!order) throw new Error("Order not found");
  if (order.xero_invoice_id) throw new Error("Already synced");

  const { data: items } = await supabase
    .from("order_items")
    .select("qty, unit_price, products ( name )")
    .eq("order_id", orderId);

  const lineItems: LineItem[] = (items ?? []).map((item) => {
    const product = item.products as unknown as { name: string } | null;
    return {
      description: product?.name ?? "Merchandise",
      quantity: item.qty,
      unitAmount: dollarsFromCents(item.unit_price),
      accountCode: salesAccountCode,
      taxType: "OUTPUT2",
    };
  });

  if (!lineItems.length) {
    lineItems.push({
      description: "Shop purchase",
      quantity: 1,
      unitAmount: dollarsFromCents(order.total_cents),
      accountCode: salesAccountCode,
      taxType: "OUTPUT2",
    });
  }

  return {
    studioId: order.studio_id,
    payerId: order.user_id,
    amountCents: order.total_cents,
    reference: `ORD-${order.id.slice(0, 8)}`,
    lineItems,
  };
}

async function loadTicketSale(
  supabase: SupabaseClient,
  ticketId: string,
  salesAccountCode: string,
): Promise<{ studioId: string; payerId: string; amountCents: number; lineItems: LineItem[]; reference: string }> {
  const { data: ticket } = await supabase
    .from("event_tickets")
    .select(`
      id, user_id, total_cents, quantity, xero_invoice_id,
      events ( studio_id, title )
    `)
    .eq("id", ticketId)
    .single();

  if (!ticket) throw new Error("Ticket not found");
  if (ticket.xero_invoice_id) throw new Error("Already synced");

  const event = ticket.events as unknown as { studio_id: string; title: string } | null;
  if (!event) throw new Error("Event not found");

  return {
    studioId: event.studio_id,
    payerId: ticket.user_id,
    amountCents: ticket.total_cents,
    reference: `TKT-${ticket.id.slice(0, 8)}`,
    lineItems: [
      {
        description: `${event.title} — event ticket${ticket.quantity > 1 ? ` ×${ticket.quantity}` : ""}`,
        quantity: 1,
        unitAmount: dollarsFromCents(ticket.total_cents),
        accountCode: salesAccountCode,
        taxType: "OUTPUT2",
      },
    ],
  };
}

async function syncInvoicePaymentToXero(
  supabase: SupabaseClient,
  invoiceId: string,
  redirectUri: string,
): Promise<SyncResult> {
  const record = await loadInvoiceRecord(supabase, invoiceId);
  if (!record.xeroInvoiceId) {
    return { ok: false, error: "Invoice not linked to Xero yet" };
  }

  const { data: log } = await supabase
    .from("xero_sync_log")
    .select("payload")
    .eq("source_type", "invoice")
    .eq("source_id", invoiceId)
    .maybeSingle();

  const payload = (log?.payload as { payment_recorded?: boolean } | null) ?? {};
  if (payload.payment_recorded) {
    return { ok: true, xeroInvoiceId: record.xeroInvoiceId };
  }

  const loaded = await loadStudioXeroClient(supabase, record.studioId, redirectUri);
  if (!loaded) return { ok: false, error: "Xero not connected" };

  const cfg = settings(loaded.connection.settings);
  if (cfg.sync_enabled === false) return { ok: false, error: "Xero sync disabled" };

  await recordXeroPayment(
    loaded,
    cfg,
    record.xeroInvoiceId,
    record.amountCents,
    record.reference,
  );

  await supabase
    .from("xero_sync_log")
    .update({
      payload: { ...payload, payment_recorded: true },
      status: "success",
      error: null,
    })
    .eq("source_type", "invoice")
    .eq("source_id", invoiceId);

  await supabase
    .from("xero_connections")
    .update({ last_sync_at: new Date().toISOString(), sync_error: null })
    .eq("studio_id", record.studioId);

  return { ok: true, xeroInvoiceId: record.xeroInvoiceId };
}

export async function syncOutstandingInvoiceToXero(
  supabase: SupabaseClient,
  invoiceId: string,
  redirectUri: string,
  options?: { lineDescription?: string },
): Promise<SyncResult> {
  try {
    const record = await loadInvoiceRecord(supabase, invoiceId);
    if (record.xeroInvoiceId) {
      return { ok: true, xeroInvoiceId: record.xeroInvoiceId };
    }

    const idempotency = await ensureSyncLog(supabase, record.studioId, "invoice", invoiceId);
    if (idempotency.skip) {
      await supabase
        .from("invoices")
        .update({ xero_invoice_id: idempotency.xeroInvoiceId })
        .eq("id", invoiceId)
        .is("xero_invoice_id", null);
      return { ok: true, xeroInvoiceId: idempotency.xeroInvoiceId };
    }

    const loaded = await loadStudioXeroClient(supabase, record.studioId, redirectUri);
    if (!loaded) return { ok: false, error: "Xero not connected" };

    const cfg = settings(loaded.connection.settings);
    if (cfg.sync_enabled === false) return { ok: false, error: "Xero sync disabled" };

    // Only the single synthesized fallback line (no real invoice_line_items)
    // takes a caller-supplied description override — real itemized lines keep
    // their own description so Xero matches what the parent was actually billed.
    const lineItems = record.lineItems.map((li) => ({
      ...li,
      description: !record.hasLineItems && options?.lineDescription ? options.lineDescription : li.description,
      accountCode: li.accountCode ?? cfg.sales_account_code ?? DEFAULT_XERO_SETTINGS.sales_account_code,
    }));

    const today = new Date().toISOString().slice(0, 10);
    const issueDate = record.issuedAt?.slice(0, 10) ?? today;
    const dueDate = record.dueDate ?? issueDate;

    const contact = await resolveContact(supabase, loaded, record.payerId);
    const xeroInvoiceId = await createOutstandingInvoice(
      loaded,
      contact,
      lineItems,
      record.reference,
      dueDate,
      issueDate,
    );

    await supabase.from("invoices").update({ xero_invoice_id: xeroInvoiceId }).eq("id", invoiceId);

    await supabase
      .from("xero_connections")
      .update({ last_sync_at: new Date().toISOString(), sync_error: null })
      .eq("studio_id", record.studioId);

    const result: SyncResult = { ok: true, xeroInvoiceId };
    await markSyncResult(supabase, "invoice", invoiceId, result);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Xero sync failed";
    await markSyncResult(supabase, "invoice", invoiceId, { ok: false, error: message });

    const { data: row } = await supabase
      .from("xero_sync_log")
      .select("studio_id")
      .eq("source_type", "invoice")
      .eq("source_id", invoiceId)
      .maybeSingle();
    if (row?.studio_id) {
      await supabase.from("xero_connections").update({ sync_error: message }).eq("studio_id", row.studio_id);
    }

    return { ok: false, error: message };
  }
}

/**
 * Flips a Draft Xero invoice to Authorised — used when an admin clicks "Send"
 * on a local draft invoice, so the Xero copy goes live at the same moment the
 * customer actually gets billed, not before. No-op if there's nothing synced
 * yet (the caller should run syncOutstandingInvoiceToXero first in that case).
 */
export async function authoriseOutstandingInvoiceInXero(
  supabase: SupabaseClient,
  invoiceId: string,
  redirectUri: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const record = await loadInvoiceRecord(supabase, invoiceId);
    if (!record.xeroInvoiceId) return { ok: true };

    const loaded = await loadStudioXeroClient(supabase, record.studioId, redirectUri);
    if (!loaded) return { ok: false, error: "Xero not connected" };

    const cfg = settings(loaded.connection.settings);
    if (cfg.sync_enabled === false) return { ok: false, error: "Xero sync disabled" };

    await ensureXeroInvoiceAuthorised(loaded, record.xeroInvoiceId);

    await supabase
      .from("xero_connections")
      .update({ last_sync_at: new Date().toISOString(), sync_error: null })
      .eq("studio_id", record.studioId);

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Xero authorise failed";
    return { ok: false, error: message };
  }
}

/**
 * Pushes a local invoice edit (due date, description, amount/line items)
 * onto its still-Draft Xero counterpart, so admins editing an invoice from
 * the Billing page can't drift the Xero copy out from under what the parent
 * was actually sent. No-ops if the invoice was never synced, or if Xero
 * already has it Authorised/Paid/Voided — at that point a bookkeeper may have
 * already acted on it, so we don't silently rewrite it.
 */
export async function updateOutstandingInvoiceInXero(
  supabase: SupabaseClient,
  invoiceId: string,
  redirectUri: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const record = await loadInvoiceRecord(supabase, invoiceId);
    if (!record.xeroInvoiceId) return { ok: true };

    const loaded = await loadStudioXeroClient(supabase, record.studioId, redirectUri);
    if (!loaded) return { ok: false, error: "Xero not connected" };

    const cfg = settings(loaded.connection.settings);
    if (cfg.sync_enabled === false) return { ok: false, error: "Xero sync disabled" };

    const current = await loaded.client.accountingApi.getInvoice(loaded.tenantId, record.xeroInvoiceId);
    const currentStatus = current.body.invoices?.[0]?.status;
    if (currentStatus !== Invoice.StatusEnum.DRAFT) {
      return { ok: true };
    }

    const lineItems = record.lineItems.map((li) => ({
      ...li,
      accountCode: li.accountCode ?? cfg.sales_account_code ?? DEFAULT_XERO_SETTINGS.sales_account_code,
    }));

    const today = new Date().toISOString().slice(0, 10);
    const issueDate = record.issuedAt?.slice(0, 10) ?? today;
    const dueDate = record.dueDate ?? issueDate;

    await loaded.client.accountingApi.updateInvoice(loaded.tenantId, record.xeroInvoiceId, {
      invoices: [
        {
          invoiceID: record.xeroInvoiceId,
          lineItems,
          date: issueDate,
          dueDate,
          reference: record.reference,
          invoiceNumber: record.reference,
          lineAmountTypes: LineAmountTypes.Inclusive,
        },
      ],
    } as Invoices);

    await supabase
      .from("xero_connections")
      .update({ last_sync_at: new Date().toISOString(), sync_error: null })
      .eq("studio_id", record.studioId);

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Xero update failed";
    return { ok: false, error: message };
  }
}

export async function syncSaleToXero(
  supabase: SupabaseClient,
  sourceType: XeroSyncSourceType,
  sourceId: string,
  redirectUri: string,
): Promise<SyncResult> {
  try {
    if (sourceType === "invoice") {
      const record = await loadInvoiceRecord(supabase, sourceId);
      if (record.xeroInvoiceId) {
        return syncInvoicePaymentToXero(supabase, sourceId, redirectUri);
      }
    }

    let sale:
      | Awaited<ReturnType<typeof loadInvoiceSale>>
      | Awaited<ReturnType<typeof loadOrderSale>>
      | Awaited<ReturnType<typeof loadTicketSale>>;

    if (sourceType === "invoice") {
      sale = await loadInvoiceSale(supabase, sourceId);
    } else if (sourceType === "order") {
      sale = await loadOrderSale(supabase, sourceId, DEFAULT_XERO_SETTINGS.sales_account_code!);
    } else {
      sale = await loadTicketSale(supabase, sourceId, DEFAULT_XERO_SETTINGS.sales_account_code!);
    }

    const idempotency = await ensureSyncLog(supabase, sale.studioId, sourceType, sourceId);
    if (idempotency.skip) return { ok: true, xeroInvoiceId: idempotency.xeroInvoiceId };

    const loaded = await loadStudioXeroClient(supabase, sale.studioId, redirectUri);
    if (!loaded) return { ok: false, error: "Xero not connected" };

    const cfg = settings(loaded.connection.settings);
    if (cfg.sync_enabled === false) return { ok: false, error: "Xero sync disabled" };

    const contact = await resolveContact(supabase, loaded, sale.payerId);
    const xeroInvoiceId = await createPaidInvoice(
      loaded,
      cfg,
      contact,
      sale.lineItems.map((li) => ({
        ...li,
        accountCode: li.accountCode ?? cfg.sales_account_code ?? DEFAULT_XERO_SETTINGS.sales_account_code,
      })),
      sale.reference,
      sale.amountCents,
    );

    const table = sourceType === "invoice" ? "invoices" : sourceType === "order" ? "orders" : "event_tickets";
    await supabase.from(table).update({ xero_invoice_id: xeroInvoiceId }).eq("id", sourceId);

    await supabase
      .from("xero_connections")
      .update({ last_sync_at: new Date().toISOString(), sync_error: null })
      .eq("studio_id", sale.studioId);

    const result: SyncResult = { ok: true, xeroInvoiceId };
    await markSyncResult(supabase, sourceType, sourceId, result);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Xero sync failed";
    await markSyncResult(supabase, sourceType, sourceId, { ok: false, error: message });

    const { data: row } = await supabase
      .from("xero_sync_log")
      .select("studio_id")
      .eq("source_type", sourceType)
      .eq("source_id", sourceId)
      .maybeSingle();
    if (row?.studio_id) {
      await supabase
        .from("xero_connections")
        .update({ sync_error: message })
        .eq("studio_id", row.studio_id);
    }

    return { ok: false, error: message };
  }
}

export async function syncRefundToXero(
  supabase: SupabaseClient,
  sourceType: XeroSyncSourceType,
  sourceId: string,
  refundCents: number,
  redirectUri: string,
): Promise<void> {
  let studioId: string | null = null;
  let xeroInvoiceId: string | null = null;
  let payerId: string | null = null;

  if (sourceType === "invoice") {
    const { data } = await supabase
      .from("invoices")
      .select("studio_id, xero_invoice_id, payer_id")
      .eq("id", sourceId)
      .maybeSingle();
    studioId = data?.studio_id ?? null;
    xeroInvoiceId = data?.xero_invoice_id ?? null;
    payerId = data?.payer_id ?? null;
  } else if (sourceType === "order") {
    const { data } = await supabase
      .from("orders")
      .select("studio_id, xero_invoice_id, user_id")
      .eq("id", sourceId)
      .maybeSingle();
    studioId = data?.studio_id ?? null;
    xeroInvoiceId = data?.xero_invoice_id ?? null;
    payerId = data?.user_id ?? null;
  } else {
    const { data } = await supabase
      .from("event_tickets")
      .select("xero_invoice_id, user_id, events ( studio_id )")
      .eq("id", sourceId)
      .maybeSingle();
    const event = data?.events as unknown as { studio_id: string } | null;
    studioId = event?.studio_id ?? null;
    xeroInvoiceId = data?.xero_invoice_id ?? null;
    payerId = data?.user_id ?? null;
  }

  if (!xeroInvoiceId || !studioId || !payerId) return;

  const loaded = await loadStudioXeroClient(supabase, studioId, redirectUri);
  if (!loaded) return;

  const contact = await resolveContact(supabase, loaded, payerId);
  const cfg = settings(loaded.connection.settings);

  const creditNote: CreditNote = {
    type: CreditNote.TypeEnum.ACCRECCREDIT,
    contact,
    lineItems: [
      {
        description: "Refund — Olune",
        quantity: 1,
        unitAmount: dollarsFromCents(refundCents),
        accountCode: cfg.sales_account_code ?? DEFAULT_XERO_SETTINGS.sales_account_code,
        taxType: "OUTPUT2",
      },
    ],
    lineAmountTypes: LineAmountTypes.Inclusive,
    status: CreditNote.StatusEnum.AUTHORISED,
    reference: `REF-${sourceId.slice(0, 8)}`,
  };

  await loaded.client.accountingApi.createCreditNotes(loaded.tenantId, {
    creditNotes: [creditNote],
  } as CreditNotes);
}

export async function voidInvoiceInXero(
  supabase: SupabaseClient,
  invoiceId: string,
  redirectUri: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const record = await loadInvoiceRecord(supabase, invoiceId);
  let xeroInvoiceId = record.xeroInvoiceId;

  if (!xeroInvoiceId) {
    const { data: log } = await supabase
      .from("xero_sync_log")
      .select("xero_invoice_id")
      .eq("source_type", "invoice")
      .eq("source_id", invoiceId)
      .maybeSingle();
    xeroInvoiceId = (log?.xero_invoice_id as string | null) ?? null;
  }

  if (!xeroInvoiceId) return { ok: true };

  const loaded = await loadStudioXeroClient(supabase, record.studioId, redirectUri);
  if (!loaded) return { ok: false, error: "Xero not connected" };

  const cfg = settings(loaded.connection.settings);
  if (cfg.sync_enabled === false) return { ok: false, error: "Xero sync disabled" };

  try {
    // Xero rejects VOIDED on a Draft/Submitted invoice — those cancel via
    // DELETED instead. Ours start as Draft (see createOutstandingInvoice), so
    // check current status rather than assuming it's been authorised.
    const current = await loaded.client.accountingApi.getInvoice(loaded.tenantId, xeroInvoiceId);
    const currentStatus = current.body.invoices?.[0]?.status;
    const nextStatus =
      currentStatus === Invoice.StatusEnum.DRAFT || currentStatus === Invoice.StatusEnum.SUBMITTED
        ? Invoice.StatusEnum.DELETED
        : Invoice.StatusEnum.VOIDED;

    await loaded.client.accountingApi.updateInvoice(loaded.tenantId, xeroInvoiceId, {
      invoices: [{ invoiceID: xeroInvoiceId, status: nextStatus }],
    } as Invoices);

    await supabase
      .from("xero_sync_log")
      .update({ status: "voided", error: null })
      .eq("source_type", "invoice")
      .eq("source_id", invoiceId);

    await supabase
      .from("xero_connections")
      .update({ last_sync_at: new Date().toISOString(), sync_error: null })
      .eq("studio_id", record.studioId);

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Xero void failed";
    return { ok: false, error: message };
  }
}
