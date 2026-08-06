"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import { useFullDayNames, useTimeGreeting, useFormatTimeShort } from "@/lib/i18n/client";
import { EnrollModal } from "@/components/portal/parent/EnrollModal";
import { PayInvoiceModal } from "@/components/portal/parent/PayInvoiceModal";
import BuyClassPass, { type StudentPass } from "@/components/portal/student/BuyClassPass";
import type { EnrolledClass } from "@/app/portal/student/page";
import type { Child, Invoice } from "@/app/portal/parent/page";

const SHOW_DAYS = [1, 2, 3, 4, 5, 6];

const DISC_COLORS: Record<string, string> = {
  Ballet: "#C8102E",
  Jazz: "#5B5BFF",
  "Hip-Hop": "#E84A8A",
  Contemporary: "#13B6A4",
  Tap: "#C9A227",
  Lyrical: "#8B5CF6",
  Acro: "#F97316",
  Pointe: "#EC4899",
};

function discColor(discipline: string | null) {
  return discipline && DISC_COLORS[discipline] ? DISC_COLORS[discipline] : "var(--brand)";
}

const NZD = new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD", maximumFractionDigits: 2 });

const STATUS_COLORS: Record<string, string> = {
  paid: "color-mix(in srgb, #22c55e 70%, transparent)",
  sent: "color-mix(in srgb, var(--brand-hot) 70%, transparent)",
  overdue: "color-mix(in srgb, #ef4444 70%, transparent)",
  draft: "color-mix(in srgb, var(--muted) 70%, transparent)",
  void: "color-mix(in srgb, var(--muted) 40%, transparent)",
};

function StatusBadge({ status }: { status: string }) {
  const t = useTranslations("parent.hub.invoiceStatus");
  const label = ["paid", "sent", "overdue", "draft", "void"].includes(status)
    ? t(status as "paid" | "sent" | "overdue" | "draft" | "void")
    : status;
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wider text-white"
      style={{ background: STATUS_COLORS[status] ?? "var(--muted)" }}
    >
      {label}
    </span>
  );
}

