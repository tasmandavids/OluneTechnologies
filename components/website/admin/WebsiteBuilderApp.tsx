"use client";

// ============================================================================
//  components/website/admin/WebsiteBuilderApp.tsx — top-level state machine
//  for the website builder admin screen. Holds the working draft (unsaved
//  edits) and switches between the gallery and customize views.
//
//  The draft is the single source of truth for the live preview, so every
//  edit — colour, word, photo — lands here first and is persisted from here.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { WebsiteConfig, WebsiteSection, WebsiteTemplateKind } from "@/lib/website/types";
import { getTemplate, TEMPLATES } from "@/lib/website/templates";
import { defaultSections } from "@/lib/website/sections";
import { saveWebsiteConfig, switchTemplate as switchTemplateAction, publishWebsite, unpublishWebsite } from "@/app/portal/admin/site/actions";
import { GalleryScreen } from "./GalleryScreen";
import { CustomizeScreen } from "./CustomizeScreen";

/** How long after the last keystroke/click a draft saves itself. Long enough
 *  that typing a headline is one save, short enough that nobody loses work by
 *  navigating away. */
const AUTOSAVE_DELAY_MS = 1500;

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
  heroImages: string[];
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
    heroImages: config.heroImages,
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
    // Hero copy is template voice — it resets with colours and fonts unless
    // the studio has already written its own, which carries over.
    headline: carryOver?.headline ?? t.headline,
    tagline: carryOver?.tagline ?? t.tagline,
    eyebrow: carryOver?.eyebrow ?? t.eyebrow,
    logoUrl: carryOver?.logoUrl ?? null,
    heroImages: carryOver?.heroImages ?? [],
    sections: carryOver?.sections ?? defaultSections(),
    status: carryOver?.status ?? "draft",
  };
}

function patchFromDraft(draft: WebsiteDraft) {
  return {
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
    logoUrl: draft.logoUrl,
    heroImages: draft.heroImages,
    sections: draft.sections,
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
  const [dirty, setDirty] = useState(false);
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
      setDirty(false);
      goCustomize();
      const res = await switchTemplateAction(templateId);
      if (!res.ok) setError(res.error);
    },
    [draft, goCustomize],
  );

  const updateDraft = useCallback((patch: Partial<WebsiteDraft>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
    setDirty(true);
  }, []);

  // `save` is called from a debounce timer as well as from buttons, so it
  // reads the draft from a ref rather than closing over it — otherwise every
  // keystroke would respawn the timer with a stale callback.
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const save = useCallback(async () => {
    const current = draftRef.current;
    if (!current) return;
    setSaving(true);
    setError(null);
    const res = await saveWebsiteConfig(patchFromDraft(current));
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    // Anything typed while the save was in flight keeps the draft dirty.
    if (draftRef.current === current) setDirty(false);
  }, []);

  useEffect(() => {
    if (!dirty || view !== "customize") return;
    const timer = setTimeout(() => void save(), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [dirty, draft, view, save]);

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
        studioName={studioName}
        studioSlug={studioSlug}
        status={publishedStatus}
        saving={saving}
        dirty={dirty}
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
