// ============================================================================
//  components/builder/StudioSandbox.tsx — in-memory Studio preview.
//
//  Mounts the full editor with a starter template and a no-op save, so the
//  builder can be tried without the database / migration. Nothing persists.
//
//  SSR-safety: a starter template's build() mints fresh random node IDs each
//  call, so building during SSR and again on the client would hydrate-mismatch.
//  We therefore render the editor CLIENT-ONLY (after mount) — the canvas is
//  never server-rendered with throwaway IDs. The real editor route has no such
//  issue: its document arrives as a serialized server prop with stable IDs.
// ============================================================================

"use client";

import { useEffect, useMemo, useState } from "react";
import { BuilderStudio } from "./BuilderStudio";
import { STARTER_TEMPLATES } from "@/lib/builder/templates";

export function StudioSandbox({ backHref }: { backHref?: string }) {
  const [ready, setReady] = useState(false);
  const [templateId, setTemplateId] = useState(STARTER_TEMPLATES[0].id);
  useEffect(() => setReady(true), []);

  const doc = useMemo(
    () => (STARTER_TEMPLATES.find((t) => t.id === templateId) ?? STARTER_TEMPLATES[0]).build(),
    [templateId],
  );

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-100 text-sm text-neutral-400">
        Loading Studio…
      </div>
    );
  }

  return (
    <>
      <div className="fixed left-1/2 top-1.5 z-[10000] flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/80 px-2 py-1 text-[11px] text-white">
        <span className="px-1 opacity-70">Sandbox:</span>
        {STARTER_TEMPLATES.map((t) => (
          <button
            key={t.id}
            onClick={() => setTemplateId(t.id)}
            className={`rounded-full px-2 py-0.5 ${templateId === t.id ? "bg-white text-black" : "hover:bg-white/20"}`}
          >
            {t.name}
          </button>
        ))}
      </div>
      {/* key forces a clean remount (re-running loadDocument) when the template changes */}
      <BuilderStudio
        key={templateId}
        initialDocument={doc}
        save={async () => ({ ok: true })}
        backHref={backHref}
        pageInfo={{ status: "draft", isHome: false, showInNav: false, slug: doc.meta.slug }}
        publish={async () => ({ ok: false, error: "Publishing isn't available in the sandbox." })}
        unpublish={async () => ({ ok: false, error: "Publishing isn't available in the sandbox." })}
        rename={async () => ({ ok: false, error: "Renaming isn't available in the sandbox." })}
      />
    </>
  );
}