export default function AdultStudentHub({
  studentName,
  selfChild,
  classes,
  invoices,
  todayDow,
  passes,
  passPriceCents,
}: {
  studentName: string | null;
  selfChild: Child;
  classes: EnrolledClass[];
  invoices: Invoice[];
  todayDow: number;
  passes: StudentPass[];
  passPriceCents: number;
}) {
  const t = useTranslations("student.timetable");
  const tHub = useTranslations("parent.hub");
  const locale = useLocale();
  const dayNames = useFullDayNames();
  const greeting = useTimeGreeting();
  const fmt = useFormatTimeShort();

  const [showEnroll, setShowEnroll] = useState(false);
  const [payInvoice, setPayInvoice] = useState<Invoice | null>(null);

  const firstName = studentName?.split(" ")[0];
  const greetingLine = firstName
    ? t("greetingWithName", { greeting, name: firstName })
    : t("greetingOnly", { greeting });

  const todayClasses = classes.filter((c) => c.dayOfWeek === todayDow);
  const outstanding = invoices
    .filter((i) => i.status === "sent" || i.status === "overdue")
    .reduce((sum, i) => sum + i.amountCents, 0);

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
      className="mx-auto max-w-5xl space-y-10 p-6"
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <motion.header
        variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
        className="flex flex-wrap items-end justify-between gap-4"
      >
        <div>
          <p className="text-sm text-muted">{greetingLine}</p>
          <h1 className="text-2xl font-black tracking-tight text-ink">My Classes</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {outstanding > 0 && (
            <Link
              href="/portal/parent/billing"
              className="box rounded-xl px-4 py-2 text-right"
            >
              <p className="text-xs text-muted">{tHub("outstanding")}</p>
              <p className="text-base font-black tabular-nums" style={{ color: "var(--brand-hot)" }}>
                {NZD.format(outstanding / 100)}
              </p>
            </Link>
          )}
          <Link
            href="/portal/student/progress"
            className="rounded-xl border border-[--hair] px-4 py-2.5 text-sm font-semibold text-ink hover:bg-surface"
          >
            Progress & certificates
          </Link>
          <button
            type="button"
            onClick={() => setShowEnroll(true)}
            className="rounded-xl border border-[--brand] bg-[color-mix(in_srgb,var(--brand)_10%,var(--surface))] px-5 py-2.5 text-sm font-bold text-ink shadow-sm transition hover:bg-[color-mix(in_srgb,var(--brand)_16%,var(--surface))]"
          >
            + Enrol in a class
          </button>
        </div>
      </motion.header>

      {/* ── My Passes ──────────────────────────────────────────── */}
      <motion.section variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}>
        <BuyClassPass priceCents={passPriceCents} existingPasses={passes} />
      </motion.section>

      {/* ── Today ──────────────────────────────────────────────── */}
      <motion.section variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}>
        <h2 className="mb-3 text-xs uppercase tracking-widest text-muted">
          {t("today", { day: dayNames[todayDow] })}
        </h2>
        {todayClasses.length === 0 ? (
          <div className="box rounded-2xl px-6 py-8 text-center">
            <p className="text-sm text-muted">{t("noClassesToday")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {todayClasses.map((c) => (
              <div
                key={c.enrollmentId}
                className="box relative overflow-hidden rounded-2xl p-5"
                style={{ boxShadow: `inset 3px 0 0 ${discColor(c.discipline)}, var(--box-shadow)` }}
              >
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background: `radial-gradient(80% 80% at 0% 50%, ${discColor(c.discipline)}18, transparent 70%)`,
                  }}
                />
                <div className="relative flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-black text-ink">{c.name}</p>
                    <p className="mt-0.5 text-sm text-muted">
                      {c.discipline && <span>{c.discipline} · </span>}
                      {c.level && <span>{c.level} · </span>}
                      {c.teacherName && <span>{c.teacherName}</span>}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black tabular-nums text-ink">{fmt(c.startTime)}</p>
                    {c.endTime && (
                      <p className="text-xs text-muted">{t("until", { time: fmt(c.endTime) })}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.section>

      {/* ── Weekly schedule grid ────────────────────────────────── */}
      <motion.section variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}>
        <h2 className="mb-3 text-xs uppercase tracking-widest text-muted">{t("weeklySchedule")}</h2>
        <div className="box overflow-x-auto rounded-2xl p-4">
          <div
            className="grid min-w-[480px] gap-2"
            style={{ gridTemplateColumns: `repeat(${SHOW_DAYS.length}, minmax(0,1fr))` }}
          >
            {SHOW_DAYS.map((d) => (
              <div
                key={d}
                className={`pb-2 text-center text-[0.65rem] font-semibold uppercase tracking-wider ${
                  d === todayDow ? "text-brand" : "text-muted"
                }`}
              >
                {dayNames[d].slice(0, 3)}
              </div>
            ))}
            {SHOW_DAYS.map((d) => {
              const dayClasses = classes.filter((c) => c.dayOfWeek === d);
              return (
                <div key={d} className="flex min-h-[60px] flex-col gap-1.5">
                  {dayClasses.map((c) => (
                    <div
                      key={c.enrollmentId}
                      className="rounded-lg px-2 py-1.5 text-center"
                      style={{
                        background: `${discColor(c.discipline)}22`,
                        borderLeft: `2px solid ${discColor(c.discipline)}`,
                      }}
                    >
                      <p className="text-[0.65rem] font-bold leading-tight text-ink">{c.name}</p>
                      {c.startTime && (
                        <p className="text-[0.58rem] text-muted">{fmt(c.startTime)}</p>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </motion.section>

      {/* ── My enrolled classes ─────────────────────────────────── */}
      <motion.section variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}>
        <h2 className="mb-3 text-xs uppercase tracking-widest text-muted">
          {t("myClasses", { count: classes.length })}
        </h2>
        {classes.length === 0 ? (
          <div className="box rounded-2xl px-6 py-10 text-center">
            <p className="text-sm text-muted">{t("noEnrolments")}</p>
            <button
              type="button"
              onClick={() => setShowEnroll(true)}
              className="mt-4 rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white"
            >
              + Enrol in a class
            </button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {classes.map((c) => (
              <motion.div
                key={c.enrollmentId}
                whileHover={{ y: -2 }}
                className="box rounded-2xl p-4"
              >
                <div className="flex items-start gap-3">
                  <span
                    className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: discColor(c.discipline) }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-ink">{c.name}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {c.discipline && <>{c.discipline} · </>}
                      {c.level}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                      <span>{dayNames[c.dayOfWeek]}</span>
                      {c.startTime && (
                        <span>
                          {fmt(c.startTime)}
                          {c.endTime ? ` – ${fmt(c.endTime)}` : ""}
                        </span>
                      )}
                      {c.teacherName && <span>{t("withTeacher", { name: c.teacherName })}</span>}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.section>

      {/* ── Invoices ────────────────────────────────────────────── */}
      <motion.section variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-xs uppercase tracking-widest text-muted">
            {tHub("invoices", { count: invoices.length })}
          </h2>
          <Link
            href="/portal/parent/billing"
            className="text-xs font-semibold text-[--brand] hover:underline"
          >
            {tHub("viewBilling")} →
          </Link>
        </div>
        {invoices.length === 0 ? (
          <div className="box rounded-2xl px-6 py-10 text-center">
            <p className="text-sm text-muted">{tHub("noInvoices")}</p>
          </div>
        ) : (
          <div className="box overflow-hidden rounded-2xl">
            <table className="w-full min-w-[400px] text-sm">
              <thead>
                <tr className="border-b border-[--hair]">
                  {[tHub("tableAmount"), tHub("tableStatus"), tHub("tableDue"), tHub("tableActions")].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-[0.62rem] font-semibold uppercase tracking-wider text-muted"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className={`border-b border-[--hair] last:border-0 ${
                      inv.status === "overdue" ? "bg-[color-mix(in_srgb,#ef4444_4%,transparent)]" : ""
                    }`}
                  >
                    <td className="px-4 py-3 font-semibold tabular-nums text-ink">
                      {NZD.format(inv.amountCents / 100)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={inv.status} />
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {inv.dueDate
                        ? new Date(inv.dueDate).toLocaleDateString(locale, { day: "numeric", month: "short" })
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {(inv.status === "sent" || inv.status === "overdue") && (
                        <button
                          type="button"
                          onClick={() => setPayInvoice(inv)}
                          className="rounded-lg border border-[--brand] px-3 py-1.5 text-xs font-bold text-[--brand] transition hover:bg-[color-mix(in_srgb,var(--brand)_10%,transparent)]"
                        >
                          {tHub("payNow")}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-muted">
          {tHub("billingNote")}{" "}
          <Link href="/portal/student/messages?topic=billing" className="font-semibold text-brand hover:underline">
            {tHub("contactBilling")}
          </Link>
        </p>
      </motion.section>

      {showEnroll && (
        <EnrollModal familyChildren={[selfChild]} onClose={() => setShowEnroll(false)} />
      )}
      {payInvoice && (
        <PayInvoiceModal
          invoiceId={payInvoice.id}
          amountCents={payInvoice.amountCents}
          label={tHub("invoicePayment")}
          onClose={() => setPayInvoice(null)}
          onPaid={() => window.location.reload()}
        />
      )}
    </motion.div>
  );
}
