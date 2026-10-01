"use client";

// ============================================================================
//  A bill's documents: the supplier's invoice shown beside the bill, plus
//  attach / remove, and "read again" while the bill is still a draft.
//
//  URLs arrive pre-signed from the page (ten-minute links to a private
//  bucket); "open" asks for a fresh one so a tab left open still works.
// ============================================================================

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { attachToBillAction, attachmentLinkAction, readBillAgainAction, removeAttachmentAction, startBillUploadAction } from "@/app/portal/admin/books/inbox-actions";
import { ATTACHMENT_ACCEPT, BOOKS_ATTACHMENT_BUCKET, checkAttachment, isImage } from "@/lib/ledger/attachments";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";
import { secondaryButton, secondaryButtonStyle } from "./ui";

export type BillDocument = { id: string; name: string; mimeType: string; url: string | null };

type Props = {
  billId: string;
  documents: BillDocument[];
  draft: boolean;
  aiAvailable: boolean;
  /** Fill the column: the review layout. Otherwise a compact list. */
  preview: boolean;
};

export function BillDocuments({ billId, documents, draft, aiAvailable, preview }: Props) {
  const t = useTranslations("books.inbox");
  const te = useTranslations("books.errors");
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(documents[0]?.id ?? null);
  const current = documents.find((d) => d.id === shown) ?? documents[0] ?? null;

  const fail = (code: string) => setError(te.has(code) ? te(code) : code);

  async function attach(file: File) {
    setError(null);
    const c = checkAttachment(file.type, file.size);
    if (!c.ok) return fail(c.error);
    setBusy("attach");
    try {
      const ticket = await startBillUploadAction([{ mimeType: file.type, sizeBytes: file.size }]);
      if (!ticket.ok || !ticket.data) return fail(ticket.ok ? "unexpected" : ticket.error);
      const { path, token } = ticket.data[0];
      const up = await createClient().storage.from(BOOKS_ATTACHMENT_BUCKET).uploadToSignedUrl(path, token, file, { contentType: file.type });
      if (up.error) return fail("uploadFailed");
      const res = await attachToBillAction(billId, { path, name: file.name, mimeType: file.type, sizeBytes: file.size });
      if (!res.ok) return fail(res.error);
      start(() => router.refresh());
    } finally {
      setBusy(null);
    }
  }

  function remove(id: string) {
    if (!window.confirm(t("removeConfirm"))) return;
    setError(null);
    start(async () => {
      const res = await removeAttachmentAction(id);
      if (!res.ok) return fail(res.error);
      router.refresh();
    });
  }

  function open(id: string) {
    start(async () => {
      const res = await attachmentLinkAction(id);
      if (res.ok && res.data) window.open(res.data.url, "_blank", "noopener");
      else if (!res.ok) fail(res.error);
    });
  }

  function readAgain() {
    setError(null);
    setBusy("read");
    start(async () => {
      const res = await readBillAgainAction(billId);
      setBusy(null);
      if (!res.ok) return fail(res.error);
      router.refresh();
    });
  }

  return (
    <GlassPanel className="!p-0 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">{t("documents")}</p>
        <div className="flex flex-wrap gap-2">
          {draft && documents.length > 0 && aiAvailable && (
            <button type="button" className={`${secondaryButton} !px-3 !py-1.5 !text-xs`} style={secondaryButtonStyle} onClick={readAgain} disabled={pending || !!busy}>
              {busy === "read" ? t("reading") : t("readAgain")}
            </button>
          )}
          <button type="button" className={`${secondaryButton} !px-3 !py-1.5 !text-xs`} style={secondaryButtonStyle} onClick={() => input.current?.click()} disabled={pending || !!busy}>
            {busy === "attach" ? t("uploading") : t("attach")}
          </button>
          <input
            ref={input}
            type="file"
            accept={ATTACHMENT_ACCEPT}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void attach(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {error && (
        <p className="px-4 pt-2 text-sm" role="alert" style={{ color: "var(--danger, #c0392b)" }}>
          {error}
        </p>
      )}

      {documents.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted">{t("noDocuments")}</p>
      ) : (
        <>
          <ul className="flex flex-wrap gap-2 px-4 py-3">
            {documents.map((d) => (
              <li key={d.id} className="flex items-center gap-1 rounded-lg border px-2 py-1 text-xs" style={{ borderColor: d.id === current?.id ? "var(--brand)" : "var(--hair)" }}>
                <button type="button" className="max-w-[220px] truncate text-ink" onClick={() => (preview ? setShown(d.id) : open(d.id))}>
                  📎 {d.name}
                </button>
                {preview && (
                  <button type="button" className="text-muted hover:text-ink" onClick={() => open(d.id)} aria-label={t("openInTab")} title={t("openInTab")}>
                    ↗
                  </button>
                )}
                <button type="button" className="text-muted hover:text-ink" onClick={() => remove(d.id)} aria-label={t("remove")} title={t("remove")}>
                  ×
                </button>
              </li>
            ))}
          </ul>
          {preview && current && (
            <div className="border-t" style={{ borderColor: "var(--hair)" }}>
              {!current.url ? (
                <p className="px-4 py-6 text-sm text-muted">{t("previewUnavailable")}</p>
              ) : isImage(current.mimeType) && current.mimeType !== "image/heic" && current.mimeType !== "image/heif" ? (
                // Signed, short-lived URL to a private object: next/image can't optimise it.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={current.url} alt={current.name} className="max-h-[80vh] w-full object-contain" />
              ) : current.mimeType === "application/pdf" ? (
                <iframe src={current.url} title={current.name} className="h-[80vh] w-full" />
              ) : (
                <p className="px-4 py-6 text-sm text-muted">
                  {t("previewUnavailable")}{" "}
                  <button type="button" className="font-semibold text-[--brand]" onClick={() => open(current.id)}>
                    {t("openInTab")}
                  </button>
                </p>
              )}
            </div>
          )}
        </>
      )}
    </GlassPanel>
  );
}
