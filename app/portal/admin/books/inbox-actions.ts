"use server";

// ============================================================================
//  Books → Bills inbox: upload supplier invoices, get draft bills back.
//
//  Two round trips per drop, so a 20 MB photo never passes through a server
//  function: startBillUploadAction mints a signed upload URL per file, the
//  browser uploads straight to Storage, then fileBillUploadsAction turns each
//  stored file into a draft bill and reads it with the studio's AI key.
//
//  Same access rule as every other Books action: studio admin, past the
//  paywall, with Olune Books as the studio's accounting choice.
// ============================================================================

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminStudio } from "@/lib/portal/access";
import { logAuditEvent } from "@/lib/audit/log";
import { MAX_FILES_PER_UPLOAD, checkAttachment, isStudioAttachmentPath } from "@/lib/ledger/attachments";
import { loadBooksContext } from "@/lib/ledger/server/data";
import { fileUploadedBill, mintAttachmentUpload, readIntoDraft, removeAttachmentObjects, signedAttachmentUrl, type FiledBill } from "@/lib/ledger/server/inbox";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function booksAdmin() {
  const a = await getAdminStudio();
  if (a.error || !a.studioId) return { error: a.error ?? "Not authorized." } as const;
  const ctx = await loadBooksContext(a.supabase, a.studioId);
  if (!ctx) return { error: "notSetUp" } as const;
  const { data: studio } = await a.supabase.from("studios").select("name").eq("id", a.studioId).maybeSingle();
  return { supabase: a.supabase, studioId: a.studioId, userId: a.userId, ctx, studioName: (studio?.name as string | null) ?? "the studio" } as const;
}

function revalidateBills() {
  revalidatePath("/portal/admin/books", "layout");
}

const FileMeta = z.object({ mimeType: z.string().max(100), sizeBytes: z.number().int().positive() });

export async function startBillUploadAction(files: z.infer<typeof FileMeta>[]): Promise<Result<{ path: string; token: string }[]>> {
  const a = await booksAdmin();
  if ("error" in a) return { ok: false, error: a.error as string };
  const parsed = z.array(FileMeta).min(1).max(MAX_FILES_PER_UPLOAD).safeParse(files);
  if (!parsed.success) return { ok: false, error: "tooManyFiles" };
  const tickets: { path: string; token: string }[] = [];
  for (const f of parsed.data) {
    const t = await mintAttachmentUpload(a.studioId, f.mimeType, f.sizeBytes);
    if (!t.ok) return { ok: false, error: t.error };
    tickets.push({ path: t.path, token: t.token });
  }
  return { ok: true, data: tickets };
}

const Uploaded = z.object({
  path: z.string().max(200),
  name: z.string().trim().min(1).max(200),
  mimeType: z.string().max(100),
  sizeBytes: z.number().int().positive(),
});

export async function fileBillUploadsAction(files: z.infer<typeof Uploaded>[]): Promise<Result<FiledBill[]>> {
  const a = await booksAdmin();
  if ("error" in a) return { ok: false, error: a.error as string };
  const parsed = z.array(Uploaded).min(1).max(MAX_FILES_PER_UPLOAD).safeParse(files);
  if (!parsed.success) return { ok: false, error: "invalid" };
  for (const f of parsed.data) {
    if (!isStudioAttachmentPath(a.studioId, f.path) || !checkAttachment(f.mimeType, f.sizeBytes).ok) return { ok: false, error: "invalid" };
  }

  // Two at a time: fast enough for a handful of invoices, gentle on the
  // studio's model rate limit.
  const filed: FiledBill[] = [];
  const queue = [...parsed.data];
  const errors: string[] = [];
  await Promise.all(
    [0, 1].map(async () => {
      for (let f = queue.shift(); f; f = queue.shift()) {
        try {
          filed.push(await fileUploadedBill(a.supabase, { id: a.studioId, name: a.studioName }, a.ctx, f, a.userId));
        } catch (err) {
          errors.push(err instanceof Error ? err.message : "unexpected");
        }
      }
    }),
  );

  if (filed.length) {
    await logAuditEvent({
      studioId: a.studioId,
      actorId: a.userId,
      action: "books.bills_uploaded",
      targetType: "ledger_bill",
      targetId: filed[0].billId,
      metadata: { count: filed.length, read: filed.filter((f) => f.read).length },
    });
  }
  revalidateBills();
  if (!filed.length) return { ok: false, error: errors[0] ?? "unexpected" };
  return { ok: true, data: filed };
}

