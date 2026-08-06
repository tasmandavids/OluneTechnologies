"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { motion } from "framer-motion";

export type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  actionUrl: string | null;
  readAt: string | null;
  createdAt: string;
};

const TYPE_ICONS: Record<string, string> = {
  invoice_due: "💳",
  invoice_overdue: "🚨",
  payment_received: "✅",
  class_change: "📢",
  class_cancelled: "❌",
  class_reminder: "🕐",
  costume_action: "👗",
  costume_fitted: "✨",
  teacher_note: "📝",
  certificate_awarded: "🏆",
  event_ticket: "🎟️",
  event_reminder: "🎭",
  makeup_approved: "🔄",
  makeup_reminder: "📅",
  form_required: "📋",
  form_received: "✅",
  general: "📬",
};

const TYPE_COLORS: Record<string, string> = {
  invoice_due: "var(--brand-hot)",
  invoice_overdue: "#ef4444",
  payment_received: "#22c55e",
  class_change: "#f59e0b",
  class_cancelled: "#ef4444",
  class_reminder: "var(--brand)",
  costume_action: "var(--brand-hot)",
  costume_fitted: "#22c55e",
  teacher_note: "var(--brand)",
  certificate_awarded: "#f59e0b",
  event_ticket: "#a855f7",
  event_reminder: "#a855f7",
  makeup_approved: "#22c55e",
  makeup_reminder: "var(--brand)",
  form_required: "var(--brand-hot)",
  form_received: "#22c55e",
  general: "var(--muted)",
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-NZ", { day: "numeric", month: "short" });
}

export function NotificationsTimeline({
  notifications,
  onMarkRead,
  onMarkAllRead,
}: {
  notifications: Notification[];
  onMarkRead: (id: string) => Promise<void>;
  onMarkAllRead: () => Promise<void>;
}) {
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [isPending, startTransition] = useTransition();

  const unreadCount = notifications.filter((n) => !n.readAt).length;
  const visible = filter === "unread" ? notifications.filter((n) => !n.readAt) : notifications;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-ink">Notifications</h1>
          <p className="text-sm text-muted">
            {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={() => startTransition(() => onMarkAllRead())}
            disabled={isPending}
            className="text-xs font-semibold text-[--brand] hover:underline disabled:opacity-50"
          >
            Mark all read
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 rounded-xl border border-[--hair] bg-surface p-1 w-fit">
        {(["all", "unread"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition ${
              filter === f ? "bg-ink text-white" : "text-muted hover:text-ink"
            }`}
          >
            {f === "all" ? "All" : `Unread${unreadCount > 0 ? ` (${unreadCount})` : ""}`}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="box rounded-2xl px-6 py-12 text-center text-sm text-muted">
          {filter === "unread" ? "No unread notifications." : "No notifications yet."}
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((n) => (
            <motion.div
              key={n.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`group relative rounded-2xl transition ${n.readAt ? "box" : "box-tint"}`}
            >
              {n.actionUrl ? (
                <Link href={n.actionUrl} className="block p-4" onClick={() => !n.readAt && startTransition(() => onMarkRead(n.id))}>
                  <NotificationContent n={n} />
                </Link>
              ) : (
                <div className="p-4">
                  <NotificationContent n={n} />
                </div>
              )}
              {!n.readAt && (
                <button
                  type="button"
                  onClick={() => startTransition(() => onMarkRead(n.id))}
                  className="absolute right-3 top-3 rounded-full p-1 text-muted opacity-0 transition-opacity hover:text-ink group-hover:opacity-100"
                  title="Mark as read"
                >
                  ✕
                </button>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

function NotificationContent({ n }: { n: Notification }) {
  return (
    <div className="flex items-start gap-3">
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-base"
        style={{ background: `color-mix(in srgb, ${TYPE_COLORS[n.type] ?? "var(--muted)"} 15%, transparent)` }}
      >
        {TYPE_ICONS[n.type] ?? "📬"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className={`text-sm font-semibold ${n.readAt ? "text-ink" : "text-ink"}`}>{n.title}</p>
          <span className="shrink-0 text-[0.65rem] text-muted">{timeAgo(n.createdAt)}</span>
        </div>
        {n.body && <p className="mt-0.5 text-xs text-muted">{n.body}</p>}
      </div>
    </div>
  );
}
