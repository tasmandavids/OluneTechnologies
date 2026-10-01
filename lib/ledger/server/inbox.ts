import "server-only";

// ============================================================================
//  The bill inbox: documents in, draft bills out.
//
//  Three ways a bill arrives without anyone typing it:
//
//    upload      an admin drops supplier invoices onto Books → Bills
//    staff       a contractor sends an invoice to the studio from
//                Teacher → Invoices (contractor_invoices)
//    read again  an admin asks for an uploaded document to be re-read
//
//  Every path ends at a DRAFT. Nothing here approves a bill or posts a
//  journal: a person checks the draft beside the original document and
//  approves it in the normal bill editor, which is where the ledger is
//  written (app/portal/admin/books/actions.ts → saveBillAction).
//
//  Files live in the private books-attachments bucket and are only ever
//  touched with the service role: uploads through signed upload URLs, reads
//  through short-lived signed URLs, and the model read through a direct
//  download. The `db` client passed in decides whose rights the ledger rows
//  are written with — an admin's session for uploads, the service role for
//  staff submissions (which RLS would otherwise refuse).
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { readDocumentJson } from "@/lib/integrations/ai";
import { BOOKS_ATTACHMENT_BUCKET, attachmentPath, checkAttachment, isReadableByModel } from "../attachments";
import { INVOICE_EXTRACTION_SCHEMA, extractionPrompt, normaliseExtraction, planDraftBill, supplierKey, type DraftBillPlan } from "../invoice-extract";
import { addDays, todayIso } from "../periods";
import { billJournal } from "../posting";
import type { BooksContext } from "./data";
import { loadBooksContext } from "./data";

export type UploadedFile = { path: string; name: string; mimeType: string; sizeBytes: number };

export type FiledBill = {
  billId: string;
  /** True when a model read the document and prefilled the draft. */
  read: boolean;
  supplierName: string | null;
  totalCents: number;
  warnings: DraftBillPlan["warnings"];
};

// ─── Storage ─────────────────────────────────────────────────────────────────

/** A signed upload URL for one file in this studio's folder. */
export async function mintAttachmentUpload(
  studioId: string,
  mimeType: string,
  sizeBytes: number,
): Promise<{ ok: true; path: string; token: string } | { ok: false; error: string }> {
  const check = checkAttachment(mimeType, sizeBytes);
  if (!check.ok) return check;
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, error: "uploadsNotConfigured" };
  }
  const path = attachmentPath(studioId, check.ext, crypto.randomUUID());
  const { data, error } = await admin.storage.from(BOOKS_ATTACHMENT_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: /bucket not found/i.test(error?.message ?? "") ? "uploadsNotConfigured" : (error?.message ?? "unexpected") };
  return { ok: true, path: data.path, token: data.token };
}

/** Confirms the object really exists (the client said it uploaded it). */
async function objectExists(path: string): Promise<boolean> {
  const admin = createAdminClient();
  const slash = path.lastIndexOf("/");
  const { data } = await admin.storage
    .from(BOOKS_ATTACHMENT_BUCKET)
    .list(path.slice(0, slash), { search: path.slice(slash + 1), limit: 1 });
  return (data ?? []).some((o) => o.name === path.slice(slash + 1));
}

