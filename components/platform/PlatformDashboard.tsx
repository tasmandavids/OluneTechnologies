"use client";

// Platform overview — the operator's "Today", laid out like the studio owner
// dashboard: date eyebrow and greeting, a row of glass stat pills, a "needs
// you" queue built from live counts, recent signups, the open ops queue by
// column, and open support threads.

import { motion } from "framer-motion";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useTimeGreeting } from "@/lib/i18n/client";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";
import { onMagnetLeave, onMagnetMove } from "@/components/portal/admin/glass/useMicroInteractions";
import { IconAlertCircle, IconBuilding, IconInbox, IconKanban } from "@/components/admin/dashboard/icons";
import { InitialTile, SectionLabel, StatusPill, initialsOf, type PillTone } from "./glass/ui";

type Stat = { id: string; label: string; value: string | number; hint?: string };

type Attention = { openThreads: number; urgentTasks: number; trials: number; suspended: number };

const STUDIO_TONE: Record<string, PillTone> = { trial: "brand", active: "success", suspended: "danger" };
const PRIORITY_TONE: Record<string, PillTone> = { urgent: "danger", high: "warm", normal: "brand", low: "neutral" };
const TASK_COLUMNS = ["todo", "in_progress", "blocked"] as const;

const rise = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } };

export function PlatformDashboard({
  stats,
  recentStudios,
  openTasks,
  openThreads,
  attention,
}: {
  stats: Stat[];
  recentStudios: { id: string; name: string; slug: string; status: string; createdAt: string }[];
  openTasks: { id: string; title: string; priority: string; status: string; dueAt: string | null; studioName: string | null }[];
  openThreads: { id: string; subject: string; studioName: string; priority: string; status: string; updatedAt: string }[];
  attention: Attention;
}) {
  const t = useTranslations("platform.dashboard");
  const tStudios = useTranslations("platform.studios");
  const tTasks = useTranslations("platform.tasks");
  const tSupport = useTranslations("platform.support");
  const locale = useLocale();
  const greeting = useTimeGreeting();
  const numberFmt = new Intl.NumberFormat(locale);
  const shortDate = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short" });

  const items = [
    attention.urgentTasks > 0 && {
      key: "tasks",
      icon: IconAlertCircle,
      warn: true,
      title: t("attention.tasks", { count: attention.urgentTasks }),
      hint: t("attention.tasksHint"),
      href: "/platform/tasks",
    },
    attention.openThreads > 0 && {
      key: "support",
      icon: IconInbox,
      warn: false,
      title: t("attention.support", { count: attention.openThreads }),
      hint: t("attention.supportHint"),
      href: "/platform/messages",
    },
    attention.suspended > 0 && {
      key: "suspended",
      icon: IconBuilding,
      warn: true,
      title: t("attention.suspended", { count: attention.suspended }),
      hint: t("attention.suspendedHint"),
      href: "/platform/studios",
    },
    attention.trials > 0 && {
      key: "trials",
      icon: IconKanban,
      warn: false,
      title: t("attention.trials", { count: attention.trials }),
      hint: t("attention.trialsHint"),
      href: "/platform/studios",
    },
  ].filter(Boolean) as { key: string; icon: typeof IconInbox; warn: boolean; title: string; hint: string; href: string }[];

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
      className="py-2"
    >
      <motion.header variants={rise} className="mb-[22px] mt-3.5 flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="mb-2.5 text-[9.5px] font-semibold uppercase tracking-[0.2em] text-muted">
            {new Date().toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" })}
          </div>
          <h1 className="font-display text-[36px] font-medium leading-[1.03] tracking-tight text-ink md:text-[42px]">{greeting}.</h1>
          <p className="mt-2 max-w-[46ch] text-[14.5px] leading-[1.5] text-muted">{t("subhead", { count: items.length })}</p>
        </div>
      </motion.header>

      <motion.div variants={rise} className="mb-3.5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.id}
            onMouseMove={onMagnetMove}
            onMouseLeave={onMagnetLeave}
            className="relative overflow-hidden rounded-[18px] border p-[13px_15px] transition-transform duration-300"
            style={{
              background: "linear-gradient(148deg, var(--refract), transparent 42%), var(--glass)",
              borderColor: "var(--edge)",
              backdropFilter: "blur(var(--blur)) saturate(1.85)",
              WebkitBackdropFilter: "blur(var(--blur))",
              boxShadow: "var(--shadow-s), inset 0 1px 0 var(--sheen), inset 0 -1px 0 var(--sheen2), inset 1px 0 0 var(--sheen2)",
            }}
          >
            <div
              className="pointer-events-none absolute -right-5 -top-10 h-[120px] w-[120px] rounded-full animate-[admin-halo_7s_ease-in-out_infinite]"
              style={{ background: "radial-gradient(circle, var(--t3), transparent 70%)" }}
            />
            <div className="relative text-[9px] font-semibold uppercase tracking-[0.16em] text-muted">{s.label}</div>
            <div className="relative my-1 font-display text-[26px] font-medium leading-[1.1] tabular-nums text-ink">
              {typeof s.value === "number" ? numberFmt.format(s.value) : s.value}
            </div>
            {s.hint && <div className="relative text-xs text-muted">{s.hint}</div>}
          </div>
        ))}
      </motion.div>

      <motion.div variants={rise} className="mb-3.5 grid gap-3.5 lg:grid-cols-2">
        <GlassPanel>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-lg font-medium tracking-tight text-ink">{t("attention.title")}</h2>
          </div>
          {items.length === 0 ? (
            <p className="text-sm text-muted">{t("attention.clear")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {items.map(({ key, icon: Icon, warn, title, hint, href }) => (
                <li key={key}>
                  <Link
                    href={href}
                    prefetch={false}
                    className="flex items-center gap-3 rounded-2xl border p-3 transition hover:-translate-y-px"
                    style={{ borderColor: "var(--hair)", background: "var(--glass2)" }}
                  >
                    <span
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
                      style={{
                        background: warn ? "color-mix(in srgb, var(--error) 12%, transparent)" : "var(--t2)",
                        color: warn ? "var(--error)" : "var(--brand-deep)",
                      }}
                    >
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-ink">{title}</span>
                      <span className="block text-[12.5px] text-muted">{hint}</span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-ink">{t("attention.open")} →</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </GlassPanel>

        <GlassPanel>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="font-display text-lg font-medium tracking-tight text-ink">{t("recentSignups")}</h2>
            <Link href="/platform/studios" prefetch={false} className="text-xs font-semibold text-ink hover:text-[--brand]">
              {t("allStudios")}
            </Link>
          </div>
          {recentStudios.length === 0 && <p className="text-sm text-muted">{t("noStudios")}</p>}
          <ul>
            {recentStudios.map((s) => (
              <li key={s.id} className="flex items-center gap-3 border-b border-[--hair] py-2.5 last:border-0">
                <InitialTile text={initialsOf(s.name).slice(0, 1)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{s.name}</p>
                  <p className="truncate text-xs text-muted">
                    {s.slug} · {shortDate(s.createdAt)}
                  </p>
                </div>
                <StatusPill tone={STUDIO_TONE[s.status] ?? "neutral"}>
                  <span className="capitalize">{tStudios.has(`filters.${s.status}`) ? tStudios(`filters.${s.status}`) : s.status}</span>
                </StatusPill>
              </li>
            ))}
          </ul>
        </GlassPanel>
      </motion.div>

      <motion.div variants={rise} className="grid gap-3.5 lg:grid-cols-[1.5fr_1fr]">
        <GlassPanel>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-lg font-medium tracking-tight text-ink">{t("opsQueue")}</h2>
            <Link href="/platform/tasks" prefetch={false} className="text-xs font-semibold text-ink hover:text-[--brand]">
              {t("allTasks")}
            </Link>
          </div>
          {openTasks.length === 0 ? (
            <p className="text-sm text-muted">{t("noOpenTasks")}</p>
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-3">
              {TASK_COLUMNS.map((col) => {
                const list = openTasks.filter((task) => task.status === col);
                return (
                  <div key={col} className="flex flex-col gap-2">
                    <SectionLabel className="px-0.5">
                      {tTasks(`columns.${col}`)} · {list.length}
                    </SectionLabel>
                    {list.map((task) => (
                      <div key={task.id} className="rounded-[14px] border p-3" style={{ borderColor: "var(--hair)", background: "var(--glass2)" }}>
                        <p className="text-[13px] font-semibold leading-snug text-ink">{task.title}</p>
                        {(task.studioName || task.dueAt) && (
                          <p className="mt-1 text-[11.5px] text-muted">
                            {[task.studioName, task.dueAt ? t("dueDate", { date: shortDate(task.dueAt) }) : null].filter(Boolean).join(" · ")}
                          </p>
                        )}
                        <div className="mt-2">
                          <StatusPill tone={PRIORITY_TONE[task.priority] ?? "neutral"}>
                            {tTasks(`priorities.${task.priority}` as Parameters<typeof tTasks>[0])}
                          </StatusPill>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </GlassPanel>

        <GlassPanel>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="font-display text-lg font-medium tracking-tight text-ink">{t("openSupport")}</h2>
            <Link href="/platform/messages" prefetch={false} className="text-xs font-semibold text-ink hover:text-[--brand]">
              {t("inbox")}
            </Link>
          </div>
          {openThreads.length === 0 && <p className="text-sm text-muted">{t("inboxClear")}</p>}
          <ul>
            {openThreads.map((thread) => (
              <li key={thread.id} className="border-b border-[--hair] py-2.5 last:border-0">
                <Link href="/platform/messages" prefetch={false} className="flex items-start gap-2.5">
                  <span className="mt-1.5 h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: thread.status === "pending" ? "#f2b788" : "var(--brand)" }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-ink">{thread.subject}</span>
                    <span className="block text-xs text-muted">
                      {thread.studioName} · {shortDate(thread.updatedAt)}
                    </span>
                  </span>
                  <span className="shrink-0 text-[11px] font-semibold capitalize text-muted">
                    {tSupport(`status.${thread.status}` as Parameters<typeof tSupport>[0])}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </GlassPanel>
      </motion.div>
    </motion.div>
  );
}
