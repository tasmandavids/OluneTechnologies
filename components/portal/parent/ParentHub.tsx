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
import { CommandCentre, countParentActions, type CommandCentreProps } from "./CommandCentre";


const STATUS_DOTS: Record<string, string> = {
  paid: "var(--success, #16a34a)",
  sent: "var(--brand)",
  overdue: "var(--error, #dc2626)",
  draft: "var(--muted)",
  void: "var(--muted)",
};

function StatusBadge({ status }: { status: string }) {
  const t = useTranslations("parent.hub.invoiceStatus");
  const label = ["paid", "sent", "overdue", "draft", "void"].includes(status)
    ? t(status as "paid" | "sent" | "overdue" | "draft" | "void")
    : status;

  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-(--hair) bg-(--t1) px-2.5 py-1 text-[11.5px] font-semibold text-ink">
      <span className="h-[7px] w-[7px] rounded-full" style={{ background: STATUS_DOTS[status] ?? "var(--muted)" }} />
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


  const tableHeaders = [t("tableDancer"), t("tableAmount"), t("tableStatus"), t("tableDue")];
  const progressHref = (studentId: string) =>
    childProgressPath ?? `/portal/parent/children/${studentId}`;

  const actionCount = commandCentre ? countParentActions(commandCentre) : 0;
  const dateLabel = new Date().toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
  const rise = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } };
  const ghostBtn =
    "inline-flex h-[38px] items-center rounded-[11px] border border-(--edge) bg-(--glass2) px-3.5 text-[13px] font-semibold text-ink transition hover:-translate-y-px";

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
      className="mx-auto max-w-[1180px] space-y-3.5 py-2"
    >
      <motion.header variants={rise} className="mb-[22px] mt-3.5 flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="mb-2.5 text-[9.5px] font-semibold uppercase tracking-[0.2em] text-muted">
            {selfManaged ? t("adultTitle") : dateLabel}
          </div>
          <h1>{greetingLine}</h1>
          {commandCentre && (
            <p className="mt-2 max-w-[46ch] text-[14.5px] leading-[1.5] text-muted">{t("week.subhead", { count: actionCount })}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {!selfManaged && (
            <button type="button" onClick={() => setShowAddChild(true)} className={ghostBtn}>
              {t("addChild")}
            </button>
          )}
          {!selfManaged && familyChildren.length > 0 && (
            <button type="button" onClick={() => setShowInviteCoParent(true)} className={ghostBtn}>
              {t("inviteCoParent")}
            </button>
          )}
          {(familyChildren.length > 0 || selfManaged) && (
            <button
              type="button"
              onClick={() => setShowEnroll(true)}
              className="inline-flex h-[38px] items-center rounded-[11px] bg-brand px-4 text-[13px] font-semibold text-white"
            >
              {t("enroll")}
            </button>
          )}
        </div>
      </motion.header>

      {commandCentre && <CommandCentre {...commandCentre} />}

      <motion.section variants={rise} className="pt-4">
        <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
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
          <div className="grid gap-3.5 sm:grid-cols-2">
            {familyChildren.map((child) => (
              <Link key={child.studentId} href={progressHref(child.studentId)} className="group block">
                <motion.div whileHover={{ y: -2 }} className="box h-full rounded-2xl p-5">
                  <div className="flex items-center gap-3">
                    <span
                      className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-[15px] font-display text-lg font-semibold text-white"
                      style={{ background: "linear-gradient(150deg, var(--tg, var(--brand-hot)), var(--brand) 55%, var(--brand-deep))" }}
                    >
                      {child.name?.[0]?.toUpperCase() ?? "?"}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-display text-xl font-medium tracking-tight text-ink">{child.name ?? t("unnamedDancer")}</p>
                      <p className="text-[13px] text-muted">{t("classesEnrolled", { count: child.classes.length })}</p>
                    </div>
                  </div>

                  {child.classes.length > 0 ? (
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {child.classes.map((c) => (
                        <span
                          key={c.id}
                          className="rounded-full border border-(--hair) bg-(--glass2) px-2.5 py-1 text-xs font-medium text-ink"
                          title={`${dayShort[c.dayOfWeek]}${c.startTime ? ` · ${fmt(c.startTime)}` : ""}`}
                        >
                          {c.name}
                          {c.level ? ` · ${c.level}` : ""}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-4 text-xs text-muted">{t("noEnrolments")}</p>
                  )}

                  <p className="mt-4 border-t border-(--hair) pt-3.5 text-right text-[12.5px] font-semibold text-ink">
                    {t("viewProgress")} →
                  </p>
                </motion.div>
              </Link>
            ))}
          </div>
        )}
      </motion.section>

      <motion.section variants={rise} className="pt-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
            {t("invoices", { count: invoices.length })}
          </h2>
          <Link href="/portal/parent/billing" className="text-xs font-semibold text-ink hover:text-(--brand)">
            {t("viewBilling")} →
          </Link>
        </div>
        {invoices.length === 0 ? (
          <div className="box rounded-2xl px-6 py-10 text-center">
            <p className="text-sm text-muted">{t("noInvoices")}</p>
          </div>
        ) : (
          <div className="box overflow-x-auto rounded-2xl">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-(--hair)">
                  {tableHeaders.map((h, i) => (
                    <th
                      key={h}
                      className={`px-4 pb-3 pt-4 text-left text-[9.5px] font-semibold uppercase tracking-[0.16em] text-muted ${i === 0 ? "pl-5" : ""}`}
                    >
                      {h}
                    </th>
                  ))}
                  <th className="px-4 pb-3 pt-4 pr-5 text-right text-[9.5px] font-semibold uppercase tracking-[0.16em] text-muted">
                    {t("tableActions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-(--hair) transition-colors last:border-0 hover:bg-(--t1)">
                    <td className="py-3 pl-5 pr-4 text-ink">{inv.studentName ?? <span className="text-muted">—</span>}</td>
                    <td className="px-4 py-3 font-semibold tabular-nums text-ink">{NZD.format(inv.amountCents / 100)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={inv.status} />
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {inv.dueDate
                        ? new Date(inv.dueDate).toLocaleDateString(locale, { day: "numeric", month: "short" })
                        : "—"}
                    </td>
                    <td className="py-3 pl-4 pr-5 text-right">
                      {(inv.status === "sent" || inv.status === "overdue") && (
                        <button
                          type="button"
                          onClick={() => setPayInvoice(inv)}
                          className="inline-flex h-8 items-center rounded-[10px] bg-brand px-3.5 text-[12.5px] font-semibold text-white"
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
        <p className="mt-2.5 text-xs text-muted">
          {t("billingNote")}{" "}
          <Link href="/portal/parent/chat?topic=billing" className="font-semibold text-ink underline-offset-2 hover:underline">
            {t("contactBilling")}
          </Link>
          {" · "}
          <Link href="/portal/parent/chat" className="font-semibold text-ink underline-offset-2 hover:underline">
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
