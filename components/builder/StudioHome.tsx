// ============================================================================
//  components/builder/StudioHome.tsx — Studio v2 landing: pick a starter
//  template or reopen an existing draft.
// ============================================================================

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { STARTER_TEMPLATES } from "@/lib/builder/templates";
import { createStudioPage, deleteStudioPage } from "@/app/portal/admin/site/studio/actions";

export interface StudioPageRow {
  pageId: string;
  title: string;
  slug: string;
  status: "draft" | "published";
  isHome: boolean;
  templateId: string | null;
  /** False = this page was only ever built in the old block editor — opening it converts its content. */
  hasV2Document: boolean;
  updatedAt: string | null;
}

function StatusBadge({ page }: { page: StudioPageRow }) {
  if (page.status === "published") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Live
      </span>
    );
  }
  return <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-500">Draft</span>;
}

export function StudioHome({ pages, provisioned }: { pages: StudioPageRow[]; provisioned: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const create = (templateId: string) =>
    startTransition(async () => {
      setError(null);
      const res = await createStudioPage(templateId);
      if (res.ok) router.push(`/portal/admin/site/studio/${res.data.pageId}`);
      else setError(res.error);
    });

  const legacyCount = pages.filter((p) => !p.hasV2Document).length;

  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <h1 className="text-xl font-semibold text-neutral-900">Website</h1>
      </div>
      <p className="mb-6 text-sm text-neutral-500">
        Build and publish your studio&apos;s public pages — hybrid layouts, responsive breakpoints, inline editing and design tokens.
        Pages start as private drafts; use Publish when you&apos;re ready to put one live.
      </p>

      {!provisioned && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Studio storage isn’t provisioned yet. Run <code className="rounded bg-amber-100 px-1">npm run db:push</code> to apply
          migration <code>0057_site_builder_v2.sql</code>, then reload.
        </div>
      )}
      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Your pages</h2>
        {legacyCount > 0 && (
          <span className="text-[11px] text-neutral-400">
            {legacyCount} built in the old editor — open one to bring it into Studio
          </span>
        )}
      </div>
      {pages.length === 0 ? (
        <p className="mb-8 text-sm text-neutral-400">No pages yet — pick a template below to begin.</p>
      ) : (
        <div className="mb-8 divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white">
          {pages.map((p) => (
            <div key={p.pageId} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-neutral-800">{p.title}</span>
                  {p.isHome && <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">Home</span>}
                  <StatusBadge page={p} />
                  {!p.hasV2Document && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">Old editor</span>
                  )}
                </div>
                <div className="text-[11px] text-neutral-400">
                  /{p.isHome ? "" : p.slug}
                  {p.updatedAt ? ` · ${new Date(p.updatedAt).toLocaleDateString()}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link href={`/portal/admin/site/studio/${p.pageId}`} className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700">
                  Open
                </Link>
                <button
                  onClick={() => startTransition(async () => { await deleteStudioPage(p.pageId); router.refresh(); })}
                  className="rounded-md border border-neutral-200 px-2 py-1.5 text-xs text-neutral-500 hover:bg-neutral-50"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">New page from a template</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {STARTER_TEMPLATES.map((t) => (
          <button
            key={t.id}
            disabled={pending}
            onClick={() => create(t.id)}
            className="group overflow-hidden rounded-xl border border-neutral-200 bg-white text-left transition hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50"
          >
            <div className="flex h-28 items-center justify-center text-2xl font-bold text-white" style={{ background: `linear-gradient(135deg, ${t.accent}, ${t.accent}cc)` }}>
              {t.name}
            </div>
            <div className="p-3">
              <div className="text-sm font-medium text-neutral-800">{t.name}</div>
              <div className="mt-0.5 line-clamp-2 text-[11px] text-neutral-500">{t.description}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
