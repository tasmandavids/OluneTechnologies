"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";
import { createContactAction, saveBillAction } from "@/app/portal/admin/books/actions";
import { formatLedgerMoney, parseMoneyInput } from "@/lib/ledger/money";
import { applyTax } from "@/lib/ledger/posting";
import type { LedgerAccount, TaxRate } from "@/lib/ledger/types";
import { Field, fieldClass, fieldStyle, primaryButton, secondaryButton, secondaryButtonStyle, smallFieldClass } from "./ui";

type Contact = { id: string; name: string; defaultAccountId: string | null };
type Line = { key: number; description: string; accountId: string; taxRateId: string; quantity: string; unit: string };

export type BillInitial = {
  id: string;
  contactId: string;
  reference: string;
  issueDate: string;
  dueDate: string;
  amountsIncludeTax: boolean;
  notes: string;
  lines: { description: string; accountId: string; taxRateId: string | null; quantity: number; unitCents: number }[];
};

type Props = {
  initial: BillInitial | null;
  contacts: Contact[];
  accounts: LedgerAccount[];
  rates: TaxRate[];
  defaultPurchaseRateCode: string;
  currency: string;
  locale: string;
  pricesIncludeTax: boolean;
  taxRegistered: boolean;
  today: string;
  defaultDue: string;
};

let k = 1;

