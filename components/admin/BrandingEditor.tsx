"use client";

import { useMemo, useState, useTransition } from "react";
import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import type { Branding, ThemeBase } from "@/lib/types";
import { brandingToCssVars } from "@/lib/branding";
import { saveBranding } from "@/app/portal/admin/branding/actions";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";

import { TYPOGRAPHY_PAIRS } from "@/lib/website/typography";

const PRESET_KEYS = ["iris", "crimson", "voltage", "aurum", "bloom", "jade"] as const;
const PRESETS: { key: (typeof PRESET_KEYS)[number]; brandColor: string; base: ThemeBase }[] = [
  { key: "iris", brandColor: "#6B66C9", base: "light" },
  { key: "crimson", brandColor: "#C8102E", base: "light" },
  { key: "voltage", brandColor: "#5B5BFF", base: "light" },
  { key: "aurum", brandColor: "#C9A227", base: "light" },
  { key: "bloom", brandColor: "#E84A8A", base: "light" },
  { key: "jade", brandColor: "#13B6A4", base: "light" },
];

const FONT_OPTIONS = [...new Set(TYPOGRAPHY_PAIRS.flatMap((p) => [p.display, p.body]))].sort();

export function BrandingEditor({ initial }: { initial: Branding }) {
  const t = useTranslations("admin.branding");
  const tShared = useTranslations("admin.shared");
  const [b, setB] = useState<Branding>(initial);
  const [pending, startTransition] = useTransition();
  const [savedOk, setSavedOk] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof Branding>(key: K, value: Branding[K]) =>
    setB((prev) => ({ ...prev, [key]: value }));

  const previewVars = useMemo(() => brandingToCssVars(b) as CSSProperties, [b]);

  const onSave = () =>
    startTransition(async () => {
      const res = await saveBranding({
        tagline: b.tagline,
        logoUrl: b.logoUrl,
        brandColor: b.brandColor,
        base: b.base,
        fontDisplay: b.fontDisplay,
        fontBody: b.fontBody,
        siteSettings: b.siteSettings,
      });
      if (res.ok) {
        setSavedOk(true);
        setError(null);
      } else {
        setSavedOk(false);
        setError(res.error);
      }
      setTimeout(() => {
        setSavedOk(null);
        setError(null);
      }, 2500);
    });

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
      <div className="space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">{t("title")}</h1>
            <p className="text-sm text-muted">{t("subtitle")}</p>
          </div>
          <button
            onClick={onSave}
            disabled={pending}
            className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {pending ? tShared("saving") : t("saveChanges")}
          </button>
        </header>

        <GlassPanel className="space-y-3">
          <h2 className="text-xs uppercase tracking-widest text-muted">{t("identity")}</h2>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">{t("tagline")}</span>
            <input
              type="text"
              value={b.tagline ?? ""}
              onChange={(e) => set("tagline", e.target.value || null)}
              placeholder={t("taglinePlaceholder")}
              className="w-full rounded-lg border border-[--hair] bg-base/40 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">{t("logoUrl")}</span>
            <input
              type="url"
              value={b.logoUrl ?? ""}
              onChange={(e) => set("logoUrl", e.target.value || null)}
              placeholder={t("logoPlaceholder")}
              className="w-full rounded-lg border border-[--hair] bg-base/40 px-3 py-2"
            />
          </label>
        </GlassPanel>

        <GlassPanel className="space-y-3">
          <h2 className="text-xs uppercase tracking-widest text-muted">{t("brandColor")}</h2>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={b.brandColor}
              onChange={(e) => set("brandColor", e.target.value)}
              className="h-10 w-12 cursor-pointer rounded-lg border border-[--hair] bg-transparent p-0.5"
              aria-label={t("brandColorAria")}
            />
            <code className="text-sm text-muted">{b.brandColor.toUpperCase()}</code>
            <div className="ml-auto flex gap-1.5">
              {previewSwatches(b.brandColor).map((c) => (
                <span key={c} className="h-6 w-6 rounded" style={{ background: c }} />
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => setB((prev) => ({ ...prev, brandColor: p.brandColor, base: p.base }))}
                className="flex items-center gap-2 rounded-full border border-[--hair] px-3 py-1.5 text-xs"
              >
                <span className="h-3 w-3 rounded-full" style={{ background: p.brandColor }} />
                {t(`presets.${p.key}`)}
              </button>
            ))}
          </div>
        </GlassPanel>

        <GlassPanel className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <h2 className="text-xs uppercase tracking-widest text-muted">{t("base")}</h2>
            <div className="inline-flex rounded-full border border-[--hair] p-1">
              {(["dark", "light"] as ThemeBase[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => set("base", mode)}
                  className={`rounded-full px-4 py-1.5 text-sm capitalize ${
                    b.base === mode ? "bg-brand text-white" : "text-muted"
                  }`}
                >
                  {mode === "dark" ? t("darkStage") : t("lightStudio")}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-xs uppercase tracking-widest text-muted">{t("displayFont")}</h2>
            <select
              value={b.fontDisplay}
              onChange={(e) => set("fontDisplay", e.target.value)}
              className="w-full rounded-lg border border-[--hair] bg-base/40 px-3 py-2 text-sm"
            >
              {FONT_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <h2 className="text-xs uppercase tracking-widest text-muted">{t("bodyFont")}</h2>
            <select
              value={b.fontBody}
              onChange={(e) => set("fontBody", e.target.value)}
              className="w-full rounded-lg border border-[--hair] bg-base/40 px-3 py-2 text-sm"
            >
              {FONT_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        </GlassPanel>

        <GlassPanel className="space-y-3">
          <h2 className="text-xs uppercase tracking-widest text-muted">{t("websiteChrome")}</h2>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">{t("footerTagline")}</span>
            <textarea
              rows={2}
              value={b.siteSettings.footerTagline ?? ""}
              onChange={(e) =>
                setB((prev) => ({
                  ...prev,
                  siteSettings: { ...prev.siteSettings, footerTagline: e.target.value || undefined },
                }))
              }
              className="w-full rounded-lg border border-[--hair] bg-base/40 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">{t("portalLabel")}</span>
            <input
              value={b.siteSettings.portalLabel ?? t("portalDefault")}
              onChange={(e) =>
                setB((prev) => ({
                  ...prev,
                  siteSettings: { ...prev.siteSettings, portalLabel: e.target.value },
                }))
              }
              className="w-full rounded-lg border border-[--hair] bg-base/40 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">{t("contactEmail")}</span>
            <input
              type="email"
              value={b.siteSettings.contactEmail ?? ""}
              onChange={(e) =>
                setB((prev) => ({
                  ...prev,
                  siteSettings: { ...prev.siteSettings, contactEmail: e.target.value || undefined },
                }))
              }
              className="w-full rounded-lg border border-[--hair] bg-base/40 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">{t("contactPhone")}</span>
            <input
              value={b.siteSettings.contactPhone ?? ""}
              onChange={(e) =>
                setB((prev) => ({
                  ...prev,
                  siteSettings: { ...prev.siteSettings, contactPhone: e.target.value || undefined },
                }))
              }
              className="w-full rounded-lg border border-[--hair] bg-base/40 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">{t("regionLabel")}</span>
            <input
              value={b.siteSettings.regionLabel ?? ""}
              onChange={(e) =>
                setB((prev) => ({
                  ...prev,
                  siteSettings: { ...prev.siteSettings, regionLabel: e.target.value || undefined },
                }))
              }
              placeholder={t("regionPlaceholder")}
              className="w-full rounded-lg border border-[--hair] bg-base/40 px-3 py-2"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={b.siteSettings.showPoweredBy !== false}
              onChange={(e) =>
                setB((prev) => ({
                  ...prev,
                  siteSettings: { ...prev.siteSettings, showPoweredBy: e.target.checked },
                }))
              }
              className="h-4 w-4 accent-[--brand]"
            />
            <span className="text-ink">{t("showPoweredBy")}</span>
          </label>
        </GlassPanel>

        {savedOk === true && (
          <p className="text-sm text-brand-hot">{t("saved")}</p>
        )}
        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}
      </div>

      <div className="lg:sticky lg:top-6">
        <p className="mb-2 text-xs uppercase tracking-widest text-muted">{t("livePreview")}</p>
        <div
          style={previewVars}
          data-base={b.base}
          className="overflow-hidden rounded-2xl border border-[--hair]"
        >
          <div style={{ background: "var(--base)", color: "var(--text)" }} className="p-7">
            <div className="mb-6 flex items-center gap-2">
              <span
                style={{ borderColor: "var(--brand)", color: "var(--text)" }}
                className="grid h-8 w-8 place-items-center border text-sm font-black"
              >
                {(b.tagline?.trim()?.[0] ?? "S").toUpperCase()}
              </span>
              <span style={{ color: "var(--muted)" }} className="text-[0.6rem] uppercase tracking-[0.3em]">
                {b.tagline ?? t("previewTagline")}
              </span>
            </div>
            <h3 style={{ color: "var(--text)" }} className="text-3xl font-black uppercase leading-none">
              {t("previewHeadline")}<br />{t("previewHeadline2")}{" "}
              <em style={{ color: "var(--brand-hot)", fontFamily: "Cormorant Garamond, serif" }} className="not-italic font-semibold italic">
                {t("previewHeadlineEm")}
              </em>
            </h3>
            <div className="mt-5 flex gap-2">
              <span style={{ background: "var(--brand)", color: "#fff" }} className="rounded-full px-4 py-2 text-xs font-bold uppercase">
                {t("previewCta")}
              </span>
              <span style={{ borderColor: "var(--hair)", color: "var(--text)" }} className="rounded-full border px-4 py-2 text-xs font-bold uppercase">
                {t("previewProgrammes")}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function previewSwatches(hex: string): string[] {
  return [
    hex,
    `color-mix(in srgb, ${hex} 78%, white)`,
    `color-mix(in srgb, ${hex} 70%, black)`,
  ];
}
