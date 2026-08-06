"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";

interface Notification {
  id:      string;
  type:    string;
  title:   string;
  body:    string | null;
  link:    string | null;
  sent_at: string;
  read_at: string | null;
}

const TYPE_ICON: Record<string, string> = {
  enrollment_confirmed: "✅",
  class_reminder:       "📅",
  payment_failed:       "💳",
  invoice_overdue:      "⚠️",
  birthday_greeting:    "🎂",
  message_received:     "✉️",
  schedule_updated:     "📅",
};

export function NotificationBell({ size = "sm" }: { size?: "sm" | "lg" }) {
  const t = useTranslations("admin.notifications");
  const tShared = useTranslations("admin.shared");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount,   setUnreadCount]   = useState(0);
  const [open,          setOpen]          = useState(false);
  const router = useRouter();
  const dropdownRef = useRef<HTMLDivElement>(null);

  function timeAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60_000);
    if (m < 1)  return tShared("justNow");
    if (m < 60) return tShared("timeAgoMinutes", { count: m });
    const h = Math.floor(m / 60);
    if (h < 24) return tShared("timeAgoHours", { count: h });
    return tShared("timeAgoDays", { count: Math.floor(h / 24) });
  }

  const fetchNotifications = async () => {
    try {
      const res = await fetch("/api/notifications?limit=20");
      const data = await res.json();
      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch {
      /* silent */
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (open && dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleOpen = async () => {
    setOpen((o) => !o);
    if (!open && unreadCount > 0) {
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
      await fetch("/api/notifications", { method: "POST", body: JSON.stringify({}) });
    }
  };

  const handleClick = async (n: Notification) => {
    setOpen(false);
    if (!n.read_at) {
      await fetch("/api/notifications", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ ids: [n.id] }),
      });
    }
    if (n.link) {
      router.push(n.link);
      router.refresh();
    }
  };

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={handleOpen}
        className={
          size === "lg"
            ? "relative grid h-11 w-11 place-items-center rounded-[16px] border text-ink transition-transform duration-300 hover:-translate-y-px"
            : "relative grid h-9 w-9 place-items-center rounded-xl text-muted transition-colors hover:bg-surface hover:text-ink"
        }
        style={
          size === "lg"
            ? { background: "var(--t1)", borderColor: "var(--tb)", boxShadow: "inset 0 1px 0 var(--sheen)" }
            : undefined
        }
        aria-label={t("ariaLabel")}
      >
        <svg
          className={size === "lg" ? "h-[22px] w-[22px]" : "h-5 w-5"}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span
            className={
              size === "lg"
                ? "absolute right-2.5 top-2.5 h-2 w-2 rounded-full"
                : "absolute right-1 top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-brand px-1 text-[0.6rem] font-bold text-white"
            }
            style={size === "lg" ? { background: "var(--brand)", boxShadow: "0 0 0 3px var(--glass), 0 0 10px var(--tg)" } : undefined}
          >
            {size === "lg" ? null : unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-[--hair] bg-surface shadow-2xl"
          >
            <div className="border-b border-[--hair] px-4 py-3">
              <h3 className="text-sm font-semibold text-ink">{t("title")}</h3>
            </div>

            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted">
                  <p className="text-2xl mb-2">🔔</p>
                  <p>{t("empty")}</p>
                </div>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className={`flex w-full items-start gap-3 border-b border-[--hair] px-4 py-3 text-left transition-colors last:border-0 hover:bg-base ${
                      !n.read_at ? "bg-brand/5" : ""
                    }`}
                  >
                    <span className="text-lg">{TYPE_ICON[n.type] ?? "🔔"}</span>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm ${!n.read_at ? "font-semibold text-ink" : "font-medium text-ink/80"}`}>
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted">{n.body}</p>
                      )}
                      <p className="mt-1 text-[0.62rem] text-muted">{timeAgo(n.sent_at)}</p>
                    </div>
                    {!n.read_at && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />
                    )}
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
