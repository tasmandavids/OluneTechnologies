"use client";

// ============================================================================
//  components/website/admin/WebsiteBuilderApp.tsx — top-level state machine
//  for the website builder admin screen. Holds the working draft (unsaved
//  edits) and switches between the gallery and customize views.
// ============================================================================

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { WebsiteConfig, WebsiteSection, WebsiteTemplateKind } from "@/lib/website/types";
import { getTemplate, TEMPLATES } from "@/lib/website/templates";
import { defaultSections } from "@/lib/website/sections";
import { saveWebsiteConfig, switchTemplate as switchTemplateAction, publishWebsite, unpublishWebsite } from "@/app/portal/admin/site/actions";
import { GalleryScreen } from "./GalleryScreen";
import { CustomizeScreen } from "./CustomizeScreen";

export type WebsiteDraft = {
  templateId: string;
  kind: WebsiteTemplateKind;
  accentColor: string;
  paperColor: string;
  inkColor: string;
  fontDisplay: string;
  fontBody: string;
  density: number;
  studioNameOverride: string | null;
  headline: string;
  tagline: string;
  eyebrow: string;
  logoUrl: string | null;
  sections: WebsiteSection[];
  status: "draft" | "published";
};

function draftFromConfig(config: WebsiteConfig): WebsiteDraft {
  return {
    templateId: config.templateId,
    kind: config.kind,
    accentColor: config.accentColor,
    paperColor: config.paperColor,
    inkColor: config.inkColor,
    fontDisplay: config.fontDisplay,
    fontBody: config.fontBody,
    density: config.density,
    studioNameOverride: config.studioNameOverride,
    headline: config.headline,
    tagline: config.tagline,
    eyebrow: config.eyebrow,
    logoUrl: config.logoUrl,
    sections: config.sections.length ? config.sections : defaultSections(),
    status: config.status,
  };
}

function draftFromTemplate(templateId: string, carryOver?: WebsiteDraft): WebsiteDraft {
  const t = getTemplate(templateId);
  return {
    templateId: t.id,
    kind: t.kind,
    accentColor: t.accent,
    paperColor: t.paper,
    inkColor: t.ink,
    fontDisplay: t.fontDisplay,
    fontBody: t.fontBody,
    density: 56,
    studioNameOverride: carryOver?.studioNameOverride ?? null,
    // Hero copy is template voice, not studio-authored yet — reset with
    // colours/fonts, same as the server action's switchTemplate.
    headline: t.headline,
    tagline: t.tagline,
    eyebrow: t.eyebrow,
    logoUrl: carryOver?.logoUrl ?? null,
    sections: carryOver?.sections ?? defaultSections(),
    status: carryOver?.status ?? "draft",
  };
}

export function WebsiteBuilderApp({
  initialConfig,
  studioName,
  studioSlug,
}: {
  initialConfig: WebsiteConfig | null;
  studioName: string;
  studioSlug: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialView = searchParams.get("view") === "customize" && initialConfig ? "customize" : "gallery";

  const [view, setView] = useState<"gallery" | "customize">(initialView);
  const [draft, setDraft] = useState<WebsiteDraft | null>(initialConfig ? draftFromConfig(initialConfig) : null);
  const [saving, setSaving] = useState(false);
  const [publishedStatus, setPublishedStatus] = useState<"draft" | "published">(initialConfig?.status ?? "draft");
  const [error, setError] = useState<string | null>(null);

  const currentTemplate = useMemo(() => (draft ? getTemplate(draft.templateId) : null), [draft]);

  const goCustomize = useCallback(() => {
    setView("customize");
    router.replace("/portal/admin/site?view=customize", { scroll: false });
  }, [router]);

  const goGallery = useCallback(() => {
    setView("gallery");
    router.replace("/portal/admin/site", { scroll: false });
  }, [router]);

  const pickTemplate = useCallback(
    async (templateId: string) => {
      setError(null);
      const next = draftFromTemplate(templateId, draft ?? undefined);
      setDraft(next);
      goCustomize();
      const res = await switchTemplateAction(templateId);
      if (!res.ok) setError(res.error);
    },
    [draft, goCustomize],
  );

  const updateDraft = useCallback((patch: Partial<WebsiteDraft>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const save = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    const res = await saveWebsiteConfig({
      accentColor: draft.accentColor,
      paperColor: draft.paperColor,
      inkColor: draft.inkColor,
      fontDisplay: draft.fontDisplay,
      fontBody: draft.fontBody,
      density: draft.density,
      studioNameOverride: draft.studioNameOverride,
      headline: draft.headline,
      tagline: draft.tagline,
      eyebrow: draft.eyebrow,
      sections: draft.sections,
    });
    setSaving(false);
    if (!res.ok) setError(res.error);
  }, [draft]);

  const publish = useCallback(async () => {
    await save();
    setSaving(true);
    const res = await publishWebsite();
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setPublishedStatus("published");
  }, [save]);

  const unpublish = useCallback(async () => {
    setSaving(true);
    const res = await unpublishWebsite();
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setPublishedStatus("draft");
  }, []);

  if (view === "customize" && draft && currentTemplate) {
    return (
      <CustomizeScreen
        draft={draft}
        template={currentTemplate}
        studioName={draft.studioNameOverride || studioName}
        studioSlug={studioSlug}
        status={publishedStatus}
        saving={saving}
        error={error}
        onChange={updateDraft}
        onSave={save}
        onPublish={publish}
        onUnpublish={unpublish}
        onBackToGallery={goGallery}
      />
    );
  }

  return (
    <GalleryScreen
      templates={TEMPLATES}
      currentTemplate={currentTemplate}
      status={publishedStatus}
      onPick={pickTemplate}
      onEditCurrent={draft ? goCustomize : undefined}
    />
  );
}
