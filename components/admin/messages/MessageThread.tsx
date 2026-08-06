"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { useMessageStream } from "@/components/admin/messages/MessageStreamProvider";
import type { MessageTopic } from "@/lib/portal/message-topics";
import { normalizeMessageTopic } from "@/lib/portal/message-topics";

export interface ThreadMessage {
  id: string;
  from_user_id: string;
  to_user_id: string;
  body: string;
  channel: string;
  topic?: string | null;
  sent_at: string;
  read_at: string | null;
}

export interface ThreadContact {
  id: string;
  name: string;
  role?: string;
  subtitle?: string;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

interface MessageThreadProps {
  currentUserId: string;
  peerId: string;
  contact: ThreadContact;
  compact?: boolean;
  placeholder?: string;
  messagesNamespace?: string;
  topic?: MessageTopic;
  onNewMessage?: (msg: ThreadMessage) => void;
}

export function MessageThread({
  currentUserId,
  peerId,
  contact,
  compact = false,
  placeholder,
  messagesNamespace = "admin.messages",
  topic,
  onNewMessage,
}: MessageThreadProps) {
  const t = useTranslations(messagesNamespace);
  const tShared = useTranslations("admin.shared");
  const stream = useMessageStream();
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const loadThread = useCallback(async (id: string, threadTopic?: MessageTopic) => {
    setLoadingThread(true);
    setLoadError(null);
    setThread([]);
    try {
      const params = new URLSearchParams({ with: id });
      if (threadTopic) params.set("topic", threadTopic);
      const res = await fetch(`/api/messages?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        setLoadError(data.error ?? t("loadFailed"));
        return;
      }
      setThread(data.messages ?? []);
    } catch {
      setLoadError(t("loadFailed"));
    } finally {
      setLoadingThread(false);
    }
  }, [t]);

  useEffect(() => {
    loadThread(peerId, topic);
  }, [peerId, topic, loadThread]);

  useEffect(() => {
    if (!stream) return;
    return stream.subscribe((newMsg) => {
      const msgPeer =
        newMsg.from_user_id === currentUserId ? newMsg.to_user_id : newMsg.from_user_id;
      if (msgPeer !== peerId) return;

      const msgTopic = newMsg.topic ?? null;
      if (topic) {
        if (normalizeMessageTopic(msgTopic) !== topic) return;
      } else if (msgTopic) {
        return;
      }

      setThread((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });
      onNewMessage?.(newMsg);
    });
  }, [stream, currentUserId, peerId, topic, onNewMessage]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread]);

  const sendMessage = async () => {
    if (!draftText.trim() || sending) return;
    const body = draftText.trim();
    setSending(true);
    setSendError(null);
    setDraftText("");

    const optimistic: ThreadMessage = {
      id: `opt-${Date.now()}`,
      from_user_id: currentUserId,
      to_user_id: peerId,
      body,
      channel: "internal",
      topic: topic ?? null,
      sent_at: new Date().toISOString(),
      read_at: null,
    };
    setThread((prev) => [...prev, optimistic]);

    try {
      const payload: Record<string, string> = { toUserId: peerId, message: body };
      if (topic) payload.topic = topic;

      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        setThread((prev) => prev.filter((m) => m.id !== optimistic.id));
        setDraftText(body);
        setSendError(data.error ?? t("sendFailed"));
        return;
      }

      if (data.message) {
        setThread((prev) => prev.map((m) => (m.id === optimistic.id ? data.message : m)));
        onNewMessage?.(data.message);
      }
    } catch {
      setThread((prev) => prev.filter((m) => m.id !== optimistic.id));
      setDraftText(body);
      setSendError(t("sendFailed"));
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const initials = contact.name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";

  return (
    <div className={`flex flex-col ${compact ? "h-[420px]" : "h-full min-h-[480px]"}`}>
      {!compact && (
        <div className="flex items-center gap-3 border-b border-[--hair] bg-surface px-6 py-4">
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white"
            style={{ background: "var(--brand)" }}
          >
            {initials}
          </span>
          <div>
            <p className="font-semibold text-ink">{contact.name}</p>
            <p className="text-xs capitalize text-muted">
              {contact.subtitle ?? contact.role ?? t("parentRole")}
            </p>
          </div>
        </div>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-6">
        {loadingThread ? (
          <div className="flex h-full items-center justify-center text-sm text-muted">{tShared("loading")}</div>
        ) : loadError ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm">
            <p className="text-red-400">{loadError}</p>
            <button
              type="button"
              onClick={() => loadThread(peerId, topic)}
              className="box-pill px-3 py-1.5 text-xs text-ink"
            >
              {tShared("retry")}
            </button>
          </div>
        ) : thread.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-muted">
            <div>
              <p className="mb-2 text-2xl">💬</p>
              <p>{t("noMessages")}</p>
              <p className="mt-1 text-xs">{t("sayHello", { name: contact.name })}</p>
            </div>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {thread.map((msg) => {
              const isMine = msg.from_user_id === currentUserId;
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18 }}
                  className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[70%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      isMine
                        ? "rounded-br-sm bg-brand text-white"
                        : "rounded-bl-sm bg-surface text-ink"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                    <p className={`mt-1 text-[0.62rem] ${isMine ? "text-white/60" : "text-muted"}`}>
                      {formatTime(msg.sent_at)}
                      {isMine && msg.read_at && ` · ${tShared("read")}`}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-[--hair] bg-surface px-4 py-4 sm:px-6">
        {sendError && (
          <p className="mb-2 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-400">
            {sendError}
          </p>
        )}
        <div className="flex items-end gap-3">
          <textarea
            ref={inputRef}
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder ?? t("placeholder")}
            rows={1}
            className="flex-1 resize-none rounded-xl border border-[--hair] bg-base px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none"
            style={{ maxHeight: "120px", overflowY: "auto" }}
          />
          <button
            type="button"
            onClick={sendMessage}
            disabled={!draftText.trim() || sending}
            className="shrink-0 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {sending ? "…" : t("send")}
          </button>
        </div>
        {!compact && (
          <p className="mt-1.5 text-[0.62rem] text-muted">{t("internalChannel")}</p>
        )}
      </div>
    </div>
  );
}