/** A link to view one attachment, valid for ten minutes. */
export async function signedAttachmentUrl(path: string, download?: string): Promise<string | null> {
  try {
    const { data } = await createAdminClient()
      .storage.from(BOOKS_ATTACHMENT_BUCKET)
      .createSignedUrl(path, 600, download ? { download } : undefined);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

export async function removeAttachmentObjects(paths: string[]): Promise<void> {
  if (!paths.length) return;
  try {
    await createAdminClient().storage.from(BOOKS_ATTACHMENT_BUCKET).remove(paths);
  } catch {
    // A stranded object costs cents; never fail the caller over it.
  }
}

// ─── Reading a document ──────────────────────────────────────────────────────

async function readDocument(studioId: string, studioName: string, ctx: BooksContext, file: UploadedFile) {
  if (!isReadableByModel(file.mimeType)) return null;
  const { data: blob } = await createAdminClient().storage.from(BOOKS_ATTACHMENT_BUCKET).download(file.path);
  if (!blob) return null;
  const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
  const prompt = extractionPrompt({
    studioName,
    baseCurrency: ctx.settings.baseCurrency,
    taxName: ctx.jurisdiction.taxName,
    accounts: billAccounts(ctx).map((a) => ({ code: a.code, name: a.name })),
  });
  const raw = await readDocumentJson({
    studioId,
    system: prompt.system,
    user: prompt.user,
    document: { mimeType: file.mimeType, base64, fileName: file.name },
    schema: INVOICE_EXTRACTION_SCHEMA as unknown as Record<string, unknown>,
  });
  return raw == null ? null : normaliseExtraction(raw);
}

/** Accounts a bill line may use: the same filter the bill editor applies. */
function billAccounts(ctx: BooksContext) {
  return ctx.accounts.filter((a) => !a.isArchived && (a.type === "expense" || a.subtype === "fixed_asset" || a.subtype === "current_asset" || a.subtype === "inventory"));
}

/** Where a line goes when nobody said: a general expense, or a contractor one for staff. */
function fallbackAccountId(ctx: BooksContext, staff: boolean): string {
  const expenses = ctx.accounts
    .filter((a) => !a.isArchived && a.subtype === "expense")
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  const pick = (re: RegExp) => expenses.find((a) => re.test(a.name));
  return (
    (staff ? pick(/contract|teach|instruct|subcontract|wages|salar/i) : null) ??
    pick(/general|sundry|other|misc/i) ??
    expenses[0] ??
    ctx.accounts.find((a) => a.type === "expense" && !a.isArchived)!
  ).id;
}

function purchaseRates(ctx: BooksContext) {
  const code = ctx.region?.defaultPurchaseCode ?? ctx.jurisdiction.defaultPurchaseCode;
  return {
    defaultPurchaseRateId: ctx.rates.find((r) => r.code === code && !r.isArchived)?.id ?? null,
    noTaxRateId: ctx.rates.find((r) => r.code === ctx.jurisdiction.exemptPurchaseCode && !r.isArchived)?.id ?? null,
  };
}

// ─── Contacts ────────────────────────────────────────────────────────────────

type ContactRow = { id: string; name: string; email: string | null; tax_number: string | null; default_account_id: string | null };

async function findOrCreateContact(
  db: SupabaseClient,
  studioId: string,
  who: { name: string; email: string | null; taxNumber: string | null },
): Promise<ContactRow | null> {
  const { data } = await db
    .from("ledger_contacts")
    .select("id, name, email, tax_number, default_account_id")
    .eq("studio_id", studioId)
    .eq("is_archived", false);
  const contacts = (data ?? []) as ContactRow[];
  const digits = (s: string | null) => (s ?? "").replace(/\W/g, "").toLowerCase();
  const key = supplierKey(who.name);
  const match =
    (who.taxNumber && contacts.find((c) => c.tax_number && digits(c.tax_number) === digits(who.taxNumber))) ||
    (who.email && contacts.find((c) => c.email && c.email.toLowerCase() === who.email!.toLowerCase())) ||
    (key && contacts.find((c) => supplierKey(c.name) === key)) ||
    null;
  if (match) return match;

  const { data: created, error } = await db
    .from("ledger_contacts")
    .insert({ studio_id: studioId, name: who.name.slice(0, 150), email: who.email, tax_number: who.taxNumber })
    .select("id, name, email, tax_number, default_account_id")
    .single();
  if (error) {
    // Lost a race to an identical name: use the one that won.
    const { data: existing } = await db
      .from("ledger_contacts")
      .select("id, name, email, tax_number, default_account_id")
      .eq("studio_id", studioId)
      .eq("name", who.name.slice(0, 150))
      .maybeSingle();
    return (existing as ContactRow | null) ?? null;
  }
  return created as ContactRow;
}

// ─── Writing the draft ───────────────────────────────────────────────────────

type DraftFields = {
  contact: ContactRow | null;
  reference: string | null;
  issueDate: string;
  dueDate: string | null;
  amountsIncludeTax: boolean;
  notes: string | null;
  lines: DraftBillPlan["lines"];
};

function totalsFor(ctx: BooksContext, f: DraftFields) {
  if (!f.lines.length) return { subtotalCents: 0, taxCents: 0, totalCents: 0 };
  try {
    return billJournal(ctx.chart, {
      id: "00000000-0000-0000-0000-000000000000",
      reference: f.reference ?? "",
      date: f.issueDate,
      contactName: f.contact?.name ?? "",
      amountsIncludeTax: f.amountsIncludeTax,
      lines: f.lines.map((l) => ({ ...l, lineTotalCents: Math.round(l.quantity * l.unitCents) })),
    }).totals;
  } catch {
    return { subtotalCents: 0, taxCents: 0, totalCents: 0 };
  }
}

async function writeDraft(db: SupabaseClient, studioId: string, ctx: BooksContext, billId: string, f: DraftFields, extracted: unknown) {
  const totals = totalsFor(ctx, f);
  const { error } = await db
    .from("ledger_bills")
    .update({
      contact_id: f.contact?.id ?? null,
      reference: f.reference,
      issue_date: f.issueDate,
      due_date: f.dueDate,
      amounts_include_tax: f.amountsIncludeTax,
      notes: f.notes,
      subtotal_cents: totals.subtotalCents,
      tax_cents: totals.taxCents,
      total_cents: totals.totalCents,
      extracted: extracted ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", billId)
    .eq("studio_id", studioId)
    .eq("status", "draft");
  if (error) throw new Error(error.message);

  await db.from("ledger_bill_lines").delete().eq("bill_id", billId).eq("studio_id", studioId);
  if (f.lines.length) {
    const { error: lineErr } = await db.from("ledger_bill_lines").insert(
      f.lines.map((l, i) => ({
        bill_id: billId,
        studio_id: studioId,
        description: l.description.slice(0, 300),
        account_id: l.accountId,
        tax_rate_id: l.taxRateId,
        quantity: l.quantity,
        unit_cents: l.unitCents,
        line_total_cents: Math.round(l.quantity * l.unitCents),
        sort_order: i,
      })),
    );
    if (lineErr) throw new Error(lineErr.message);
  }
  return totals.totalCents;
}

/** Turn a model's reading into draft fields (supplier matched or created). */
async function fieldsFromReading(
  db: SupabaseClient,
  studioId: string,
  ctx: BooksContext,
  reading: NonNullable<Awaited<ReturnType<typeof readDocument>>>,
  staff: boolean,
): Promise<{ fields: DraftFields; warnings: DraftBillPlan["warnings"] }> {
  const contact = reading.supplierName
    ? await findOrCreateContact(db, studioId, { name: reading.supplierName, email: reading.supplierEmail, taxNumber: reading.supplierTaxNumber })
    : null;
  const plan = planDraftBill(reading, {
    accounts: billAccounts(ctx),
    fallbackAccountId: fallbackAccountId(ctx, staff),
    contactDefaultAccountId: contact?.default_account_id ?? null,
    taxRegistered: ctx.settings.taxRegistered,
    ...purchaseRates(ctx),
    baseCurrency: ctx.settings.baseCurrency,
    pricesIncludeTax: ctx.settings.pricesIncludeTax,
  });
  const issueDate = plan.issueDate ?? todayIso();
  return {
    fields: {
      contact,
      reference: plan.reference,
      issueDate,
      dueDate: plan.dueDate ?? addDays(issueDate, 20),
      amountsIncludeTax: plan.amountsIncludeTax,
      notes: null,
      lines: plan.lines,
    },
    warnings: plan.warnings,
  };
}

/**
 * File one uploaded document as a draft bill and try to read it.
 * `db` writes the rows: pass the admin's own client for an admin upload.
 */
export async function fileUploadedBill(
  db: SupabaseClient,
  studio: { id: string; name: string },
  ctx: BooksContext,
  file: UploadedFile,
  userId: string | null,
): Promise<FiledBill> {
  if (!(await objectExists(file.path))) throw new Error("uploadMissing");

  const today = todayIso();
  const { data: bill, error } = await db
    .from("ledger_bills")
    .insert({ studio_id: studio.id, contact_id: null, issue_date: today, due_date: addDays(today, 20), status: "draft", source: "upload", created_by: userId, amounts_include_tax: ctx.settings.pricesIncludeTax })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const billId = bill.id as string;

  const { error: attErr } = await db.from("ledger_attachments").insert({
    studio_id: studio.id,
    bill_id: billId,
    storage_path: file.path,
    file_name: file.name.slice(0, 200) || "invoice",
    mime_type: file.mimeType,
    size_bytes: file.sizeBytes,
    uploaded_by: userId,
  });
  if (attErr) {
    await db.from("ledger_bills").delete().eq("id", billId).eq("studio_id", studio.id);
    throw new Error(attErr.message);
  }

  return readIntoDraft(db, studio, ctx, billId, file, false);
}

/** (Re-)read a draft's document and overwrite the draft with what it says. */
export async function readIntoDraft(
  db: SupabaseClient,
  studio: { id: string; name: string },
  ctx: BooksContext,
  billId: string,
  file: UploadedFile,
  staff: boolean,
): Promise<FiledBill> {
  const reading = await readDocument(studio.id, studio.name, ctx, file).catch(() => null);
  if (!reading) return { billId, read: false, supplierName: null, totalCents: 0, warnings: [] };
  const { fields, warnings } = await fieldsFromReading(db, studio.id, ctx, reading, staff);
  const totalCents = await writeDraft(db, studio.id, ctx, billId, fields, { ...reading, warnings });
  return { billId, read: true, supplierName: fields.contact?.name ?? reading.supplierName, totalCents, warnings };
}

// ─── Contractor invoices → staff bills ───────────────────────────────────────

/**
 * File a contractor invoice that was just sent to a studio as a draft bill in
 * that studio's Books. Service role throughout: the caller is the contractor,
 * who has no rights on the studio's ledger. Does nothing (returns null) when
 * the studio doesn't keep Olune Books, or the invoice is already filed.
 */
export async function fileContractorInvoice(contractorInvoiceId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: inv } = await admin
    .from("contractor_invoices")
    .select("id, instructor_id, studio_id, description, line_items, amount_cents, invoice_number, due_date, notes, status, attachment_path, attachment_name, attachment_mime, attachment_size, created_at")
    .eq("id", contractorInvoiceId)
    .maybeSingle();
  if (!inv?.studio_id || !["sent", "paid"].includes(inv.status as string)) return null;

  const studioId = inv.studio_id as string;
  const ctx = await loadBooksContext(admin, studioId);
  if (!ctx) return null;

  const { data: existing } = await admin.from("ledger_bills").select("id").eq("contractor_invoice_id", inv.id).maybeSingle();
  if (existing) return existing.id as string;

  const { data: me } = await admin.from("profiles").select("full_name, email").eq("id", inv.instructor_id).maybeSingle();
  const name = ((me?.full_name as string | null) ?? "").trim() || ((me?.email as string | null) ?? "Contractor");
  const contact = await findOrCreateContact(admin, studioId, { name, email: (me?.email as string | null) ?? null, taxNumber: null });

  // The contractor's own figures are the bill. Contractors usually aren't
  // registered for tax; the reviewer changes the rate if this one is.
  const account = contact?.default_account_id ?? fallbackAccountId(ctx, true);
  const { noTaxRateId, defaultPurchaseRateId } = purchaseRates(ctx);
  const taxRateId = ctx.settings.taxRegistered ? (noTaxRateId ?? defaultPurchaseRateId) : null;
  type Item = { description?: string; quantity?: number; unit_cents?: number };
  const items = (Array.isArray(inv.line_items) ? (inv.line_items as Item[]) : []).filter((l) => (l.unit_cents ?? 0) > 0 && (l.quantity ?? 0) > 0);
  const lines = items.length
    ? items.map((l) => ({ description: (l.description || (inv.description as string)).slice(0, 300), accountId: account, taxRateId, quantity: Number(l.quantity), unitCents: Number(l.unit_cents) }))
    : [{ description: (inv.description as string).slice(0, 300), accountId: account, taxRateId, quantity: 1, unitCents: Number(inv.amount_cents) }];

  const issueDate = (inv.created_at as string).slice(0, 10);
  const reference = inv.invoice_number != null ? `${name.split(" ")[0]}-${inv.invoice_number}`.slice(0, 60) : null;
  const dueDate = (inv.due_date as string | null) ?? addDays(issueDate, 14);
  const { data: bill, error } = await admin
    .from("ledger_bills")
    .insert({
      studio_id: studioId,
      contact_id: contact?.id ?? null,
      issue_date: issueDate,
      due_date: dueDate,
      status: "draft",
      source: "staff",
      submitted_by: inv.instructor_id,
      submitted_at: new Date().toISOString(),
      contractor_invoice_id: inv.id,
      reference,
      amounts_include_tax: true,
    })
    .select("id")
    .single();
  if (error) {
    // The unique index means a concurrent send already filed it.
    const { data: raced } = await admin.from("ledger_bills").select("id").eq("contractor_invoice_id", inv.id).maybeSingle();
    return (raced?.id as string | undefined) ?? null;
  }
  const billId = bill.id as string;

  await writeDraft(
    admin,
    studioId,
    ctx,
    billId,
    {
      contact,
      reference,
      issueDate,
      dueDate,
      amountsIncludeTax: true,
      notes: (inv.notes as string | null)?.slice(0, 1000) ?? null,
      lines,
    },
    null,
  );

  if (inv.attachment_path) {
    await admin.from("ledger_attachments").insert({
      studio_id: studioId,
      bill_id: billId,
      storage_path: inv.attachment_path,
      file_name: (inv.attachment_name as string | null) ?? "invoice.pdf",
      mime_type: (inv.attachment_mime as string | null) ?? "application/pdf",
      size_bytes: Number(inv.attachment_size ?? 1),
      uploaded_by: inv.instructor_id,
    });
  }
  return billId;
}

/** A staff bill was paid in full: tell the contractor's side. */
export async function markContractorInvoicePaid(billId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: bill } = await admin.from("ledger_bills").select("contractor_invoice_id, status").eq("id", billId).maybeSingle();
    if (!bill?.contractor_invoice_id || bill.status !== "paid") return;
    await admin
      .from("contractor_invoices")
      .update({ status: "paid", paid_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", bill.contractor_invoice_id as string)
      .eq("status", "sent");
  } catch {
    // The bill is paid either way; the contractor can mark it themselves.
  }
}
