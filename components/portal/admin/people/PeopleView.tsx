"use client";

// ============================================================================
//  PeopleView — Students / Families / Leads segmented directory. One row
//  expands at a time. Since the standalone /students and /parents rosters were
//  retired, this screen also carries their toolbars: search + filters, add
//  student, add family, invite all, mass email, and bulk edit/delete.
// ============================================================================

import Link from "next/link";
import { loadPeopleOptions } from "@/app/portal/admin/people/options";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { useTranslations, useLocale } from "next-intl";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";
import { onGlowMove, onGlowLeave } from "@/components/portal/admin/glass/useMicroInteractions";
import { confirmDialog } from "@/lib/feedback";
const AddStudentPanel = dynamic(() => import("@/components/admin/students/AddStudentPanel"));
const BulkEditStudentsPanel = dynamic(() => import("@/components/admin/students/BulkEditStudentsPanel"));
const AddFamilyPanel = dynamic(() => import("@/components/admin/parents/AddFamilyPanel"));
import type { ClassOption } from "@/components/admin/parents/MassEmailParentsPanel";
const MassEmailParentsPanel = dynamic(() => import("@/components/admin/parents/MassEmailParentsPanel"));
import { bulkDeleteStudents, createDraftInvoiceFromEnrollments } from "@/app/portal/admin/students/actions";
import { bulkInviteMembers } from "@/app/portal/admin/parents/actions";
import type { ParentRow, StudentOption } from "@/lib/parents/types";
import type { PeopleStudentRow, PeopleFamilyRow, PeopleLeadRow } from "./types";

export type PeopleTab = "students" | "families" | "leads";

type StudentFilter = "all" | "overdue" | "new" | "unenrolled";
type FamilyFilter = "all" | "owing" | "noChildren";
type LeadFilter = "all" | PeopleLeadRow["status"];

const LEAD_STATUSES: PeopleLeadRow["status"][] = ["new", "contacted", "trial", "converted", "lost"];

function attendanceColor(pct: number): string {
  if (pct >= 88) return "var(--brand)";
  if (pct >= 75) return "var(--ink, var(--text))";
  return "var(--muted)";
}



// ─── shared chrome ───────────────────────────────────────────────────────────

const CONTROL_STYLE = {
  background: "var(--glass)",
  borderColor: "var(--edge)",
  color: "var(--ink, var(--text))",
} as const;

function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full min-w-[200px] flex-1 rounded-[12px] border px-3.5 py-2 text-[12.5px] text-ink outline-none transition-colors placeholder:text-muted focus:border-[--ring] sm:max-w-[320px]"
      style={CONTROL_STYLE}
    />
  );
}

function FilterSelect<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="rounded-[12px] border px-3 py-2 text-[12.5px] font-medium text-ink outline-none transition-colors focus:border-[--ring]"
      style={CONTROL_STYLE}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function ToolbarButton({
  onClick,
  children,
  disabled,
  primary,
}: {
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-[12px] border px-3.5 py-2 text-[12.5px] font-semibold transition-colors disabled:opacity-50"
      style={
        primary
          ? { background: "var(--brand)", borderColor: "var(--brand)", color: "#fff" }
          : CONTROL_STYLE
      }
    >
      {children}
    </button>
  );
}

function NoMatches({ label }: { label: string }) {
  return (
    <GlassPanel>
      <p className="py-6 text-center text-sm text-muted">{label}</p>
    </GlassPanel>
  );
}

// ─── main ────────────────────────────────────────────────────────────────────

