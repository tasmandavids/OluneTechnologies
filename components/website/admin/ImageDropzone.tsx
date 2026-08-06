"use client";

// ============================================================================
//  components/website/admin/ImageDropzone.tsx — one image slot in the
//  customizer. Handles click-to-pick and drag-and-drop, downscales oversized
//  photos in the browser, uploads through a server-minted signed URL, and
//  hands the public URL back to the caller.
//
//  It never writes to website_configs itself — the caller folds the URL into
//  the working draft so the live preview updates immediately and the normal
//  save path persists it (and cleans up whatever it replaced).
// ============================================================================

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { createWebsiteImageUploadUrl } from "@/app/portal/admin/site/actions";
import { IMAGE_ACCEPT, IMAGE_BUCKET, MAX_IMAGE_BYTES } from "@/lib/website/images";
import { IconUpload } from "@/components/website/icons";
import { IconX } from "@/components/admin/dashboard/icons";

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

export function ImageDropzone({
  value,
  onChange,
  slot,
  label,
  hint,
  height = 74,
}: {
  value: string | null | undefined;
  onChange: (url: string | null) => void;
  /** Filename prefix for the uploaded object — "logo", "hero-1", "gallery"… */
  slot: string;
  label?: string;
  hint?: string;
  height?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setError(null);
    if (file.size > MAX_IMAGE_BYTES) {
      setError("That image is over 8 MB.");
      return;
    }
    setBusy(true);
    try {
      const blob = await maybeDownscale(file);
      const ticket = await createWebsiteImageUploadUrl(file.type, blob.size, slot);
      if (!ticket.ok) {
        setError(ticket.error);
        return;
      }
      const supabase = createClient();
      const { error: upErr } = await supabase.storage
        .from(IMAGE_BUCKET)
        .uploadToSignedUrl(ticket.data.path, ticket.data.token, blob, { contentType: file.type });
      if (upErr) {
        setError(upErr.message);
        return;
      }
      onChange(ticket.data.publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) await upload(file);
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("That file isn't an image.");
      return;
    }
    await upload(file);
  };

  return (
    <div>
      {label && <div className="mb-1.5 text-[12.5px] text-ink">{label}</div>}
      {value ? (
        <div
          className="relative overflow-hidden rounded-[12px] border"
          style={{ height, borderColor: "var(--hair)", background: "#fff" }}
        >
          <div
            className="absolute inset-0"
            style={{ backgroundImage: `url("${value}")`, backgroundSize: "cover", backgroundPosition: "center" }}
          />
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 p-1.5">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="rounded-lg px-2.5 py-1 text-[11.5px] font-semibold text-[#0a0a0a]"
              style={{ background: "rgba(255,255,255,.9)", backdropFilter: "blur(8px)" }}
            >
              {busy ? "Uploading…" : "Replace"}
            </button>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="ml-auto rounded-lg p-1 text-[#0a0a0a]"
              style={{ background: "rgba(255,255,255,.9)", backdropFilter: "blur(8px)" }}
              aria-label="Remove image"
            >
              <IconX className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          disabled={busy}
          className="flex w-full flex-col items-center justify-center gap-1 rounded-[12px] border border-dashed px-3 text-center"
          style={{
            height,
            borderColor: dragging ? "var(--brand)" : "color-mix(in srgb, var(--brand) 40%, var(--hair))",
            background: dragging
              ? "color-mix(in srgb, var(--brand) 14%, var(--surface))"
              : "color-mix(in srgb, var(--brand) 6%, var(--surface))",
          }}
        >
          <IconUpload className="h-4 w-4 text-muted" />
          <div className="text-[12.5px] font-semibold text-ink">{busy ? "Uploading…" : "Drop a photo"}</div>
          {hint && <div className="text-[11.5px] leading-[1.35] text-muted">{hint}</div>}
        </button>
      )}
      <input ref={inputRef} type="file" accept={IMAGE_ACCEPT} onChange={onPick} className="hidden" />
      {error && <div className="mt-1.5 text-[12px] text-[var(--error)]">{error}</div>}
    </div>
  );
}

/** A fixed-length row of slots backed by one array — used for hero art and
 *  the gallery mosaic. Empty slots render as dropzones, so order is stable. */
export function ImageSlotGrid({
  values,
  count,
  onChange,
  slot,
  labels,
  hints,
  columns = 2,
  height = 74,
}: {
  values: string[];
  count: number;
  onChange: (next: string[]) => void;
  slot: string;
  labels?: string[];
  hints?: string[];
  columns?: number;
  height?: number;
}) {
  const setAt = (index: number, url: string | null) => {
    const next = Array.from({ length: count }, (_, i) => values[i] ?? "");
    next[index] = url ?? "";
    // Trailing blanks carry no meaning — drop them so the stored array stays
    // the minimum that still keeps every filled slot at its own index.
    while (next.length && !next[next.length - 1]) next.pop();
    onChange(next);
  };

  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {Array.from({ length: count }, (_, i) => (
        <ImageDropzone
          key={i}
          value={values[i] || null}
          onChange={(url) => setAt(i, url)}
          slot={`${slot}-${i + 1}`}
          label={labels?.[i]}
          hint={hints?.[i]}
          height={height}
        />
      ))}
    </div>
  );
}
