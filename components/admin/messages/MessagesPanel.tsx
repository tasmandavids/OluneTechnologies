"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { IconSearch } from "@/components/admin/dashboard/icons";
import { MessageThread, type ThreadMessage } from "@/components/admin/messages/MessageThread";
import {
  MessageStreamProvider,
  useMessageStream,
} from "@/components/admin/messages/MessageStreamProvider";
import {
  adminTopicThreadKey,
  MESSAGE_TOPICS,
  normalizeMessageTopic,
  type MessageTopic,
} from "@/lib/portal/message-topics";

interface Contact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  role: string;
  avatar_url: string | null;
}

interface Message {
  id: string;
  from_user_id: string;
  to_user_id: string;
  body: string;
  channel: string;
  topic: string | null;
  sent_at: string;
  read_at: string | null;
}

type Selection =
  | { kind: "parentTopic"; topic: MessageTopic; peerId: string }
  | { kind: "direct"; peerId: string };

const AVATAR_TINTS = ["var(--brand)", "var(--brand-hot)", "var(--brand-deep)"];
function avatarTint(index: number) {
  return AVATAR_TINTS[index % AVATAR_TINTS.length];
}

interface Props {
  currentUserId: string;
  contacts: Contact[];
  recentMessages: Message[];
  initialContactId?: string | null;
  initialTopic?: MessageTopic | null;
}

function initials(c: Contact) {
  return [c.first_name?.[0], c.last_name?.[0]].filter(Boolean).join("").toUpperCase() || "?";
}

function displayName(c: Contact, unknownLabel: string) {
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || unknownLabel;
}

