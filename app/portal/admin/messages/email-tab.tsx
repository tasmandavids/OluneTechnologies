// ============================================================================
//  Email tab — studio email inbox (server loader moved from the old
//  /portal/admin/email page body). Only rendered for admins.
// ============================================================================

import { identifyContactsByEmail } from "@/lib/email/identify-contact";
import { EmailInbox } from "@/components/admin/email/EmailInbox";
import { requirePortalSession } from "@/lib/portal/session";

export async function EmailTab({
  bannerError,
  bannerConnected,
}: {
  bannerError: string | null;
  bannerConnected: string | null;
}) {
  const { supabase, studioId } = await requirePortalSession();

  const [{ data: accounts }, { data: threads }] = await Promise.all([
    supabase
      .from("email_accounts")
      .select("id, provider, email_address, display_name, last_sync_at, sync_error")
      .eq("studio_id", studioId)
      .order("created_at"),
    supabase
      .from("email_threads")
      .select("*")
      .eq("studio_id", studioId)
      .order("last_message_at", { ascending: false })
      .limit(200),
  ]);

  const participantEmails = new Set<string>();
  for (const thread of threads ?? []) {
    for (const address of thread.participant_addresses ?? []) {
      participantEmails.add(address.toLowerCase());
    }
  }

  const contacts = await identifyContactsByEmail(supabase, studioId, [...participantEmails]);

  return (
    <div className="flex h-full min-h-[32rem] flex-col">
      <EmailInbox
        accounts={accounts ?? []}
        threads={threads ?? []}
        contacts={contacts}
        bannerError={bannerError}
        bannerConnected={bannerConnected}
      />
    </div>
  );
}
