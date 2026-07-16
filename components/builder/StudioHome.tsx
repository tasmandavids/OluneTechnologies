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
  templateId: string | null;
  updatedAt: string | null;
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

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-1 flex items-center gap-2">
        <h1 className="text-xl font-semibold text-neutral-900">Studio</h1>
        <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700">v2</span>
      </div>
      <p className="mb-6 text-sm text-neutral-500">
        The rebuilt visual builder — hybrid layouts, responsive breakpoints, inline editing and design tokens.
        Pages start as private drafts; open one and use Publish when you&apos;re ready to put it live.
      </p>

      {!provisioned && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Studio storage isn’t provisioned yet. Run <code className="rounded bg-amber-100 px-1">npm run db:push</code> to apply
          migration <code>0057_site_builder_v2.sql</code>, then reload.
        </div>
      )}
      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">Start from a template</h2>
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

      <h2 className="mb-3 mt-8 text-xs font-semibold uppercase tracking-wide text-neutral-400">Your studio drafts</h2>
      {pages.length === 0 ? (
        <p className="text-sm text-neutral-400">No drafts yet — pick a template above to begin.</p>
      ) : (
        <div className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white">
          {pages.map((p) => (
            <div key={p.pageId} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-sm font-medium text-neutral-800">{p.title}</div>
                <div className="text-[11px] text-neutral-400">
                  {p.templateId ? `${p.templateId} · ` : ""}{p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : ""}
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
    </div>
  );
}
