"use client";

// ============================================================================
//  EnrollModal — 4-step enrollment flow for parents.
//
//  Step 1: Select child + class (browse by day / discipline, capacity check)
//  Step 2: Sign studio waivers (required waivers only)
//  Step 3: Review — confirm enrollment; optional pay now or pay later
//  Step 4: Confirmation
//
//  State machine: uses a simple step index + accumulated data object.
//  All server calls use the actions in /app/portal/parent/enroll/actions.ts.
// ============================================================================

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { useShortDayNames, useFormatTimeShort } from "@/lib/i18n/client";
import type { Child } from "@/app/portal/parent/page";
import {
  getAvailableClasses,
  getActiveWaivers,
  signWaiver,
  enrollChildInClass,
  createEnrollmentIntent,
  createEnrollmentPayLaterInvoice,
  getEnrollmentBillingQuote,
  type AvailableClass,
  type Waiver,
} from "@/app/portal/parent/enroll/actions";
import {
  startTermPlanAfterEnrollment,
  getAccountBillingSummary,
  type AccountBillingSummary,
} from "@/app/portal/parent/billing/actions";
import { splitTermInstallments, TERM_INSTALLMENT_COUNT } from "@/lib/term-payments";
import CheckoutForm from "@/components/payments/CheckoutForm";

// ─── Helpers ────────────────────────────────────────────────────────────────

const NZD = new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD" });

// ─── Types ───────────────────────────────────────────────────────────────────

type SelectedClass = {
  classId: string;
  className: string;
  priceCents: number;
  billableCents: number;
  includedInProgramme: boolean;
  recurringGroupId: string | null;
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function StepIndicator({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className="h-1.5 rounded-full transition-all duration-300"
          style={{
            width: i === step ? 24 : 8,
            background: i <= step ? "var(--brand)" : "var(--hair)",
          }}
        />
      ))}
    </div>
  );
}

