import type { SupabaseClient } from "@supabase/supabase-js";
import type { SyncedMessage } from "./types";

export type ParentProfile = {
  id: string;
  email: string;
};

export async function loadParentsByEmails(
  supabase: SupabaseClient,
  studioId: string,
  emails: string[],
): Promise<Map<string, ParentProfile>> {
  const normalized = [...new Set(emails.map((e) => e.toLowerCase().trim()).filter(Boolean))];
  if (!normalized.length) return new Map();

  const { data } = await supabase
    .from("profiles")
    .select("id, email")
    .eq("studio_id", studioId)
    .eq("role", "parent")
    .in("email", normalized);

  const out = new Map<string, ParentProfile>();
  for (const row of data ?? []) {
    if (!row.email) continue;
    out.set(row.email.toLowerCase(), { id: row.id, email: row.email.toLowerCase() });
  }
  return out;
}

function messageAddresses(msg: SyncedMessage): Set<string> {
  const out = new Set<string>();
  for (const a of [msg.fromAddress, ...msg.toAddresses, ...msg.ccAddresses]) {
    if (a) out.add(a.toLowerCase().trim());
  }
  return out;
}

/**
 * Which messages of a thread a parent may see: only those they sent or received
 * (from / to / cc). Thread membership is not enough: a reply to a group send
 * is private to the replier and the studio (audit E-01).
 */
export function messagesForParent<T extends { synced: SyncedMessage }>(
  parent: ParentProfile,
  messages: T[],
): T[] {
  return messages.filter((m) => messageAddresses(m.synced).has(parent.email));
}

function parentsOnMessages(
  messages: Array<{ synced: SyncedMessage }>,
  accountEmail: string,
  parentsByEmail: Map<string, ParentProfile>,
): ParentProfile[] {
  const studioAddress = accountEmail.toLowerCase();
  const matched = new Map<string, ParentProfile>();

  for (const m of messages) {
    for (const address of messageAddresses(m.synced)) {
      if (address === studioAddress) continue;
      const parent = parentsByEmail.get(address);
      if (parent) matched.set(parent.id, parent);
    }
  }

  return [...matched.values()];
}

export async function archiveThreadForParents(
  supabase: SupabaseClient,
  input: {
    studioId: string;
    accountEmail: string;
    sourceThreadId: string;
    participants: string[];
    subject: string | null;
    snippet: string | null;
    lastMessageAt: string | null;
    messageCount: number;
    messages: Array<{
      sourceMessageId: string;
      synced: SyncedMessage;
    }>;
    parentsByEmail: Map<string, ParentProfile>;
  },
): Promise<number> {
  const parents = parentsOnMessages(input.messages, input.accountEmail, input.parentsByEmail);
  if (!parents.length) return 0;

  let archived = 0;

  for (const parent of parents) {
    const visible = messagesForParent(parent, input.messages);
    if (!visible.length) continue;
    const lastVisible = visible.reduce((a, b) =>
      (b.synced.sentAt ?? "") >= (a.synced.sentAt ?? "") ? b : a,
    );
    const participants = [
      ...new Set(visible.flatMap((m) => [...messageAddresses(m.synced)])),
    ];

    const { data: parentThread, error: threadErr } = await supabase
      .from("parent_email_threads")
      .upsert(
        {
          studio_id: input.studioId,
          parent_id: parent.id,
          source_email_thread_id: input.sourceThreadId,
          subject: lastVisible.synced.subject,
          snippet: lastVisible.synced.snippet,
          participant_addresses: participants,
          message_count: visible.length,
          last_message_at: lastVisible.synced.sentAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "parent_id,source_email_thread_id" },
      )
      .select("id")
      .single();

    if (threadErr || !parentThread) continue;

    for (const msg of visible) {
      const { error: msgErr } = await supabase.from("parent_email_messages").upsert(
        {
          studio_id: input.studioId,
          parent_id: parent.id,
          parent_email_thread_id: parentThread.id,
          source_email_message_id: msg.sourceMessageId,
          from_address: msg.synced.fromAddress,
          from_name: msg.synced.fromName,
          to_addresses: msg.synced.toAddresses,
          subject: msg.synced.subject,
          body_text: msg.synced.bodyText,
          body_html: msg.synced.bodyHtml,
          sent_at: msg.synced.sentAt,
          is_outbound: msg.synced.isOutbound,
        },
        { onConflict: "parent_id,source_email_message_id" },
      );
      if (!msgErr) archived += 1;
    }
  }

  return archived;
}