function formatTime(iso: string, locale: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

function peerIdForMessage(m: Message, currentUserId: string) {
  return m.from_user_id === currentUserId ? m.to_user_id : m.from_user_id;
}

export function MessagesPanel(props: Props) {
  return (
    <MessageStreamProvider currentUserId={props.currentUserId}>
      <MessagesPanelContent {...props} />
    </MessageStreamProvider>
  );
}

function MessagesPanelContent({
  currentUserId,
  contacts,
  recentMessages,
  initialContactId = null,
  initialTopic = null,
}: Props) {
  const t = useTranslations("admin.messages");
  const tParentTopics = useTranslations("parent.chat.topics");
  const tShared = useTranslations("admin.shared");
  const locale = useLocale();
  const stream = useMessageStream();

  const parentContacts = useMemo(
    () => contacts.filter((c) => c.role === "parent"),
    [contacts],
  );
  const parentIds = useMemo(() => new Set(parentContacts.map((c) => c.id)), [parentContacts]);
  const otherContacts = useMemo(
    () => contacts.filter((c) => c.role !== "parent"),
    [contacts],
  );

  const resolveInitialSelection = (): { selection: Selection | null; topic: MessageTopic | null } => {
    if (
      initialContactId &&
      initialTopic &&
      parentIds.has(initialContactId)
    ) {
      return {
        selection: { kind: "parentTopic", topic: initialTopic, peerId: initialContactId },
        topic: initialTopic,
      };
    }
    if (initialContactId && contacts.some((c) => c.id === initialContactId)) {
      const contact = contacts.find((c) => c.id === initialContactId);
      if (contact?.role === "parent") {
        return {
          selection: { kind: "parentTopic", topic: "general", peerId: initialContactId },
          topic: "general",
        };
      }
      return { selection: { kind: "direct", peerId: initialContactId }, topic: null };
    }
    return { selection: null, topic: MESSAGE_TOPICS[0] };
  };

  const initial = resolveInitialSelection();
  const [activeTopic, setActiveTopic] = useState<MessageTopic | null>(initial.topic);
  const [selection, setSelection] = useState<Selection | null>(initial.selection);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [lastMessages, setLastMessages] = useState<Record<string, Message>>({});
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const listKeyForMessage = useCallback((m: Message) => {
    const peerId = peerIdForMessage(m, currentUserId);
    if (parentIds.has(peerId)) {
      return adminTopicThreadKey(normalizeMessageTopic(m.topic));
    }
    return peerId;
  }, [currentUserId, parentIds]);

  function parentTopicKey(topic: MessageTopic, parentId: string) {
    return `${topic}:${parentId}`;
  }

  function selectionMatchesMessage(current: Selection | null, m: Message) {
    if (!current) return false;
    const peerId = peerIdForMessage(m, currentUserId);
    if (current.peerId !== peerId) return false;
    if (current.kind === "parentTopic") {
      return normalizeMessageTopic(m.topic) === current.topic;
    }
    return !m.topic;
  }

  useEffect(() => {
    const last: Record<string, Message> = {};
    const unread: Record<string, number> = {};

    recentMessages.forEach((m) => {
      const key = listKeyForMessage(m);
      if (!last[key] || last[key].sent_at < m.sent_at) last[key] = m;

      if (parentIds.has(peerIdForMessage(m, currentUserId))) {
        const topic = normalizeMessageTopic(m.topic);
        const parentKey = parentTopicKey(topic, peerIdForMessage(m, currentUserId));
        if (!last[parentKey] || last[parentKey].sent_at < m.sent_at) {
          last[parentKey] = m;
        }
        if (m.to_user_id === currentUserId && !m.read_at) {
          unread[parentKey] = (unread[parentKey] ?? 0) + 1;
        }
      } else {
        if (m.to_user_id === currentUserId && !m.read_at) {
          unread[key] = (unread[key] ?? 0) + 1;
        }
      }
    });

    setLastMessages(last);
    setUnreadCounts(unread);
  }, [recentMessages, currentUserId, parentIds, listKeyForMessage]);

  useEffect(() => {
    if (!stream) return;
    return stream.subscribe((newMsg) => {
      const msg = newMsg as Message;
      const key = listKeyForMessage(msg);
      const peerId = peerIdForMessage(msg, currentUserId);

      setLastMessages((prev) => {
        const next = { ...prev, [key]: msg };
        if (parentIds.has(peerId)) {
          const topic = normalizeMessageTopic(msg.topic);
          next[parentTopicKey(topic, peerId)] = msg;
        }
        return next;
      });

      setSelection((current) => {
        const unreadKey = parentIds.has(peerId)
          ? parentTopicKey(normalizeMessageTopic(msg.topic), peerId)
          : key;

        if (!selectionMatchesMessage(current, msg)) {
          setUnreadCounts((u) => ({ ...u, [unreadKey]: (u[unreadKey] ?? 0) + 1 }));
        } else {
          setUnreadCounts((prev) => ({ ...prev, [unreadKey]: 0 }));
        }
        return current;
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream, currentUserId, parentIds]);

  const parentsInTopic = useMemo(() => {
    if (!activeTopic) return [];

    const seen = new Map<string, Message>();
    recentMessages.forEach((m) => {
      if (!parentIds.has(peerIdForMessage(m, currentUserId))) return;
      if (normalizeMessageTopic(m.topic) !== activeTopic) return;
      const parentId = peerIdForMessage(m, currentUserId);
      const existing = seen.get(parentId);
      if (!existing || existing.sent_at < m.sent_at) seen.set(parentId, m);
    });

    return [...seen.entries()]
      .map(([parentId, lastMsg]) => ({
        contact: parentContacts.find((c) => c.id === parentId)!,
        lastMsg,
      }))
      .filter((row) => row.contact)
      .filter(
        (row) =>
          !q ||
          [row.contact.first_name, row.contact.last_name]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(q),
      )
      .sort((a, b) => {
        const ua = unreadCounts[parentTopicKey(activeTopic, a.contact.id)] ?? 0;
        const ub = unreadCounts[parentTopicKey(activeTopic, b.contact.id)] ?? 0;
        if (ub !== ua) return ub - ua;
        return (b.lastMsg?.sent_at ?? "").localeCompare(a.lastMsg?.sent_at ?? "");
      });
  }, [activeTopic, recentMessages, parentContacts, parentIds, currentUserId, unreadCounts, q]);

  const handleThreadMessage = (msg: ThreadMessage) => {
    if (!selection) return;
    if (selection.kind === "parentTopic") {
      setLastMessages((prev) => ({
        ...prev,
        [parentTopicKey(selection.topic, selection.peerId)]: msg as Message,
        [adminTopicThreadKey(selection.topic)]: msg as Message,
      }));
      return;
    }
    setLastMessages((prev) => ({ ...prev, [selection.peerId]: msg as Message }));
  };

  const selectParentTopic = (topic: MessageTopic, parentId: string) => {
    setActiveTopic(topic);
    setSelection({ kind: "parentTopic", topic, peerId: parentId });
    setUnreadCounts((prev) => ({ ...prev, [parentTopicKey(topic, parentId)]: 0 }));
  };

  const selectTopic = (topic: MessageTopic) => {
    setActiveTopic(topic);
    setSelection(null);
  };

  const selectDirectContact = (id: string) => {
    setActiveTopic(null);
    setSelection({ kind: "direct", peerId: id });
    setUnreadCounts((prev) => ({ ...prev, [id]: 0 }));
  };

  const sortedOtherContacts = otherContacts
    .filter(
      (c) =>
        !q ||
        [c.first_name, c.last_name].filter(Boolean).join(" ").toLowerCase().includes(q) ||
        c.role.toLowerCase().includes(q),
    )
    .sort((a, b) => {
      const ua = unreadCounts[a.id] ?? 0;
      const ub = unreadCounts[b.id] ?? 0;
      if (ub !== ua) return ub - ua;
      const ta = lastMessages[a.id]?.sent_at ?? "";
      const tb = lastMessages[b.id]?.sent_at ?? "";
      return tb.localeCompare(ta);
    });

  function formatDate(iso: string) {
    const d = new Date(iso);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return tShared("today");
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return tShared("yesterday");
    return d.toLocaleDateString(locale, { month: "short", day: "numeric" });
  }

  const threadContact = useMemo(() => {
    if (!selection) return null;
    const contact = contacts.find((c) => c.id === selection.peerId);
    if (!contact) return null;

    const name = displayName(contact, tShared("unknown"));
    if (selection.kind === "parentTopic") {
      return {
        id: contact.id,
        name,
        role: contact.role,
        subtitle: tParentTopics(`${selection.topic}.subtitle`),
        topic: selection.topic,
      };
    }
    return { id: contact.id, name, role: contact.role, topic: undefined as MessageTopic | undefined };
  }, [selection, contacts, tParentTopics, tShared]);

  const topicUnread = (topic: MessageTopic) =>
    parentsInTopicForCount(topic).reduce(
      (sum, parentId) => sum + (unreadCounts[parentTopicKey(topic, parentId)] ?? 0),
      0,
    );

  function parentsInTopicForCount(topic: MessageTopic) {
    const ids = new Set<string>();
    recentMessages.forEach((m) => {
      if (!parentIds.has(peerIdForMessage(m, currentUserId))) return;
      if (normalizeMessageTopic(m.topic) !== topic) return;
      ids.add(peerIdForMessage(m, currentUserId));
    });
    return [...ids];
  }

  return (
    <div className="flex h-full overflow-hidden bg-base">
      <aside className="flex w-80 shrink-0 flex-col border-r border-[--hair] bg-surface">
        <div className="border-b border-[--hair] px-5 py-4">
          <h1 className="font-display text-xl font-bold text-ink">{t("title")}</h1>
          <p className="mb-3 mt-0.5 text-xs text-muted">{t("contacts", { count: contacts.length })}</p>
          <div className="flex items-center gap-2 rounded-xl border border-[--hair] bg-base px-3 py-2.5">
            <IconSearch className="h-4 w-4 shrink-0 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="w-full border-none bg-transparent text-sm text-ink outline-none placeholder:text-muted"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="border-b border-[--hair] py-2">
            <p className="px-4 py-2 text-[0.65rem] font-bold uppercase tracking-wider text-muted">
              {t("parentEnquiries")}
            </p>
            {MESSAGE_TOPICS.map((topic) => {
              const unread = topicUnread(topic);
              const last = lastMessages[adminTopicThreadKey(topic)];

              return (
                <div key={topic}>
                  <button
                    type="button"
                    onClick={() => selectTopic(topic)}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${
                      activeTopic === topic && !selection ? "bg-brand/10" : "hover:bg-surface/60"
                    }`}
                  >
                    <span
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-base"
                      style={{
                        background: "color-mix(in srgb, var(--brand) 12%, var(--surface))",
                        color: "var(--brand-deep)",
                      }}
                    >
                      {topic === "billing" ? "💳" : topic === "absence" ? "📅" : "💬"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span
                          className={`truncate text-sm font-semibold ${
                            activeTopic === topic ? "text-brand" : "text-ink"
                          }`}
                        >
                          {tParentTopics(`${topic}.label`)}
                        </span>
                        {last && (
                          <span className="shrink-0 text-[0.65rem] text-muted">
                            {formatDate(last.sent_at) === tShared("today")
                              ? formatTime(last.sent_at, locale)
                              : formatDate(last.sent_at)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-1">
                        <p className="truncate text-xs text-muted">
                          {last
                            ? (last.from_user_id === currentUserId ? t("youPrefix") : "") +
                              last.body
                            : tParentTopics(`${topic}.hint`)}
                        </p>
                        {unread > 0 && (
                          <span className="ml-1 shrink-0 rounded-full bg-brand px-1.5 py-0.5 text-[0.6rem] font-bold text-white">
                            {unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>

                  {activeTopic === topic &&
                    parentsInTopic.map(({ contact, lastMsg }, contactIdx) => {
                      const isSelected =
                        selection?.kind === "parentTopic" &&
                        selection.topic === topic &&
                        selection.peerId === contact.id;
                      const parentUnread =
                        unreadCounts[parentTopicKey(topic, contact.id)] ?? 0;
                      const name = displayName(contact, tShared("unknown"));

                      return (
                        <button
                          key={contact.id}
                          type="button"
                          onClick={() => selectParentTopic(topic, contact.id)}
                          className={`flex w-full items-start gap-3 border-t border-[--hair]/60 py-2.5 pl-10 pr-4 text-left transition-colors ${
                            isSelected ? "bg-brand/10" : "hover:bg-surface/60"
                          }`}
                        >
                          <span
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
                            style={{ background: avatarTint(contactIdx) }}
                          >
                            {initials(contact)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1">
                              <span
                                className={`truncate text-sm font-semibold ${
                                  isSelected ? "text-brand" : "text-ink"
                                }`}
                              >
                                {name}
                              </span>
                              {lastMsg && (
                                <span className="shrink-0 text-[0.65rem] text-muted">
                                  {formatDate(lastMsg.sent_at) === tShared("today")
                                    ? formatTime(lastMsg.sent_at, locale)
                                    : formatDate(lastMsg.sent_at)}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center justify-between gap-1">
                              <p className="truncate text-xs text-muted">
                                {lastMsg
                                  ? (lastMsg.from_user_id === currentUserId
                                      ? t("youPrefix")
                                      : "") + lastMsg.body
                                  : t("parentRole")}
                              </p>
                              {parentUnread > 0 && (
                                <span className="ml-1 shrink-0 rounded-full bg-brand px-1.5 py-0.5 text-[0.6rem] font-bold text-white">
                                  {parentUnread}
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                </div>
              );
            })}
          </div>

          {sortedOtherContacts.length > 0 && (
            <div className="py-2">
              <p className="px-4 py-2 text-[0.65rem] font-bold uppercase tracking-wider text-muted">
                {t("otherContacts")}
              </p>
              {sortedOtherContacts.map((c, contactIdx) => {
                const unread = unreadCounts[c.id] ?? 0;
                const last = lastMessages[c.id];
                const isSelected = selection?.kind === "direct" && selection.peerId === c.id;
                const name = displayName(c, tShared("unknown"));

                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => selectDirectContact(c.id)}
                    className={`flex w-full items-start gap-3 border-b border-[--hair] px-4 py-3 text-left transition-colors ${
                      isSelected ? "bg-brand/10" : "hover:bg-surface/60"
                    }`}
                  >
                    <span
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
                      style={{ background: avatarTint(contactIdx) }}
                    >
                      {initials(c)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span
                          className={`truncate text-sm font-semibold ${
                            isSelected ? "text-brand" : "text-ink"
                          }`}
                        >
                          {name}
                        </span>
                        {last && (
                          <span className="shrink-0 text-[0.65rem] text-muted">
                            {formatDate(last.sent_at) === tShared("today")
                              ? formatTime(last.sent_at, locale)
                              : formatDate(last.sent_at)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-1">
                        <p className="truncate text-xs text-muted">
                          {last ? (
                            (last.from_user_id === currentUserId ? t("youPrefix") : "") + last.body
                          ) : (
                            <span className="capitalize text-muted/60">{c.role}</span>
                          )}
                        </p>
                        {unread > 0 && (
                          <span className="ml-1 shrink-0 rounded-full bg-brand px-1.5 py-0.5 text-[0.6rem] font-bold text-white">
                            {unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        {selection && threadContact ? (
          <MessageThread
            currentUserId={currentUserId}
            peerId={selection.peerId}
            topic={threadContact.topic}
            contact={{
              id: threadContact.id,
              name: threadContact.name,
              role: threadContact.role,
              subtitle: threadContact.subtitle,
            }}
            onNewMessage={handleThreadMessage}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-center text-muted">
            <div>
              <p className="mb-4 text-5xl">✉️</p>
              <p className="text-lg font-semibold text-ink">{t("selectContact")}</p>
              <p className="mt-1 text-sm">{t("selectDescription")}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
