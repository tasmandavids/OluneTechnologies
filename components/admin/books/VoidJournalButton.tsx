"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { voidJournalAction } from "@/app/portal/admin/books/actions";
import { Dialog } from "./Dialog";
import { Field, dangerButton, dangerButtonStyle, fieldClass, fieldStyle, secondaryButton, secondaryButtonStyle } from "./ui";

export function VoidJournalButton({ journalId }: { journalId: string }) {
  const t = useTranslations("books.journals");
  const te = useTranslations("books.errors");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <>
      <button type="button" className={dangerButton} style={dangerButtonStyle} onClick={() => setOpen(true)}>
        {t("void")}
      </button>
      {open && (
        <Dialog title={t("voidTitle")} onClose={() => setOpen(false)}>
          <p className="text-sm text-muted">{t("voidBody")}</p>
          <div className="mt-3">
            <Field label={t("voidReason")}>
              <input className={fieldClass} style={fieldStyle} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          </div>
          {error && <p className="mt-3 text-sm" role="alert" style={{ color: "var(--danger, #c0392b)" }}>{error}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className={secondaryButton} style={secondaryButtonStyle} onClick={() => setOpen(false)}>
              {t("cancel")}
            </button>
            <button
              type="button"
              className={dangerButton}
              style={dangerButtonStyle}
              disabled={pending || !reason.trim()}
              onClick={() =>
                start(async () => {
                  const res = await voidJournalAction(journalId, reason);
                  if (!res.ok) return setError(te.has(res.error) ? te(res.error) : res.error);
                  setOpen(false);
                  router.refresh();
                })
              }
            >
              {t("confirmVoid")}
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
