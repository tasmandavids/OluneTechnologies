"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import {
  updateStudioName,
  updateSiblingDiscount,
  updateFamilyRetailDiscount,
  updateStudioTimezone,
  updateStudioRegistration,
} from "@/app/portal/admin/settings/actions";
import PortalEmbed from "@/components/admin/PortalEmbed";
import BillingPeriodSettings, { type StudioTermInfo } from "@/components/admin/BillingPeriodSettings";

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "olune.app";

const TIMEZONES = [
  "Pacific/Auckland",
  "Australia/Sydney",
  "Australia/Perth",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Dubai",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "UTC",
];

type StudioInfo = {
  id: string;
  name: string;
  slug: string;
  customDomain: string | null;
  status: string;
  createdAt: string;
  siblingDiscountPct: number;
  familyDiscountOnRetail: boolean;
  timezone: string;
  registrationEnabled: boolean;
  registrationRoles: string[];
  billingPeriod: "monthly" | "termly";
};

export default function AdminSettings({
  studio,
  terms,
}: {
  studio: StudioInfo | null;
  terms: StudioTermInfo[];
}) {
  const t = useTranslations("admin.settings");
  const tShared = useTranslations("admin.shared");
  const tStatus = useTranslations("admin.shared.status");

  const [name, setName] = useState(studio?.name ?? "");
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  const [discount, setDiscount] = useState(String(studio?.siblingDiscountPct ?? 0));
  const [discountPending, startDiscountTransition] = useTransition();
  const [discountStatus, setDiscountStatus] = useState<string | null>(null);

  const [retailDiscount, setRetailDiscount] = useState(studio?.familyDiscountOnRetail ?? false);
  const [retailPending, startRetailTransition] = useTransition();
  const [retailStatus, setRetailStatus] = useState<string | null>(null);

  const [timezone, setTimezone] = useState(studio?.timezone ?? "Pacific/Auckland");
  const [tzPending, startTzTransition] = useTransition();
  const [tzStatus, setTzStatus] = useState<string | null>(null);

  const [registrationEnabled, setRegistrationEnabled] = useState(studio?.registrationEnabled ?? false);
  const [regRoles, setRegRoles] = useState<string[]>(studio?.registrationRoles ?? ["parent", "student"]);
  const [regPending, startRegTransition] = useTransition();
  const [regStatus, setRegStatus] = useState<string | null>(null);

  const onSave = () =>
    startTransition(async () => {
      const res = await updateStudioName({ name });
      setStatus(res.ok ? "saved" : res.ok === false ? res.error : "error");
      setTimeout(() => setStatus(null), 2500);
    });

  const onSaveDiscount = () =>
    startDiscountTransition(async () => {
      const res = await updateSiblingDiscount({ pct: Number(discount) });
      setDiscountStatus(res.ok ? "saved" : res.error);
      setTimeout(() => setDiscountStatus(null), 2500);
    });

  const onToggleRetail = (enabled: boolean) => {
    setRetailDiscount(enabled);
    startRetailTransition(async () => {
      const res = await updateFamilyRetailDiscount({ enabled });
      if (!res.ok) {
        setRetailDiscount(!enabled);
        setRetailStatus(res.error);
      } else {
        setRetailStatus("saved");
      }
      setTimeout(() => setRetailStatus(null), 2500);
    });
  };

  const onSaveTimezone = () =>
    startTzTransition(async () => {
      const res = await updateStudioTimezone({ timezone });
      setTzStatus(res.ok ? "saved" : res.error);
      setTimeout(() => setTzStatus(null), 2500);
    });

  const onSaveRegistration = () =>
    startRegTransition(async () => {
      const res = await updateStudioRegistration({
        enabled: registrationEnabled,
        roles: regRoles.filter((r): r is "parent" | "student" => r === "parent" || r === "student"),
      });
      setRegStatus(res.ok ? "saved" : res.error);
      setTimeout(() => setRegStatus(null), 2500);
    });

  const toggleRegRole = (role: "parent" | "student") => {
    setRegRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  };

  if (!studio) {
    return (
      <div className="grid min-h-screen place-items-center p-8 text-ink">
        <p className="text-sm text-muted">{t("notFound")}</p>
      </div>
    );
  }

  const statusLabel =
    studio.status in { active: 1, trial: 1, canceled: 1, lost: 1 }
      ? tStatus(studio.status as "active")
      : studio.status;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="mx-auto max-w-2xl space-y-10 p-6"
    >
      <header>
        <h1 className="text-xl font-bold text-ink">{t("title")}</h1>
        <p className="text-sm text-muted">{t("subtitle")}</p>
      </header>

      <section className="space-y-6 rounded-2xl border border-[--hair] bg-surface p-6">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted">{t("identity")}</h2>

        <div className="space-y-2">
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-ink">{t("studioName")}</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="field-premium"
              placeholder={t("studioNamePlaceholder")}
            />
          </label>
          <div className="flex items-center gap-3">
            <button
              onClick={onSave}
              disabled={pending || !name.trim() || name.trim() === studio.name}
              className="btn-glow btn-glow--solid px-5 py-2 text-sm disabled:opacity-50"
            >
              {pending ? tShared("saving") : t("saveName")}
            </button>
            {status && (
              <p
                className="text-sm"
                style={{ color: status === "saved" ? "var(--brand-hot)" : "#ef4444" }}
              >
                {status === "saved" ? t("nameUpdated") : status}
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-6 rounded-2xl border border-[--hair] bg-surface p-6">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted">{t("billing")}</h2>
          <p className="mt-1 text-sm text-muted">{t("siblingDiscountDescription")}</p>
        </div>

        <div className="space-y-2">
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-ink">{t("siblingDiscount")}</span>
            <input
              type="number"
              min={0}
              max={100}
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              className="field-premium"
              placeholder={t("siblingDiscountPlaceholder")}
            />
          </label>
          <div className="flex items-center gap-3">
            <button
              onClick={onSaveDiscount}
              disabled={
                discountPending ||
                discount.trim() === "" ||
                Number(discount) === studio.siblingDiscountPct
              }
              className="btn-glow btn-glow--solid px-5 py-2 text-sm disabled:opacity-50"
            >
              {discountPending ? tShared("saving") : t("saveDiscount")}
            </button>
            {discountStatus && (
              <p
                className="text-sm"
                style={{ color: discountStatus === "saved" ? "var(--brand-hot)" : "#ef4444" }}
              >
                {discountStatus === "saved" ? t("discountUpdated") : discountStatus}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-2 border-t border-[--hair] pt-5">
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={retailDiscount}
              disabled={retailPending}
              onChange={(e) => onToggleRetail(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[--brand]"
            />
            <span>
              <span className="block font-medium text-ink">{t("retailDiscount")}</span>
              <span className="block text-muted">{t("retailDiscountDescription")}</span>
            </span>
          </label>
          {retailStatus && (
            <p
              className="pl-7 text-sm"
              style={{ color: retailStatus === "saved" ? "var(--brand-hot)" : "#ef4444" }}
            >
              {retailStatus === "saved" ? tShared("saved") : retailStatus}
            </p>
          )}
        </div>

        <BillingPeriodSettings billingPeriod={studio.billingPeriod} terms={terms} />
      </section>

      <section className="space-y-6 rounded-2xl border border-[--hair] bg-surface p-6">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted">
            {t("localization")}
          </h2>
          <p className="mt-1 text-sm text-muted">{t("timezoneDescription")}</p>
        </div>

        <div className="space-y-2">
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-ink">{t("timezone")}</span>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="field-premium"
            >
              {!TIMEZONES.includes(timezone) && <option value={timezone}>{timezone}</option>}
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-3">
            <button
              onClick={onSaveTimezone}
              disabled={tzPending || timezone === studio.timezone}
              className="btn-glow btn-glow--solid px-5 py-2 text-sm disabled:opacity-50"
            >
              {tzPending ? tShared("saving") : t("saveTimezone")}
            </button>
            {tzStatus && (
              <p
                className="text-sm"
                style={{ color: tzStatus === "saved" ? "var(--brand-hot)" : "#ef4444" }}
              >
                {tzStatus === "saved" ? t("timezoneUpdated") : tzStatus}
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-[--hair] bg-surface p-6">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted">{t("registration")}</h2>
        <p className="text-sm text-muted">{t("registrationDescription")}</p>
        <label className="flex items-center gap-3 text-sm text-ink">
          <input
            type="checkbox"
            checked={registrationEnabled}
            onChange={(e) => setRegistrationEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-[--hair]"
          />
          {t("registrationEnabled")}
        </label>
        <div className="flex flex-wrap gap-4">
          {(["parent", "student"] as const).map((role) => (
            <label key={role} className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={regRoles.includes(role)}
                onChange={() => toggleRegRole(role)}
                className="h-4 w-4 rounded border-[--hair]"
              />
              {t(`registrationRole.${role}`)}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted">
          {t("registrationJoinUrl")}{" "}
          <code className="rounded bg-base px-1.5 py-0.5">{studio.slug}.{ROOT}/join</code>
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onSaveRegistration}
            disabled={regPending}
            className="btn-glow btn-glow--solid px-5 py-2 text-sm disabled:opacity-50"
          >
            {regPending ? tShared("saving") : t("saveRegistration")}
          </button>
          {regStatus && (
            <p className="text-sm" style={{ color: regStatus === "saved" ? "var(--brand-hot)" : "#ef4444" }}>
              {regStatus === "saved" ? tShared("saved") : regStatus}
            </p>
          )}
        </div>
      </section>

      <PortalEmbed
        slug={studio.slug}
        customDomain={studio.customDomain}
        root={ROOT}
        registrationEnabled={registrationEnabled}
      />

      <section className="space-y-4 rounded-2xl border border-[--hair] bg-surface p-6">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted">{t("urlsStatus")}</h2>

        <InfoRow label={t("subdomainUrl")}>
          <code className="rounded bg-base px-2 py-0.5 text-xs text-ink">
            {studio.slug}.{ROOT}
          </code>
        </InfoRow>

        {studio.customDomain && (
          <InfoRow label={t("customDomain")}>
            <code className="rounded bg-base px-2 py-0.5 text-xs text-ink">
              {studio.customDomain}
            </code>
          </InfoRow>
        )}

        <InfoRow label={t("status")}>
          <span
            className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wider text-white"
            style={{
              background:
                studio.status === "active"
                  ? "#22c55e"
                  : studio.status === "trial"
                  ? "var(--brand)"
                  : "#8b8b92",
            }}
          >
            {statusLabel}
          </span>
        </InfoRow>

        <InfoRow label={t("created")}>
          <span className="text-sm text-muted">
            {new Date(studio.createdAt).toLocaleDateString(undefined, {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </span>
        </InfoRow>

        <InfoRow label={t("studioId")}>
          <code className="text-[0.62rem] text-muted">{studio.id}</code>
        </InfoRow>
      </section>

      <section className="rounded-2xl border border-dashed border-[--hair] p-5">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">
          {t("customDomainSection")}
        </h2>
        <p className="text-sm text-muted leading-relaxed">{t("customDomainDescription")}</p>
        <Link
          href="/portal/admin/site/domain"
          className="mt-3 inline-flex rounded-full border border-brand/40 px-4 py-2 text-sm font-medium text-brand transition hover:bg-brand/10"
        >
          {t("openDomainWizard")}
        </Link>
      </section>
    </motion.div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[--hair] pb-3 last:border-0 last:pb-0">
      <span className="text-sm text-muted">{label}</span>
      <div>{children}</div>
    </div>
  );
}
