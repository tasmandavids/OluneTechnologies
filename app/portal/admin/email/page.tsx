import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { identifyContactsByEmail } from "@/lib/email/identify-contact";
import { EmailInbox } from "@/components/admin/email/EmailInbox";

export const dynamic = "force-dynamic";

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function EmailPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("studio_id, role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") redirect("/portal/admin");
  if (!profile.studio_id) redirect("/portal/admin");

  const params = await searchParams;

  const [{ data: accounts }, { data: threads }] = await Promise.all([
    supabase
      .from("email_accounts")
      .select("id, provider, email_address, display_name, last_sync_at, sync_error")
      .eq("studio_id", profile.studio_id)
      .order("created_at"),
    supabase
      .from("email_threads")
      .select("*")
      .eq("studio_id", profile.studio_id)
      .order("last_message_at", { ascending: false })
      .limit(200),
  ]);

  const participantEmails = new Set<string>();
  for (const thread of threads ?? []) {
    for (const address of thread.participant_addresses ?? []) {
      participantEmails.add(address.toLowerCase());
    }
  }

  const contacts = await identifyContactsByEmail(supabase, profile.studio_id, [...participantEmails]);

  return (
    <div className="flex h-[calc(100dvh-3.25rem)] min-h-[32rem] flex-col md:h-[calc(100dvh-3rem)]">
      <EmailInbox
        accounts={accounts ?? []}
        threads={threads ?? []}
        contacts={contacts}
        bannerError={params.error ? safeDecodeURIComponent(params.error) : null}
        bannerConnected={params.connected ?? null}
      />
    </div>
  );
}
