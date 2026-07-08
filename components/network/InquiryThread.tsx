"use client";

import { confirmDialog } from "@/lib/feedback";
import { useState, useTransition } from "react";
import { sendMessage as adminSend, withdrawInquiry } from "@/app/portal/admin/network/inquiries/[id]/actions";
import { sendMessage as teacherSend, respondToInquiry } from "@/app/portal/teacher/network/[id]/actions";

export type ThreadMessage = {
  id:         string;
  body:       string;
  createdAt:  string;
  senderId:   string;
  senderName: string;
};

export function InquiryThread({
  inquiryId,
  messages,
  currentUserId,
  status,
  isInstructor = false,
}: {
  inquiryId:     string;
  messages:      ThreadMessage[];
  currentUserId: string;
  status:        string;
  isInstructor?: boolean;
}) {
  const [body, setBody] = useState("");
  const [error, setError]   = useState<string | null>(null);
  const [pending, start]    = useTransition();

  const isClosed = ["declined", "withdrawn"].includes(status);

  function handleSend() {
    if (!body.trim()) return;
    setError(null);
    start(async () => {
      const fn = isInstructor ? teacherSend : adminSend;
      const res = await fn(inquiryId, body.trim());
      if (res && "error" in res) { setError(res.error ?? null); return; }
      setBody("");
    });
  }

  function handleAccept() {
    start(async () => {
      const res = await respondToInquiry(inquiryId, "accepted");
      if (res && "error" in res) setError(res.error ?? null);
    });
  }

  function handleDecline() {
    start(async () => {
      const res = await respondToInquiry(inquiryId, "declined");
      if (res && "error" in res) setError(res.error ?? null);
    });
  }

  async function handleWithdraw() {
    if (!(await confirmDialog({ title: "Withdraw this inquiry?", destructive: true }))) return;
    start(async () => {
      const res = await withdrawInquiry(inquiryId);
      if (res && "error" in res) setError(res.error ?? null);
    });
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100">
        <p className="text-sm font-medium text-gray-700">Conversation</p>
      </div>

      {/* Messages */}
      <div className="p-4 space-y-3 min-h-[80px]">
        {messages.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-4">No messages yet.</p>
        )}
        {messages.map((m) => {
          const isMe = m.senderId === currentUserId;
          return (
            <div key={m.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
              <div
                className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm ${
                  isMe
                    ? "bg-indigo-600 text-white rounded-br-sm"
                    : "bg-gray-100 text-gray-800 rounded-bl-sm"
                }`}
              >
                <p className="whitespace-pre-line">{m.body}</p>
              </div>
              <p className="text-xs text-gray-400 mt-1 px-1">
                {isMe ? "You" : m.senderName} ·{" "}
                {new Date(m.createdAt).toLocaleString("en-NZ", {
                  day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                })}
              </p>
            </div>
          );
        })}
      </div>

      {/* Accept / Decline for instructor */}
      {isInstructor && !isClosed && status !== "accepted" && (
        <div className="px-4 pb-3 flex gap-2 border-t border-gray-100 pt-3">
          <button
            disabled={pending}
            onClick={handleAccept}
            className="flex-1 bg-green-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-green-700 disabled:opacity-50"
          >
            Accept
          </button>
          <button
            disabled={pending}
            onClick={handleDecline}
            className="flex-1 border border-red-300 text-red-600 rounded-lg py-2 text-sm font-medium hover:bg-red-50 disabled:opacity-50"
          >
            Decline
          </button>
        </div>
      )}

      {/* Accepted banner */}
      {status === "accepted" && (
        <div className="px-5 py-3 bg-green-50 border-t border-green-200">
          <p className="text-sm text-green-800 font-medium">✓ Inquiry accepted</p>
        </div>
      )}

      {/* Input area */}
      {!isClosed && (
        <div className="border-t border-gray-100 p-4 space-y-2">
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={2}
              placeholder="Write a message… (Enter to send)"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              disabled={pending || !body.trim()}
              onClick={handleSend}
              className="self-end px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              Send
            </button>
          </div>
          {/* Withdraw for studio side */}
          {!isInstructor && status !== "withdrawn" && (
            <button
              onClick={handleWithdraw}
              disabled={pending}
              className="text-xs text-gray-400 hover:text-red-500"
            >
              Withdraw inquiry
            </button>
          )}
        </div>
      )}

      {isClosed && (
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
          <p className="text-xs text-gray-400 capitalize">{status} — this inquiry is closed.</p>
        </div>
      )}
    </div>
  );
}
