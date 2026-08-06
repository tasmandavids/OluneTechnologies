// ============================================================================
//  GET /api/apple-wallet/checkin-card/[cardId]
//
//  Streams a signed .pkpass for an issued NFC check-in card so the student or
//  their guardian can keep a copy in Apple Wallet.
//
//  Authorisation is RLS, not hand-rolled: the card is read with the caller's
//  own session, so 0103's nfc_cards select policies (guardian, the student
//  themselves, studio admin/office) decide who gets a pass. Only once that
//  read succeeds do we use the service-role client for the supporting studio /
//  profile lookups, which are decorative and shouldn't each need their own
//  policy carve-out.
// ============================================================================

import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_BRANDING } from "@/lib/branding";
import { isAppleWalletConfigured } from "@/lib/apple-wallet/config";
import { buildCheckinPass } from "@/lib/apple-wallet/pass";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CardIdSchema = z.string().uuid();

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ cardId: string }> },
) {
  const { cardId } = await params;
  if (!CardIdSchema.safeParse(cardId).success) {
    return NextResponse.json({ error: "Invalid card." }, { status: 400 });
  }

  if (!isAppleWalletConfigured()) {
    return NextResponse.json(
      { error: "Apple Wallet passes aren't set up for this studio yet." },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: card } = await supabase
    .from("nfc_cards")
    .select("id, token, status, student_id, studio_id, issued_at")
    .eq("id", cardId)
    .maybeSingle();

  // RLS turns "not yours" into "not found" — keep it that way.
  if (!card) return NextResponse.json({ error: "Card not found." }, { status: 404 });

  if (card.status !== "active") {
    return NextResponse.json(
      { error: "This card isn't active, so it can't be added to Apple Wallet." },
      { status: 409 },
    );
  }

  const admin = createAdminClient();
  const [studentRes, studioRes, brandingRes] = await Promise.all([
    admin.from("profiles").select("full_name").eq("id", card.student_id).maybeSingle(),
    admin.from("studios").select("name").eq("id", card.studio_id).maybeSingle(),
    admin.from("studio_branding").select("brand_color").eq("studio_id", card.studio_id).maybeSingle(),
  ]);

  let pkpass: Buffer;
  try {
    pkpass = await buildCheckinPass({
      cardId: card.id,
      cardToken: card.token,
      studentName: studentRes.data?.full_name?.trim() || "Dancer",
      studioName: studioRes.data?.name?.trim() || "Studio",
      brandColor: brandingRes.data?.brand_color ?? DEFAULT_BRANDING.brandColor,
      issuedAt: card.issued_at,
    });
  } catch (e) {
    console.error("[apple-wallet] pkpass build failed", e);
    return NextResponse.json({ error: "Could not build the wallet pass." }, { status: 500 });
  }

  return new NextResponse(new Uint8Array(pkpass), {
    headers: {
      "Content-Type": "application/vnd.apple.pkpass",
      "Content-Disposition": `attachment; filename="checkin-card.pkpass"`,
      // Contains the tap token — never let a shared cache hold onto it.
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}
