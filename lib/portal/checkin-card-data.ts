// ============================================================================
//  lib/portal/checkin-card-data.ts
//
//  One fetch shared by /portal/parent (a card per child) and /portal/student
//  (the student's own), so the two portals can't drift on which statuses count
//  as "you have a card" or how the QR is rendered.
//
//  Reads go through the caller's RLS-scoped client: 0103's guardian policy
//  covers the parent view and 0108's widened self-read covers the student one,
//  including minors.
// ============================================================================

import QRCode from "qrcode";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PortalCardStatus = "active" | "frozen";

export type PortalCheckinCard = {
  cardId: string;
  studentId: string;
  studentName: string | null;
  status: PortalCardStatus;
  issuedAt: string | null;
  /** Null unless the card is active — a frozen card's token must not be scannable. */
  qrDataUrl: string | null;
};

/** `pending` is mid-issuance and `lost`/`revoked` are dead — neither is a card
 *  the holder has, so neither surfaces in the portals. */
const VISIBLE_STATUSES: PortalCardStatus[] = ["active", "frozen"];

export async function fetchPortalCheckinCards(
  supabase: SupabaseClient,
  studentIds: string[],
  studentNames: Map<string, string | null>,
): Promise<PortalCheckinCard[]> {
  if (studentIds.length === 0) return [];

  const { data } = await supabase
    .from("nfc_cards")
    .select("id, student_id, token, status, issued_at")
    .in("student_id", studentIds)
    .in("status", VISIBLE_STATUSES);

  return Promise.all(
    (data ?? []).map(async (row) => {
      const status = row.status as PortalCardStatus;
      return {
        cardId: row.id as string,
        studentId: row.student_id as string,
        studentName: studentNames.get(row.student_id as string) ?? null,
        status,
        issuedAt: (row.issued_at as string | null) ?? null,
        qrDataUrl:
          status === "active"
            ? await QRCode.toDataURL(row.token as string, { width: 320, margin: 1 })
            : null,
      };
    }),
  );
}
