"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { PlatformSettings } from "@/lib/platform/types";
import { updatePlatformSettings } from "@/app/platform/settings/actions";

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

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-black text-ink">{t("title")}</h1>
        <p className="text-sm text-muted">{t("subtitle")}</p>
      </header>

      <div className="box space-y-4 rounded-2xl p-5">
        <label className="flex items-center justify-between gap-4 text-sm">
          <span>{t("maintenanceMode")}</span>
          <input
            type="checkbox"
            checked={form.maintenanceMode ?? false}
            onChange={(e) => setForm({ ...form, maintenanceMode: e.target.checked })}
          />
        </label>

        <label className="flex items-center justify-between gap-4 text-sm">
          <span>{t("signupEnabled")}</span>
          <input
            type="checkbox"
            checked={form.signupEnabled ?? true}
            onChange={(e) => setForm({ ...form, signupEnabled: e.target.checked })}
          />
        </label>

        <label className="block text-sm">
          <span className="text-xs uppercase tracking-widest text-muted">{t("defaultTrialDays")}</span>
          <input
            type="number"
            min={0}
            value={form.defaultTrialDays ?? 14}
            onChange={(e) => setForm({ ...form, defaultTrialDays: Number(e.target.value) })}
            className="mt-1 w-full rounded-xl border border-[--hair] bg-base px-3 py-2"
          />
        </label>

        <label className="block text-sm">
          <span className="text-xs uppercase tracking-widest text-muted">{t("supportEmail")}</span>
          <input
            type="email"
            value={form.supportEmail ?? ""}
            onChange={(e) => setForm({ ...form, supportEmail: e.target.value })}
            className="mt-1 w-full rounded-xl border border-[--hair] bg-base px-3 py-2"
          />
        </label>

        <label className="block text-sm">
          <span className="text-xs uppercase tracking-widest text-muted">{t("welcomeMessage")}</span>
          <textarea
            value={form.welcomeMessage ?? ""}
            onChange={(e) => setForm({ ...form, welcomeMessage: e.target.value })}
            rows={3}
            className="mt-1 w-full rounded-xl border border-[--hair] bg-base px-3 py-2"
          />
        </label>

        <div className="flex items-center gap-3">
          <button
            onClick={save}
            disabled={pending}
            className="rounded-full bg-brand px-5 py-2 text-xs font-bold uppercase text-white"
          >
            {t("saveSettings")}
          </button>
          {status && <span className="text-xs text-muted">{status}</span>}
        </div>
      </div>

      <section className="box rounded-2xl p-5 text-sm text-muted">
        <h2 className="mb-2 font-bold text-ink">{t("operatorAccessTitle")}</h2>
        <p>
          {t.rich("operatorAccessBody", {
            envVar: () => (
              <code className="rounded bg-base px-1">PLATFORM_OPERATOR_EMAILS</code>
            ),
            table: () => (
              <code className="rounded bg-base px-1">platform_operators</code>
            ),
          })}
        </p>
      </section>
    </div>
  );
}
