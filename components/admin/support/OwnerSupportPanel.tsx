"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { createOwnerSupportThread, replyOwnerSupport } from "@/app/portal/admin/support/actions";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";

type Thread = {
  id: string;
  subject: string;
  status: string;
  updatedAt: string;
};

type Message = {
  id: string;
  body: string;
  isFromOlune: boolean;
  createdAt: string;
};

export function OwnerSupportPanel({
  threads: initialThreads,
  initialMessages,
  selectedThreadId,
}: {
  threads: Thread[];
  initialMessages: Message[];
  selectedThreadId: string | null;
}) {
  const t = useTranslations("admin.support");
  const tShared = useTranslations("admin.shared");
  const [threads] = useState(initialThreads);
  const [selectedId, setSelectedId] = useState(selectedThreadId);
  const [messages, setMessages] = useState(initialMessages);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [reply, setReply] = useState("");
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);

  function createThread() {
    if (!subject.trim() || !body.trim()) return;
    startTransition(async () => {
      const res = await createOwnerSupportThread({ subject: subject.trim(), body: body.trim() });
      setFeedback(res.ok ? t("messageSent") : res.error);
      if (res.ok) {
        setSubject("");
        setBody("");
      }
      setTimeout(() => setFeedback(null), 3000);
    });
  }

  function sendReply() {
    if (!selectedId || !reply.trim()) return;
    startTransition(async () => {
      const res = await replyOwnerSupport({ threadId: selectedId, body: reply.trim() });
      if (res.ok) {
        setReply("");
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            body: reply.trim(),
            isFromOlune: false,
            createdAt: new Date().toISOString(),
          },
        ]);
      }
    });
  }

  const selected = threads.find((t) => t.id === selectedId);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-black text-ink">{t("title")}</h1>
        <p className="text-sm text-muted">{t("subtitle")}</p>
      </header>

      {feedback && <p className="text-sm text-muted">{feedback}</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        <GlassPanel className="!p-5 space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted">{t("newConversation")}</h2>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={t("subject")}
            className="w-full rounded-xl border border-[--hair] bg-surface px-3 py-2 text-sm"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            placeholder={t("bodyPlaceholder")}
            className="w-full rounded-xl border border-[--hair] bg-surface px-3 py-2 text-sm"
          />
          <button
            onClick={createThread}
            disabled={pending}
            className="rounded-full bg-brand px-5 py-2 text-xs font-bold uppercase text-white"
          >
            {t("sendToOlune")}
          </button>
        </GlassPanel>

        <GlassPanel className="!p-5">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted">{t("yourThreads")}</h2>
          <ul className="space-y-2">
            {threads.map((thread) => (
              <li key={thread.id}>
                <button
                  onClick={() => setSelectedId(thread.id)}
                  className={`w-full rounded-xl border bg-surface p-3 text-left text-sm ${
                    selectedId === thread.id ? "border-brand" : "border-[--hair]"
                  }`}
                >
                  <p className="font-semibold text-ink">{thread.subject}</p>
                  <p className="text-xs text-muted">{thread.status}</p>
                </button>
              </li>
            ))}
            {threads.length === 0 && <li className="text-sm text-muted">{t("noConversations")}</li>}
          </ul>
        </GlassPanel>
      </div>

      {selected && (
        <GlassPanel className="!p-5">
          <h2 className="mb-4 font-bold text-ink">{selected.subject}</h2>
          <div className="mb-4 space-y-2 max-h-64 overflow-y-auto">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`rounded-xl px-4 py-2 text-sm ${
                  m.isFromOlune ? "mr-8 border border-[--hair] bg-surface" : "ml-8 bg-brand text-white"
                }`}
              >
                {m.body}
              </div>
            ))}
          </div>
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={2}
            className="mb-2 w-full rounded-xl border border-[--hair] bg-surface px-3 py-2 text-sm"
            placeholder={t("replyPlaceholder")}
          />
          <button
            onClick={sendReply}
            disabled={pending}
            className="rounded-full border border-[--hair] px-4 py-1.5 text-xs font-bold uppercase"
          >
            {pending ? tShared("sending") : t("sendReply")}
          </button>
        </GlassPanel>
      )}
    </div>
  );
}
