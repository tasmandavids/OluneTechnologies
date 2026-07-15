// ============================================================================
//  /portal/parent/messages — merged into Messages at /portal/parent/chat
//  (1.6.1 IA). Route kept as a redirect so old links keep working.
// ============================================================================

import { redirect } from "next/navigation";

export default function ParentMessagesPage() {
  redirect("/portal/parent/chat?tab=email");
}
