// ============================================================================
//  /portal/parent/chat — the parent Messages hub: one door for talking to the
//  studio. Tabs: Chat (direct messages) | Email (studio email threads).
//  Backends stay separate — this is a UI-level merge only (1.6.1 IA).
// ============================================================================

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "@/lib/i18n/server";
import { ParentChatPanel } from "@/components/portal/parent/ParentChatPanel";
import { ParentEmailInbox } from "@/components/portal/parent/ParentEmailInbox";
import { loadParentChatData } from "@/lib/portal/parent-chat";
import { isMessageTopic } from "@/lib/portal/message-topics";

export const dynamic = "force-dynamic";

async function ChatTab({
  userId,
  studioId,
  withParam,
  topicParam,
}: {
  userId: string;
  studioId: string;
  withParam: string | null;
  topicParam: string | null;
}) {
  const { admin, teachers, recentMessages } = await loadParentChatData(userId, studioId);

  const initialTopic =
    topicParam && isMessageTopic(topicParam) ? topicParam : null;

  return (
    <ParentChatPanel
      currentUserId={userId}
      admin={admin}
      teachers={teachers}
      recentMessages={recentMessages}
      initialTopic={initialTopic}
      initialPeerId={withParam}
    />
  );
}

async function EmailTab({ userId, studioName }: { userId: string; studioName: string | null }) {
  const supabase = await createClient();
  const t = await getTranslations("parent.email");

  const { data: threads } = await supabase
    .from("parent_email_threads")
    .select("id, subject, snippet, participant_addresses, last_message_at, is_read")
    .eq("parent_id", userId)
    .order("last_message_at", { ascending: false })
    .limit(200);

  return (
    <ParentEmailInbox
      threads={threads ?? []}
      studioName={studioName ?? t("yourStudio")}
    />
  );
}

export default async function ParentChatPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; with?: string; topic?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("studio_id, role, studios!profiles_studio_id_fkey(name)")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "parent" || !profile.studio_id) redirect("/portal/parent");

  const tab = params.tab === "email" ? "email" : "chat";
  const t = await getTranslations("parent.inbox");
  const studioName = (profile.studios as { name?: string } | null)?.name ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-[--hair] bg-surface px-4 py-2">
        {(
          [
            { id: "chat", href: "/portal/parent/chat", label: t("tabs.chat") },
            { id: "email", href: "/portal/parent/chat?tab=email", label: t("tabs.email") },
          ] as const
        ).map(({ id, href, label }) => (
          <Link
            key={id}
            href={href}
            scroll={false}
            className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition ${
              tab === id ? "bg-ink text-paper" : "text-muted hover:bg-base hover:text-ink"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      <div className="min-h-0 flex-1">
        {tab === "email" ? (
          <EmailTab userId={user.id} studioName={studioName} />
        ) : (
          <ChatTab
            userId={user.id}
            studioId={profile.studio_id}
            withParam={params.with ?? null}
            topicParam={params.topic ?? null}
          />
        )}
      </div>
    </div>
  );
}
