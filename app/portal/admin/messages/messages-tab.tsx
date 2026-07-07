// ============================================================================
//  Messages tab — internal messaging hub (server loader moved from the old
//  /portal/admin/messages page body).
// ============================================================================

import { MessagesPanel } from "@/components/admin/messages/MessagesPanel";
import { isMessageTopic } from "@/lib/portal/message-topics";
import { normalizeMessageContact } from "@/lib/portal/staff-messages";
import { requirePortalSession } from "@/lib/portal/session";

export async function MessagesTab({
  withParam,
  topicParam,
}: {
  withParam: string | null;
  topicParam: string | null;
}) {
  const { supabase, userId, studioId } = await requirePortalSession();

  const [{ data: contacts }, { data: recentMessages }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, role")
      .eq("studio_id", studioId)
      .neq("id", userId)
      .order("full_name"),
    supabase
      .from("messages")
      .select("id, from_user_id, to_user_id, body, channel, topic, sent_at, read_at")
      .eq("studio_id", studioId)
      .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
      .order("sent_at", { ascending: false })
      .limit(100),
  ]);

  const normalizedContacts = (contacts ?? []).map((c) =>
    normalizeMessageContact({
      id: c.id as string,
      full_name: c.full_name as string | null,
      role: c.role as string,
    }),
  );

  const initialTopic =
    topicParam && isMessageTopic(topicParam) ? topicParam : null;

  return (
    <MessagesPanel
      currentUserId={userId}
      contacts={normalizedContacts}
      recentMessages={recentMessages ?? []}
      initialContactId={withParam}
      initialTopic={initialTopic}
    />
  );
}
