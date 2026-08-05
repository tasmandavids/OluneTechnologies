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
import { signOut } from "@/app/portal/actions";
import PortalEmbed from "@/components/admin/PortalEmbed";
import BillingPeriodSettings, { type StudioTermInfo } from "@/components/admin/BillingPeriodSettings";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";

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

// Shared field chrome for the glass shell — matches the frosted inputs used
// across the Claude Design "Studio Settings" import (border-[--hair] on
// var(--surface), no separate "field-premium" skin like the pre-glass pages).
const fieldClass =
  "w-full rounded-xl border px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-muted focus:border-[--brand]";
const fieldStyle = { background: "var(--surface)", borderColor: "var(--hair)" } as const;

function StatusPill({ status }: { status: string }) {
  const bg =
    status === "active" ? "#22c55e" : status === "trial" ? "var(--brand)" : "#8b8b92";
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wider text-white"
      style={{ background: bg }}
    >
      {status}
    </span>
  );
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative h-6 w-[42px] shrink-0 rounded-full transition-colors disabled:opacity-50"
      style={{ background: checked ? "var(--brand)" : "var(--t3)" }}
    >
      <span
        className="absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white shadow transition-transform"
        style={{ transform: checked ? "translateX(21px)" : "translateX(3px)" }}
      />
    </button>
  );
}

function SaveStatus({ status, savedLabel }: { status: string | null; savedLabel: string }) {
  if (!status) return null;
  return (
    <p className="text-sm" style={{ color: status === "saved" ? "var(--brand-hot)" : "#ef4444" }}>
      {status === "saved" ? savedLabel : status}
    </p>
  );
}

const NAV_SECTIONS = ["profile", "billing", "registration", "domains", "account"] as const;

