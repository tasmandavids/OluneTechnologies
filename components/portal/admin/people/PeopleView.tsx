"use client";

// ============================================================================
//  PeopleView — Students / Families / Leads segmented directory. One row
//  expands at a time. Each tab links out to its full manager (/students,
//  /parents, /leads) for bulk actions, enrollment, and the leads Kanban.
// ============================================================================

import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";
import { onGlowMove, onGlowLeave } from "@/components/portal/admin/glass/useMicroInteractions";
import type { PeopleStudentRow, PeopleFamilyRow, PeopleLeadRow } from "./types";

type Tab = "students" | "families" | "leads";

function attendanceColor(pct: number): string {
  if (pct >= 88) return "var(--brand)";
  if (pct >= 75) return "var(--ink, var(--text))";
  return "var(--muted)";
}

export function PeopleView({
  students,
  families,
  leads,
  studioTracksAttendance,
}: {
  students: PeopleStudentRow[];
  families: PeopleFamilyRow[];
  leads: PeopleLeadRow[];
  studioTracksAttendance: boolean;
}) {
  const t = useTranslations("admin.people");
  const locale = useLocale();
  const [tab, setTab] = useState<Tab>("students");
  const [openId, setOpenId] = useState<string | null>(null);

  const currency = useMemo(
    () => new Intl.NumberFormat(locale, { style: "currency", currency: "NZD", maximumFractionDigits: 0 }),
    [locale],
  );

  const counts: Record<Tab, number> = { students: students.length, families: families.length, leads: leads.length };
  const totalRecords = students.length + families.length + leads.length;

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
              onClick={() => {
                setTab(k);
                setOpenId(null);
              }}
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

      {tab === "students" && (
        <StudentsTable students={students} currency={currency} openId={openId} setOpenId={setOpenId} studioTracksAttendance={studioTracksAttendance} />
      )}
      {tab === "families" && <FamiliesTable families={families} currency={currency} openId={openId} setOpenId={setOpenId} />}
      {tab === "leads" && <LeadsTable leads={leads} openId={openId} setOpenId={setOpenId} />}

      <p className="mt-4 text-[11.5px] text-muted">
        {t("openManagerHint")}{" "}
        <Link href={tab === "students" ? "/portal/admin/students" : tab === "families" ? "/portal/admin/parents" : "/portal/admin/leads"} className="font-semibold text-ink hover:underline">
          {t(`openManager.${tab}`)} →
        </Link>
      </p>
    </div>
  );
}

function StudentsTable({
  students,
  currency,
  openId,
  setOpenId,
  studioTracksAttendance,
}: {
  students: PeopleStudentRow[];
  currency: Intl.NumberFormat;
  openId: string | null;
  setOpenId: (id: string | null) => void;
  studioTracksAttendance: boolean;
}) {
  const t = useTranslations("admin.people");
  const locale = useLocale();
  const dateFmt = useMemo(() => new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" }), [locale]);

  if (students.length === 0) {
    return (
      <GlassPanel>
        <p className="py-6 text-center text-sm text-muted">{t("empty.students")}</p>
      </GlassPanel>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-[22px] border"
      style={{ background: "linear-gradient(148deg, var(--refract), transparent 42%), var(--glass)", borderColor: "var(--edge)", backdropFilter: "blur(var(--blur))" }}
    >
      <div className="grid grid-cols-[26px_2.1fr_1.3fr_92px_108px_28px] items-center gap-3.5 border-b px-[18px] py-[11px] text-[9px] font-semibold uppercase tracking-[0.14em] text-muted" style={{ borderColor: "var(--hair)" }}>
        <span />
        <span>{t("columns.name")}</span>
        <span>{t("columns.programme")}</span>
        <span>{t("columns.attendance")}</span>
        <span className="text-right">{t("columns.balance")}</span>
        <span />
      </div>
      {students.map((s) => {
        const open = openId === s.id;
        return (
          <div key={s.id} className="border-b last:border-b-0" style={{ borderColor: "var(--hair)" }}>
            <button
              type="button"
              onMouseMove={onGlowMove}
              onMouseLeave={onGlowLeave}
              onClick={() => setOpenId(open ? null : s.id)}
              className="relative grid w-full grid-cols-[26px_2.1fr_1.3fr_92px_108px_28px] items-center gap-3.5 overflow-hidden px-[18px] py-[9px] text-left transition-colors"
              style={{ background: open ? "var(--glass2)" : "transparent" }}
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

  if (families.length === 0) {
    return (
      <GlassPanel>
        <p className="py-6 text-center text-sm text-muted">{t("empty.families")}</p>
      </GlassPanel>
    );
  }

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

  if (leads.length === 0) {
    return (
      <GlassPanel>
        <p className="py-6 text-center text-sm text-muted">{t("empty.leads")}</p>
      </GlassPanel>
    );
  }

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
