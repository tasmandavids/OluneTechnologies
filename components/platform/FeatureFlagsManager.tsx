"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { FeatureFlag } from "@/lib/platform/types";
import { toggleFeatureFlag } from "@/app/platform/features/actions";

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
    <div className="mx-auto max-w-6xl space-y-8 p-6">
      <header>
        <h1 className="text-2xl font-black text-ink">{t("title")}</h1>
        <p className="text-sm text-muted">{t("subtitle")}</p>
      </header>

      <section>
        <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-muted">
          {t("globalDefaults")}
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {globalFlags.map((f) => (
            <li
              key={f.id}
              className="box flex items-start justify-between gap-4 rounded-2xl p-4"
            >
              <div>
                <p className="font-semibold text-ink">{f.label}</p>
                <p className="text-xs text-muted">{f.description}</p>
                <p className="mt-1 font-mono text-[0.65rem] text-muted">{f.featureKey}</p>
              </div>
              <button
                disabled={pending}
                onClick={() => toggle(f.id, !f.enabled)}
                className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-bold uppercase ${
                  f.enabled ? "bg-brand text-white" : "border border-[--hair] text-muted"
                }`}
              >
                {f.enabled ? t("on") : t("off")}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {studioFlags.length > 0 && (
        <section>
          <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-muted">
            {t("studioOverrides")}
          </h2>
          <ul className="space-y-2">
            {studioFlags.map((f) => (
              <li
                key={f.id}
                className="box flex items-center justify-between rounded-xl px-4 py-3 text-sm"
              >
                <span>
                  {f.label} · <strong>{f.studioName}</strong>
                </span>
                <button
                  disabled={pending}
                  onClick={() => toggle(f.id, !f.enabled)}
                  className={`rounded-full px-3 py-1 text-[0.65rem] uppercase ${
                    f.enabled ? "bg-brand text-white" : "border border-[--hair]"
                  }`}
                >
                  {f.enabled ? t("on") : t("off")}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
