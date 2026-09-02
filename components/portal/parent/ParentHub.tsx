"use client";

import { useNumberFormat } from "@/lib/i18n/format";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import { useShortDayNames, useTimeGreeting, useFormatTimeShort } from "@/lib/i18n/client";
import type { Child, Invoice } from "@/app/portal/parent/page";
import { EnrollModal } from "./EnrollModal";
import { AddChildModal } from "./AddChildModal";
import { InviteCoParentModal } from "./InviteCoParentModal";
import { PayInvoiceModal } from "./PayInvoiceModal";
import { CommandCentre, type CommandCentreProps } from "./CommandCentre";


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
  const color = STATUS_COLORS[status] ?? "var(--muted)";

  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wider text-white"
      style={{ background: color }}
    >
      {label}
    </span>
  );
}

export default function ParentHub({
  parentName,
  familyChildren,
  invoices,
  selfManaged = false,
  childProgressPath,
  commandCentre,
}: {
  parentName: string | null;
  familyChildren: Child[];
  invoices: Invoice[];
  selfManaged?: boolean;
  /** Override child card link for every dancer (e.g. adult students use /portal/student/progress). */
  childProgressPath?: string;
  commandCentre?: CommandCentreProps;
}) {
  const NZD = useNumberFormat({ style: "currency", currency: "NZD", maximumFractionDigits: 2 });
  const t = useTranslations("parent.hub");
  const locale = useLocale();
  const dayShort = useShortDayNames();
  const greeting = useTimeGreeting();
  const fmt = useFormatTimeShort();
  const [showEnroll, setShowEnroll] = useState(false);
  const [showAddChild, setShowAddChild] = useState(false);
  const [showInviteCoParent, setShowInviteCoParent] = useState(false);
  const [payInvoice, setPayInvoice] = useState<Invoice | null>(null);

  const firstName = parentName?.split(" ")[0];
  const greetingLine = firstName
    ? t("greetingWithName", { greeting, name: firstName })
    : t("greetingOnly", { greeting });

  const outstanding = invoices
    .filter((i) => i.status === "sent" || i.status === "overdue")
    .reduce((sum, i) => sum + i.amountCents, 0);

  const tableHeaders = [t("tableDancer"), t("tableAmount"), t("tableStatus"), t("tableDue")];
  const progressHref = (studentId: string) =>
    childProgressPath ?? `/portal/parent/children/${studentId}`;

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
      className="mx-auto max-w-5xl space-y-10 p-6"
    >
      {commandCentre && <CommandCentre {...commandCentre} />}

      <motion.header
        variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div>
          <p className="text-sm text-muted">{greetingLine}</p>
          <h1 className="text-2xl font-black tracking-tight text-ink">
            {selfManaged ? t("adultTitle") : t("title")}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {outstanding > 0 && (
            <div className="box rounded-xl px-4 py-2 text-right">
              <p className="text-xs text-muted">{t("outstanding")}</p>
              <p className="text-lg font-black" style={{ color: "var(--brand-hot)" }}>
                {NZD.format(outstanding / 100)}
              </p>
            </div>
          )}
          {!selfManaged && familyChildren.length > 0 && (
            <Link
              href="/portal/parent/schedule"
              className="rounded-xl border border-[--hair] px-5 py-2.5 text-sm font-semibold text-ink hover:bg-surface"
            >
              {t("viewSchedule")}
            </Link>
          )}
          {(familyChildren.length > 0 || selfManaged) && (
            <button
              type="button"
              onClick={() => setShowEnroll(true)}
              className="rounded-xl border border-[--brand] bg-[color-mix(in_srgb,var(--brand)_10%,var(--surface))] px-5 py-2.5 text-sm font-bold text-ink shadow-sm transition hover:bg-[color-mix(in_srgb,var(--brand)_16%,var(--surface))]"
            >
              {t("enroll")}
            </button>
          )}
          {!selfManaged && (
            <button
              type="button"
              onClick={() => setShowAddChild(true)}
              className="rounded-xl border border-[--hair] px-5 py-2.5 text-sm font-semibold text-ink hover:bg-surface"
            >
              {t("addChild")}
            </button>
          )}
          {!selfManaged && familyChildren.length > 0 && (
            <button
              type="button"
              onClick={() => setShowInviteCoParent(true)}
              className="rounded-xl border border-[--hair] px-5 py-2.5 text-sm font-semibold text-ink hover:bg-surface"
            >
              {t("inviteCoParent")}
            </button>
          )}
        </div>
      </motion.header>

      <motion.section variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}>
        <h2 className="mb-3 text-xs uppercase tracking-widest text-muted">
          {t("yourDancers", { count: familyChildren.length })}
        </h2>
        {familyChildren.length === 0 ? (
          <div className="box rounded-2xl px-6 py-10 text-center">
            <p className="text-sm text-muted">{t("noChildren")}</p>
            <p className="mt-1 text-xs text-muted">{t("noChildrenHint")}</p>
            {!selfManaged && (
              <button
                type="button"
                onClick={() => setShowAddChild(true)}
                className="mt-4 rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white"
              >
                {t("addChild")}
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {familyChildren.map((child) => (
              <Link
                key={child.studentId}
                href={progressHref(child.studentId)}
                className="group block"
              >
              <motion.div
                whileHover={{ y: -2 }}
                className="box rounded-2xl p-5"
              >
                <div className="mb-4 flex items-center gap-3">
                  <span
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-black text-white"
                    style={{ background: "var(--brand)" }}
                  >
                    {child.name?.[0]?.toUpperCase() ?? "?"}
                  </span>
                  <div>
                    <p className="font-bold text-ink">{child.name ?? t("unnamedDancer")}</p>
                    <p className="text-xs text-muted">
                      {t("classesEnrolled", { count: child.classes.length })}
                    </p>
                  </div>
                </div>

                {child.classes.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {child.classes.map((c) => (
                      <span
                        key={c.id}
                        className="rounded-full border border-[--hair] px-2.5 py-1 text-[0.65rem] font-medium text-ink"
                        title={`${dayShort[c.dayOfWeek]}${c.startTime ? ` · ${fmt(c.startTime)}` : ""}`}
                      >
                        {c.name}
                        {c.level ? ` · ${c.level}` : ""}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted">{t("noEnrolments")}</p>
                )}

                <p className="mt-4 text-xs font-semibold text-[--brand] opacity-0 transition-opacity group-hover:opacity-100">
                  {t("viewProgress")} →
                </p>
              </motion.div>
              </Link>
            ))}
          </div>
        )}
      </motion.section>

      <motion.section variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-xs uppercase tracking-widest text-muted">
            {t("invoices", { count: invoices.length })}
          </h2>
          <Link
            href="/portal/parent/billing"
            className="text-xs font-semibold text-[--brand] hover:underline"
          >
            {t("viewBilling")} →
          </Link>
        </div>
        {invoices.length === 0 ? (
          <div className="box rounded-2xl px-6 py-10 text-center">
            <p className="text-sm text-muted">{t("noInvoices")}</p>
          </div>
        ) : (
          <div className="box overflow-hidden rounded-2xl">
            <table className="w-full min-w-[400px] text-sm">
              <thead>
                <tr className="border-b border-[--hair]">
                  {tableHeaders.map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-[0.62rem] font-semibold uppercase tracking-wider text-muted"
                    >
                      {h}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-left text-[0.62rem] font-semibold uppercase tracking-wider text-muted">
                    {t("tableActions")}
                  </th>
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
                    <td className="px-4 py-3 text-ink">
                      {inv.studentName ?? <span className="text-muted">—</span>}
                    </td>
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
                          {t("payNow")}
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
          {t("billingNote")}{" "}
          <Link href="/portal/parent/chat?topic=billing" className="font-semibold text-brand hover:underline">
            {t("contactBilling")}
          </Link>
          {" · "}
          <Link href="/portal/parent/chat" className="font-semibold text-brand hover:underline">
            {t("contactStudio")}
          </Link>
        </p>
      </motion.section>

      <AnimatePresence>
        {showEnroll && familyChildren.length > 0 && (
          <EnrollModal familyChildren={familyChildren} onClose={() => setShowEnroll(false)} />
        )}
        {showAddChild && (
          <AddChildModal onClose={() => setShowAddChild(false)} onAdded={() => window.location.reload()} />
        )}
        {showInviteCoParent && (
          <InviteCoParentModal onClose={() => setShowInviteCoParent(false)} />
        )}
        {payInvoice && (
          <PayInvoiceModal
            invoiceId={payInvoice.id}
            amountCents={payInvoice.amountCents}
            label={payInvoice.studentName ?? t("invoicePayment")}
            onClose={() => setPayInvoice(null)}
            onPaid={() => window.location.reload()}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