export function BillEditor(props: Props) {
  const t = useTranslations("books.bills");
  const te = useTranslations("books.errors");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [contacts, setContacts] = useState(props.contacts);
  const [contactId, setContactId] = useState(props.initial?.contactId ?? "");
  const [newSupplier, setNewSupplier] = useState<string | null>(null);
  const [reference, setReference] = useState(props.initial?.reference ?? "");
  const [issueDate, setIssueDate] = useState(props.initial?.issueDate ?? props.today);
  const [dueDate, setDueDate] = useState(props.initial?.dueDate ?? props.defaultDue);
  const [inclusive, setInclusive] = useState(props.initial?.amountsIncludeTax ?? props.pricesIncludeTax);
  const [notes, setNotes] = useState(props.initial?.notes ?? "");

  const defaultRateId = props.rates.find((r) => r.code === props.defaultPurchaseRateCode)?.id ?? "";
  const defaultExpense = props.accounts.find((a) => a.subtype === "expense")?.id ?? "";
  const blankLine = (accountId = defaultExpense): Line => {
    const acct = props.accounts.find((a) => a.id === accountId);
    return { key: k++, description: "", accountId, taxRateId: props.taxRegistered ? (acct?.defaultTaxRateId ?? defaultRateId) : "", quantity: "1", unit: "" };
  };
  const [lines, setLines] = useState<Line[]>(() =>
    props.initial?.lines.length
      ? props.initial.lines.map((l) => ({ key: k++, description: l.description, accountId: l.accountId, taxRateId: l.taxRateId ?? "", quantity: String(l.quantity), unit: (l.unitCents / 100).toFixed(2) }))
      : [blankLine()],
  );

  const totals = useMemo(() => {
    let subtotal = 0;
    let tax = 0;
    for (const l of lines) {
      const qty = Number(l.quantity.replace(",", ".")) || 0;
      const unit = parseMoneyInput(l.unit) ?? 0;
      const amount = Math.round(qty * unit);
      const rate = props.rates.find((r) => r.id === l.taxRateId) ?? null;
      const split = applyTax(amount, props.taxRegistered ? rate : null, inclusive);
      const recoverable = split.components.filter((c) => c.component.purchaseAccountKey).reduce((s, c) => s + c.cents, 0);
      subtotal += split.netCents + (split.taxCents - recoverable);
      tax += recoverable;
    }
    return { subtotal, tax, total: subtotal + tax };
  }, [lines, inclusive, props.rates, props.taxRegistered]);

  const money = (c: number) => formatLedgerMoney(c, props.currency, props.locale);

  function update(key: number, patch: Partial<Line>) {
    setLines((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, ...patch };
        if (patch.accountId && props.taxRegistered) {
          const acct = props.accounts.find((a) => a.id === patch.accountId);
          if (acct?.defaultTaxRateId && props.rates.some((r) => r.id === acct.defaultTaxRateId)) next.taxRateId = acct.defaultTaxRateId;
        }
        return next;
      }),
    );
  }

  function addSupplier() {
    if (!newSupplier?.trim()) return;
    start(async () => {
      const res = await createContactAction({ name: newSupplier.trim(), email: null, taxNumber: null, defaultAccountId: null });
      if (!res.ok || !res.data) return setError(!res.ok && te.has(res.error) ? te(res.error) : !res.ok ? res.error : te("unexpected"));
      setContacts((cs) => [...cs, { id: res.data!.id, name: newSupplier.trim(), defaultAccountId: null }].sort((a, b) => a.name.localeCompare(b.name)));
      setContactId(res.data.id);
      setNewSupplier(null);
    });
  }

  function save(approve: boolean) {
    setError(null);
    if (!contactId) return setError(te("chooseSupplier"));
    const payload = lines
      .map((l) => ({ description: l.description.trim(), accountId: l.accountId, taxRateId: props.taxRegistered ? l.taxRateId || null : null, quantity: Number(l.quantity.replace(",", ".")) || 0, unitCents: parseMoneyInput(l.unit) ?? 0 }))
      .filter((l) => l.unitCents > 0);
    if (!payload.length) return setError(te("billNoLines"));
    if (payload.some((l) => !l.description || !l.accountId || !(l.quantity > 0))) return setError(te("billLineIncomplete"));
    start(async () => {
      const res = await saveBillAction({
        id: props.initial?.id ?? null,
        contactId,
        reference: reference || null,
        issueDate,
        dueDate: dueDate || null,
        amountsIncludeTax: inclusive,
        notes: notes || null,
        lines: payload,
        approve,
      });
      if (!res.ok) return setError(te.has(res.error) ? te(res.error) : res.error);
      router.push(res.data ? `/portal/admin/books/bills/${res.data.id}` : "/portal/admin/books/bills");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <GlassPanel className="!p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <Field label={t("supplier")}>
              {newSupplier === null ? (
                <div className="flex gap-2">
                  <select className={fieldClass} style={fieldStyle} value={contactId} onChange={(e) => setContactId(e.target.value)}>
                    <option value="">{t("chooseSupplier")}</option>
                    {contacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <button type="button" className={secondaryButton} style={secondaryButtonStyle} onClick={() => setNewSupplier("")}>
                    {t("addSupplier")}
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input className={fieldClass} style={fieldStyle} autoFocus value={newSupplier} placeholder={t("supplierName")} onChange={(e) => setNewSupplier(e.target.value)} />
                  <button type="button" className={primaryButton} disabled={pending || !newSupplier.trim()} onClick={addSupplier}>
                    {t("saveSupplier")}
                  </button>
                  <button type="button" className={secondaryButton} style={secondaryButtonStyle} onClick={() => setNewSupplier(null)}>
                    {t("cancel")}
                  </button>
                </div>
              )}
            </Field>
          </div>
          <Field label={t("reference")}>
            <input className={fieldClass} style={fieldStyle} value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("issued")}>
              <input type="date" className={fieldClass} style={fieldStyle} value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </Field>
            <Field label={t("due")}>
              <input type="date" className={fieldClass} style={fieldStyle} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </Field>
          </div>
        </div>
        {props.taxRegistered && (
          <label className="mt-3 flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={inclusive} onChange={(e) => setInclusive(e.target.checked)} />
            {t("amountsInclude")}
          </label>
        )}
      </GlassPanel>

      <GlassPanel className="!p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <th className="px-3 py-2.5">{t("description")}</th>
                <th className="px-3 py-2.5">{t("account")}</th>
                {props.taxRegistered && <th className="px-3 py-2.5">{t("taxRate")}</th>}
                <th className="px-3 py-2.5 text-right">{t("qty")}</th>
                <th className="px-3 py-2.5 text-right">{t("unitPrice")}</th>
                <th className="px-3 py-2.5 text-right">{t("amount")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const amount = Math.round((Number(l.quantity.replace(",", ".")) || 0) * (parseMoneyInput(l.unit) ?? 0));
                return (
                  <tr key={l.key} style={{ borderTop: "1px solid var(--hair)" }}>
                    <td className="px-3 py-2">
                      <input className={smallFieldClass} style={fieldStyle} value={l.description} onChange={(e) => update(l.key, { description: e.target.value })} aria-label={t("description")} />
                    </td>
                    <td className="px-3 py-2">
                      <select className={smallFieldClass} style={fieldStyle} value={l.accountId} onChange={(e) => update(l.key, { accountId: e.target.value })} aria-label={t("account")}>
                        {props.accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.code} — {a.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    {props.taxRegistered && (
                      <td className="px-3 py-2">
                        <select className={smallFieldClass} style={fieldStyle} value={l.taxRateId} onChange={(e) => update(l.key, { taxRateId: e.target.value })} aria-label={t("taxRate")}>
                          <option value="">{t("noTax")}</option>
                          {props.rates.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      </td>
                    )}
                    <td className="w-20 px-3 py-2">
                      <input className={`${smallFieldClass} text-right`} style={fieldStyle} inputMode="decimal" value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} aria-label={t("qty")} />
                    </td>
                    <td className="w-32 px-3 py-2">
                      <input className={`${smallFieldClass} text-right tabular-nums`} style={fieldStyle} inputMode="decimal" value={l.unit} onChange={(e) => update(l.key, { unit: e.target.value })} aria-label={t("unitPrice")} />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink">{money(amount)}</td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" className="text-lg leading-none text-muted" aria-label={t("removeLine")} onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls))}>
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
          <button type="button" className="text-xs font-semibold text-[--brand]" onClick={() => setLines((ls) => [...ls, blankLine(ls[ls.length - 1]?.accountId)])}>
            {t("addLine")}
          </button>
          <dl className="min-w-[220px] space-y-1 text-sm">
            <div className="flex justify-between gap-6 text-muted">
              <dt>{t("subtotal")}</dt>
              <dd className="tabular-nums">{money(totals.subtotal)}</dd>
            </div>
            {props.taxRegistered && (
              <div className="flex justify-between gap-6 text-muted">
                <dt>{t("tax")}</dt>
                <dd className="tabular-nums">{money(totals.tax)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-6 font-semibold text-ink">
              <dt>{t("total")}</dt>
              <dd className="tabular-nums">{money(totals.total)}</dd>
            </div>
          </dl>
        </div>
      </GlassPanel>

      <GlassPanel className="!p-5">
        <Field label={t("notes")}>
          <textarea className={fieldClass} style={fieldStyle} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </GlassPanel>

      {error && <p className="text-sm" role="alert" style={{ color: "var(--danger, #c0392b)" }}>{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className={secondaryButton} style={secondaryButtonStyle} disabled={pending} onClick={() => save(false)}>
          {t("saveDraft")}
        </button>
        <button type="button" className={primaryButton} disabled={pending} onClick={() => save(true)}>
          {pending ? t("saving") : t("approve")}
        </button>
      </div>
    </div>
  );
}
