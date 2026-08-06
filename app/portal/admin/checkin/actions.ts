"use server";

// ============================================================================
//  Admin · Check-in server actions
//  Card issuance lifecycle (staff-initiated, deliberate — never auto-created)
//  and reader-credential management.
// ============================================================================

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getStudioOpsStudio, getAdminStudio as getTrueAdminStudio } from "@/lib/portal/access";
import { issueReaderCredential, type ReaderCredential } from "@/lib/checkin/reader-credential";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Admin + office (front desk) — card issuance/lifecycle. */
async function getOpsStudio() {
  const ctx = await getStudioOpsStudio();
  return { error: ctx.error, supabase: ctx.supabase, studioId: ctx.studioId, userId: ctx.userId };
}

function revalidateCheckin(studentId?: string) {
  revalidatePath("/portal/admin/checkin");
  revalidatePath("/portal/admin");
  if (studentId) revalidatePath(`/portal/admin/students/${studentId}`);
}

// ─── ISSUE ──────────────────────────────────────────────────────────────────

const StudentIdSchema = z.object({ studentId: z.string().uuid() });

export type IssueCardStartResult =
  | { ok: true; cardId: string; token: string }
  | { ok: false; error: string };

/** Pre-creates a `pending` card row before the Web NFC write. Deliberately a
 *  separate manual action, not something enrollStudent triggers automatically. */
export async function issueCardStart(input: unknown): Promise<IssueCardStartResult> {
  const parsed = StudentIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };

  const { error, supabase, studioId, userId } = await getOpsStudio();
  if (error || !studioId || !userId) return { ok: false, error: error ?? "Unknown error" };

  const { data: existing } = await supabase
    .from("nfc_cards")
    .select("id, status")
    .eq("student_id", parsed.data.studentId)
    .eq("studio_id", studioId)
    .in("status", ["pending", "active"])
    .maybeSingle();

  if (existing) {
    return {
      ok: false,
      error:
        existing.status === "active"
          ? "This student already has an active card. Freeze or revoke it before issuing a new one."
          : "A card is already being issued for this student.",
    };
  }

  const { data: card, error: dbError } = await supabase
    .from("nfc_cards")
    .insert({ studio_id: studioId, student_id: parsed.data.studentId })
    .select("id, token")
    .single();

  if (dbError || !card) return { ok: false, error: dbError?.message ?? "Could not start card issuance." };

  return { ok: true, cardId: card.id, token: card.token };
}

const CardIdSchema = z.object({ cardId: z.string().uuid() });

/** Called once the browser confirms the NDEF write succeeded. */
export async function issueCardConfirm(input: unknown): Promise<ActionResult> {
  const parsed = CardIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };

  const { error, supabase, studioId, userId } = await getOpsStudio();
  if (error || !studioId || !userId) return { ok: false, error: error ?? "Unknown error" };

  // Conditional update — guards against a stale/duplicate confirm resurrecting
  // an already-active or already-frozen card.
  const { data: updated, error: dbError } = await supabase
    .from("nfc_cards")
    .update({ status: "active", issued_by: userId, issued_at: new Date().toISOString() })
    .eq("id", parsed.data.cardId)
    .eq("studio_id", studioId)
    .eq("status", "pending")
    .select("student_id")
    .maybeSingle();

  if (dbError) return { ok: false, error: dbError.message };
  if (!updated) return { ok: false, error: "This card is no longer pending — it may have already been confirmed." };

  revalidateCheckin(updated.student_id);
  return { ok: true };
}

/** Write failed or staff backed out — delete the never-physically-written pending row. */
export async function issueCardCancel(input: unknown): Promise<ActionResult> {
  const parsed = CardIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };

  const { error, supabase, studioId } = await getOpsStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  const { data: deleted, error: dbError } = await supabase
    .from("nfc_cards")
    .delete()
    .eq("id", parsed.data.cardId)
    .eq("studio_id", studioId)
    .eq("status", "pending")
    .select("student_id")
    .maybeSingle();

  if (dbError) return { ok: false, error: dbError.message };
  if (deleted) revalidateCheckin(deleted.student_id);
  return { ok: true };
}

// ─── LIFECYCLE ──────────────────────────────────────────────────────────────

async function setCardStatus(
  cardId: string,
  fromStatuses: string[],
  toStatus: "active" | "frozen" | "lost" | "revoked",
): Promise<ActionResult> {
  const { error, supabase, studioId } = await getOpsStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  const { data: updated, error: dbError } = await supabase
    .from("nfc_cards")
    .update({ status: toStatus })
    .eq("id", cardId)
    .eq("studio_id", studioId)
    .in("status", fromStatuses)
    .select("student_id")
    .maybeSingle();

  if (dbError) return { ok: false, error: dbError.message };
  if (!updated) return { ok: false, error: "Card not found or not in an expected state." };

  revalidateCheckin(updated.student_id);
  return { ok: true };
}

export async function freezeCard(input: unknown): Promise<ActionResult> {
  const parsed = CardIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  return setCardStatus(parsed.data.cardId, ["active"], "frozen");
}

export async function unfreezeCard(input: unknown): Promise<ActionResult> {
  const parsed = CardIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  return setCardStatus(parsed.data.cardId, ["frozen"], "active");
}

export async function revokeCard(input: unknown): Promise<ActionResult> {
  const parsed = CardIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  return setCardStatus(parsed.data.cardId, ["active", "frozen", "lost"], "revoked");
}

// ─── READER CREDENTIAL ──────────────────────────────────────────────────────

export type ReaderCredentialResult = { ok: true; credential: ReaderCredential } | { ok: false; error: string };

/** Generates (or rotates) the studio's shared reader secret. Shown once —
 *  the secret is never retrievable again after this call returns. */
export async function rotateReaderCredential(): Promise<ReaderCredentialResult> {
  const { error, supabase, studioId, userId } = await getTrueAdminStudio();
  if (error || !studioId || !userId) return { ok: false, error: error ?? "Unknown error" };

  try {
    const credential = await issueReaderCredential(supabase, studioId, userId);
    revalidatePath("/portal/admin/checkin");
    return { ok: true, credential };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not generate a reader credential." };
  }
}
