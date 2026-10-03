"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { PlatformSettings } from "@/lib/platform/types";
import { updatePlatformSettings } from "@/app/platform/settings/actions";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";
import { RippleButton } from "@/components/portal/admin/glass/RippleButton";
import { GlassSwitch, PlatformPageHeader, fieldClass } from "./glass/ui";

export function PlatformSettingsForm({ settings }: { settings: PlatformSettings }) {
  const t = useTranslations("platform.settings");
  const [form, setForm] = useState<PlatformSettings>(settings);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  function save() {
    startTransition(async () => {
      const res = await updatePlatformSettings(form);
      setStatus(res.ok ? t("saved") : res.error);
      setTimeout(() => setStatus(null), 2500);
    });
  }

  const labelCls = "mb-2 block text-[9.5px] font-semibold uppercase tracking-[0.16em] text-muted";

  return (
    <div className="py-2">
      <PlatformPageHeader title={t("title")} subtitle={t("subtitle")} />

      <div className="flex flex-col gap-3.5 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 lg:max-w-[680px]">
          <GlassPanel className="!p-0">
            <div className="flex items-center justify-between gap-4 border-b border-[--hair] px-5 py-[18px]">
              <span className="text-[15px] font-semibold text-ink">{t("maintenanceMode")}</span>
              <GlassSwitch
                checked={form.maintenanceMode ?? false}
                onChange={(next) => setForm({ ...form, maintenanceMode: next })}
                label={t("maintenanceMode")}
              />
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-[--hair] px-5 py-[18px]">
              <span className="text-[15px] font-semibold text-ink">{t("signupEnabled")}</span>
              <GlassSwitch
                checked={form.signupEnabled ?? true}
                onChange={(next) => setForm({ ...form, signupEnabled: next })}
                label={t("signupEnabled")}
              />
            </div>
            <div className="grid gap-3.5 border-b border-[--hair] px-5 py-[18px] sm:grid-cols-2">
              <label className="block">
                <span className={labelCls}>{t("defaultTrialDays")}</span>
                <input
                  type="number"
                  min={0}
                  value={form.defaultTrialDays ?? 14}
                  onChange={(e) => setForm({ ...form, defaultTrialDays: Number(e.target.value) })}
                  className={fieldClass}
                />
              </label>
              <label className="block">
                <span className={labelCls}>{t("supportEmail")}</span>
                <input
                  type="email"
                  value={form.supportEmail ?? ""}
                  onChange={(e) => setForm({ ...form, supportEmail: e.target.value })}
                  className={fieldClass}
                />
              </label>
            </div>
            <label className="block px-5 py-[18px]">
              <span className={labelCls}>{t("welcomeMessage")}</span>
              <textarea
                value={form.welcomeMessage ?? ""}
                onChange={(e) => setForm({ ...form, welcomeMessage: e.target.value })}
                rows={3}
                className={fieldClass}
              />
            </label>
            <div className="flex items-center gap-3 px-5 pb-5">
              <RippleButton variant="solid" size="lg" onClick={save} disabled={pending}>
                {t("saveSettings")}
              </RippleButton>
              {status && (
                <span className="text-xs text-muted" role="status">
                  {status}
                </span>
              )}
            </div>
          </GlassPanel>
        </div>

        <aside className="w-full shrink-0 lg:w-[380px]">
          <GlassPanel>
            <h2 className="mb-2 font-display text-base font-medium tracking-tight text-ink">{t("operatorAccessTitle")}</h2>
            <p className="text-[13.5px] leading-relaxed text-muted">
              {t.rich("operatorAccessBody", {
                envVar: () => (
                  <code className="rounded-md px-1.5 py-px font-mono text-xs text-ink" style={{ background: "var(--t1)" }}>
                    PLATFORM_OPERATOR_EMAILS
                  </code>
                ),
                table: () => (
                  <code className="rounded-md px-1.5 py-px font-mono text-xs text-ink" style={{ background: "var(--t1)" }}>
                    platform_operators
                  </code>
                ),
              })}
            </p>
          </GlassPanel>
        </aside>
      </div>
    </div>
  );
}
