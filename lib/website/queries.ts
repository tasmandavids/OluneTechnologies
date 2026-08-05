// ============================================================================
//  lib/website/queries.ts — reads for website_configs.
//  Public reads use the cookieless anon client (RLS exposes published
//  configs to anonymous visitors); admin reads use the caller's own
//  authenticated client (passed in from a server action / admin page).
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { createPublicClient } from "@/lib/supabase/public";
import type { WebsiteConfig, WebsiteSection } from "./types";

const COLUMNS =
  "studio_id, template_id, kind, accent_color, paper_color, ink_color, font_display, font_body, density, studio_name_override, headline, tagline, eyebrow, logo_url, sections, status, published_at, updated_at";

type WebsiteConfigRow = {
  studio_id: string;
  template_id: string;
  kind: WebsiteConfig["kind"];
  accent_color: string;
  paper_color: string;
  ink_color: string;
  font_display: string;
  font_body: string;
  density: number;
  studio_name_override: string | null;
  headline: string;
  tagline: string;
  eyebrow: string;
  logo_url: string | null;
  sections: unknown;
  status: WebsiteConfig["status"];
  published_at: string | null;
  updated_at: string;
};

function normalizeSections(raw: unknown): WebsiteSection[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
    .map((s) => ({
      key: String(s.key) as WebsiteSection["key"],
      visible: Boolean(s.visible),
      headline: typeof s.headline === "string" ? s.headline : undefined,
      body: typeof s.body === "string" ? s.body : undefined,
    }));
}

function toWebsiteConfig(row: WebsiteConfigRow): WebsiteConfig {
  return {
    studioId: row.studio_id,
    templateId: row.template_id,
    kind: row.kind,
    accentColor: row.accent_color,
    paperColor: row.paper_color,
    inkColor: row.ink_color,
    fontDisplay: row.font_display,
    fontBody: row.font_body,
    density: row.density,
    studioNameOverride: row.studio_name_override,
    headline: row.headline,
    tagline: row.tagline,
    eyebrow: row.eyebrow,
    logoUrl: row.logo_url,
    sections: normalizeSections(row.sections),
    status: row.status,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  };
}

/** Admin read — any status, scoped by the caller's own authenticated client. */
export async function getWebsiteConfig(
  supabase: SupabaseClient,
  studioId: string,
): Promise<WebsiteConfig | null> {
  const { data } = await supabase
    .from("website_configs")
    .select(COLUMNS)
    .eq("studio_id", studioId)
    .maybeSingle();
  return data ? toWebsiteConfig(data as WebsiteConfigRow) : null;
}

/** Public read — published only, cookieless client. */
export async function getPublishedWebsiteConfig(studioId: string): Promise<WebsiteConfig | null> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("website_configs")
    .select(COLUMNS)
    .eq("studio_id", studioId)
    .eq("status", "published")
    .maybeSingle();
  return data ? toWebsiteConfig(data as WebsiteConfigRow) : null;
}