export default function AdminSettings({
  studio,
  terms,
  userEmail,
}: {
  studio: StudioInfo | null;
  terms: StudioTermInfo[];
  userEmail?: string | null;
}) {
  const t = useTranslations("admin.settings");
  const tShared = useTranslations("admin.shared");
  const tStatus = useTranslations("admin.shared.status");
  const tCommon = useTranslations("common");

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

  const [signingOut, startSignOutTransition] = useTransition();

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
    setRegRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
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
      className="mx-auto max-w-[920px] pb-16 pt-3.5"
    >
      <header className="mb-5">
        <p className="mb-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-muted">{t("title")}</p>
        <h1 className="font-display text-[32px] font-medium leading-[1.03] tracking-tight text-ink md:text-[36px]">
          {t("title")}
        </h1>
        <p className="mt-2 max-w-[58ch] text-sm text-muted">{t("subtitle")}</p>
      </header>

      <nav
        className="sticky top-0 z-20 mb-6 flex flex-wrap gap-1.5 rounded-[16px] border p-1.5"
        style={{
          background: "linear-gradient(148deg, var(--refract), transparent 42%), var(--glass)",
          borderColor: "var(--edge)",
          backdropFilter: "blur(var(--blur)) saturate(1.85)",
          WebkitBackdropFilter: "blur(var(--blur)) saturate(1.85)",
        }}
      >
        {NAV_SECTIONS.map((key) => (
          <a
            key={key}
            href={`#${key}`}
            className="rounded-[10px] px-3.5 py-2 text-[12.5px] font-semibold text-muted transition-colors hover:bg-[--t2] hover:text-ink"
          >
            {t(`nav.${key}`)}
          </a>
        ))}
      </nav>

      <div className="flex flex-col gap-5">
        <GlassPanel id="profile" className="scroll-mt-20 !p-6">
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{t("identity")}</h2>
            </div>

            <div className="space-y-2.5">
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium text-ink">{t("studioName")}</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={fieldClass}
                  style={fieldStyle}
                  placeholder={t("studioNamePlaceholder")}
                />
              </label>
              <div className="flex items-center gap-3">
                <button
                  onClick={onSave}
                  disabled={pending || !name.trim() || name.trim() === studio.name}
                  className="rounded-full px-5 py-2 text-sm font-semibold text-white transition disabled:opacity-50"
                  style={{ background: "linear-gradient(150deg, var(--tg), var(--brand) 60%, var(--brand-deep))" }}
                >
                  {pending ? tShared("saving") : t("saveName")}
                </button>
                <SaveStatus status={status} savedLabel={t("nameUpdated")} />
              </div>
            </div>

            <div className="border-t pt-5" style={{ borderColor: "var(--hair)" }}>
              <p className="text-sm font-medium text-ink">{t("brandingTitle")}</p>
              <p className="mt-0.5 text-sm text-muted">{t("brandingDescription")}</p>
              <Link
                href="/portal/admin/branding"
                className="mt-3 inline-flex rounded-full border px-4 py-2 text-sm font-medium text-ink transition hover:bg-[--t2]"
                style={{ borderColor: "var(--ring)" }}
              >
                {t("openBranding")}
              </Link>
            </div>

            <div className="border-t pt-5" style={{ borderColor: "var(--hair)" }}>
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium text-ink">{t("timezone")}</span>
                <p className="mb-2 text-sm text-muted">{t("timezoneDescription")}</p>
                <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className={fieldClass} style={fieldStyle}>
                  {!TIMEZONES.includes(timezone) && <option value={timezone}>{timezone}</option>}
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </label>
              <div className="mt-2.5 flex items-center gap-3">
                <button
                  onClick={onSaveTimezone}
                  disabled={tzPending || timezone === studio.timezone}
                  className="rounded-full px-5 py-2 text-sm font-semibold text-white transition disabled:opacity-50"
                  style={{ background: "linear-gradient(150deg, var(--tg), var(--brand) 60%, var(--brand-deep))" }}
                >
                  {tzPending ? tShared("saving") : t("saveTimezone")}
                </button>
                <SaveStatus status={tzStatus} savedLabel={t("timezoneUpdated")} />
              </div>
            </div>
          </div>
        </GlassPanel>

        <GlassPanel id="billing" className="scroll-mt-20 !p-6">
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{t("billing")}</h2>
              <p className="mt-1 text-sm text-muted">{t("siblingDiscountDescription")}</p>
            </div>

            <div className="space-y-2.5">
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium text-ink">{t("siblingDiscount")}</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  className={fieldClass}
                  style={fieldStyle}
                  placeholder={t("siblingDiscountPlaceholder")}
                />
              </label>
              <div className="flex items-center gap-3">
                <button
                  onClick={onSaveDiscount}
                  disabled={discountPending || discount.trim() === "" || Number(discount) === studio.siblingDiscountPct}
                  className="rounded-full px-5 py-2 text-sm font-semibold text-white transition disabled:opacity-50"
                  style={{ background: "linear-gradient(150deg, var(--tg), var(--brand) 60%, var(--brand-deep))" }}
                >
                  {discountPending ? tShared("saving") : t("saveDiscount")}
                </button>
                <SaveStatus status={discountStatus} savedLabel={t("discountUpdated")} />
              </div>
            </div>

            <div className="flex items-start justify-between gap-4 border-t pt-5" style={{ borderColor: "var(--hair)" }}>
              <div>
                <p className="font-medium text-ink">{t("retailDiscount")}</p>
                <p className="mt-0.5 text-sm text-muted">{t("retailDiscountDescription")}</p>
                <SaveStatus status={retailStatus} savedLabel={tShared("saved")} />
              </div>
              <Toggle checked={retailDiscount} onChange={onToggleRetail} disabled={retailPending} />
            </div>

            <div className="border-t pt-5" style={{ borderColor: "var(--hair)" }}>
              <BillingPeriodSettings billingPeriod={studio.billingPeriod} terms={terms} />
            </div>
          </div>
        </GlassPanel>

        <GlassPanel id="registration" className="scroll-mt-20 !p-6">
          <div className="flex flex-col gap-5">
            <div>
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{t("registration")}</h2>
              <p className="mt-1 text-sm text-muted">{t("registrationDescription")}</p>
            </div>

            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium text-ink">{t("registrationEnabled")}</span>
              <Toggle checked={registrationEnabled} onChange={setRegistrationEnabled} />
            </div>

            <div className="flex flex-wrap gap-4">
              {(["parent", "student"] as const).map((role) => (
                <label key={role} className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={regRoles.includes(role)}
                    onChange={() => toggleRegRole(role)}
                    className="h-4 w-4 rounded"
                    style={{ accentColor: "var(--brand)" }}
                  />
                  {t(`registrationRole.${role}`)}
                </label>
              ))}
            </div>

            <p className="text-xs text-muted">
              {t("registrationJoinUrl")}{" "}
              <code className="rounded px-1.5 py-0.5" style={{ background: "var(--t1)" }}>
                {studio.slug}.{ROOT}/join
              </code>
            </p>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onSaveRegistration}
                disabled={regPending}
                className="rounded-full px-5 py-2 text-sm font-semibold text-white transition disabled:opacity-50"
                style={{ background: "linear-gradient(150deg, var(--tg), var(--brand) 60%, var(--brand-deep))" }}
              >
                {regPending ? tShared("saving") : t("saveRegistration")}
              </button>
              <SaveStatus status={regStatus} savedLabel={tShared("saved")} />
            </div>

            <div className="border-t pt-5" style={{ borderColor: "var(--hair)" }}>
              <PortalEmbed
                slug={studio.slug}
                customDomain={studio.customDomain}
                root={ROOT}
                registrationEnabled={registrationEnabled}
              />
            </div>
          </div>
        </GlassPanel>

        <GlassPanel id="domains" className="scroll-mt-20 !p-6">
          <div className="flex flex-col gap-5">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{t("urlsStatus")}</h2>

            <InfoRow label={t("subdomainUrl")}>
              <code className="rounded px-2 py-0.5 text-xs text-ink" style={{ background: "var(--t1)" }}>
                {studio.slug}.{ROOT}
              </code>
            </InfoRow>

            {studio.customDomain && (
              <InfoRow label={t("customDomain")}>
                <code className="rounded px-2 py-0.5 text-xs text-ink" style={{ background: "var(--t1)" }}>
                  {studio.customDomain}
                </code>
              </InfoRow>
            )}

            <InfoRow label={t("status")}>
              <StatusPill status={studio.status} />
              <span className="ml-2 text-sm text-muted">{statusLabel}</span>
            </InfoRow>

            <InfoRow label={t("created")}>
              <span className="text-sm text-muted">
                {new Date(studio.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
              </span>
            </InfoRow>

            <InfoRow label={t("studioId")}>
              <code className="text-[0.62rem] text-muted">{studio.id}</code>
            </InfoRow>

            <div className="border-t pt-5" style={{ borderColor: "var(--hair)" }}>
              <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                {t("customDomainSection")}
              </h3>
              <p className="text-sm leading-relaxed text-muted">{t("customDomainDescription")}</p>
              <Link
                href="/portal/admin/site/domain"
                className="mt-3 inline-flex rounded-full border px-4 py-2 text-sm font-medium text-ink transition hover:bg-[--t2]"
                style={{ borderColor: "var(--ring)" }}
              >
                {t("openDomainWizard")}
              </Link>
            </div>
          </div>
        </GlassPanel>

        <GlassPanel id="account" className="scroll-mt-20 !p-6">
          <div className="flex flex-col gap-4">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{t("account.title")}</h2>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-ink">{userEmail ?? tCommon("you")}</p>
                <p className="mt-0.5 text-sm text-muted">{t("account.description")}</p>
              </div>
              <button
                type="button"
                disabled={signingOut}
                onClick={() => startSignOutTransition(async () => void (await signOut()))}
                className="shrink-0 rounded-full border px-5 py-2 text-sm font-semibold text-ink transition hover:bg-[--t2] disabled:opacity-50"
                style={{ borderColor: "var(--ring)" }}
              >
                {signingOut ? tShared("saving") : tCommon("signOut")}
              </button>
            </div>
          </div>
        </GlassPanel>
      </div>
    </motion.div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b pb-3 last:border-0 last:pb-0" style={{ borderColor: "var(--hair)" }}>
      <span className="text-sm text-muted">{label}</span>
      <div className="flex items-center">{children}</div>
    </div>
  );
}
