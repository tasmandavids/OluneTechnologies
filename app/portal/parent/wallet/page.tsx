// ============================================================================
//  /portal/parent/wallet — merged into /portal/parent/billing (1.6.1 IA).
//  Route kept as a redirect so old links keep working.
// ============================================================================

import { redirect } from "next/navigation";

export default function WalletPage() {
  redirect("/portal/parent/billing");
}
