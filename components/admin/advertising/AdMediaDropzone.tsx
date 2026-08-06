"use client";

// ============================================================================
//  AdMediaDropzone — one creative slot in the composer (image or video).
//
//  Replaces a bare "paste a URL" text input. Studio owners have a photo or a
//  clip on their phone, not a hosted URL — and TikTok hard-requires a video
//  URL, so without this the integration was unusable by anyone.
//
//  Uploads go browser → Storage directly through a server-minted signed URL,
//  so a 100 MB video never passes through a serverless function.
// ============================================================================

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import {
  createAdMediaUploadUrl,
  deleteAdMedia,
} from "@/app/portal/admin/advertising/actions";
import {
  AD_IMAGE_ACCEPT,
  AD_MEDIA_BUCKET,
  AD_VIDEO_ACCEPT,
  maxLabelFor,
  validateAdMedia,
  type AdMediaKind,
} from "@/lib/advertising/media";

export function AdMediaDropzone({
  kind,
  value,
  onChange,
  label,
  hint,
}: {
  kind: AdMediaKind;
  value: string;
  onChange: (url: string) => void;
  label: string;
  hint?: string;
}) {
  const t = useTranslations("admin.advertising.media");
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);

    // Same validator the server runs — fails fast, before a 100 MB read.
    const valid = validateAdMedia(kind, file.type, file.size);
    if (!valid.ok) {
      setError(valid.error);
      return;
    }

    setBusy(true);
    try {
      const ticket = await createAdMediaUploadUrl(kind, file.type, file.size);
      if (!ticket.ok) {
        setError(ticket.error);
        return;
      }
      const supabase = createClient();
      const { error: upErr } = await supabase.storage
        .from(AD_MEDIA_BUCKET)
        .uploadToSignedUrl(ticket.data.path, ticket.data.token, file, {
          contentType: file.type,
        });
      if (upErr) {
        setError(upErr.message);
        return;
      }
      onChange(ticket.data.publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("uploadFailed"));
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    const previous = value;
    onChange("");
    setError(null);
    // Fire-and-forget: the slot is already cleared in the UI, and a stranded
    // object must not block the composer.
    if (previous) void deleteAdMedia(previous);
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) await upload(file);
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await upload(file);
  }

  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">{label}</div>

      {value ? (
        <div className="rounded-xl border border-[--hair] bg-base p-2">
          {kind === "video" ? (
            <video src={value} controls className="max-h-48 w-full rounded-lg bg-black" />
          ) : (
            /* Plain <img>: the source is a Supabase Storage public URL on a
               per-project host, so next/image would need a remotePatterns entry
               for an admin-only thumbnail that is never on a critical path. */
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="max-h-48 w-full rounded-lg object-contain" />
          )}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="rounded-lg border border-[--hair] bg-surface px-3 py-1.5 text-xs font-semibold text-ink disabled:opacity-50"
            >
              {busy ? t("uploading") : t("replace")}
            </button>
            <button
              type="button"
              onClick={clear}
              className="rounded-lg border border-[--hair] bg-surface px-3 py-1.5 text-xs font-semibold text-muted hover:text-ink"
            >
              {t("remove")}
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
          className="flex w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed px-3 py-6 text-center disabled:opacity-60"
          style={{
            borderColor: dragging ? "var(--brand)" : "var(--hair)",
            background: dragging ? "color-mix(in srgb, var(--brand) 12%, var(--surface))" : "var(--base)",
          }}
        >
          <span className="text-sm font-semibold text-ink">
            {busy ? t("uploading") : kind === "video" ? t("dropVideo") : t("dropImage")}
          </span>
          <span className="text-xs text-muted">{hint ?? t("maxSize", { size: maxLabelFor(kind) })}</span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={kind === "video" ? AD_VIDEO_ACCEPT : AD_IMAGE_ACCEPT}
        onChange={onPick}
        className="hidden"
      />
      {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
    </div>
  );
}
