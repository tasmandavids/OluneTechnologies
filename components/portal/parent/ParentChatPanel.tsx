"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  MessageThread,
  type ThreadMessage,
} from "@/components/admin/messages/MessageThread";
import {
  MessageStreamProvider,
  useMessageStream,
} from "@/components/admin/messages/MessageStreamProvider";
import type {
  ParentChatAdmin,
  ParentChatMessage,
  ParentChatTeacher,
  ParentChatTopic,
} from "@/lib/portal/parent-chat";
import {
  adminTopicThreadKey,
  MESSAGE_TOPICS,
  normalizeMessageTopic,
} from "@/lib/portal/message-topics";

type Selection =
  | { kind: "admin"; topic: ParentChatTopic; peerId: string }
  | { kind: "teacher"; peerId: string };

interface Props {
  currentUserId: string;
  admin: ParentChatAdmin | null;
  teachers: ParentChatTeacher[];
  recentMessages: ParentChatMessage[];
  initialTopic?: ParentChatTopic | null;
  initialPeerId?: string | null;
}

function personName(
  first: string | null,
  last: string | null,
  fallback: string,
) {
  return [first, last].filter(Boolean).join(" ") || fallback;
}

function initials(first: string | null, last: string | null, fallback: string) {
  return [first?.[0], last?.[0]].filter(Boolean).join("").toUpperCase() || fallback;
}

export function ParentChatPanel(props: Props) {
  return (
    <MessageStreamProvider currentUserId={props.currentUserId}>
      <ParentChatPanelContent {...props} />
    </MessageStreamProvider>
  );
}

