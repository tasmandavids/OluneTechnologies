// ============================================================================
//  components/builder/HostContext.tsx — publish/rename state for the Studio
//  editor. Kept separate from the Zustand document store because it reflects
//  server truth on the linked site_pages row (status/is_home/show_in_nav/
//  slug), not document content — BuilderStudio owns it and provides it to
//  Topbar (publish controls) and the Inspector's Page tab (rename).
// ============================================================================

"use client";

import { createContext, useContext } from "react";

export type PublishStatus = "draft" | "published";

export interface RenameResult {
  ok: boolean;
  error?: string;
  data?: { title: string; slug: string };
}

export interface StudioHostState {
  status: PublishStatus;
  isHome: boolean;
  showInNav: boolean;
  slug: string;
}

export interface StudioHostValue extends StudioHostState {
  publishing: boolean;
  publishError: string | null;
  publish: (opts: { asHome: boolean; showInNav: boolean }) => Promise<void>;
  unpublish: () => Promise<void>;
  rename: (patch: { title?: string; slug?: string }) => Promise<RenameResult>;
}

export const StudioHostContext = createContext<StudioHostValue | null>(null);

export function useStudioHost(): StudioHostValue {
  const ctx = useContext(StudioHostContext);
  if (!ctx) throw new Error("useStudioHost must be used within <BuilderStudio>");
  return ctx;
}
