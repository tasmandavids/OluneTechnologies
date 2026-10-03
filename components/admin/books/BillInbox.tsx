"use client";

// ============================================================================
//  Drop supplier invoices here → draft bills.
//
//  Files go straight from the browser to private Storage on signed upload
//  URLs (startBillUploadAction), then fileBillUploadsAction makes one draft
//  bill per file and reads it with the studio's AI key. One file opens its
//  draft for review; several show a short summary with links.
// ============================================================================

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { fileBillUploadsAction, startBillUploadAction } from "@/app/portal/admin/books/inbox-actions";
import { ATTACHMENT_ACCEPT, BOOKS_ATTACHMENT_BUCKET, MAX_FILES_PER_UPLOAD, checkAttachment } from "@/lib/ledger/attachments";
import { formatLedgerMoney } from "@/lib/ledger/money";
import type { FiledBill } from "@/lib/ledger/server/inbox";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";

type Props = { currency: string; locale: string; aiAvailable: boolean; compact?: boolean };

export function BillInbox({ currency, locale, aiAvailable, compact = false }: Props) {
  const t = useTranslations("books.inbox");
  const te = useTranslations("books.errors");
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [stage, setStage] = useState<"idle" | "uploading" | "reading">("idle");
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<FiledBill[] | null>(null);
  const [, start] = useTransition();

  const fail = (code: string) => {
    setStage("idle");
    setError(te.has(code) ? te(code) : code);
  };

  async function handle(list: FileList | File[]) {
    const files = Array.from(list);
    setError(null);
    setResults(null);
    if (!files.length) return;
    if (files.length > MAX_FILES_PER_UPLOAD) return fail("tooManyFiles");
    for (const f of files) {
      const c = checkAttachment(f.type, f.size);
      if (!c.ok) return fail(c.error);
    }

    setStage("uploading");
    const tickets = await startBillUploadAction(files.map((f) => ({ mimeType: f.type, sizeBytes: f.size })));
    if (!tickets.ok || !tickets.data) return fail(tickets.ok ? "unexpected" : tickets.error);
    const storage = createClient().storage.from(BOOKS_ATTACHMENT_BUCKET);
    const uploads = await Promise.all(files.map((f, i) => storage.uploadToSignedUrl(tickets.data![i].path, tickets.data![i].token, f, { contentType: f.type })));
    if (uploads.some((u) => u.error)) return fail("uploadFailed");

    setStage("reading");
    const filed = await fileBillUploadsAction(files.map((f, i) => ({ path: tickets.data![i].path, name: f.name, mimeType: f.type, sizeBytes: f.size })));
    if (!filed.ok || !filed.data) return fail(filed.ok ? "unexpected" : filed.error);
    setStage("idle");
    if (filed.data.length === 1) {
      router.push(`/portal/admin/books/bills/${filed.data[0].billId}`);
      return;
    }
    setResults(filed.data);
    start(() => router.refresh());
  }

  const busy = stage !== "idle";

  return (
    <GlassPanel className={compact ? "!p-4" : "!p-5"}>
      <div
        role="button"
        tabIndex={0}
        aria-busy={busy}
        aria-label={t("dropLabel")}
        onClick={() => !busy && input.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !busy) {
            e.preventDefault();
            input.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (!busy) void handle(e.dataTransfer.files);
        }}
        className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition"
        style={{ borderColor: over ? "var(--brand)" : "var(--hair)", background: over ? "var(--t2)" : "transparent" }}
      >
        <span aria-hidden className="text-2xl">{busy ? "⏳" : "📥"}</span>
        <p className="text-sm font-semibold text-ink">
          {stage === "uploading" ? t("uploading") : stage === "reading" ? (aiAvailable ? t("reading") : t("filing")) : t("dropTitle")}
        </p>
        <p className="max-w-md text-xs text-muted">{aiAvailable ? t("dropHintAi") : t("dropHint")}</p>
        <input
          ref={input}
          type="file"
          multiple
          accept={ATTACHMENT_ACCEPT}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void handle(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {!aiAvailable && !compact && (
        <p className="mt-3 text-xs text-muted">
          {t("noAiKey")}{" "}
          <Link href="/portal/admin/settings/connections" className="font-semibold text-(--brand)">
            {t("addAiKey")}
          </Link>
        </p>
      )}

      {error && (
        <p className="mt-3 text-sm" role="alert" style={{ color: "var(--danger, #c0392b)" }}>
          {error}
        </p>
      )}

      {results && (
        <ul className="mt-4 space-y-1.5 text-sm">
          {results.map((r) => (
            <li key={r.billId} className="flex items-center justify-between gap-3">
              <Link href={`/portal/admin/books/bills/${r.billId}`} className="truncate font-medium text-ink hover:underline">
                {r.supplierName ?? t("unknownSupplier")}
              </Link>
              <span className="shrink-0 text-xs text-muted">
                {r.read ? (r.totalCents ? formatLedgerMoney(r.totalCents, currency, locale) : t("readNoTotal")) : t("notRead")}
                {r.warnings.length > 0 ? ` · ${t("checkIt")}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </GlassPanel>
  );
}