function ParentChatPanelContent({
  currentUserId,
  admin,
  teachers,
  recentMessages,
  initialTopic = null,
  initialPeerId = null,
}: Props) {
  const t = useTranslations("parent.chat");
  const tShared = useTranslations("parent.hub");
  const locale = useLocale();
  const stream = useMessageStream();

  const resolveInitialSelection = (): Selection | null => {
    if (initialPeerId && teachers.some((teacher) => teacher.id === initialPeerId)) {
      return { kind: "teacher", peerId: initialPeerId };
    }
    if (admin) {
      const topic =
        initialTopic && ["billing", "absence", "general"].includes(initialTopic)
          ? initialTopic
          : "general";
      return { kind: "admin", topic, peerId: admin.id };
    }
    return null;
  };

  const [selection, setSelection] = useState<Selection | null>(resolveInitialSelection);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [lastMessages, setLastMessages] = useState<Record<string, ParentChatMessage>>({});

  const adminTopics = MESSAGE_TOPICS;

  const messageListKey = useCallback((m: ParentChatMessage) => {
    const peerId = m.from_user_id === currentUserId ? m.to_user_id : m.from_user_id;
    if (admin && peerId === admin.id) {
      return adminTopicThreadKey(normalizeMessageTopic(m.topic));
    }
    return peerId;
  }, [currentUserId, admin]);

  function selectionMatchesMessage(current: Selection | null, m: ParentChatMessage) {
    if (!current) return false;
    const peerId = m.from_user_id === currentUserId ? m.to_user_id : m.from_user_id;
    if (current.peerId !== peerId) return false;
    if (current.kind === "admin") {
      return normalizeMessageTopic(m.topic) === current.topic;
    }
    return current.kind === "teacher";
  }

  useEffect(() => {
    const last: Record<string, ParentChatMessage> = {};
    const unread: Record<string, number> = {};

    recentMessages.forEach((m) => {
      const key = messageListKey(m);
      if (!last[key] || last[key].sent_at < m.sent_at) last[key] = m;
      if (m.to_user_id === currentUserId && !m.read_at) {
        unread[key] = (unread[key] ?? 0) + 1;
      }
    });

    setLastMessages(last);
    setUnreadCounts(unread);
  }, [recentMessages, currentUserId, admin, messageListKey]);

  useEffect(() => {
    if (!stream) return;
    return stream.subscribe((newMsg) => {
      const key = messageListKey(newMsg as ParentChatMessage);

      setLastMessages((prev) => ({ ...prev, [key]: newMsg as ParentChatMessage }));

      setSelection((current) => {
        if (!selectionMatchesMessage(current, newMsg as ParentChatMessage)) {
          setUnreadCounts((u) => ({ ...u, [key]: (u[key] ?? 0) + 1 }));
        } else {
          setUnreadCounts((prev) => ({ ...prev, [key]: 0 }));
        }
        return current;
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream, currentUserId, admin]);

  const activePeerId = selection?.peerId ?? null;

  const threadContact = useMemo(() => {
    if (!selection) return null;

    if (selection.kind === "teacher") {
      const teacher = teachers.find((item) => item.id === selection.peerId);
      if (!teacher) return null;
      const name = personName(teacher.first_name, teacher.last_name, tShared("unnamedDancer"));
      return {
        id: teacher.id,
        name,
        role: "teacher",
        subtitle: teacher.classNames.join(", "),
        placeholder: t("teacherPlaceholder", { name }),
      };
    }

    if (!admin) return null;
    const name = personName(admin.first_name, admin.last_name, t("studioAdmin"));
    return {
      id: admin.id,
      name,
      role: admin.role,
      subtitle: t(`topics.${selection.topic}.subtitle`),
      placeholder: t(`topics.${selection.topic}.placeholder`),
    };
  }, [selection, admin, teachers, t, tShared]);

  const handleThreadMessage = (msg: ThreadMessage) => {
    if (!selection) return;
    const key =
      selection.kind === "admin"
        ? adminTopicThreadKey(selection.topic)
        : selection.peerId;
    setLastMessages((prev) => ({ ...prev, [key]: msg as ParentChatMessage }));
  };

  const selectAdminTopic = (topic: ParentChatTopic) => {
    if (!admin) return;
    setSelection({ kind: "admin", topic, peerId: admin.id });
    setUnreadCounts((prev) => ({ ...prev, [adminTopicThreadKey(topic)]: 0 }));
  };

  const selectTeacher = (teacherId: string) => {
    setSelection({ kind: "teacher", peerId: teacherId });
    setUnreadCounts((prev) => ({ ...prev, [teacherId]: 0 }));
  };

  function formatDate(iso: string) {
    const d = new Date(iso);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return t("today");
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return t("yesterday");
    return d.toLocaleDateString(locale, { month: "short", day: "numeric" });
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  }

  const isAdminTopicSelected = (topic: ParentChatTopic) =>
    selection?.kind === "admin" && selection.topic === topic;

  const isTeacherSelected = (teacherId: string) =>
    selection?.kind === "teacher" && selection.peerId === teacherId;

  return (
    <div className="flex h-full overflow-hidden bg-base">
      <aside className="flex w-80 shrink-0 flex-col border-r border-[--hair] bg-surface">
        <div className="border-b border-[--hair] px-5 py-4">
          <h1 className="text-lg font-black text-ink">{t("title")}</h1>
          <p className="text-xs text-muted">{t("subtitle")}</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {!admin && teachers.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted">{t("noContacts")}</p>
          ) : (
            <>
              {admin && (
                <div className="border-b border-[--hair] py-2">
                  <p className="px-4 py-2 text-[0.65rem] font-bold uppercase tracking-wider text-muted">
                    {t("studioSection")}
                  </p>
                  {adminTopics.map((topic) => {
                    const key = adminTopicThreadKey(topic);
                    const unread = unreadCounts[key] ?? 0;
                    const last = lastMessages[key];
                    const selected = isAdminTopicSelected(topic);

                    return (
                      <button
                        key={topic}
                        type="button"
                        onClick={() => selectAdminTopic(topic)}
                        className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${
                          selected ? "bg-brand/10" : "hover:bg-surface/60"
                        }`}
                      >
                        <span
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
                          style={{ background: "var(--brand)" }}
                        >
                          {topic === "billing" ? "💳" : topic === "absence" ? "📅" : "💬"}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <span
                              className={`truncate text-sm font-semibold ${selected ? "text-brand" : "text-ink"}`}
                            >
                              {t(`topics.${topic}.label`)}
                            </span>
                            {last && (
                              <span className="shrink-0 text-[0.65rem] text-muted">
                                {formatDate(last.sent_at) === t("today")
                                  ? formatTime(last.sent_at)
                                  : formatDate(last.sent_at)}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center justify-between gap-1">
                            <p className="truncate text-xs text-muted">
                              {last
                                ? (last.from_user_id === currentUserId ? t("youPrefix") : "") +
                                  last.body
                                : t(`topics.${topic}.hint`)}
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

              {teachers.length > 0 && (
                <div className="py-2">
                  <p className="px-4 py-2 text-[0.65rem] font-bold uppercase tracking-wider text-muted">
                    {t("teachersSection")}
                  </p>
                  {teachers.map((teacher) => {
                    const unread = unreadCounts[teacher.id] ?? 0;
                    const last = lastMessages[teacher.id];
                    const selected = isTeacherSelected(teacher.id);
                    const name = personName(
                      teacher.first_name,
                      teacher.last_name,
                      tShared("unnamedDancer"),
                    );

                    return (
                      <button
                        key={teacher.id}
                        type="button"
                        onClick={() => selectTeacher(teacher.id)}
                        className={`flex w-full items-start gap-3 border-b border-[--hair] px-4 py-3 text-left transition-colors ${
                          selected ? "bg-brand/10" : "hover:bg-surface/60"
                        }`}
                      >
                        <span
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
                          style={{ background: "var(--brand-deep, var(--brand))" }}
                        >
                          {initials(teacher.first_name, teacher.last_name, "T")}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <span
                              className={`truncate text-sm font-semibold ${selected ? "text-brand" : "text-ink"}`}
                            >
                              {name}
                            </span>
                            {last && (
                              <span className="shrink-0 text-[0.65rem] text-muted">
                                {formatDate(last.sent_at) === t("today")
                                  ? formatTime(last.sent_at)
                                  : formatDate(last.sent_at)}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center justify-between gap-1">
                            <p className="truncate text-xs text-muted">
                              {last
                                ? (last.from_user_id === currentUserId ? t("youPrefix") : "") +
                                  last.body
                                : teacher.classNames.join(", ")}
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
            </>
          )}
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        {selection && threadContact && activePeerId ? (
          <MessageThread
            currentUserId={currentUserId}
            peerId={activePeerId}
            topic={selection.kind === "admin" ? selection.topic : undefined}
            contact={{
              id: threadContact.id,
              name: threadContact.name,
              role: threadContact.role,
              subtitle: threadContact.subtitle,
            }}
            placeholder={threadContact.placeholder}
            messagesNamespace="parent.chat"
            onNewMessage={handleThreadMessage}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-center text-muted">
            <div>
              <p className="mb-4 text-5xl">✉️</p>
              <p className="text-lg font-semibold text-ink">{t("selectPrompt")}</p>
              <p className="mt-1 text-sm">{t("selectDescription")}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
