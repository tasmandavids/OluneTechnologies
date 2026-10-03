"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { SupportThread, SupportMessage } from "@/lib/platform/types";
import {
  replyToThread,
  updateThreadStatus,
  loadThreadMessages,
} from "@/app/platform/messages/actions";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";
import { RippleButton } from "@/components/portal/admin/glass/RippleButton";
import { PlatformPageHeader, Segmented, fieldClass } from "./glass/ui";

const THREAD_DOT: Record<string, string> = { open: "var(--brand)", pending: "#f2b788", resolved: "var(--success, #16a34a)" };

export function SupportInbox({ threads: initialThreads }: { threads: SupportThread[] }) {
  const t = useTranslations("platform.support");
  const locale = useLocale();
  const [threads, setThreads] = useState(initialThreads);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [reply, setReply] = useState("");
  const [pending, startTransition] = useTransition();

  function selectThread(id: string) {
    setSelectedId(id);
    startTransition(async () => {
      const res = await loadThreadMessages(id);
      if (res.ok) setMessages(res.messages);
    });
  }

  function sendReply() {
    if (!selectedId || !reply.trim()) return;
    startTransition(async () => {
      const res = await replyToThread({ threadId: selectedId, body: reply.trim() });
      if (res.ok) {
        setReply("");
        const msgs = await loadThreadMessages(selectedId);
        if (msgs.ok) setMessages(msgs.messages);
      }
    });
  }

  function setStatus(status: "open" | "pending" | "resolved") {
    if (!selectedId) return;
    startTransition(async () => {
      await updateThreadStatus({ threadId: selectedId, status });
      setThreads((prev) =>
        prev.map((thread) => (thread.id === selectedId ? { ...thread, status } : thread)),
      );
    });
  }

  const selected = threads.find((thread) => thread.id === selectedId);
  const statusKeys = ["open", "pending", "resolved"] as const;

  return (
    <div className="py-2">
      <PlatformPageHeader title={t("title")} />

      <div className="flex flex-col gap-3.5 md:flex-row md:items-stretch">
        <div className="w-full shrink-0 md:w-[340px]">
          <GlassPanel className="!p-2">
            <ul className="flex max-h-96 flex-col gap-0.5 overflow-y-auto md:max-h-[calc(100vh-15rem)]">
              {threads.map((thread) => {
                const on = selectedId === thread.id;
                return (
                  <li key={thread.id}>
                    <button
                      type="button"
                      onClick={() => selectThread(thread.id)}
                      aria-pressed={on}
                      className="flex w-full flex-col gap-1 rounded-[14px] border p-3 text-left transition-colors hover:bg-[--t1]"
                      style={{ borderColor: on ? "var(--tb)" : "transparent", background: on ? "var(--t2)" : undefined }}
                    >
                      <span className="text-[13.5px] font-semibold leading-snug text-ink">{thread.subject}</span>
                      <span className="flex items-center gap-1.5 text-xs text-muted">
                        <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: THREAD_DOT[thread.status] }} />
                        {thread.studioName} · {t(`status.${thread.status}`)} · {thread.priority}
                      </span>
                    </button>
                  </li>
                );
              })}
              {threads.length === 0 && <li className="p-3 text-sm text-muted">{t("noThreads")}</li>}
            </ul>
          </GlassPanel>
        </div>

        <div className="flex min-h-[520px] min-w-0 flex-1 flex-col">
          <GlassPanel className="flex flex-1 flex-col !p-0">
            {selected ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[--hair] px-5 py-4">
                  <div className="min-w-0">
                    <h2 className="font-display text-lg font-medium tracking-tight text-ink">{selected.subject}</h2>
                    <p className="text-xs text-muted">{selected.studioName}</p>
                  </div>
                  <Segmented
                    label={t("title")}
                    value={selected.status}
                    onChange={setStatus}
                    disabled={pending}
                    options={statusKeys.map((s) => ({ value: s, label: t(`status.${s}`) }))}
                  />
                </div>

                <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-5">
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={`max-w-[80%] px-3.5 py-3 text-sm ${
                        m.isOperator ? "ml-auto rounded-[16px_16px_6px_16px] text-white" : "mr-auto rounded-[16px_16px_16px_6px] border text-ink"
                      }`}
                      style={
                        m.isOperator
                          ? { background: "var(--brand)" }
                          : { borderColor: "var(--edge)", background: "var(--glass2)" }
                      }
                    >
                      <p className={`mb-1 text-[11px] font-semibold ${m.isOperator ? "opacity-85" : "text-muted"}`}>
                        {m.senderName ?? (m.isOperator ? t("senderOperator") : t("senderOwner"))}
                      </p>
                      <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
                      <p className={`mt-1.5 text-[11px] ${m.isOperator ? "opacity-80" : "text-muted"}`}>
                        {new Date(m.createdAt).toLocaleString(locale)}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="border-t border-[--hair] px-5 py-4">
                  <label className="block">
                    <span className="sr-only">{t("replyPlaceholder")}</span>
                    <textarea
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      rows={3}
                      placeholder={t("replyPlaceholder")}
                      className={fieldClass}
                    />
                  </label>
                  <div className="mt-2.5 flex justify-end">
                    <RippleButton variant="solid" size="lg" onClick={sendReply} disabled={pending || !reply.trim()}>
                      {t("sendReply")}
                    </RippleButton>
                  </div>
                </div>
              </>
            ) : (
              <div className="grid flex-1 place-items-center p-8 text-sm text-muted">{t("selectThread")}</div>
            )}
          </GlassPanel>
        </div>
      </div>
    </div>
  );
}
