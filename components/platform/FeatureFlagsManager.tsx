"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { FeatureFlag } from "@/lib/platform/types";
import { toggleFeatureFlag } from "@/app/platform/features/actions";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";
import { GlassSwitch, PlatformPageHeader, SectionLabel } from "./glass/ui";

export function FeatureFlagsManager({ flags }: { flags: FeatureFlag[] }) {
  const t = useTranslations("platform.features");
  const [items, setItems] = useState(flags);
  const [pending, startTransition] = useTransition();

  const globalFlags = items.filter((f) => !f.studioId);
  const studioFlags = items.filter((f) => f.studioId);

  function toggle(id: string, enabled: boolean) {
    startTransition(async () => {
      const res = await toggleFeatureFlag({ flagId: id, enabled });
      if (res.ok) {
        setItems((prev) => prev.map((f) => (f.id === id ? { ...f, enabled } : f)));
      }
    });
  }

  return (
    <div className="py-2">
      <PlatformPageHeader title={t("title")} subtitle={t("subtitle")} />

      <section className="mb-6">
        <SectionLabel className="mb-3">{t("globalDefaults")}</SectionLabel>
        <ul className="grid gap-2.5 sm:grid-cols-2">
          {globalFlags.map((f) => (
            <li key={f.id}>
              <GlassPanel className="h-full">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{f.label}</p>
                    <p className="mt-0.5 text-[13px] leading-snug text-muted">{f.description}</p>
                    <code className="mt-2 inline-block font-mono text-[11px] tracking-wide text-muted">{f.featureKey}</code>
                  </div>
                  <GlassSwitch
                    checked={f.enabled}
                    onChange={(next) => toggle(f.id, next)}
                    label={`${f.label}: ${f.enabled ? t("on") : t("off")}`}
                    disabled={pending}
                  />
                </div>
              </GlassPanel>
            </li>
          ))}
        </ul>
      </section>

      {studioFlags.length > 0 && (
        <section>
          <SectionLabel className="mb-3">{t("studioOverrides")}</SectionLabel>
          <GlassPanel className="!p-2">
            <ul>
              {studioFlags.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 border-b border-[--hair] p-3 text-sm last:border-0">
                  <span className="text-ink">
                    {f.label} · <strong>{f.studioName}</strong>
                  </span>
                  <GlassSwitch
                    checked={f.enabled}
                    onChange={(next) => toggle(f.id, next)}
                    label={`${f.label} · ${f.studioName}: ${f.enabled ? t("on") : t("off")}`}
                    disabled={pending}
                  />
                </li>
              ))}
            </ul>
          </GlassPanel>
        </section>
      )}
    </div>
  );
}