function ClassCard({
  cls,
  selected,
  includedInBatch,
  onToggle,
}: {
  cls: AvailableClass;
  selected: boolean;
  includedInBatch: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("parent.enroll");
  const dayShort = useShortDayNames();
  const fmtTime = useFormatTimeShort();
  const spotsLeft = cls.capacity - cls.enrolled;
  const isFull = spotsLeft <= 0;

  return (
    <button
      type="button"
      onClick={isFull ? undefined : onToggle}
      disabled={isFull}
      className={`w-full rounded-xl border p-4 text-left transition-all ${
        selected
          ? "border-[--brand] bg-[color-mix(in_srgb,var(--brand)_8%,transparent)]"
          : isFull
          ? "border-[--hair] bg-surface opacity-60 cursor-not-allowed"
          : "border-[--hair] bg-surface hover:border-[--brand]"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
            selected
              ? "border-[--brand] bg-[--brand] text-white"
              : "border-[--hair] bg-base"
          }`}
        >
          {selected && (
            <svg viewBox="0 0 10 8" fill="none" className="h-2.5 w-2.5">
              <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
        <div className="flex flex-1 items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-ink">{cls.name}</p>
            <p className="mt-0.5 text-xs text-muted">
              {cls.discipline}
              {cls.level ? ` · ${cls.level}` : ""}
            </p>
            <p className="mt-1 text-xs text-muted">
              {cls.dayOfWeek !== null ? dayShort[cls.dayOfWeek] : ""}
              {cls.startTime ? ` · ${fmtTime(cls.startTime)}` : ""}
            </p>
          </div>
          <div className="text-right shrink-0">
            {includedInBatch ? (
              <p className="text-sm font-bold" style={{ color: "var(--brand)" }}>
                {t("programIncluded")}
              </p>
            ) : (
              <p className="text-sm font-bold text-ink">
                {cls.priceCents > 0 ? NZD.format(cls.priceCents / 100) : t("free")}
              </p>
            )}
            <p
              className="mt-1 text-[0.62rem] font-semibold uppercase tracking-wide"
              style={{ color: isFull ? "#ef4444" : spotsLeft <= 3 ? "var(--brand-hot)" : "var(--muted)" }}
            >
              {isFull ? t("fullWaitlist") : t("spotsLeft", { count: spotsLeft })}
            </p>
          </div>
        </div>
      </div>
    </button>
  );
}

function SuggestedClassesPanel({
  childName,
  suggestions,
  onAdd,
}: {
  childName: string | null;
  suggestions: AvailableClass[];
  onAdd: (id: string) => void;
}) {
  const t = useTranslations("parent.enroll");
  const dayShort = useShortDayNames();
  const fmtTime = useFormatTimeShort();

  if (suggestions.length === 0 || typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ x: 336, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 336, opacity: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="fixed inset-y-0 right-0 z-[60] hidden w-80 flex-col gap-3 overflow-y-auto border-l border-[--hair] bg-base p-5 shadow-2xl lg:flex"
      >
        <div>
          <p className="text-[0.62rem] font-semibold uppercase tracking-wider text-muted">
            {t("suggestedTitle", { name: childName ?? t("yourDancer") })}
          </p>
          <p className="mt-1 text-xs text-muted">{t("suggestedHint")}</p>
        </div>
        <div className="flex flex-col gap-2">
          {suggestions.map((cls) => (
            <div key={cls.id} className="rounded-xl border border-[--hair] bg-surface p-3">
              <p className="text-sm font-semibold text-ink">{cls.name}</p>
              <p className="mt-0.5 text-xs text-muted">
                {cls.discipline}
                {cls.level ? ` · ${cls.level}` : ""}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {cls.dayOfWeek !== null ? dayShort[cls.dayOfWeek] : ""}
                {cls.startTime ? ` · ${fmtTime(cls.startTime)}` : ""}
              </p>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs font-bold" style={{ color: "var(--brand)" }}>
                  {t("programIncluded")}
                </span>
                <button
                  type="button"
                  onClick={() => onAdd(cls.id)}
                  className="rounded-lg px-3 py-1 text-xs font-bold text-white transition-opacity hover:opacity-90"
                  style={{ background: "var(--brand)" }}
                >
                  {t("addClass")}
                </button>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

// ─── Step screens ────────────────────────────────────────────────────────────

type EnrollData = {
  childId: string;
  childName: string | null;
  classes: SelectedClass[];
  waitlisted: boolean;
  payLater?: boolean;
  paidOnline?: boolean;
  payMonthly?: boolean;
  installmentCents?: number;
};

function Step1SelectClass({
  familyChildren,
  onNext,
}: {
  familyChildren: Child[];
  onNext: (data: { childId: string; childName: string | null; classes: AvailableClass[] }) => void;
}) {
  const t = useTranslations("parent.enroll");
  const dayShort = useShortDayNames();
  const [childId, setChildId] = useState(familyChildren[0]?.studentId ?? "");
  const [classes, setClasses] = useState<AvailableClass[]>([]);
  const [filter, setFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAvailableClasses().then((res) => {
      if (res.ok) setClasses(res.data);
      else setError(res.error);
      setLoading(false);
    });
  }, []);

  const filtered = classes.filter((c) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.discipline?.toLowerCase().includes(q) ?? false) ||
      (c.level?.toLowerCase().includes(q) ?? false) ||
      (c.dayOfWeek !== null && dayShort[c.dayOfWeek].toLowerCase().includes(q))
    );
  });

  function toggleClass(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedChild = familyChildren.find((c) => c.studentId === childId);
  const selectedClasses = classes.filter((c) => selectedIds.has(c.id));

  // Compute which selected classes are "included" (linked recurring-series
  // sibling of one already counted, not the first). Only an explicit shared
  // recurringGroupId counts — never matched by class name.
  const paidGroupsInSelection = new Set<string>();
  const includedInBatchIds = new Set<string>();
  for (const c of selectedClasses) {
    if (!c.recurringGroupId) continue;
    if (paidGroupsInSelection.has(c.recurringGroupId)) {
      includedInBatchIds.add(c.id);
    } else {
      paidGroupsInSelection.add(c.recurringGroupId);
    }
  }
  const totalCents = selectedClasses
    .filter((c) => !includedInBatchIds.has(c.id))
    .reduce((sum, c) => sum + c.priceCents, 0);

  // Suggested classes: other days of a linked recurring series the dancer is
  // already enrolled in (or has just selected) — same recurringGroupId, so
  // they'd be billed as "Included" per lib/enrollment-billing.ts.
  const activeClassIds = new Set((selectedChild?.classes ?? []).map((c) => c.id));
  const relevantGroupIds = new Set(
    [
      ...(selectedChild?.classes ?? []).map((c) => c.recurringGroupId),
      ...selectedClasses.map((c) => c.recurringGroupId),
    ].filter((id): id is string => !!id),
  );
  const suggestions = classes.filter(
    (c) =>
      !selectedIds.has(c.id) &&
      !activeClassIds.has(c.id) &&
      c.capacity - c.enrolled > 0 &&
      !!c.recurringGroupId &&
      relevantGroupIds.has(c.recurringGroupId),
  );

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-base font-bold text-ink">{t("chooseClass")}</h3>

      {/* Child selector */}
      {familyChildren.length > 1 && (
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">
            {t("enrollingFor")}
          </label>
          <select
            value={childId}
            onChange={(e) => { setChildId(e.target.value); setSelectedIds(new Set()); }}
            className="w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-[--brand]"
          >
            {familyChildren.map((c) => (
              <option key={c.studentId} value={c.studentId}>
                {c.name ?? t("unnamedDancer")}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Search */}
      <input
        type="text"
        placeholder={t("searchClasses")}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-[--brand]"
      />

      {/* Class list */}
      {loading ? (
        <div className="py-8 text-center text-sm text-muted animate-pulse">{t("loadingClasses")}</div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted">{t("noClassesMatch")}</div>
      ) : (
        <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
          {filtered.map((cls) => (
            <ClassCard
              key={cls.id}
              cls={cls}
              selected={selectedIds.has(cls.id)}
              includedInBatch={includedInBatchIds.has(cls.id)}
              onToggle={() => toggleClass(cls.id)}
            />
          ))}
        </div>
      )}

      {/* Selection summary */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-[--hair] bg-surface px-3 py-2 text-xs">
          <span className="text-muted">
            {selectedIds.size === 1
              ? t("classSelected", { count: 1 })
              : t("classesSelected", { count: selectedIds.size })}
          </span>
          {totalCents > 0 && (
            <span className="font-bold text-ink">{NZD.format(totalCents / 100)}</span>
          )}
        </div>
      )}

      <button
        type="button"
        disabled={selectedIds.size === 0 || !childId}
        onClick={() => {
          if (selectedClasses.length > 0) {
            onNext({ childId, childName: selectedChild?.name ?? null, classes: selectedClasses });
          }
        }}
        className="mt-2 w-full rounded-xl py-3 text-sm font-bold text-white transition-opacity disabled:opacity-40"
        style={{ background: "var(--brand)" }}
      >
        {t("continue")}
      </button>

      <SuggestedClassesPanel
        childName={selectedChild?.name ?? null}
        suggestions={suggestions}
        onAdd={toggleClass}
      />
    </div>
  );
}

function Step2SignWaivers({
  childName,
  childId,
  onNext,
  onBack,
}: {
  childName: string | null;
  childId: string;
  onNext: () => void;
  onBack: () => void;
}) {
  const t = useTranslations("parent.enroll");
  const [waivers, setWaivers] = useState<Waiver[]>([]);
  const [agreed, setAgreed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getActiveWaivers().then((res) => {
      if (res.ok) setWaivers(res.data);
      else setError(res.error);
      setLoading(false);
    });
  }, []);

  // If no waivers, skip this step automatically
  useEffect(() => {
    if (!loading && waivers.length === 0) onNext();
  }, [loading, waivers.length, onNext]);

  const allAgreed = waivers.every((w) => agreed.has(w.id));

  function handleSubmit() {
    startSaving(async () => {
      for (const w of waivers) {
        if (agreed.has(w.id)) {
          const res = await signWaiver(w.id, childId, w.version);
          if (!res.ok) { setError(res.error); return; }
        }
      }
      onNext();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-base font-bold text-ink">{t("waiversTitle")}</h3>
      <p className="text-sm text-muted">
        {t.rich("waiversIntro", {
          name: childName ?? t("yourDancer"),
          strong: (chunks) => <strong>{chunks}</strong>,
        })}
      </p>

      {loading ? (
        <div className="py-8 text-center text-sm text-muted animate-pulse">{t("loadingWaivers")}</div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>
      ) : waivers.length === 0 ? (
        <div className="rounded-lg border border-[--hair] bg-surface p-4 text-sm text-muted">
          {t("noWaiversRequired")}
        </div>
      ) : (
        <div className="space-y-4">
          {waivers.map((w) => (
            <div key={w.id} className="rounded-xl border border-[--hair] bg-surface p-4">
              <p className="mb-2 font-semibold text-ink">{w.title}</p>
              <div className="mb-3 max-h-32 overflow-y-auto rounded-lg bg-base p-3 text-xs text-muted leading-relaxed whitespace-pre-wrap">
                {w.content}
              </div>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreed.has(w.id)}
                  onChange={(e) => {
                    setAgreed((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(w.id);
                      else next.delete(w.id);
                      return next;
                    });
                  }}
                  className="mt-0.5 shrink-0 accent-[--brand]"
                />
                <span className="text-xs text-ink">
                  {t.rich("agreeWaiver", {
                    title: w.title,
                    strong: (chunks) => <strong>{chunks}</strong>,
                  })}
                </span>
              </label>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 rounded-xl border border-[--hair] py-3 text-sm font-semibold text-muted transition-colors hover:border-[--brand] hover:text-ink"
        >
          {t("back")}
        </button>
        <button
          type="button"
          disabled={!allAgreed || saving}
          onClick={handleSubmit}
          className="flex-1 rounded-xl py-3 text-sm font-bold text-white transition-opacity disabled:opacity-40"
          style={{ background: "var(--brand)" }}
        >
          {saving ? t("signing") : t("acceptContinue")}
        </button>
      </div>
    </div>
  );
}

function Step3Review({
  childId,
  enrollData,
  onComplete,
  onBack,
}: {
  childId: string;
  enrollData: Pick<EnrollData, "childName" | "classes">;
  onComplete: (
    waitlisted: boolean,
    opts?: { payLater?: boolean; paidOnline?: boolean; payMonthly?: boolean; installmentCents?: number },
  ) => void;
  onBack: () => void;
}) {
  const t = useTranslations("parent.enroll");
  const [phase, setPhase] = useState<"summary" | "pay">("summary");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enrolledClassIds, setEnrolledClassIds] = useState<Set<string>>(new Set());
  const [payMeta, setPayMeta] = useState<{
    installmentCents: number;
    installmentNumber: number;
    installmentCount: number;
    totalCents: number;
  } | null>(null);
  const [accountSummary, setAccountSummary] = useState<AccountBillingSummary | null>(null);

  const classes = enrollData.classes;
  const totalBillableCents = classes.reduce((sum, c) => sum + c.billableCents, 0);
  const isPaid = totalBillableCents > 0;
  const isSingleClass = classes.length === 1;

  useEffect(() => {
    if (!isPaid) return;
    getAccountBillingSummary().then((res) => {
      if (res.ok) setAccountSummary(res.data);
    });
  }, [isPaid]);

  const projectedTermTotal = (accountSummary?.outstandingCents ?? 0) + totalBillableCents;

  async function enrollAll(): Promise<{ anyWaitlisted: boolean } | null> {
    const toEnroll = classes.filter((c) => !enrolledClassIds.has(c.classId));
    let anyWaitlisted = false;
    const newEnrolled = new Set(enrolledClassIds);

    for (const cls of toEnroll) {
      const res = await enrollChildInClass(childId, cls.classId);
      if (!res.ok) {
        setError(res.error);
        return null;
      }
      if (res.data.waitlisted) anyWaitlisted = true;
      newEnrolled.add(cls.classId);
    }

    setEnrolledClassIds(newEnrolled);
    return { anyWaitlisted };
  }

  async function handlePayLater() {
    setBusy(true);
    setError(null);

    const enrolled = await enrollAll();
    if (!enrolled) { setBusy(false); return; }

    if (enrolled.anyWaitlisted || !isPaid) {
      onComplete(enrolled.anyWaitlisted);
      setBusy(false);
      return;
    }

    const invRes = await createEnrollmentPayLaterInvoice(
      childId,
      classes.map((cls) => ({ classId: cls.classId, className: cls.className, priceCents: cls.priceCents })),
      false,
    );
    if (!invRes.ok) { setError(invRes.error); setBusy(false); return; }

    onComplete(false, { payLater: true });
    setBusy(false);
  }

  async function handlePayMonthly() {
    setBusy(true);
    setError(null);

    const enrolled = await enrollAll();
    if (!enrolled) { setBusy(false); return; }

    if (enrolled.anyWaitlisted || !isPaid) {
      onComplete(enrolled.anyWaitlisted);
      setBusy(false);
      return;
    }

    const invRes = await createEnrollmentPayLaterInvoice(
      childId,
      classes.map((cls) => ({ classId: cls.classId, className: cls.className, priceCents: cls.priceCents })),
      true,
    );
    if (!invRes.ok) { setError(invRes.error); setBusy(false); return; }

    if (!invRes.data.invoiceId) {
      onComplete(false);
      setBusy(false);
      return;
    }

    const termRes = await startTermPlanAfterEnrollment(invRes.data.invoiceId);
    if (!termRes.ok) { setError(termRes.error); setBusy(false); return; }

    setPayMeta({
      installmentCents: termRes.data.installmentCents,
      installmentNumber: termRes.data.installmentNumber,
      installmentCount: termRes.data.installmentCount,
      totalCents: termRes.data.totalCents,
    });
    setClientSecret(termRes.data.clientSecret);
    setPhase("pay");
    setBusy(false);
  }

  async function handlePayNow() {
    if (!isSingleClass) return;
    setBusy(true);
    setError(null);

    const cls = classes[0];
    const enrolled = await enrollAll();
    if (!enrolled) { setBusy(false); return; }

    if (enrolled.anyWaitlisted || !isPaid) {
      onComplete(enrolled.anyWaitlisted);
      setBusy(false);
      return;
    }

    const intentRes = await createEnrollmentIntent(childId, cls.classId, cls.className, cls.priceCents);
    if (!intentRes.ok) { setError(intentRes.error); setBusy(false); return; }

    if ("billingSkipped" in intentRes.data) {
      onComplete(false);
      setBusy(false);
      return;
    }

    setClientSecret(intentRes.data.clientSecret);
    setPhase("pay");
    setBusy(false);
  }

  async function handleFreeConfirm() {
    setBusy(true);
    setError(null);
    const enrolled = await enrollAll();
    if (!enrolled) { setBusy(false); return; }
    onComplete(enrolled.anyWaitlisted);
    setBusy(false);
  }

  function handlePaymentCancelled() {
    onComplete(false, { payLater: true });
  }

  // ── Card capture phase ─────────────────────────────────────────────────────
  if (phase === "pay" && clientSecret) {
    const chargeCents = payMeta?.installmentCents ?? totalBillableCents;
    const label = isSingleClass ? classes[0].className : t("multipleClasses", { count: classes.length });
    return (
      <div className="flex flex-col gap-4">
        <h3 className="text-base font-bold text-ink">
          {payMeta ? t("termPayTitle") : t("paymentTitle")}
        </h3>
        {payMeta && (
          <p className="text-xs text-muted">
            {t("termInstallmentProgress", {
              current: payMeta.installmentNumber,
              total: payMeta.installmentCount,
              accountTotal: NZD.format(payMeta.totalCents / 100),
            })}
          </p>
        )}
        <div className="flex items-center justify-between rounded-xl border border-[--hair] bg-surface px-4 py-3">
          <span className="text-sm text-muted">{label}</span>
          <span className="font-black text-ink">{NZD.format(chargeCents / 100)}</span>
        </div>
        <CheckoutForm
          clientSecret={clientSecret}
          submitLabel={t("payAmount", { amount: NZD.format(chargeCents / 100) })}
          onSuccess={() =>
            onComplete(false, {
              paidOnline: !payMeta,
              payMonthly: !!payMeta,
              installmentCents: payMeta?.installmentCents,
            })
          }
          onCancel={handlePaymentCancelled}
          cancelLabel={t("payLaterInstead")}
        />
        <p className="text-center text-[0.65rem] text-muted">
          {payMeta ? t("termPayNowHint") : t("payNowHint")}
        </p>
      </div>
    );
  }

  // ── Summary phase ──────────────────────────────────────────────────────────
  const allIncluded = classes.every((c) => c.includedInProgramme);

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-base font-bold text-ink">{t("reviewTitle")}</h3>

      <div className="rounded-xl border border-[--hair] bg-surface p-5 space-y-3">
        {/* Class list */}
        {classes.map((cls) => (
          <div key={cls.classId} className="flex justify-between text-sm">
            <span className="text-muted truncate pr-2">{cls.className}</span>
            <span className="font-semibold text-ink shrink-0">
              {cls.includedInProgramme
                ? t("programIncluded")
                : cls.billableCents > 0
                ? NZD.format(cls.billableCents / 100)
                : t("free")}
            </span>
          </div>
        ))}
        <div className="flex justify-between text-sm">
          <span className="text-muted">{t("summaryDancer")}</span>
          <span className="font-semibold text-ink">{enrollData.childName ?? "—"}</span>
        </div>
        <div className="my-2 border-t border-[--hair]" />
        <div className="flex justify-between">
          <span className="font-bold text-ink">{t("summaryTotalDue")}</span>
          <span className="font-black text-ink">
            {allIncluded
              ? t("programIncluded")
              : isPaid
              ? NZD.format(totalBillableCents / 100)
              : t("free")}
          </span>
        </div>
      </div>

      {isPaid && (
        <div className="rounded-lg border border-[--hair] bg-base p-3 text-xs text-muted space-y-1">
          <p>{t("paymentChoiceHint")}</p>
          {projectedTermTotal > totalBillableCents && (
            <p>
              {t("termAccountTotalHint", {
                total: NZD.format(projectedTermTotal / 100),
              })}
            </p>
          )}
          <p>
            {t("termMonthlyOptionHint", {
              count: TERM_INSTALLMENT_COUNT,
              amount: NZD.format(
                (splitTermInstallments(projectedTermTotal)[0] ?? 0) / 100,
              ),
            })}
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={busy}
          className="w-full rounded-xl border border-[--hair] py-3 text-sm font-semibold text-muted transition-colors hover:text-ink disabled:opacity-40"
        >
          {t("back")}
        </button>
        {isPaid ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={handlePayLater}
              className="w-full rounded-xl py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              style={{ background: "var(--brand)" }}
            >
              {busy ? t("processing") : t("payLater")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handlePayMonthly}
              className="w-full rounded-xl border border-[--brand] bg-[color-mix(in_srgb,var(--brand)_8%,transparent)] py-3 text-sm font-bold text-ink transition-colors hover:bg-[color-mix(in_srgb,var(--brand)_14%,transparent)] disabled:opacity-40"
            >
              {busy ? t("processing") : t("payMonthly")}
            </button>
            {isSingleClass && (
              <button
                type="button"
                disabled={busy}
                onClick={handlePayNow}
                className="w-full rounded-xl border border-[--hair] bg-surface py-3 text-sm font-bold text-ink transition-colors hover:bg-base disabled:opacity-40"
              >
                {busy ? t("processing") : t("payNow")}
              </button>
            )}
          </>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={handleFreeConfirm}
            className="w-full rounded-xl py-3 text-sm font-bold text-white transition-opacity disabled:opacity-40"
            style={{ background: "var(--brand)" }}
          >
            {busy ? t("processing") : t("confirmEnrollment")}
          </button>
        )}
      </div>
    </div>
  );
}

function Step4Confirmation({
  enrollData,
  onClose,
}: {
  enrollData: EnrollData;
  onClose: () => void;
}) {
  const t = useTranslations("parent.enroll");
  const dancerName = enrollData.childName ?? t("yourDancer");
  const classes = enrollData.classes;
  const totalBillableCents = classes.reduce((sum, c) => sum + c.billableCents, 0);

  return (
    <div className="flex flex-col items-center gap-5 py-4 text-center">
      <div
        className="grid h-16 w-16 place-items-center rounded-full text-2xl"
        style={{ background: "color-mix(in srgb, var(--brand) 12%, transparent)" }}
      >
        {enrollData.waitlisted ? "⏳" : "🎉"}
      </div>
      <div>
        <h3 className="text-lg font-black text-ink">
          {enrollData.waitlisted ? t("waitlistedTitle") : t("enrolledTitle")}
        </h3>
        {classes.length === 1 ? (
          <p className="mt-1 text-sm text-muted">
            {enrollData.waitlisted
              ? t("waitlistedBody", { name: dancerName, className: classes[0].className })
              : t("enrolledBody", { name: dancerName, className: classes[0].className })}
          </p>
        ) : (
          <div className="mt-2 space-y-0.5">
            {classes.map((cls) => (
              <p key={cls.classId} className="text-sm text-ink font-medium">{cls.className}</p>
            ))}
            <p className="mt-1 text-xs text-muted">{t("enrolledForDancer", { name: dancerName })}</p>
          </div>
        )}
        {totalBillableCents > 0 && !enrollData.waitlisted && (
          <p className="mt-2 text-xs text-muted">
            {enrollData.paidOnline
              ? t("paidOnlineHint", { amount: NZD.format(totalBillableCents / 100) })
              : enrollData.payMonthly
                ? t("termPaidHint", {
                    amount: NZD.format((enrollData.installmentCents ?? 0) / 100),
                    count: TERM_INSTALLMENT_COUNT,
                  })
                : enrollData.payLater
                ? t("payLaterHint", { amount: NZD.format(totalBillableCents / 100) })
                : t("invoiceHint", { amount: NZD.format(totalBillableCents / 100) })}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="rounded-xl px-8 py-3 text-sm font-bold text-white"
        style={{ background: "var(--brand)" }}
      >
        {t("done")}
      </button>
    </div>
  );
}

// ─── Main modal ──────────────────────────────────────────────────────────────

export function EnrollModal({
  familyChildren,
  onClose,
}: {
  familyChildren: Child[];
  onClose: () => void;
}) {
  const t = useTranslations("parent.enroll");
  const steps = [
    t("steps.selectClass"),
    t("steps.waivers"),
    t("steps.review"),
    t("steps.done"),
  ];
  const [step, setStep] = useState(0);
  const [enrollData, setEnrollData] = useState<Partial<EnrollData>>({ classes: [] });
  const backdropRef = useRef<HTMLDivElement>(null);

  // Close on backdrop click
  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === backdropRef.current) onClose();
  }

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4 backdrop-blur-sm"
    >
      <div className="flex min-h-full items-start justify-center py-2 sm:items-center sm:py-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 8 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="relative flex w-full max-w-md max-h-[calc(100dvh-2rem)] flex-col overflow-hidden rounded-2xl border border-[--hair] bg-base shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-[--hair] px-6 py-4">
          <div>
            <p className="text-[0.62rem] font-semibold uppercase tracking-wider text-muted">
              {t("title")}
            </p>
            <p className="text-sm font-bold text-ink">{steps[step]}</p>
          </div>
          <div className="flex items-center gap-4">
            <StepIndicator step={step} total={steps.length} />
            <button
              type="button"
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-full text-muted transition-colors hover:bg-surface hover:text-ink"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.18 }}
            >
              {step === 0 && (
                <Step1SelectClass
                  familyChildren={familyChildren}
                  onNext={({ childId, childName, classes }) => {
                    setEnrollData({
                      childId,
                      childName,
                      classes: classes.map((cls) => ({
                        classId: cls.id,
                        className: cls.name,
                        priceCents: cls.priceCents,
                        billableCents: cls.priceCents,
                        includedInProgramme: false,
                        recurringGroupId: cls.recurringGroupId,
                      })),
                    });
                    setStep(1);
                  }}
                />
              )}
              {step === 1 && (
                <Step2SignWaivers
                  childName={enrollData.childName ?? null}
                  childId={enrollData.childId!}
                  onNext={async () => {
                    // Process quotes sequentially so that within this batch, the
                    // second day of a linked recurring series (same
                    // recurringGroupId) is correctly treated as included —
                    // mirroring the DB logic in enrollment-billing.ts, which
                    // never matches by class name.
                    const paidGroups = new Set<string>();
                    const updatedClasses: SelectedClass[] = [];
                    for (const cls of enrollData.classes ?? []) {
                      if (cls.recurringGroupId && paidGroups.has(cls.recurringGroupId)) {
                        updatedClasses.push({ ...cls, billableCents: 0, includedInProgramme: true });
                        continue;
                      }
                      const quote = await getEnrollmentBillingQuote(
                        enrollData.childId!,
                        cls.priceCents,
                        cls.classId,
                      );
                      const billable = quote.ok ? quote.data.billableCents : cls.priceCents;
                      const included = quote.ok ? quote.data.includedInProgramme : false;
                      if (billable > 0 && cls.recurringGroupId) paidGroups.add(cls.recurringGroupId);
                      updatedClasses.push({ ...cls, billableCents: billable, includedInProgramme: included });
                    }
                    setEnrollData((prev) => ({ ...prev, classes: updatedClasses }));
                    setStep(2);
                  }}
                  onBack={() => setStep(0)}
                />
              )}
              {step === 2 && (
                <Step3Review
                  childId={enrollData.childId!}
                  enrollData={{
                    childName: enrollData.childName ?? null,
                    classes: enrollData.classes ?? [],
                  }}
                  onComplete={(waitlisted, opts) => {
                    setEnrollData((prev) => ({
                      ...prev,
                      waitlisted,
                      payLater: opts?.payLater,
                      paidOnline: opts?.paidOnline,
                      payMonthly: opts?.payMonthly,
                      installmentCents: opts?.installmentCents,
                    }));
                    setStep(3);
                  }}
                  onBack={() => setStep(1)}
                />
              )}
              {step === 3 && enrollData.childId && (enrollData.classes?.length ?? 0) > 0 && (
                <Step4Confirmation
                  enrollData={enrollData as EnrollData}
                  onClose={onClose}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
      </div>
    </div>
  );
}
