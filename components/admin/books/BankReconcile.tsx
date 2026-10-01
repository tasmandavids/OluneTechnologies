"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";
import { codeBankTxnAction, matchBankTxnAction, setBankTxnExcludedAction, unreconcileBankTxnAction } from "@/app/portal/admin/books/actions";
import { formatLedgerMoney } from "@/lib/ledger/money";
import type { ScoredMatch } from "@/lib/ledger/reconcile";
import type { LedgerAccount, TaxRate } from "@/lib/ledger/types";
import { Badge, EmptyState, fieldStyle, primaryButton, secondaryButton, secondaryButtonStyle, smallFieldClass } from "./ui";

type ActionOutcome = { ok: boolean; error?: string };
interface ActionFn {
  (): Promise<ActionOutcome>;
}

export type ReconcileTxn = {
  id: string;
  date: string;
  description: string;
  reference: string | null;
  amountCents: number;
  status: "unreconciled" | "reconciled" | "excluded";
  journalId: string | null;
  matches: ScoredMatch[];
  hint: "stripe_payout" | "bank_fee" | "interest" | null;
};

type Props = {
  rows: ReconcileTxn[];
  view: "unreconciled" | "reconciled";
  bankAccountId: string;
  accounts: LedgerAccount[];
  rates: TaxRate[];
  taxRegistered: boolean;
  stripeClearingId: string | null;
  bankFeesId: string | null;
  interestId: string | null;
  currency: string;
  locale: string;
};

export function BankReconcile(props: Props) {
  const t = useTranslations("books.bank");
  if (!props.rows.length) {
    return <EmptyState title={props.view === "unreconciled" ? t("allReconciled") : t("noneReconciled")} body={props.view === "unreconciled" ? t("allReconciledBody") : undefined} />;
  }
  return (
    <div className="space-y-3">
      {props.rows.map((row) => (
        <TxnCard key={row.id} row={row} {...props} />
      ))}
    </div>
  );
}

