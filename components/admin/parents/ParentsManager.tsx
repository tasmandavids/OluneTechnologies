"use client";
import { confirmDialog } from "@/lib/feedback";
import { useTranslations } from "next-intl";

import { useState, useTransition } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import AddFamilyPanel from "@/components/admin/parents/AddFamilyPanel";
import MassEmailParentsPanel, {
  type ClassOption,
} from "@/components/admin/parents/MassEmailParentsPanel";
import { bulkInviteMembers } from "@/app/portal/admin/parents/actions";
import type { ParentRow, StudentOption } from "@/lib/parents/types";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";

function initials(name: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

function ParentCard({ parent }: { parent: ParentRow }) {
  const t = useTranslations("admin.parents");
  const tShared = useTranslations("admin.shared");
  const tCommon = useTranslations("common");
  return (
    <GlassPanel className="!p-0 overflow-hidden transition-shadow hover:shadow-md">
      <Link href={`/portal/admin/parents/${parent.id}`} className="block p-4 text-left">
        <div className="mb-3 flex items-center gap-3">
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-black text-white"
            style={{ background: "var(--brand)" }}
          >
            {initials(parent.name)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="truncate font-semibold text-ink">{parent.name ?? tShared("unknown")}</p>
              {parent.isPrimaryContact && (
                <span className="shrink-0 rounded-full bg-brand/15 px-1.5 py-0.5 text-[0.55rem] font-semibold uppercase tracking-wider text-brand">
                  {t("primary")}
                </span>
              )}
            </div>
            <p className="truncate text-xs text-muted">
              {parent.email ?? parent.phone ?? tShared("noContact")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {parent.children.length === 0 ? (
            <span className="text-xs italic text-muted">{t("noLinkedStudents")}</span>
          ) : (
            parent.children.map((child) => (
              <span
                key={child.id}
                className="box-pill rounded-full px-2 py-0.5 text-[0.62rem] font-medium text-ink"
              >
                {child.name ?? tCommon("student")}
              </span>
            ))
          )}
        </div>
        {parent.coParents.length > 0 && (
          <p className="mt-2 text-[0.62rem] text-muted">
            {tShared("withCoParents", {
              names: parent.coParents.map((c) => c.name ?? tShared("coParentFallback")).join(", "),
            })}
          </p>
        )}
      </Link>
    </GlassPanel>
  );
}

export default function ParentsManager({
  parents,
  students,
  classes = [],
  canMassEmail = false,
}: {
  parents: ParentRow[];
  students: StudentOption[];
  classes?: ClassOption[];
  canMassEmail?: boolean;
}) {
  const t = useTranslations("admin.parents");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showMassEmail, setShowMassEmail] = useState(false);
  const [inviting, startInvite] = useTransition();
  const [inviteResult, setInviteResult] = useState<string | null>(null);

  async function handleBulkInvite() {
    if (!(await confirmDialog({ title: "Send invite emails to all parents and students who have never logged in?" }))) return;
    setInviteResult(null);
    startInvite(async () => {
      const res = await bulkInviteMembers();
      if (!res.ok) {
        setInviteResult(`Error: ${res.error}`);
      } else {
        const msg = `Invites sent: ${res.sent}. Already active: ${res.skipped}.${res.failed > 0 ? ` Failed: ${res.failed}.` : ""}`;
        setInviteResult(msg);
      }
    });
  }

  const filtered = parents.filter(
    (p) =>
      !search ||
      (p.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (p.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
      p.children.some((c) => (c.name ?? "").toLowerCase().includes(search.toLowerCase())) ||
      p.coParents.some((c) => (c.name ?? "").toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-5xl space-y-6 p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-ink">{t("title")}</h1>
          <p className="text-sm text-muted">
            {t("subtitle", { count: parents.length })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canMassEmail && (
            <button
              type="button"
              onClick={() => setShowMassEmail(true)}
              className="rounded-xl border border-[--hair] bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-canvas"
            >
              {t("massEmail.button")}
            </button>
          )}
          <button
            type="button"
            onClick={handleBulkInvite}
            disabled={inviting}
            className="rounded-xl border border-[--hair] bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-canvas disabled:opacity-50"
          >
            {inviting ? "Sending invites…" : "Invite all"}
          </button>
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="rounded-xl bg-ink px-4 py-2 text-sm font-bold text-paper"
          >
            {t("addFamilyButton")}
          </button>
        </div>
      </div>
      {inviteResult && (
        <GlassPanel className="!p-0">
          <p className="px-4 py-2.5 text-sm text-ink">{inviteResult}</p>
        </GlassPanel>
      )}

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("searchPlaceholder")}
        className="w-full max-w-sm rounded-xl border border-[--hair] bg-surface px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-[--brand]"
      />

      {filtered.length === 0 ? (
        <GlassPanel className="!p-0">
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-muted">
              {search
                ? t("emptySearch")
                : t("empty")}
            </p>
            {!search && (
              <button
                type="button"
                onClick={() => setShowAdd(true)}
                className="mt-3 text-sm font-semibold text-ink underline"
              >
                {t("addFirstFamily")}
              </button>
            )}
          </div>
        </GlassPanel>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((parent) => (
            <ParentCard key={parent.id} parent={parent} />
          ))}
        </div>
      )}

      <AnimatePresence>
        {showAdd && (
          <AddFamilyPanel students={students} onClose={() => setShowAdd(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showMassEmail && (
          <MassEmailParentsPanel
            parents={parents}
            classes={classes}
            onClose={() => setShowMassEmail(false)}
            onResult={setInviteResult}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
