"use client";

// ============================================================================
//  components/website/admin/LogoDropzone.tsx — logo upload. Same signed-URL
//  + client-side downscale pattern as the old v1 ImageInput.tsx, pointed at
//  the new createLogoUploadUrl/saveLogoUrl actions.
// ============================================================================

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { createLogoUploadUrl, saveLogoUrl } from "@/app/portal/admin/site/actions";
import { IconUpload } from "@/components/website/icons";
import { IconX } from "@/components/admin/dashboard/icons";

const BUCKET = "site-images";
const MAX_DIM = 1920;
const DOWNSCALE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

async function maybeDownscale(file: File): Promise<Blob> {
  if (!DOWNSCALE_TYPES.has(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    if (Math.max(width, height) <= MAX_DIM) {
      bitmap.close();
      return file;
    }
    const scale = MAX_DIM / Math.max(width, height);
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, file.type, 0.85));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

export function LogoDropzone({ logoUrl, onChange }: { logoUrl: string | null; onChange: (url: string | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setError(null);
    setBusy(true);
    try {
      const upload = await maybeDownscale(file);
      const ticket = await createLogoUploadUrl(file.type, upload.size);
      if (!ticket.ok) {
        setError(ticket.error);
        return;
      }
      const supabase = createClient();
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .uploadToSignedUrl(ticket.data.path, ticket.data.token, upload, { contentType: file.type });
      if (upErr) {
        setError(upErr.message);
        return;
      }
      const saved = await saveLogoUrl(ticket.data.publicUrl);
      if (!saved.ok) {
        setError(saved.error);
        return;
      }
      onChange(ticket.data.publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  if (logoUrl) {
    return (
      <div className="mt-2.5 flex items-center gap-2.5 rounded-xl border p-2.5" style={{ borderColor: "var(--hair)", background: "rgba(255,255,255,.66)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL, next/image domain config not worth it for an admin-only logo preview */}
        <img src={logoUrl} alt="Studio logo" className="h-10 w-10 rounded-lg object-contain" style={{ background: "#fff" }} />
        <div className="min-w-0 flex-1 truncate text-[12px] text-muted">Logo uploaded</div>
        <button type="button" onClick={() => onChange(null)} className="text-muted" aria-label="Remove logo">
          <IconX className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="mt-2.5 flex w-full flex-col items-center gap-1.5 rounded-[14px] border border-dashed px-4 py-4 text-center"
        style={{ borderColor: "color-mix(in srgb, var(--brand) 40%, var(--hair))", background: "color-mix(in srgb, var(--brand) 6%, var(--surface))" }}
      >
        <IconUpload className="h-5 w-5 text-muted" />
        <div className="text-[13px] font-semibold text-ink">{busy ? "Uploading…" : "Drop your logo"}</div>
        <div className="text-[12px] text-muted">SVG or PNG · transparent works best</div>
      </button>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/svg+xml" onChange={onFile} className="hidden" />
      {error && <div className="mt-1.5 text-[12px] text-[var(--error)]">{error}</div>}
    </div>
  );
}
