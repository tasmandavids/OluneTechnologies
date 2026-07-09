// ============================================================================
//  /portal/admin/maestro — the studio owner's AI assistant (Phase 1: finances).
// ============================================================================

export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { requirePortalSession } from "@/lib/portal/session";
import { MaestroPanel } from "@/components/admin/maestro/MaestroPanel";

export default async function MaestroPage() {
  const session = await requirePortalSession();
  // Owner-only — mirrors the API route's guard.
  if (session.role !== "admin") redirect("/portal");

  const studio = session.memberships.find((m) => m.studioId === session.studioId);

  return (
    <div className="mx-auto max-w-3xl">
      <MaestroPanel studioName={studio?.studioName ?? "your studio"} />
    </div>
  );
}
