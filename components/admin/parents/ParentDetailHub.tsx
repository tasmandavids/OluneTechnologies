"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import {
  updateParent,
  linkChild,
  unlinkChild,
  setPrimaryContact,
  addCoParent,
  updateChildRelationship,
} from "@/app/portal/admin/parents/actions";
import type {
  CoParent,
  GuardianRelationship,
  ParentChild,
  ParentDetail,
  ParentInvoice,
  ParentOrder,
  ParentPayment,
  StudentOption,
} from "@/lib/parents/types";
import ParentBillingTab from "./ParentBillingTab";
import ParentMessagesTab from "./ParentMessagesTab";
import DeleteParentButton from "./DeleteParentButton";

type Tab = "profile" | "children" | "billing" | "messages";

function initials(name: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

const RELATIONSHIPS: GuardianRelationship[] = ["mother", "father", "guardian", "other"];

export default function ParentDetailHub({
  parent,
  students,
  invoices,
  payments,
  orders,
  currentUserId,
}: {
  parent: ParentDetail;
  students: StudentOption[];
  invoices: ParentInvoice[];
  payments: ParentPayment[];
  orders: ParentOrder[];
  currentUserId: string;
}) {
  const t = useTranslations("admin.parents.detail");
  const tShared = useTranslations("admin.shared");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("profile");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [profileForm, setProfileForm] = useState({
    fullName: parent.name ?? "",
    email: parent.email ?? "",
    phone: parent.phone ?? "",
  });

  const [linkStudentId, setLinkStudentId] = useState("");
  const [linkRelationship, setLinkRelationship] = useState<GuardianRelationship>("guardian");

  const [showCoParent, setShowCoParent] = useState(false);
  const [coParentForm, setCoParentForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    relationship: "guardian" as GuardianRelationship,
    makePrimary: false,
  });

  const linkedIds = new Set(parent.children.map((c) => c.id));
  const availableStudents = students.filter((s) => !linkedIds.has(s.id));

  const run = (fn: () => Promise<{ ok: boolean; error?: string; id?: string }>) => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.error ?? tShared("somethingWentWrong"));
        return;
      }
      setSuccess(tShared("saved"));
      router.refresh();
      if (result.id && showCoParent) {
        setShowCoParent(false);
        router.push(`/portal/admin/parents/${result.id}`);
      }
    });
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "profile", label: t("tabs.profile") },
    { id: "children", label: t("tabs.children") },
    { id: "billing", label: t("tabs.billing") },
    { id: "messages", label: t("tabs.messages") },
  ];

  const relationshipLabel = (r: GuardianRelationship) =>
    tShared(`relationships.${r}` as "relationships.mother");

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-5xl space-y-6 p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/portal/admin/parents"
            className="mb-2 inline-block text-xs font-semibold text-muted hover:text-ink"
          >
            {t("back")}
          </Link>
          <div className="flex items-center gap-3">
            <span
              className="grid h-12 w-12 place-items-center rounded-full text-sm font-black text-white"
              style={{ background: "var(--brand)" }}
            >
              {initials(parent.name)}
            </span>
            <div>
              <h1 className="text-2xl font-black text-ink">{parent.name ?? tShared("unknown")}</h1>
              <p className="text-sm text-muted">
                {parent.email ?? parent.phone ?? tShared("noContactInfo")}
                {parent.isPrimaryContact && (
                  <span className="ml-2 rounded-full bg-brand/15 px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wider text-brand">
                    {t("primaryContact")}
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setTab("messages")}
          className="rounded-xl border border-[--hair] px-4 py-2 text-sm font-semibold text-ink hover:bg-surface"
        >
          {t("message")}
        </button>
      </div>

      {(error || success) && (
        <p
          className={`rounded-lg px-3 py-2 text-xs ${
            error
              ? "border border-red-400/30 bg-red-400/10 text-red-400"
              : "border border-green-400/30 bg-green-400/10 text-green-600"
          }`}
        >
          {error ?? success}
        </p>
      )}

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

      {tab === "profile" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-[--hair] bg-surface p-5 space-y-4">
            <h2 className="font-bold text-ink">{t("contactDetails")}</h2>
            <div>
              <label className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
                {t("fullName")}
              </label>
              <input
                value={profileForm.fullName}
                onChange={(e) => setProfileForm((f) => ({ ...f, fullName: e.target.value }))}
                className="w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm text-ink"
              />
            </div>
            <div>
              <label className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
                {tCommon("email")}
              </label>
              <input
                type="email"
                value={profileForm.email}
                onChange={(e) => setProfileForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm text-ink"
              />
            </div>
            <div>
              <label className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
                {tCommon("phone")}
              </label>
              <input
                value={profileForm.phone}
                onChange={(e) => setProfileForm((f) => ({ ...f, phone: e.target.value }))}
                className="w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm text-ink"
              />
            </div>
            <button
              type="button"
              disabled={pending || !profileForm.fullName.trim()}
              onClick={() =>
                run(() =>
                  updateParent({
                    id: parent.id,
                    fullName: profileForm.fullName,
                    email: profileForm.email,
                    phone: profileForm.phone,
                  }),
                )
              }
              className="rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              style={{ background: "var(--brand)" }}
            >
              {pending ? tShared("saving") : t("saveChanges")}
            </button>

            <DeleteParentButton parentId={parent.id} parentName={parent.name} />
          </section>

          <section className="space-y-4">
            {!parent.isPrimaryContact && parent.children.length > 0 && (
              <div className="rounded-2xl border border-[--hair] bg-surface p-5">
                <h2 className="mb-2 font-bold text-ink">{t("makePrimaryTitle")}</h2>
                <p className="mb-3 text-sm text-muted">{t("makePrimaryDescription")}</p>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => setPrimaryContact({ guardianId: parent.id }))}
                  className="rounded-xl border border-[--hair] px-4 py-2 text-sm font-semibold text-ink hover:bg-base"
                >
                  {t("makePrimaryContact")}
                </button>
              </div>
            )}

            <div className="rounded-2xl border border-[--hair] bg-surface p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-bold text-ink">{t("coParents")}</h2>
                {!showCoParent && (
                  <button
                    type="button"
                    onClick={() => setShowCoParent(true)}
                    className="text-sm font-semibold text-brand"
                  >
                    {t("addCoParent")}
                  </button>
                )}
              </div>
              {parent.coParents.length === 0 && !showCoParent ? (
                <p className="text-sm italic text-muted">{t("noCoParents")}</p>
              ) : (
                <ul className="space-y-2">
                  {parent.coParents.map((cp) => (
                    <CoParentCard key={cp.id} coParent={cp} />
                  ))}
                </ul>
              )}
              {showCoParent && (
                <div className="mt-4 space-y-3 border-t border-[--hair] pt-4">
                  <GuardianFields
                    form={coParentForm}
                    onChange={(k, v) => setCoParentForm((f) => ({ ...f, [k]: v }))}
                  />
                  <label className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={coParentForm.makePrimary}
                      onChange={(e) =>
                        setCoParentForm((f) => ({ ...f, makePrimary: e.target.checked }))
                      }
                    />
                    {t("makeCoParentPrimary")}
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowCoParent(false)}
                      className="flex-1 rounded-xl border border-[--hair] py-2 text-sm text-muted"
                    >
                      {tCommon("cancel")}
                    </button>
                    <button
                      type="button"
                      disabled={pending || !coParentForm.fullName.trim()}
                      onClick={() =>
                        run(() =>
                          addCoParent({
                            existingGuardianId: parent.id,
                            coParent: {
                              fullName: coParentForm.fullName,
                              email: coParentForm.email,
                              phone: coParentForm.phone,
                              relationship: coParentForm.relationship,
                            },
                            makePrimary: coParentForm.makePrimary,
                          }),
                        )
                      }
                      className="flex-1 rounded-xl py-2 text-sm font-bold text-white disabled:opacity-50"
                      style={{ background: "var(--brand)" }}
                    >
                      {t("addCoParentButton")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {tab === "children" && (
        <div className="space-y-6">
          {parent.children.length === 0 ? (
            <p className="text-sm italic text-muted">{t("noLinkedStudents")}</p>
          ) : (
            <ul className="space-y-2">
              {parent.children.map((child) => (
                <ChildRow
                  key={child.id}
                  child={child}
                  pending={pending}
                  onUnlink={() =>
                    run(() => unlinkChild({ guardianId: parent.id, studentId: child.id }))
                  }
                  onRelationshipChange={(relationship) =>
                    run(() =>
                      updateChildRelationship({
                        guardianId: parent.id,
                        studentId: child.id,
                        relationship,
                      }),
                    )
                  }
                />
              ))}
            </ul>
          )}

          {availableStudents.length > 0 && (
            <div className="rounded-2xl border border-[--hair] bg-surface p-5 space-y-3">
              <h3 className="font-bold text-ink">{t("linkStudent")}</h3>
              <div className="flex flex-wrap gap-3">
                <select
                  value={linkStudentId}
                  onChange={(e) => setLinkStudentId(e.target.value)}
                  className="min-w-[200px] flex-1 rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm"
                >
                  <option value="">{t("selectStudent")}</option>
                  {availableStudents.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name ?? tCommon("student")}
                    </option>
                  ))}
                </select>
                <select
                  value={linkRelationship}
                  onChange={(e) =>
                    setLinkRelationship(e.target.value as GuardianRelationship)
                  }
                  className="rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm"
                >
                  {RELATIONSHIPS.map((r) => (
                    <option key={r} value={r}>
                      {relationshipLabel(r)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={pending || !linkStudentId}
                  onClick={() =>
                    run(async () => {
                      const res = await linkChild({
                        guardianId: parent.id,
                        studentId: linkStudentId,
                        relationship: linkRelationship,
                      });
                      if (res.ok) setLinkStudentId("");
                      return res;
                    })
                  }
                  className="rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                  style={{ background: "var(--brand)" }}
                >
                  {t("linkStudentButton")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "billing" && (
        <ParentBillingTab invoices={invoices} payments={payments} orders={orders} />
      )}

      {tab === "messages" && (
        <ParentMessagesTab
          currentUserId={currentUserId}
          parentId={parent.id}
          parentName={parent.name ?? tCommon("parent")}
        />
      )}
    </motion.div>
  );
}

function CoParentCard({ coParent }: { coParent: CoParent }) {
  const t = useTranslations("admin.parents.detail");
  const tShared = useTranslations("admin.shared");

  return (
    <li className="flex items-center justify-between rounded-xl border border-[--hair] px-3 py-2">
      <div>
        <p className="text-sm font-semibold text-ink">{coParent.name ?? tShared("unknown")}</p>
        <p className="text-xs text-muted">{coParent.email ?? coParent.phone ?? tShared("dash")}</p>
      </div>
      <Link
        href={`/portal/admin/parents/${coParent.id}`}
        className="text-xs font-semibold text-brand"
      >
        {t("viewProfile")}
      </Link>
    </li>
  );
}

function ChildRow({
  child,
  pending,
  onUnlink,
  onRelationshipChange,
}: {
  child: ParentChild;
  pending: boolean;
  onUnlink: () => void;
  onRelationshipChange: (r: GuardianRelationship) => void;
}) {
  const t = useTranslations("admin.parents.detail");
  const tShared = useTranslations("admin.shared");
  const tCommon = useTranslations("common");

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[--hair] bg-surface px-4 py-3">
      <div className="flex items-center gap-3">
        <Link
          href={`/portal/admin/students/${child.id}`}
          className="text-sm font-semibold text-ink hover:underline"
        >
          {child.name ?? tCommon("student")}
        </Link>
        {child.isPrimary && (
          <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[0.6rem] font-semibold uppercase text-brand">
            {t("primaryPayer")}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <select
          value={child.relationship}
          disabled={pending}
          onChange={(e) => onRelationshipChange(e.target.value as GuardianRelationship)}
          className="rounded-lg border border-[--hair] bg-base px-2 py-1 text-xs"
        >
          {RELATIONSHIPS.map((r) => (
            <option key={r} value={r}>
              {tShared(`relationships.${r}` as "relationships.mother")}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={pending}
          onClick={onUnlink}
          className="text-xs text-red-500 hover:underline"
        >
          {t("unlink")}
        </button>
      </div>
    </li>
  );
}

function GuardianFields({
  form,
  onChange,
}: {
  form: {
    fullName: string;
    email: string;
    phone: string;
    relationship: GuardianRelationship;
  };
  onChange: (k: "fullName" | "email" | "phone" | "relationship", v: string) => void;
}) {
  const t = useTranslations("admin.parents.detail");
  const tCommon = useTranslations("common");
  const tShared = useTranslations("admin.shared");

  return (
    <>
      <div>
        <label className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
          {t("fullName")} *
        </label>
        <input
          value={form.fullName}
          onChange={(e) => onChange("fullName", e.target.value)}
          className="w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
            {tCommon("email")}
          </label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => onChange("email", e.target.value)}
            className="w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
            {tCommon("phone")}
          </label>
          <input
            value={form.phone}
            onChange={(e) => onChange("phone", e.target.value)}
            className="w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
          {t("relationship")}
        </label>
        <select
          value={form.relationship}
          onChange={(e) => onChange("relationship", e.target.value)}
          className="w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm"
        >
          {RELATIONSHIPS.map((r) => (
            <option key={r} value={r}>
              {tShared(`relationships.${r}` as "relationships.mother")}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