function TxnCard({ row, accounts, rates, taxRegistered, stripeClearingId, bankFeesId, interestId, currency, locale, view }: Props & { row: ReconcileTxn }) {
  const t = useTranslations("books.bank");
  const te = useTranslations("books.errors");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const hinted = row.hint === "stripe_payout" ? stripeClearingId : row.hint === "bank_fee" ? bankFeesId : row.hint === "interest" ? interestId : null;
  const [mode, setMode] = useState<"match" | "create">(row.matches.length ? "match" : "create");
  const [accountId, setAccountId] = useState<string>(hinted ?? "");
  const [taxRateId, setTaxRateId] = useState<string>(() => (taxRegistered && hinted ? (accounts.find((a) => a.id === hinted)?.defaultTaxRateId ?? "") : ""));
  const [contact, setContact] = useState("");
  const moneyIn = row.amountCents > 0;
  const selectedType = accounts.find((a) => a.id === accountId)?.type;
  const direction: "sales" | "purchases" = selectedType ? (selectedType === "revenue" ? "sales" : "purchases") : moneyIn ? "sales" : "purchases";
  const fail = (e: string) => setError(te.has(e) ? te(e) : e);

  function pickAccount(id: string) {
    setAccountId(id);
    const acct = accounts.find((a) => a.id === id);
    setTaxRateId(taxRegistered && acct && acct.subtype !== "bank" ? (acct.defaultTaxRateId ?? "") : "");
  }

  const run = (fn: ActionFn) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) return fail((res as { error: string }).error);
      router.refresh();
    });

  return (
    <GlassPanel className="!p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted tabular-nums">{row.date}</p>
          <p className="truncate text-sm font-semibold text-ink">{row.description || t("noDescription")}</p>
          {row.reference && <p className="text-xs text-muted">{row.reference}</p>}
        </div>
        <p className="text-lg font-semibold tabular-nums" style={{ color: moneyIn ? "var(--success, #1e8e5a)" : "var(--ink)" }}>
          {moneyIn ? "+" : "−"}
          {formatLedgerMoney(Math.abs(row.amountCents), currency, locale)}
        </p>
      </div>

      {view === "reconciled" ? (
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge tone={row.status === "reconciled" ? "good" : "neutral"}>{t(`statuses.${row.status}`)}</Badge>
            {row.journalId && (
              <Link href={`/portal/admin/books/journals/${row.journalId}`} className="text-xs font-semibold text-[--brand]">
                {t("viewJournal")}
              </Link>
            )}
          </div>
          <button
            type="button"
            className="text-xs font-semibold text-muted"
            disabled={pending}
            onClick={() => run(() => (row.status === "excluded" ? setBankTxnExcludedAction(row.id, false) : unreconcileBankTxnAction(row.id)))}
          >
            {row.status === "excluded" ? t("restore") : t("unreconcile")}
          </button>
        </div>
      ) : (
        <>
          <div className="mt-3 flex gap-1">
            {row.matches.length > 0 && (
              <TabButton active={mode === "match"} onClick={() => setMode("match")}>
                {t("match", { count: row.matches.length })}
              </TabButton>
            )}
            <TabButton active={mode === "create"} onClick={() => setMode("create")}>
              {moneyIn ? t("receive") : t("spend")}
            </TabButton>
          </div>

          {mode === "match" && (
            <ul className="mt-3 space-y-2">
              {row.matches.map((m) => (
                <li key={m.lineId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2" style={{ borderColor: "var(--hair)" }}>
                  <span className="min-w-0 text-sm">
                    <span className="text-muted tabular-nums">#{m.journalNumber} · {m.date}</span> <span className="text-ink">{m.narration}</span>
                    {m.daysApart > 0 && <span className="ml-2 text-xs text-muted">{t("daysApart", { days: m.daysApart })}</span>}
                  </span>
                  <button type="button" className={primaryButton} disabled={pending} onClick={() => run(() => matchBankTxnAction(row.id, m.lineId))}>
                    {t("confirmMatch")}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {mode === "create" && (
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-4">
              <select className={smallFieldClass} style={fieldStyle} value={accountId} onChange={(e) => pickAccount(e.target.value)} aria-label={t("account")}>
                <option value="">{t("chooseAccount")}</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} — {a.name}
                  </option>
                ))}
              </select>
              {taxRegistered ? (
                <select className={smallFieldClass} style={fieldStyle} value={taxRateId} onChange={(e) => setTaxRateId(e.target.value)} aria-label={t("taxRate")}>
                  <option value="">{t("noTax")}</option>
                  {rates.filter((r) => r.appliesTo === "both" || r.appliesTo === direction).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span />
              )}
              <input className={smallFieldClass} style={fieldStyle} placeholder={t("who")} value={contact} onChange={(e) => setContact(e.target.value)} aria-label={t("who")} />
              <div className="flex gap-2">
                <button
                  type="button"
                  className={primaryButton}
                  disabled={pending || !accountId}
                  onClick={() => run(() => codeBankTxnAction({ txnId: row.id, contactName: contact || null, lines: [{ accountId, taxRateId: taxRateId || null, amountCents: Math.abs(row.amountCents), description: row.description || null }] }))}
                >
                  {t("ok")}
                </button>
                <button type="button" className={secondaryButton} style={secondaryButtonStyle} disabled={pending} onClick={() => run(() => setBankTxnExcludedAction(row.id, true))}>
                  {t("exclude")}
                </button>
              </div>
              {row.hint === "stripe_payout" && stripeClearingId && (
                <p className="text-xs text-muted sm:col-span-4">{t("stripeHint")}</p>
              )}
            </div>
          )}
        </>
      )}
      {error && <p className="mt-2 text-sm" role="alert" style={{ color: "var(--danger, #c0392b)" }}>{error}</p>}
    </GlassPanel>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[10px] px-3 py-1 text-xs font-semibold"
      style={{ color: active ? "var(--ink)" : "var(--muted)", background: active ? "var(--t3)" : "transparent", border: `1px solid ${active ? "var(--tb)" : "transparent"}` }}
    >
      {children}
    </button>
  );
}
