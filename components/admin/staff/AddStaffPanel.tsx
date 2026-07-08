"use client";

import { panelSlide } from "@/lib/motion";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { createStaffMember } from "@/app/portal/admin/staff/actions";
import type {
  StaffEmploymentType,
  StaffOption,
  StaffPortalRole,
  StaffWorkLocation,
} from "@/lib/staff/types";
import { EMPLOYMENT_TYPES, STAFF_PORTAL_ROLES, WORK_LOCATIONS } from "@/lib/staff/types";

type FormState = {
  fullName: string;
  email: string;
  phone: string;
  role: StaffPortalRole;
  employmentType: StaffEmploymentType | "";
  workLocation: StaffWorkLocation | "";
  locationNames: string[];
  scheduleNotes: string;
  contractNotes: string;
  payNotes: string;
  managerId: string;
  startDate: string;
};

const emptyForm = (): FormState => ({
  fullName: "",
  email: "",
  phone: "",
  role: "teacher",
  employmentType: "",
  workLocation: "",
  locationNames: [],
  scheduleNotes: "",
  contractNotes: "",
  payNotes: "",
  managerId: "",
  startDate: "",
});

export default function AddStaffPanel({
  managerOptions,
  locations,
  onClose,
}: {
  managerOptions: StaffOption[];
  locations: string[];
  onClose: () => void;
}) {
  const t = useTranslations("admin.staff.add");
  const tShared = useTranslations("admin.shared");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const toggleLocation = (name: string) => {
    setForm((f) => ({
      ...f,
      locationNames: f.locationNames.includes(name)
        ? f.locationNames.filter((n) => n !== name)
        : [...f.locationNames, name],
    }));
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createStaffMember({
        fullName: form.fullName,
        email: form.email,
        phone: form.phone,
        role: form.role,
        employmentType: form.employmentType || null,
        workLocation: form.workLocation || null,
        locationNames: form.locationNames,
        scheduleNotes: form.scheduleNotes,
        contractNotes: form.contractNotes,
        payNotes: form.payNotes,
        managerId: form.managerId || null,
        startDate: form.startDate || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
      onClose();
      if (result.id) router.push(`/portal/admin/staff/${result.id}`);
    });
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          {...panelSlide}
          className="flex h-full w-full max-w-md flex-col border-l border-[--hair] bg-surface shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-[--hair] px-5 py-4">
            <h2 className="text-lg font-bold text-ink">{t("title")}</h2>
            <button type="button" onClick={onClose} className="text-muted hover:text-ink">
              {tShared("close")}
            </button>
          </div>

          <form onSubmit={onSubmit} className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {error && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              )}

              <div>
                <label className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
                  {tCommon("name")}
                </label>
                <input
                  required
                  value={form.fullName}
                  onChange={(e) => set("fullName", e.target.value)}
                  className="w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm text-ink"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
                    {tCommon("email")}
                  </label>
                  <input
                    required
                    type="email"
                    value={form.email}
                    onChange={(e) => set("email", e.target.value)}
                    className="w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm text-ink"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
                    {tCommon("phone")}
                  </label>
                  <input
                    value={form.phone}
                    onChange={(e) => set("phone", e.target.value)}
                    className="w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm text-ink"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
                  {t("role")}
                </label>
                <select
                  value={form.role}
                  onChange={(e) => set("role", e.target.value as StaffPortalRole)}
                  className="w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm text-ink"
                >
                  {STAFF_PORTAL_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {t(`roles.${r}`)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
                    {t("employmentType")}
                  </label>
                  <select
                    value={form.employmentType}
                    onChange={(e) =>
                      set("employmentType", e.target.value as StaffEmploymentType | "")
                    }
                    className="w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm text-ink"
                  >
                    <option value="">{tShared("none")}</option>
                    {EMPLOYMENT_TYPES.map((et) => (
                      <option key={et} value={et}>
                        {t(`employment.${et}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
                    {t("workLocation")}
                  </label>
                  <select
                    value={form.workLocation}
                    onChange={(e) =>
                      set("workLocation", e.target.value as StaffWorkLocation | "")
                    }
                    className="w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm text-ink"
                  >
                    <option value="">{tShared("none")}</option>
                    {WORK_LOCATIONS.map((wl) => (
                      <option key={wl} value={wl}>
                        {t(`workLocationOptions.${wl}`)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
                  {t("manager")}
                </label>
                <select
                  value={form.managerId}
                  onChange={(e) => set("managerId", e.target.value)}
                  className="w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm text-ink"
                >
                  <option value="">{tShared("unassignedOption")}</option>
                  {managerOptions.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name ?? tShared("unknown")} ({t(`roles.${m.role}`)})
                    </option>
                  ))}
                </select>
              </div>

              {locations.length > 0 && (
                <div>
                  <label className="mb-2 block text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
                    {t("locations")}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {locations.map((loc) => (
                      <button
                        key={loc}
                        type="button"
                        onClick={() => toggleLocation(loc)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                          form.locationNames.includes(loc)
                            ? "border-brand bg-brand/15 text-brand"
                            : "border-[--hair] text-muted hover:text-ink"
                        }`}
                      >
                        {loc}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
                  {t("startDate")}
                </label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => set("startDate", e.target.value)}
                  className="w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm text-ink"
                />
              </div>

              <div>
                <label className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
                  {t("scheduleNotes")}
                </label>
                <textarea
                  rows={2}
                  value={form.scheduleNotes}
                  onChange={(e) => set("scheduleNotes", e.target.value)}
                  className="w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm text-ink"
                />
              </div>
            </div>

            <div className="border-t border-[--hair] p-5">
              <button
                type="submit"
                disabled={pending}
                className="w-full rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-60"
                style={{ background: "var(--brand)" }}
              >
                {pending ? tShared("adding") : t("submit")}
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
