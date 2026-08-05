"use client";

import { confirmDialog, toast } from "@/lib/feedback";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import {
  createStaffShift,
  deleteStaffMember,
  deleteStaffShift,
  setStaffActive,
  updateStaffMember,
  updateStaffProfile,
} from "@/app/portal/admin/staff/actions";
import type {
  StaffDetail,
  StaffEmploymentType,
  StaffOption,
  StaffPortalRole,
  StaffShift,
  StaffWorkLocation,
} from "@/lib/staff/types";
import { EMPLOYMENT_TYPES, STAFF_PORTAL_ROLES, WORK_LOCATIONS } from "@/lib/staff/types";
import { formatTimeShort } from "@/lib/i18n/format";
import { useLocale } from "next-intl";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";

type Tab = "profile" | "employment" | "contract" | "shifts";

export default function StaffDetailHub({
  staff,
  shifts,
  managerOptions,
  locations,
}: {
  staff: StaffDetail;
  shifts: StaffShift[];
  managerOptions: StaffOption[];
  locations: string[];
}) {
  const t = useTranslations("admin.staff.detail");
  const tStaff = useTranslations("admin.staff");
  const tShared = useTranslations("admin.shared");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("profile");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [profileForm, setProfileForm] = useState({
    fullName: staff.name ?? "",
    email: staff.email ?? "",
    phone: staff.phone ?? "",
    role: staff.role,
  });

  const [employmentForm, setEmploymentForm] = useState({
    employmentType: staff.employmentType ?? "",
    workLocation: staff.workLocation ?? "",
    locationNames: staff.locationNames,
    scheduleNotes: staff.scheduleNotes ?? "",
    managerId: staff.managerId ?? "",
    startDate: staff.startDate ?? "",
    endDate: staff.endDate ?? "",
    active: staff.active,
  });

  const [contractForm, setContractForm] = useState({
    contractNotes: staff.contractNotes ?? "",
    payNotes: staff.payNotes ?? "",
  });

  const [shiftDraft, setShiftDraft] = useState({
    shiftDate: "",
    startTime: "09:00",
    endTime: "17:00",
    locationName: locations[0] ?? "",
    notes: "",
  });

  const tabs: { id: Tab; label: string }[] = [
    { id: "profile", label: t("tabs.profile") },
    { id: "employment", label: t("tabs.employment") },
    { id: "contract", label: t("tabs.contract") },
    { id: "shifts", label: t("tabs.shifts") },
  ];

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
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
    });
  };

  const toggleLocation = (name: string) => {
    setEmploymentForm((f) => ({
      ...f,
      locationNames: f.locationNames.includes(name)
        ? f.locationNames.filter((n) => n !== name)
        : [...f.locationNames, name],
    }));
  };

  const saveProfile = () =>
    run(() =>
      updateStaffProfile({
        id: staff.id,
        fullName: profileForm.fullName,
        email: profileForm.email,
        phone: profileForm.phone,
        role: profileForm.role,
      }),
    );

  const saveEmployment = () =>
    run(() =>
      updateStaffMember({
        id: staff.id,
        fullName: profileForm.fullName,
        phone: profileForm.phone,
        role: profileForm.role,
        employmentType: (employmentForm.employmentType || null) as StaffEmploymentType | null,
        workLocation: (employmentForm.workLocation || null) as StaffWorkLocation | null,
        locationNames: employmentForm.locationNames,
        scheduleNotes: employmentForm.scheduleNotes,
        contractNotes: contractForm.contractNotes,
        payNotes: contractForm.payNotes,
        managerId: employmentForm.managerId || null,
        startDate: employmentForm.startDate || null,
        endDate: employmentForm.endDate || null,
        active: employmentForm.active,
      }),
    );

  const saveContract = () =>
    run(() =>
      updateStaffMember({
        id: staff.id,
        fullName: profileForm.fullName,
        phone: profileForm.phone,
        role: profileForm.role,
        employmentType: (employmentForm.employmentType || null) as StaffEmploymentType | null,
        workLocation: (employmentForm.workLocation || null) as StaffWorkLocation | null,
        locationNames: employmentForm.locationNames,
        scheduleNotes: employmentForm.scheduleNotes,
        contractNotes: contractForm.contractNotes,
        payNotes: contractForm.payNotes,
        managerId: employmentForm.managerId || null,
        startDate: employmentForm.startDate || null,
        endDate: employmentForm.endDate || null,
        active: employmentForm.active,
      }),
    );

  const addShift = () =>
    run(async () => {
      if (!shiftDraft.shiftDate) return { ok: false, error: t("shiftDateRequired") };
      return createStaffShift({
        staffId: staff.id,
        shiftDate: shiftDraft.shiftDate,
        startTime: shiftDraft.startTime,
        endTime: shiftDraft.endTime,
        locationName: shiftDraft.locationName,
        notes: shiftDraft.notes,
      });
    });

  const toggleActive = () =>
    run(() => setStaffActive(staff.id, !employmentForm.active));

  const removeStaff = async () => {
    if (!(await confirmDialog({ title: t("deleteConfirm", { name: staff.name ?? tShared("unknown") }), destructive: true }))) return;
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await deleteStaffMember(staff.id);
      if (!result.ok) {
        setError(result.error ?? tShared("somethingWentWrong"));
        return;
      }
      toast.success(tShared("deleted"));
      router.push("/portal/admin/staff");
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-3xl space-y-6 p-6"
    >
      <div>
        <Link href="/portal/admin/staff" className="text-sm text-muted hover:text-ink">
          ← {t("back")}
        </Link>
        <h1 className="mt-2 text-2xl font-black text-ink">{staff.name ?? tShared("unknown")}</h1>
        <p className="text-sm text-muted">
          {tStaff(`roles.${staff.role}`)}
          {staff.managerName ? ` · ${tStaff("reportsTo", { name: staff.managerName })}` : ""}
        </p>
      </div>

      {(error || success) && (
        <p className={`text-sm ${error ? "text-red-600" : "text-green-600"}`}>{error ?? success}</p>
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
        <GlassPanel className="space-y-4 !p-5">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-muted">
              {tCommon("name")}
            </label>
            <input
              value={profileForm.fullName}
              onChange={(e) => setProfileForm({ ...profileForm, fullName: e.target.value })}
              className="w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-muted">
                {tCommon("email")}
              </label>
              <input
                value={profileForm.email}
                disabled
                className="w-full rounded-lg border border-[--hair] bg-base/50 px-3 py-2 text-sm text-muted"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-muted">
                {tCommon("phone")}
              </label>
              <input
                value={profileForm.phone}
                onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                className="w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-muted">
              {tStaff("add.role")}
            </label>
            <select
              value={profileForm.role}
              onChange={(e) =>
                setProfileForm({ ...profileForm, role: e.target.value as StaffPortalRole })
              }
              className="w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm"
            >
              {STAFF_PORTAL_ROLES.map((r) => (
                <option key={r} value={r}>
                  {tStaff(`roles.${r}`)}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={saveProfile}
            className="rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
            style={{ background: "var(--brand)" }}
          >
            {pending ? tShared("saving") : tCommon("save")}
          </button>
        </GlassPanel>
      )}

      {tab === "employment" && (
        <GlassPanel className="space-y-4 !p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-muted">
                {tStaff("add.employmentType")}
              </label>
              <select
                value={employmentForm.employmentType}
                onChange={(e) =>
                  setEmploymentForm({
                    ...employmentForm,
                    employmentType: e.target.value as StaffEmploymentType | "",
                  })
                }
                className="w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm"
              >
                <option value="">{tShared("none")}</option>
                {EMPLOYMENT_TYPES.map((et) => (
                  <option key={et} value={et}>
                    {tStaff(`employment.${et}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-muted">
                {tStaff("add.workLocation")}
              </label>
              <select
                value={employmentForm.workLocation}
                onChange={(e) =>
                  setEmploymentForm({
                    ...employmentForm,
                    workLocation: e.target.value as StaffWorkLocation | "",
                  })
                }
                className="w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm"
              >
                <option value="">{tShared("none")}</option>
                {WORK_LOCATIONS.map((wl) => (
                  <option key={wl} value={wl}>
                    {tStaff(`workLocationOptions.${wl}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-muted">
              {tStaff("add.manager")}
            </label>
            <select
              value={employmentForm.managerId}
              onChange={(e) => setEmploymentForm({ ...employmentForm, managerId: e.target.value })}
              className="w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm"
            >
              <option value="">{tShared("unassignedOption")}</option>
              {managerOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name ?? tShared("unknown")}
                </option>
              ))}
            </select>
          </div>
          {locations.length > 0 && (
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase text-muted">
                {tStaff("add.locations")}
              </label>
              <div className="flex flex-wrap gap-2">
                {locations.map((loc) => (
                  <button
                    key={loc}
                    type="button"
                    onClick={() => toggleLocation(loc)}
                    className={`rounded-full border px-3 py-1 text-xs ${
                      employmentForm.locationNames.includes(loc)
                        ? "border-brand bg-brand/15 text-brand"
                        : "border-[--hair] text-muted"
                    }`}
                  >
                    {loc}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-muted">
                {tStaff("add.startDate")}
              </label>
              <input
                type="date"
                value={employmentForm.startDate}
                onChange={(e) =>
                  setEmploymentForm({ ...employmentForm, startDate: e.target.value })
                }
                className="w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-muted">
                {t("endDate")}
              </label>
              <input
                type="date"
                value={employmentForm.endDate}
                onChange={(e) =>
                  setEmploymentForm({ ...employmentForm, endDate: e.target.value })
                }
                className="w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-muted">
              {tStaff("add.scheduleNotes")}
            </label>
            <textarea
              rows={3}
              value={employmentForm.scheduleNotes}
              onChange={(e) =>
                setEmploymentForm({ ...employmentForm, scheduleNotes: e.target.value })
              }
              className="w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={saveEmployment}
              className="rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
              style={{ background: "var(--brand)" }}
            >
              {pending ? tShared("saving") : tCommon("save")}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={toggleActive}
              className="rounded-xl border border-[--hair] px-4 py-2 text-sm text-muted"
            >
              {employmentForm.active ? t("deactivate") : t("reactivate")}
            </button>
          </div>
        </GlassPanel>
      )}

      {tab === "contract" && (
        <GlassPanel className="space-y-4 !p-5">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-muted">
              {t("contractNotes")}
            </label>
            <textarea
              rows={4}
              value={contractForm.contractNotes}
              onChange={(e) =>
                setContractForm({ ...contractForm, contractNotes: e.target.value })
              }
              className="w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-muted">
              {t("payNotes")}
            </label>
            <textarea
              rows={4}
              value={contractForm.payNotes}
              onChange={(e) => setContractForm({ ...contractForm, payNotes: e.target.value })}
              className="w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={saveContract}
            className="rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
            style={{ background: "var(--brand)" }}
          >
            {pending ? tShared("saving") : tCommon("save")}
          </button>
        </GlassPanel>
      )}

      {tab === "shifts" && (
        <div className="space-y-4">
          <GlassPanel className="!p-5">
            <h3 className="mb-3 font-semibold text-ink">{t("addShift")}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                type="date"
                value={shiftDraft.shiftDate}
                onChange={(e) => setShiftDraft({ ...shiftDraft, shiftDate: e.target.value })}
                className="rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm"
              />
              <input
                type="time"
                value={shiftDraft.startTime}
                onChange={(e) => setShiftDraft({ ...shiftDraft, startTime: e.target.value })}
                className="rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm"
              />
              <input
                type="time"
                value={shiftDraft.endTime}
                onChange={(e) => setShiftDraft({ ...shiftDraft, endTime: e.target.value })}
                className="rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm"
              />
              {locations.length > 0 && (
                <select
                  value={shiftDraft.locationName}
                  onChange={(e) =>
                    setShiftDraft({ ...shiftDraft, locationName: e.target.value })
                  }
                  className="rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm"
                >
                  {locations.map((loc) => (
                    <option key={loc} value={loc}>
                      {loc}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={addShift}
              className="mt-3 rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
              style={{ background: "var(--brand)" }}
            >
              {t("addShift")}
            </button>
          </GlassPanel>
          <GlassPanel className="!p-0 overflow-hidden">
            <ul className="divide-y divide-[--hair]">
              {shifts.length === 0 ? (
                <li className="px-5 py-8 text-center text-sm text-muted">{t("noShifts")}</li>
              ) : (
                shifts.map((shift) => (
                <li
                  key={shift.id}
                  className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
                >
                  <div>
                    <p className="font-medium text-ink">{shift.shiftDate}</p>
                    <p className="text-muted">
                      {formatTimeShort(shift.startTime, locale)}–{formatTimeShort(shift.endTime, locale)}
                      {shift.locationName ? ` · ${shift.locationName}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(() => deleteStaffShift(shift.id))
                    }
                    className="text-xs text-red-600"
                  >
                    {tCommon("delete")}
                  </button>
                </li>
                ))
              )}
            </ul>
          </GlassPanel>
        </div>
      )}

      <section className="rounded-2xl border border-red-400/30 bg-red-400/5 p-5">
        <h3 className="mb-1 text-sm font-semibold text-red-600">{t("dangerZone")}</h3>
        <p className="mb-3 text-sm text-muted">{t("deleteDescription")}</p>
        <button
          type="button"
          disabled={pending}
          onClick={removeStaff}
          className="rounded-xl border border-red-400/40 px-4 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-400/10 disabled:opacity-60"
        >
          {pending ? tShared("deleting") : t("deleteStaff")}
        </button>
      </section>
    </motion.div>
  );
}
