"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import AddStaffPanel from "@/components/admin/staff/AddStaffPanel";
import StaffCalendar from "@/components/admin/staff/StaffCalendar";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";
import type { StaffOption, StaffRow, StaffShift, TeachingBlock } from "@/lib/staff/types";

function initials(name: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

function StaffCard({ member }: { member: StaffRow }) {
  const t = useTranslations("admin.staff");
  const tShared = useTranslations("admin.shared");

  return (
    <GlassPanel className="!p-0 overflow-hidden transition-shadow hover:shadow-md">
      <Link href={`/portal/admin/staff/${member.id}`} className="block p-4">
        <div className="mb-3 flex items-center gap-3">
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-black text-white"
            style={{ background: "var(--brand)" }}
          >
            {initials(member.name)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="truncate font-semibold text-ink">{member.name ?? tShared("unknown")}</p>
              <span className="shrink-0 rounded-full bg-brand/15 px-1.5 py-0.5 text-[0.55rem] font-semibold uppercase tracking-wider text-brand">
                {t(`roles.${member.role}`)}
              </span>
              {!member.active && (
                <span className="shrink-0 rounded-full bg-red-500/10 px-1.5 py-0.5 text-[0.55rem] font-semibold uppercase text-red-600">
                  {t("inactive")}
                </span>
              )}
            </div>
            <p className="truncate text-xs text-muted">
              {member.email ?? member.phone ?? tShared("noContact")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[0.62rem] text-muted">
          {member.employmentType && (
            <span className="rounded-full border border-[--hair] px-2 py-0.5">
              {t(`employment.${member.employmentType}`)}
            </span>
          )}
          {member.workLocation && (
            <span className="rounded-full border border-[--hair] px-2 py-0.5">
              {t(`workLocationOptions.${member.workLocation}`)}
            </span>
          )}
          {member.managerName && (
            <span className="rounded-full border border-[--hair] px-2 py-0.5">
              {t("reportsTo", { name: member.managerName })}
            </span>
          )}
        </div>
      </Link>
    </GlassPanel>
  );
}

export default function StaffManager({
  staff,
  shifts,
  teachingBlocks,
  staffOptions,
  managerOptions,
  locations,
  weekStart,
  loadError,
}: {
  staff: StaffRow[];
  shifts: StaffShift[];
  teachingBlocks: TeachingBlock[];
  staffOptions: StaffOption[];
  managerOptions: StaffOption[];
  locations: string[];
  weekStart: string;
  loadError?: string | null;
}) {
  const t = useTranslations("admin.staff");
  const [activeTab, setActiveTab] = useState<"roster" | "calendar">("roster");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const filtered = staff.filter(
    (s) =>
      !search ||
      (s.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (s.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (s.managerName ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-6xl space-y-6 p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-ink">{t("title")}</h1>
          <p className="text-sm text-muted">{t("subtitle", { count: staff.length })}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="rounded-xl px-4 py-2.5 text-sm font-bold text-white"
          style={{ background: "var(--brand)" }}
        >
          {t("addStaff")}
        </button>
      </div>

      {loadError && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
        </p>
      )}

      <div className="flex gap-1 rounded-xl border border-[--hair] bg-base p-1 w-fit">
        {(["roster", "calendar"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              activeTab === tab ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
            }`}
          >
            {t(`tabs.${tab}`)}
          </button>
        ))}
      </div>

      {activeTab === "roster" ? (
        <>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full max-w-sm rounded-xl border border-[--hair] bg-surface px-4 py-2.5 text-sm text-ink"
          />
          {filtered.length === 0 ? (
            <GlassPanel>
              <p className="py-12 text-center text-sm text-muted">{t("empty")}</p>
            </GlassPanel>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((member) => (
                <StaffCard key={member.id} member={member} />
              ))}
            </div>
          )}
        </>
      ) : (
        <StaffCalendar
          shifts={shifts}
          teachingBlocks={teachingBlocks}
          staffOptions={staffOptions}
          locations={locations}
          weekStart={weekStart}
        />
      )}

      {showAdd && (
        <AddStaffPanel
          managerOptions={managerOptions}
          locations={locations}
          onClose={() => setShowAdd(false)}
        />
      )}
    </motion.div>
  );
}
