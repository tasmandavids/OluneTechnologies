"use client";

// ============================================================================
//  StudentDetailHub — tabbed shell for /portal/admin/students/[id].
//  Progress · Schedule · Badges · Information. The header (avatar, name,
//  contact line) stays above the tabs; everything that used to be stacked
//  down the page now lives in its own tab. "Information" is the catch-all
//  admin panel: contact details, guardians, medical/consent form answers,
//  check-in card status, and the danger zone at the very bottom.
// ============================================================================

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import ProgressTracker, { type ProgressEntry } from "./ProgressTracker";
import StudentSchedulePanel from "./StudentSchedulePanel";
import DeleteStudentButton from "./DeleteStudentButton";
import BadgeAwarder from "@/components/portal/shared/BadgeAwarder";
import {
  IssueCardButton,
  type CurrentCard,
} from "@/components/portal/admin/checkin/IssueCardButton";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";
import type { BadgeDefinition } from "@/lib/portal/badges-data";
import type { ScheduleEntry } from "@/lib/students/schedule-types";
import { useFormatDateMedium } from "@/lib/i18n/client";

export type StudentGuardian = {
  id: string;
  name: string | null;
  isPrimary: boolean;
};

export type StudentFormField = {
  key: string;
  label: string;
  type?: string;
};

/** One completed (or started) form for this student, flattened for display. */
export type StudentFormAnswer = {
  id: string;
  title: string;
  formType: string;
  fields: StudentFormField[];
  data: Record<string, unknown>;
  signedAt: string | null;
};

export type StudentSummary = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  classes: { id: string; name: string }[];
  guardians: StudentGuardian[];
};

type Tab = "progress" | "schedule" | "badges" | "information";

const FORM_TYPE_ICONS: Record<string, string> = {
  medical: "🏥",
  emergency_contact: "🚨",
  photo_consent: "📸",
  video_consent: "🎬",
  waiver: "✍️",
  pickup_permission: "🚗",
  general: "📋",
};

