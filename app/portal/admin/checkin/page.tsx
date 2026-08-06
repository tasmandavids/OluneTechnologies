// ============================================================================
//  /portal/admin/checkin — who's in the building right now, plus card
//  issuance status (surfaced per-student on the student detail page) and the
//  door reader credential. Admin + office (front desk).
// ============================================================================

import { redirect } from "next/navigation";
import { getStudioOpsStudio } from "@/lib/portal/access";
import { listWhosIn } from "@/lib/checkin/roster";
import { getReaderCredentialStatus } from "@/lib/checkin/reader-credential";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";
import { WhosInRoster } from "@/components/portal/admin/checkin/WhosInRoster";
import { ReaderCredentialCard } from "@/components/portal/admin/checkin/ReaderCredentialCard";
import { DebugTapForm } from "@/components/portal/admin/checkin/DebugTapForm";

export const dynamic = "force-dynamic";

export default async function CheckinPage() {
  const { error, supabase, studioId } = await getStudioOpsStudio();
  if (error || !studioId) redirect("/portal/admin");

  const [roster, readerStatus] = await Promise.all([
    listWhosIn(supabase, studioId),
    getReaderCredentialStatus(supabase, studioId),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-ink">Check-in</h1>
        <p className="text-sm text-muted">
          Who&apos;s on the premises, card issuance, and the door reader — the building safety register.
        </p>
      </div>

      <GlassPanel>
        <WhosInRoster entries={roster} />
      </GlassPanel>

      <GlassPanel>
        <ReaderCredentialCard status={readerStatus} />
      </GlassPanel>

      <GlassPanel>
        <DebugTapForm />
      </GlassPanel>
    </div>
  );
}