export function PeopleView({
  students,
  families,
  leads,
  studioTracksAttendance,
  classOptions,
  canMassEmail,
  initialTab = "students",
  serverCounts,
  serverClassNames,
}: {
  students: PeopleStudentRow[];
  families: PeopleFamilyRow[];
  leads: PeopleLeadRow[];
  studioTracksAttendance: boolean;
  classOptions: ClassOption[];
  canMassEmail: boolean;
  initialTab?: PeopleTab;
  serverCounts: Record<PeopleTab, number>;
  serverClassNames: string[];
}) {
  const t = useTranslations("admin.people");
  const tStudents = useTranslations("admin.students");
  const tParents = useTranslations("admin.parents");
  const tShared = useTranslations("admin.shared");
  const tError = useTranslations("errors.generic");
  const locale = useLocale();
  const router = useRouter();

  const searchParams = useSearchParams();
  const tab = initialTab;
  const updateFilters = (changes: Record<string, string>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) next.set(key, value);
    next.delete("page");
    router.replace(`/portal/admin/people?${next}`, { scroll: false });
  };
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const urlQuery = searchParams.get("q") ?? "";
  const submittedQuery = useRef(urlQuery);
  useEffect(() => { if (urlQuery !== submittedQuery.current) setQuery(urlQuery); }, [urlQuery]);
  useEffect(() => {
    if (query === urlQuery) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(searchParams.toString());
      submittedQuery.current = query;
      next.set("q", query); next.delete("page");
      router.replace(`/portal/admin/people?${next}`, { scroll: false });
    }, 350);
    return () => clearTimeout(timer);
  }, [query, urlQuery, searchParams, router]);
  const studentFilter = (searchParams.get("filter") ?? "all") as StudentFilter;
  const setStudentFilter = (value: string) => updateFilters({ filter: value });
  const classFilter = searchParams.get("class") ?? "all";
  const setClassFilter = (value: string) => updateFilters({ class: value });
  const familyFilter = (searchParams.get("filter") ?? "all") as FamilyFilter;
  const setFamilyFilter = (value: string) => updateFilters({ filter: value });
  const leadFilter = (searchParams.get("filter") ?? "all") as LeadFilter;
  const setLeadFilter = (value: string) => updateFilters({ filter: value });

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [studentOptions, setStudentOptions] = useState<StudentOption[]>([]);
  const [parentRows, setParentRows] = useState<Pick<ParentRow, "id" | "name" | "email">[]>([]);
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [showAddFamily, setShowAddFamily] = useState(false);
  const [showMassEmail, setShowMassEmail] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startAction] = useTransition();

  const currency = useMemo(
    () => new Intl.NumberFormat(locale, { style: "currency", currency: "NZD", maximumFractionDigits: 0 }),
    [locale],
  );

  const needle = query.trim().toLowerCase();

  const allClassNames = serverClassNames;
  const visibleStudents = students;
  const visibleFamilies = families;
  const visibleLeads = leads;
  const counts = serverCounts;
  const totalRecords = counts.students + counts.families + counts.leads;
  const shownCount = tab === "students" ? students.length : tab === "families" ? families.length : leads.length;
  const totalForTab = counts[tab];
  const isFiltered =
    needle.length > 0 ||
    (tab === "students" && (studentFilter !== "all" || classFilter !== "all")) ||
    (tab === "families" && familyFilter !== "all") ||
    (tab === "leads" && leadFilter !== "all");

  const selectedStudents = useMemo(
    () => students.filter((s) => selectedIds.includes(s.id)),
    [students, selectedIds],
  );
  useEffect(() => { setSelectedIds([]); setOpenId(null); }, [students, families, leads]);
  const allShownSelected = visibleStudents.length > 0 && visibleStudents.every((s) => selectedIds.includes(s.id));

  const switchTab = (next: PeopleTab) => {
    setQuery("");
    updateFilters({ tab: next, q: "", filter: "all", class: "all" });
    setOpenId(null);
    setSelectedIds([]);
    setNotice(null);
    setError(null);
  };

  const clearFilters = () => {
    setQuery("");
    updateFilters({ q: "", filter: "all", class: "all" });
  };

  const toggleSelectAll = () => {
    if (allShownSelected) {
      const shown = new Set(visibleStudents.map((s) => s.id));
      setSelectedIds((prev) => prev.filter((id) => !shown.has(id)));
    } else {
      setSelectedIds([...new Set([...selectedIds, ...visibleStudents.map((s) => s.id)])]);
    }
  };

  const bulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!(await confirmDialog({ title: tStudents("deleteSelectedConfirm", { count: selectedIds.length }), destructive: true }))) return;
    setNotice(null);
    setError(null);
    startAction(async () => {
      const result = await bulkDeleteStudents({ studentIds: selectedIds });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.failures.length > 0) {
        setNotice(tStudents("bulkDeletePartial", { deleted: result.deleted, failed: result.failures.length }));
        setSelectedIds(result.failures.map((f) => f.id));
      } else {
        setNotice(tStudents("bulkDeleteSuccess", { count: result.deleted }));
        setSelectedIds([]);
      }
      router.refresh();
    });
  };

  const openDirectoryPanel = (kind: "student" | "parent") => startAction(async () => {
    setError(null);
    try {
      const options = await loadPeopleOptions(kind);
      if (kind === "student") { setStudentOptions(options); setShowAddFamily(true); }
      else { setParentRows(options); setShowMassEmail(true); }
    } catch { setError(tError("body")); }
  });

  const inviteAll = async () => {
    if (!(await confirmDialog({ title: t("invite.confirm") }))) return;
    setNotice(null);
    setError(null);
    startAction(async () => {
      const res = await bulkInviteMembers();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNotice(t("invite.result", { sent: res.sent, skipped: res.skipped, failed: res.failed }));
    });
  };

  return (
    <div className="mx-auto max-w-[1180px] py-2">
      <div className="mb-5 mt-3.5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2.5 text-[9.5px] font-semibold uppercase tracking-[0.2em] text-muted">
            {t("eyebrow", { count: totalRecords })}
          </div>
          <h1 className="font-display text-[34px] font-medium leading-[1.03] tracking-tight text-ink md:text-[38px]">{t("title")}</h1>
        </div>
        <div
          className="flex gap-1.5 rounded-[14px] border p-1.5"
          style={{ background: "linear-gradient(148deg, var(--refract), transparent 42%), var(--glass)", borderColor: "var(--edge)", backdropFilter: "blur(var(--blur))" }}
        >
          {(["students", "families", "leads"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => switchTab(k)}
              className="rounded-[10px] px-3.5 py-2 text-[12.5px] font-semibold transition-all"
              style={{
                color: tab === k ? "var(--ink, var(--text))" : "var(--muted)",
                background: tab === k ? "var(--t3)" : "transparent",
                border: tab === k ? "1px solid var(--tb)" : "1px solid transparent",
              }}
            >
              {t(`tabs.${k}`)} <span className="tabular-nums opacity-70">{counts[k]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── toolbar: search · filters · actions ─────────────────────────── */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput value={query} onChange={setQuery} placeholder={t(`search.${tab}`)} />

        {tab === "students" && (
          <>
            {allClassNames.length > 0 && (
              <FilterSelect
                value={classFilter}
                onChange={setClassFilter}
                options={[
                  { value: "all", label: t("filters.allClasses") },
                  ...allClassNames.map((c) => ({ value: c, label: c })),
                ]}
              />
            )}
            <FilterSelect
              value={studentFilter}
              onChange={setStudentFilter}
              options={[
                { value: "all", label: t("filters.allStudents") },
                { value: "overdue", label: t("filters.overdue") },
                { value: "new", label: t("filters.recentlyJoined") },
                { value: "unenrolled", label: t("filters.unenrolled") },
              ]}
            />
          </>
        )}

        {tab === "families" && (
          <FilterSelect
            value={familyFilter}
            onChange={setFamilyFilter}
            options={[
              { value: "all", label: t("filters.allFamilies") },
              { value: "owing", label: t("filters.owing") },
              { value: "noChildren", label: t("filters.noChildren") },
            ]}
          />
        )}

        {tab === "leads" && (
          <FilterSelect
            value={leadFilter}
            onChange={setLeadFilter}
            options={[
              { value: "all", label: t("filters.allLeads") },
              ...LEAD_STATUSES.map((s) => ({ value: s, label: t(`leads.status.${s}`) })),
            ]}
          />
        )}

        {isFiltered && (
          <button type="button" onClick={clearFilters} className="text-[12px] font-semibold text-muted transition-colors hover:text-ink">
            {t("filters.clear")}
          </button>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {tab === "students" && (
            <ToolbarButton onClick={() => setShowAddStudent(true)} primary>
              {tStudents("addStudent")}
            </ToolbarButton>
          )}
          {tab === "families" && (
            <>
              {canMassEmail && (
                <ToolbarButton disabled={pending} onClick={() => openDirectoryPanel("parent")}>{tParents("massEmail.button")}</ToolbarButton>
              )}
              <ToolbarButton onClick={inviteAll} disabled={pending}>
                {pending ? t("invite.sending") : t("invite.button")}
              </ToolbarButton>
              <ToolbarButton disabled={pending} onClick={() => openDirectoryPanel("student")} primary>
                {tParents("addFamilyButton")}
              </ToolbarButton>
            </>
          )}
          {tab === "leads" && (
            <Link
              href="/portal/admin/leads"
              className="rounded-[12px] border px-3.5 py-2 text-[12.5px] font-semibold transition-colors"
              style={CONTROL_STYLE}
            >
              {t("leads.openBoard")}
            </Link>
          )}
        </div>
      </div>

      {isFiltered && (
        <p className="mb-2.5 text-[11.5px] text-muted">{t("showing", { shown: shownCount, total: totalForTab })}</p>
      )}

      {/* ── students bulk bar ────────────────────────────────────────────── */}
      {tab === "students" && selectedIds.length > 0 && (
        <div
          className="mb-2.5 flex flex-wrap items-center gap-2.5 rounded-[14px] border px-3.5 py-2.5"
          style={{ background: "var(--t2)", borderColor: "var(--tb)" }}
        >
          <span className="text-[12.5px] font-semibold text-ink">{tStudents("selectedCount", { count: selectedIds.length })}</span>
          <ToolbarButton onClick={() => setShowBulkEdit(true)}>{tStudents("editProfiles")}</ToolbarButton>
          <button
            type="button"
            onClick={bulkDelete}
            disabled={pending}
            className="rounded-[12px] border border-red-400/40 px-3.5 py-2 text-[12.5px] font-semibold text-red-500 transition-colors hover:bg-red-400/10 disabled:opacity-50"
          >
            {pending ? tShared("deleting") : tStudents("deleteSelected")}
          </button>
          <button type="button" onClick={() => setSelectedIds([])} className="ml-auto text-[12px] text-muted hover:text-ink">
            {tStudents("clearSelection")}
          </button>
        </div>
      )}

      {notice && (
        <p className="mb-2.5 rounded-[12px] border px-3.5 py-2 text-[12px] text-ink" style={{ background: "var(--t1)", borderColor: "var(--tb)" }}>
          {notice}
        </p>
      )}
      {error && (
        <p className="mb-2.5 rounded-[12px] border border-red-400/30 bg-red-400/10 px-3.5 py-2 text-[12px] text-red-500">{error}</p>
      )}

      {tab === "students" &&
        (students.length === 0 ? (
          <NoMatches label={t("empty.students")} />
        ) : visibleStudents.length === 0 ? (
          <NoMatches label={t("noMatches.students")} />
        ) : (
          <StudentsTable
            students={visibleStudents}
            currency={currency}
            openId={openId}
            setOpenId={setOpenId}
            studioTracksAttendance={studioTracksAttendance}
            selectedIds={selectedIds}
            onToggle={(id) => setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))}
            allShownSelected={allShownSelected}
            onToggleAll={toggleSelectAll}
          />
        ))}

      {tab === "families" &&
        (families.length === 0 ? (
          <NoMatches label={t("empty.families")} />
        ) : visibleFamilies.length === 0 ? (
          <NoMatches label={t("noMatches.families")} />
        ) : (
          <FamiliesTable families={visibleFamilies} currency={currency} openId={openId} setOpenId={setOpenId} />
        ))}

      {tab === "leads" &&
        (leads.length === 0 ? (
          <NoMatches label={t("empty.leads")} />
        ) : visibleLeads.length === 0 ? (
          <NoMatches label={t("noMatches.leads")} />
        ) : (
          <LeadsTable leads={visibleLeads} openId={openId} setOpenId={setOpenId} />
        ))}

      <AnimatePresence>
        {showAddStudent && <AddStudentPanel onClose={() => setShowAddStudent(false)} />}
        {showBulkEdit && selectedStudents.length > 0 && (
          <BulkEditStudentsPanel
            students={selectedStudents}
            onClose={() => setShowBulkEdit(false)}
            onSaved={() => {
              setNotice(tStudents("bulkUpdateSuccess", { count: selectedStudents.length }));
              setSelectedIds([]);
            }}
          />
        )}
        {showAddFamily && <AddFamilyPanel students={studentOptions} onClose={() => setShowAddFamily(false)} />}
        {showMassEmail && (
          <MassEmailParentsPanel
            parents={parentRows}
            classes={classOptions}
            onClose={() => setShowMassEmail(false)}
            onResult={setNotice}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── students ────────────────────────────────────────────────────────────────

function StudentsTable({
  students,
  currency,
  openId,
  setOpenId,
  studioTracksAttendance,
  selectedIds,
  onToggle,
  allShownSelected,
  onToggleAll,
}: {
  students: PeopleStudentRow[];
  currency: Intl.NumberFormat;
  openId: string | null;
  setOpenId: (id: string | null) => void;
  studioTracksAttendance: boolean;
  selectedIds: string[];
  onToggle: (id: string) => void;
  allShownSelected: boolean;
  onToggleAll: () => void;
}) {
  const t = useTranslations("admin.people");
  const tStudents = useTranslations("admin.students");
  const locale = useLocale();
  const dateFmt = useMemo(() => new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" }), [locale]);

  const COLS = "grid-cols-[26px_2.1fr_1.3fr_92px_108px_28px]";

  return (
    <div
      className="overflow-hidden rounded-[22px] border"
      style={{ background: "linear-gradient(148deg, var(--refract), transparent 42%), var(--glass)", borderColor: "var(--edge)", backdropFilter: "blur(var(--blur))" }}
    >
      <div className="grid grid-cols-[24px_1fr] items-center gap-2 border-b px-[18px] py-[11px]" style={{ borderColor: "var(--hair)" }}>
        <input
          type="checkbox"
          checked={allShownSelected}
          onChange={onToggleAll}
          aria-label={tStudents("selectAll")}
          className="h-3.5 w-3.5 accent-[--brand]"
        />
        <div className={`grid ${COLS} items-center gap-3.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted`}>
          <span />
          <span>{t("columns.name")}</span>
          <span>{t("columns.programme")}</span>
          <span>{t("columns.attendance")}</span>
          <span className="text-right">{t("columns.balance")}</span>
          <span />
        </div>
      </div>
      {students.map((s) => {
        const open = openId === s.id;
        return (
          <div key={s.id} className="border-b last:border-b-0" style={{ borderColor: "var(--hair)" }}>
            <div
              className="grid grid-cols-[24px_1fr] items-center gap-2 px-[18px]"
              style={{ background: open ? "var(--glass2)" : "transparent" }}
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(s.id)}
                onChange={() => onToggle(s.id)}
                aria-label={s.name ?? t("unnamed")}
                className="h-3.5 w-3.5 accent-[--brand]"
              />
              <button
                type="button"
                onMouseMove={onGlowMove}
                onMouseLeave={onGlowLeave}
                onClick={() => setOpenId(open ? null : s.id)}
                className={`relative grid w-full ${COLS} items-center gap-3.5 overflow-hidden py-[9px] text-left transition-colors`}
              >
                <div
                  className="pointer-events-none absolute inset-0 transition-opacity duration-[1300ms] ease-out"
                  style={{
                    opacity: "var(--glow-o, 0)",
                    background: "radial-gradient(260px circle at var(--mx, -300px) var(--my, -300px), var(--t2), transparent 70%)",
                  }}
                />
                <span
                  className="relative grid h-[26px] w-[26px] place-items-center rounded-[9px] text-[9.5px] font-bold text-white"
                  style={{ background: "linear-gradient(150deg, var(--tg), var(--brand))" }}
                >
                  {s.initials}
                </span>
                <span className="relative flex min-w-0 items-center gap-2">
                  <span className="truncate text-[13px] font-semibold text-ink">{s.name ?? t("unnamed")}</span>
                  {s.flag && (
                    <span
                      className="shrink-0 rounded-[5px] px-[5px] py-[3px] text-[8.5px] font-bold uppercase tracking-[0.1em]"
                      style={{ background: "var(--t2)", border: "1px solid var(--tb)", color: "var(--ink, var(--text))" }}
                    >
                      {t(`flag.${s.flag}`)}
                    </span>
                  )}
                </span>
                <span className="relative truncate text-[12.5px] text-muted">{s.programme ?? t("noProgramme")}</span>
                <span className="relative flex items-center gap-1.5">
                  {s.attendancePercent === null ? (
                    <span className="text-[11px] text-muted">{t("noAttendance")}</span>
                  ) : (
                    <>
                      <span className="h-1 w-[34px] overflow-hidden rounded-full" style={{ background: "var(--hair)" }}>
                        <span className="block h-full rounded-full" style={{ width: `${s.attendancePercent}%`, background: attendanceColor(s.attendancePercent) }} />
                      </span>
                      <span className="text-[11px] tabular-nums text-muted">{s.attendancePercent}%</span>
                    </>
                  )}
                </span>
                <span className="relative text-right font-display text-[13px] tabular-nums" style={{ color: s.balanceCents > 0 ? "#dc2626" : "var(--muted)" }}>
                  {s.balanceCents > 0 ? currency.format(s.balanceCents / 100) : "—"}
                </span>
                <span className="relative text-center text-[13px] text-muted transition-transform" style={{ transform: open ? "rotate(90deg)" : "none" }}>
                  ›
                </span>
              </button>
            </div>
            {open && (
              <div className="grid grid-cols-1 gap-4 px-[18px] pb-5 pt-1 sm:grid-cols-3" style={{ background: "linear-gradient(var(--t1), transparent)" }}>
                <div>
                  <p className="mb-2.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted">{t("expand.profile")}</p>
                  <p className="text-[12.5px] leading-[1.7] text-muted">
                    {t("expand.guardian")} · {s.guardianName ?? t("unnamed")}
                    <br />
                    {t("expand.joined")} · {dateFmt.format(new Date(s.joinedAt))}
                    <br />
                    {t("expand.nextClass")} · {s.nextClassLabel ?? t("expand.noneScheduled")}
                  </p>
                  {s.badges.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {s.badges.map((b) => (
                        <span key={b.name} className="rounded-[7px] border px-2 py-[5px] text-[10px] font-semibold text-muted" style={{ background: "var(--surface)", borderColor: "var(--hair)" }}>
                          {b.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <p className="mb-2.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted">{t("expand.attendance12")}</p>
                  {s.attendanceWeeks ? (
                    <div className="flex h-11 items-end gap-[3px]">
                      {s.attendanceWeeks.map((v, i) => (
                        <div key={i} className="flex-1 rounded-[3px]" style={{ height: `${Math.max(6, v)}%`, background: attendanceColor(v) }} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11.5px] text-muted">{studioTracksAttendance ? t("expand.noRecentAttendance") : t("expand.attendanceNotTracked")}</p>
                  )}
                </div>
                <div>
                  <p className="mb-2.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted">{t("expand.actions")}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Link href="/portal/admin/messages" className="rounded-[10px] border px-3 py-2 text-[11.5px] font-semibold text-ink transition-colors hover:bg-[--t2]" style={{ borderColor: "var(--ring)" }}>
                      {t("actions.messageGuardian")}
                    </Link>
                    <Link href={`/portal/admin/students/${s.id}`} className="rounded-[10px] border px-3 py-2 text-[11.5px] font-semibold text-ink transition-colors hover:bg-[--t2]" style={{ borderColor: "var(--ring)" }}>
                      {t("actions.viewProfile")}
                    </Link>
                    {s.balanceCents > 0 && (
                      <Link href="/portal/admin/money?tab=collections" className="rounded-[10px] border px-3 py-2 text-[11.5px] font-semibold text-ink transition-colors hover:bg-[--t2]" style={{ borderColor: "var(--ring)" }}>
                        {t("actions.chasePayment")}
                      </Link>
                    )}
                    {s.classNames.length > 0 && <DraftInvoiceButton studentId={s.id} />}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Raises a draft invoice from a student's active enrollments. The retired
 *  student slide-over was this action's only entry point. */
function DraftInvoiceButton({ studentId }: { studentId: string }) {
  const t = useTranslations("admin.students.panel");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const run = () => {
    setResult(null);
    start(async () => {
      const res = await createDraftInvoiceFromEnrollments(studentId);
      if (!res.ok) {
        setResult({ ok: false, message: res.error });
        return;
      }
      setResult(
        res.xeroError
          ? { ok: false, message: t("draftInvoiceXeroError", { error: res.xeroError }) }
          : { ok: true, message: t("draftInvoiceCreated") },
      );
      router.refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="rounded-[10px] border px-3 py-2 text-[11.5px] font-semibold text-ink transition-colors hover:bg-[--t2] disabled:opacity-50"
        style={{ borderColor: "var(--ring)" }}
      >
        {t("createDraftInvoice")}
      </button>
      {result && (
        <p className={`w-full text-[11px] ${result.ok ? "text-muted" : "text-red-500"}`}>{result.message}</p>
      )}
    </>
  );
}

// ─── families ────────────────────────────────────────────────────────────────

function FamiliesTable({
  families,
  currency,
  openId,
  setOpenId,
}: {
  families: PeopleFamilyRow[];
  currency: Intl.NumberFormat;
  openId: string | null;
  setOpenId: (id: string | null) => void;
}) {
  const t = useTranslations("admin.people");

  return (
    <div className="flex flex-col gap-2">
      {families.map((f) => {
        const open = openId === f.id;
        return (
          <GlassPanel key={f.id} className="!p-0 overflow-hidden">
            <button type="button" onClick={() => setOpenId(open ? null : f.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-[11px] font-bold text-white" style={{ background: "linear-gradient(150deg, var(--tg), var(--brand))" }}>
                {f.initials}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-semibold text-ink">{f.name ?? t("unnamed")}</p>
                <p className="truncate text-[11.5px] text-muted">{t("families.children", { count: f.childrenNames.length })}</p>
              </div>
              <span className="text-right font-display text-[13px] tabular-nums" style={{ color: f.balanceCents > 0 ? "#dc2626" : "var(--muted)" }}>
                {f.balanceCents > 0 ? currency.format(f.balanceCents / 100) : "—"}
              </span>
              <span className="w-4 text-center text-[13px] text-muted transition-transform" style={{ transform: open ? "rotate(90deg)" : "none" }}>
                ›
              </span>
            </button>
            {open && (
              <div className="border-t px-4 py-3 text-[12.5px] leading-[1.7] text-muted" style={{ borderColor: "var(--hair)" }}>
                {f.childrenNames.length > 0 && <p>{t("families.childrenList")} · {f.childrenNames.join(", ")}</p>}
                {f.email && <p>{f.email}</p>}
                {f.phone && <p>{f.phone}</p>}
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <Link href="/portal/admin/messages" className="rounded-[10px] border px-3 py-2 text-[11.5px] font-semibold text-ink transition-colors hover:bg-[--t2]" style={{ borderColor: "var(--ring)" }}>
                    {t("actions.message")}
                  </Link>
                  <Link href={`/portal/admin/parents/${f.id}`} className="rounded-[10px] border px-3 py-2 text-[11.5px] font-semibold text-ink transition-colors hover:bg-[--t2]" style={{ borderColor: "var(--ring)" }}>
                    {t("actions.viewProfile")}
                  </Link>
                </div>
              </div>
            )}
          </GlassPanel>
        );
      })}
    </div>
  );
}

// ─── leads ───────────────────────────────────────────────────────────────────

function LeadsTable({
  leads,
  openId,
  setOpenId,
}: {
  leads: PeopleLeadRow[];
  openId: string | null;
  setOpenId: (id: string | null) => void;
}) {
  const t = useTranslations("admin.people");
  const locale = useLocale();
  const dateFmt = useMemo(() => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }), [locale]);

  return (
    <div className="flex flex-col gap-2">
      {leads.map((l) => {
        const open = openId === l.id;
        return (
          <GlassPanel key={l.id} className="!p-0 overflow-hidden">
            <button type="button" onClick={() => setOpenId(open ? null : l.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-semibold text-ink">{l.name}</p>
                <p className="truncate text-[11.5px] text-muted">
                  {l.source ?? t("leads.unknownSource")} · {dateFmt.format(new Date(l.createdAt))}
                </p>
              </div>
              <span
                className="shrink-0 rounded-[7px] px-2 py-[5px] text-[10.5px] font-semibold"
                style={{ background: "var(--t2)", border: "1px solid var(--tb)", color: "var(--ink, var(--text))" }}
              >
                {t(`leads.status.${l.status}`)}
              </span>
              <span className="w-4 text-center text-[13px] text-muted transition-transform" style={{ transform: open ? "rotate(90deg)" : "none" }}>
                ›
              </span>
            </button>
            {open && (
              <div className="border-t px-4 py-3 text-[12.5px] leading-[1.7] text-muted" style={{ borderColor: "var(--hair)" }}>
                {l.email && <p>{l.email}</p>}
                {l.phone && <p>{l.phone}</p>}
                {l.notes && <p className="mt-1.5">{l.notes}</p>}
                <div className="mt-2.5">
                  <Link href="/portal/admin/leads" className="rounded-[10px] border px-3 py-2 text-[11.5px] font-semibold text-ink transition-colors hover:bg-[--t2]" style={{ borderColor: "var(--ring)" }}>
                    {t("leads.openBoard")}
                  </Link>
                </div>
              </div>
            )}
          </GlassPanel>
        );
      })}
    </div>
  );
}
