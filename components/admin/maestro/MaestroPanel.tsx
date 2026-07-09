"use client";

// ============================================================================
//  Maestro chat panel — the owner's conversational assistant. Talks to
//  POST /api/maestro (a streaming tool-calling agent scoped to this studio).
// ============================================================================

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

const SUGGESTIONS = [
  "How are we doing financially this month?",
  "What's our net profit year to date?",
  "Show me our most recent invoices.",
];

/** Friendly label for a tool call while it runs. */
function toolLabel(type: string): string {
  if (type === "tool-getFinancialSnapshot") return "Checking the studio's finances…";
  return "Working…";
}

export function MaestroPanel({
  studioName,
  onClose,
}: {
  studioName: string;
  onClose?: () => void;
}) {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/maestro" }),
  });

  const busy = status === "submitted" || status === "streaming";

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    sendMessage({ text: trimmed });
    setInput("");
  }

  return (
    <div className="flex h-full flex-col rounded-2xl border border-[--hair] bg-surface">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[--hair] px-4 py-3">
        <div>
          <p className="text-sm font-bold text-ink">Maestro</p>
          <p className="text-xs text-muted">{studioName}</p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Maestro"
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted transition hover:bg-black/[0.05] hover:text-ink"
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth={1.75}
                strokeLinecap="round"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Conversation */}
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {messages.length === 0 && (
          <div className="mx-auto max-w-md pt-6 text-center">
            <p className="text-sm text-muted">
              Your AI right hand for {studioName}. Ask about finances, invoices, and how the
              studio is doing.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => submit(s)}
                  className="rounded-xl border border-[--hair] px-4 py-2 text-left text-sm text-ink transition hover:bg-black/[0.03]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={message.role === "user" ? "flex justify-end" : "flex justify-start"}
          >
            <div
              className={
                message.role === "user"
                  ? "max-w-[80%] rounded-2xl bg-ink px-4 py-2.5 text-sm text-white"
                  : "max-w-[85%] space-y-2 text-sm text-ink"
              }
            >
              {message.parts.map((part, i) => {
                if (part.type === "text") {
                  return (
                    <p key={i} className="whitespace-pre-wrap leading-relaxed">
                      {part.text}
                    </p>
                  );
                }
                if (part.type.startsWith("tool-")) {
                  return (
                    <p
                      key={i}
                      className="inline-flex items-center gap-2 rounded-lg bg-black/[0.04] px-2.5 py-1 text-xs text-muted"
                    >
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
                      {toolLabel(part.type)}
                    </p>
                  );
                }
                return null;
              })}
            </div>
          </div>
        ))}

        {busy && messages[messages.length - 1]?.role === "user" && (
          <p className="text-xs text-muted">Maestro is thinking…</p>
        )}
        {error && (
          <p className="text-xs text-red-600">
            Something went wrong reaching Maestro. Please try again.
          </p>
        )}
      </div>

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
        className="flex items-center gap-2 border-t border-[--hair] p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Maestro anything about your studio…"
          className="flex-1 rounded-xl border border-[--hair] bg-transparent px-4 py-2.5 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-[--ring]"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