function initials(name: string | null) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function StudentDetailHub({
  student,
  entries,
  scheduleEntries,
  weekStart,
  studentCatalogue,
  studentEarnedIds,
  familyRecipient,
  familyCatalogue,
  familyEarnedIds,
  currentCard,
  appleWalletEnabled,
  forms,
}: {
  student: StudentSummary;
  entries: ProgressEntry[];
  scheduleEntries: ScheduleEntry[];
  weekStart: string;
  studentCatalogue: BadgeDefinition[];
  studentEarnedIds: string[];
  familyRecipient: { id: string; name: string | null } | null;
  familyCatalogue: BadgeDefinition[];
  familyEarnedIds: string[];
  currentCard: CurrentCard;
  appleWalletEnabled: boolean;
  forms: StudentFormAnswer[];
}) {
  const t = useTranslations("admin.students.detail");
  const tShared = useTranslations("admin.shared");
  const tCommon = useTranslations("common");
  const formatWhen = useFormatDateMedium();
  const [tab, setTab] = useState<Tab>("progress");

  const tabs: { id: Tab; label: string }[] = [
    { id: "progress", label: t("tabs.progress") },
    { id: "schedule", label: t("tabs.schedule") },
    { id: "badges", label: t("tabs.badges") },
    { id: "information", label: t("tabs.information") },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-5xl space-y-6 p-6"
    >
      <div>
        <Link href="/portal/admin/people?tab=students" className="text-xs text-muted hover:text-ink">
          {t("back")}
        </Link>
        <div className="mt-3 flex items-center gap-4">
          <span
            className="grid h-14 w-14 shrink-0 place-items-center rounded-full text-xl font-black text-white"
            style={{ background: "var(--brand)" }}
          >
            {initials(student.name)}
          </span>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-ink">
              {student.name ?? tShared("unknownStudent")}
            </h1>
            <p className="text-sm text-muted">
              {student.email ?? student.phone ?? t("noContactOnFile")}
            </p>
            {student.classes.length > 0 && (
              <p className="mt-1 text-xs text-muted">
                {student.classes.map((c) => c.name).join(" · ")}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-[--hair] pb-1">
        {tabs.map((tabItem) => (
          <button
            key={tabItem.id}
            type="button"
            onClick={() => setTab(tabItem.id)}
            className={`rounded-t-lg px-4 py-2 text-sm font-semibold transition-colors ${
              tab === tabItem.id
                ? "border-b-2 border-brand text-brand"
                : "text-muted hover:text-ink"
            }`}
          >
            {tabItem.label}
          </button>
        ))}
      </div>

      {tab === "progress" && <ProgressTracker studentId={student.id} entries={entries} />}

      {tab === "schedule" && (
        <StudentSchedulePanel
          studentId={student.id}
          entries={scheduleEntries}
          weekStart={weekStart}
        />
      )}

      {tab === "badges" && (
        <div className="space-y-6">
          {studentCatalogue.length === 0 && familyCatalogue.length === 0 && (
            <p className="text-sm italic text-muted">{t("badges.empty")}</p>
          )}
          {studentCatalogue.length > 0 && (
            <BadgeAwarder
              recipientId={student.id}
              catalogue={studentCatalogue}
              earnedIds={studentEarnedIds}
            />
          )}
          {familyRecipient && familyCatalogue.length > 0 && (
            <BadgeAwarder
              recipientId={familyRecipient.id}
              catalogue={familyCatalogue}
              earnedIds={familyEarnedIds}
            />
          )}
        </div>
      )}

      {tab === "information" && (
        <div className="space-y-6">
          <GlassPanel className="space-y-3 !p-5">
            <h2 className="font-bold text-ink">{t("information.contactDetails")}</h2>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Detail label={tCommon("email")} value={student.email} />
              <Detail label={tCommon("phone")} value={student.phone} />
              <Detail
                label={t("information.classes")}
                value={
                  student.classes.length > 0
                    ? student.classes.map((c) => c.name).join(", ")
                    : null
                }
              />
            </dl>
          </GlassPanel>

          <GlassPanel className="space-y-3 !p-5">
            <h2 className="font-bold text-ink">{t("information.guardians")}</h2>
            {student.guardians.length === 0 ? (
              <p className="text-sm italic text-muted">{t("information.noGuardians")}</p>
            ) : (
              <ul className="space-y-2">
                {student.guardians.map((g) => (
                  <li
                    key={g.id}
                    className="box flex items-center justify-between gap-3 rounded-xl px-4 py-3"
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                      {g.name ?? tShared("unknown")}
                      {g.isPrimary && (
                        <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider text-brand">
                          {t("information.primaryContact")}
                        </span>
                      )}
                    </span>
                    <Link
                      href={`/portal/admin/parents/${g.id}`}
                      className="text-xs font-semibold text-brand"
                    >
                      {t("information.viewProfile")}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </GlassPanel>

          <GlassPanel className="space-y-3 !p-5">
            <h2 className="font-bold text-ink">{t("information.medical")}</h2>
            {forms.length === 0 ? (
              <p className="text-sm italic text-muted">{t("information.noForms")}</p>
            ) : (
              <ul className="space-y-3">
                {forms.map((form) => (
                  <li key={form.id} className="box rounded-xl px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-ink">
                        <span className="mr-2">
                          {FORM_TYPE_ICONS[form.formType] ?? FORM_TYPE_ICONS.general}
                        </span>
                        {form.title}
                      </p>
                      <span className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
                        {form.signedAt
                          ? t("information.signedOn", { date: formatWhen(form.signedAt) })
                          : t("information.notSigned")}
                      </span>
                    </div>
                    <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                      {form.fields.map((field) => (
                        <Detail
                          key={field.key}
                          label={field.label}
                          value={formatAnswer(form.data[field.key], tCommon)}
                        />
                      ))}
                    </dl>
                  </li>
                ))}
              </ul>
            )}
          </GlassPanel>

          <GlassPanel className="space-y-3 !p-5">
            <h2 className="font-bold text-ink">{t("information.card")}</h2>
            <IssueCardButton
              studentId={student.id}
              currentCard={currentCard}
              appleWalletEnabled={appleWalletEnabled}
            />
          </GlassPanel>

          <DeleteStudentButton studentId={student.id} studentName={student.name} />
        </div>
      )}
    </motion.div>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  const tShared = useTranslations("admin.shared");
  return (
    <div>
      <dt className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
        {label}
      </dt>
      <dd className="text-sm text-ink">{value?.trim() ? value : tShared("dash")}</dd>
    </div>
  );
}

/** Form answers arrive as free-form JSON — coerce the shapes the parent-facing
 *  FormsVault can produce (string, boolean checkbox, multi-select array). */
function formatAnswer(value: unknown, tCommon: (key: "yes" | "no") => string): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value ? tCommon("yes") : tCommon("no");
  if (Array.isArray(value)) return value.map(String).join(", ");
  return String(value);
}