async function draftAttachment(a: Exclude<Awaited<ReturnType<typeof booksAdmin>>, { error: string }>, billId: string) {
  const { data: bill } = await a.supabase
    .from("ledger_bills")
    .select("id, status, source, ledger_attachments ( storage_path, file_name, mime_type, size_bytes, created_at )")
    .eq("id", billId)
    .eq("studio_id", a.studioId)
    .maybeSingle();
  if (!bill) return null;
  type Att = { storage_path: string; file_name: string; mime_type: string; size_bytes: number; created_at: string };
  const att = ((bill.ledger_attachments as Att[] | null) ?? []).sort((x, y) => x.created_at.localeCompare(y.created_at))[0];
  return { bill, att };
}

/** Read a draft's document again (after adding an AI key, or to undo edits). */
export async function readBillAgainAction(billId: string): Promise<Result<FiledBill>> {
  const a = await booksAdmin();
  if ("error" in a) return { ok: false, error: a.error as string };
  if (!z.string().uuid().safeParse(billId).success) return { ok: false, error: "invalid" };
  const found = await draftAttachment(a, billId);
  if (!found) return { ok: false, error: "notFound" };
  if (found.bill.status !== "draft") return { ok: false, error: "billLocked" };
  if (!found.att) return { ok: false, error: "noAttachment" };
  const res = await readIntoDraft(
    a.supabase,
    { id: a.studioId, name: a.studioName },
    a.ctx,
    billId,
    { path: found.att.storage_path, name: found.att.file_name, mimeType: found.att.mime_type, sizeBytes: Number(found.att.size_bytes) },
    found.bill.source === "staff",
  );
  if (!res.read) return { ok: false, error: "couldNotRead" };
  revalidateBills();
  return { ok: true, data: res };
}

/** Attach another document (a receipt, a remittance) to any bill. */
export async function attachToBillAction(billId: string, file: z.infer<typeof Uploaded>): Promise<Result> {
  const a = await booksAdmin();
  if ("error" in a) return { ok: false, error: a.error as string };
  const parsed = Uploaded.safeParse(file);
  if (!parsed.success || !z.string().uuid().safeParse(billId).success) return { ok: false, error: "invalid" };
  const f = parsed.data;
  if (!isStudioAttachmentPath(a.studioId, f.path) || !checkAttachment(f.mimeType, f.sizeBytes).ok) return { ok: false, error: "invalid" };
  const { error } = await a.supabase.from("ledger_attachments").insert({
    studio_id: a.studioId,
    bill_id: billId,
    storage_path: f.path,
    file_name: f.name,
    mime_type: f.mimeType,
    size_bytes: f.sizeBytes,
    uploaded_by: a.userId,
  });
  if (error) return { ok: false, error: error.message };
  revalidateBills();
  return { ok: true };
}

export async function removeAttachmentAction(attachmentId: string): Promise<Result> {
  const a = await booksAdmin();
  if ("error" in a) return { ok: false, error: a.error as string };
  if (!z.string().uuid().safeParse(attachmentId).success) return { ok: false, error: "invalid" };
  const { data: att } = await a.supabase
    .from("ledger_attachments")
    .select("id, storage_path, bill_id, bill:ledger_bills ( source )")
    .eq("id", attachmentId)
    .eq("studio_id", a.studioId)
    .maybeSingle();
  if (!att) return { ok: false, error: "notFound" };
  const { error } = await a.supabase.from("ledger_attachments").delete().eq("id", attachmentId).eq("studio_id", a.studioId);
  if (error) return { ok: false, error: error.message };
  // A contractor's own PDF is theirs too (their invoice points at it): keep the file.
  if ((att.bill as { source?: string } | null)?.source !== "staff") await removeAttachmentObjects([att.storage_path as string]);
  await logAuditEvent({ studioId: a.studioId, actorId: a.userId, action: "books.attachment_removed", targetType: "ledger_bill", targetId: (att.bill_id as string | null) ?? attachmentId });
  revalidateBills();
  return { ok: true };
}

/** A fresh link to one attachment (signed links expire after ten minutes). */
export async function attachmentLinkAction(attachmentId: string, download = false): Promise<Result<{ url: string }>> {
  const a = await booksAdmin();
  if ("error" in a) return { ok: false, error: a.error as string };
  if (!z.string().uuid().safeParse(attachmentId).success) return { ok: false, error: "invalid" };
  const { data: att } = await a.supabase.from("ledger_attachments").select("storage_path, file_name").eq("id", attachmentId).eq("studio_id", a.studioId).maybeSingle();
  if (!att) return { ok: false, error: "notFound" };
  const url = await signedAttachmentUrl(att.storage_path as string, download ? (att.file_name as string) : undefined);
  return url ? { ok: true, data: { url } } : { ok: false, error: "unexpected" };
}
