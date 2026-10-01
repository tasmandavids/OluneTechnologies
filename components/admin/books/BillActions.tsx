"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { payBillAction, voidBillAction } from "@/app/portal/admin/books/actions";
import { formatLedgerMoney, parseMoneyInput } from "@/lib/ledger/money";
import { Dialog } from "./Dialog";
import { Field, dangerButton, dangerButtonStyle, fieldClass, fieldStyle, primaryButton, secondaryButton, secondaryButtonStyle } from "./ui";

type Props = {
  billId: string;
  status: "draft" | "awaiting_payment" | "paid" | "void";
  outstandingCents: number;
  bankAccounts: { id: string; name: string }[];
  today: string;
  currency: string;
  locale: string;
};

export function BillActions({ billId, status, outstandingCents, bankAccounts, today, currency, locale }: Props) {
  const t = useTranslations("books.bills");
  const te = useTranslations("books.errors");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dialog, setDialog] = useState<"pay" | "void" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState((outstandingCents / 100).toFixed(2));
  const [bank, setBank] = useState(bankAccounts[0]?.id ?? "");
  const [reason, setReason] = useState("");

  const fail = (e: string) => setError(te.has(e) ? te(e) : e);

  return (
    <>
      {status === "awaiting_payment" && (
        <button type="button" className={primaryButton} onClick={() => { setError(null); setDialog("pay"); }}>
          {t("recordPayment")}
        </button>
      )}
      {(status === "awaiting_payment" || status === "draft") && (
        <button type="button" className={dangerButton} style={dangerButtonStyle} onClick={() => { setError(null); setDialog("void"); }}>
          {status === "draft" ? t("deleteDraft") : t("voidBill")}
        </button>
      )}

      {dialog === "pay" && (
        <Dialog title={t("recordPayment")} onClose={() => setDialog(null)}>
          <p className="text-sm text-muted">{t("outstandingIs", { amount: formatLedgerMoney(outstandingCents, currency, locale) })}</p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label={t("paidOn")}>
              <input type="date" className={fieldClass} style={fieldStyle} value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label={t("amount")}>
              <input className={`${fieldClass} text-right`} style={fieldStyle} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label={t("paidFrom")}>
              <select className={fieldClass} style={fieldStyle} value={bank} onChange={(e) => setBank(e.target.value)}>
                {bankAccounts.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {error && <p className="mt-3 text-sm" role="alert" style={{ color: "var(--danger, #c0392b)" }}>{error}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className={secondaryButton} style={secondaryButtonStyle} onClick={() => setDialog(null)}>
              {t("cancel")}
            </button>
            <button
              type="button"
              className={primaryButton}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const cents = parseMoneyInput(amount);
                  if (!cents || cents <= 0) return fail("invalid");
                  const res = await payBillAction({ billId, date, amountCents: cents, bankAccountId: bank });
                  if (!res.ok) return fail(res.error);
                  setDialog(null);
                  router.refresh();
                })
              }
            >
              {t("savePayment")}
            </button>
          </div>
        </Dialog>
      )}

      {dialog === "void" && (
        <Dialog title={status === "draft" ? t("deleteDraft") : t("voidBill")} onClose={() => setDialog(null)}>
          <p className="text-sm text-muted">{status === "draft" ? t("deleteDraftBody") : t("voidBody")}</p>
          {status !== "draft" && (
            <div className="mt-3">
              <Field label={t("voidReason")}>
                <input className={fieldClass} style={fieldStyle} value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
            </div>
          )}
          {error && <p className="mt-3 text-sm" role="alert" style={{ color: "var(--danger, #c0392b)" }}>{error}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className={secondaryButton} style={secondaryButtonStyle} onClick={() => setDialog(null)}>
              {t("cancel")}
            </button>
            <button
              type="button"
              className={dangerButton}
              style={dangerButtonStyle}
              disabled={pending || (status !== "draft" && !reason.trim())}
              onClick={() =>
                start(async () => {
                  const res = await voidBillAction(billId, reason);
                  if (!res.ok) return fail(res.error);
                  router.push("/portal/admin/books/bills");
                  router.refresh();
                })
              }
            >
              {status === "draft" ? t("deleteDraft") : t("voidBill")}
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
