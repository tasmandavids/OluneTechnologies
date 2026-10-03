"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";
import { archiveAccountAction, archiveTaxRateAction, createTaxRateAction, saveAccountAction } from "@/app/portal/admin/books/actions";
import { ACCOUNT_SUBTYPES, ACCOUNT_TYPES, TAX_REPORT_CATEGORIES, type AccountSubtype, type BankKind, type LedgerAccount, type TaxRate, type TaxReportCategory } from "@/lib/ledger/types";
import { Dialog } from "./Dialog";
import { Amount, Badge, Field, fieldClass, fieldStyle, primaryButton, rowStyle, secondaryButton, secondaryButtonStyle, tableClass, tdClass, thClass } from "./ui";

type Props = {
  accounts: LedgerAccount[];
  rates: TaxRate[];
  balances: Record<string, number>;
  currency: string;
  locale: string;
  taxName: string;
};

type Draft = {
  id: string | null;
  code: string;
  name: string;
  subtype: AccountSubtype;
  description: string;
  defaultTaxRateId: string;
  bankKind: BankKind;
  bankNumber: string;
  system: boolean;
};

const emptyDraft = (): Draft => ({ id: null, code: "", name: "", subtype: "expense", description: "", defaultTaxRateId: "", bankKind: "bank", bankNumber: "", system: false });

export function AccountsManager({ accounts, rates, balances, currency, locale, taxName }: Props) {
  const t = useTranslations("books.accounts");
  const tt = useTranslations("books.accountTypes");
  const ts = useTranslations("books.subtypes");
  const te = useTranslations("books.errors");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState("");
  const [rateDraft, setRateDraft] = useState<{ code: string; name: string; pct: string; appliesTo: "sales" | "purchases" | "both"; category: TaxReportCategory } | null>(null);

  const visible = useMemo(
    () =>
      accounts.filter((a) => (showArchived || !a.isArchived) && (!query || `${a.code} ${a.name}`.toLowerCase().includes(query.toLowerCase()))),
    [accounts, showArchived, query],
  );

  const errorText = (key: string) => (te.has(key) ? te(key) : key);

  function edit(a: LedgerAccount) {
    setError(null);
    setDraft({
      id: a.id,
      code: a.code,
      name: a.name,
      subtype: a.subtype,
      description: a.description ?? "",
      defaultTaxRateId: a.defaultTaxRateId ?? "",
      bankKind: a.bankKind ?? "bank",
      bankNumber: a.bankNumber ?? "",
      system: !!a.systemKey,
    });
  }

  function save() {
    if (!draft) return;
    start(async () => {
      const res = await saveAccountAction({
        id: draft.id,
        code: draft.code,
        name: draft.name,
        subtype: draft.subtype,
        description: draft.description || null,
        defaultTaxRateId: draft.defaultTaxRateId || null,
        bankKind: draft.subtype === "bank" ? draft.bankKind : null,
        bankNumber: draft.subtype === "bank" ? draft.bankNumber || null : null,
      });
      if (!res.ok) return setError(errorText(res.error));
      setDraft(null);
      router.refresh();
    });
  }

  function toggleArchive(a: LedgerAccount) {
    start(async () => {
      const res = await archiveAccountAction(a.id, !a.isArchived);
      if (!res.ok) setError(errorText(res.error));
      router.refresh();
    });
  }

  function saveRate() {
    if (!rateDraft) return;
    const pct = Number(rateDraft.pct.replace(",", "."));
    if (!Number.isFinite(pct)) return setError(te("invalid"));
    start(async () => {
      const res = await createTaxRateAction({ code: rateDraft.code, name: rateDraft.name, rateBp: Math.round(pct * 1000) / 10, appliesTo: rateDraft.appliesTo, reportCategory: rateDraft.category });
      if (!res.ok) return setError(errorText(res.error));
      setRateDraft(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={primaryButton} onClick={() => { setError(null); setDraft(emptyDraft()); }}>
          {t("newAccount")}
        </button>
        <input className={`${fieldClass} max-w-xs`} style={fieldStyle} placeholder={t("search")} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t("search")} />
        <label className="flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          {t("showArchived")}
        </label>
      </div>

      {error && !draft && !rateDraft && (
        <p className="text-sm" role="alert" style={{ color: "var(--danger, #c0392b)" }}>
          {error}
        </p>
      )}

      {ACCOUNT_TYPES.map((type) => {
        const rows = visible.filter((a) => a.type === type);
        if (!rows.length) return null;
        return (
          <GlassPanel key={type} className="!p-0 overflow-hidden">
            <p className="px-5 pt-4 text-xs font-semibold uppercase tracking-wider text-muted">{tt(type)}</p>
            <div className="overflow-x-auto">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={thClass}>{t("code")}</th>
                    <th className={thClass}>{t("name")}</th>
                    <th className={thClass}>{t("subtype")}</th>
                    <th className={thClass}>{t("taxDefault", { tax: taxName })}</th>
                    <th className={`${thClass} text-right`}>{t("balance")}</th>
                    <th className={thClass} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.id} style={rowStyle} className={a.isArchived ? "opacity-50" : ""}>
                      <td className={`${tdClass} tabular-nums text-muted`}>{a.code}</td>
                      <td className={tdClass}>
                        <span className="font-medium">{a.name}</span>{" "}
                        {a.systemKey && <Badge>{t("system")}</Badge>} {a.autoCreated && <Badge tone="warn">{t("autoCreated")}</Badge>}
                      </td>
                      <td className={`${tdClass} text-muted`}>{ts(a.subtype)}</td>
                      <td className={`${tdClass} text-muted`}>{rates.find((r) => r.id === a.defaultTaxRateId)?.name ?? "—"}</td>
                      <td className={`${tdClass} text-right`}>
                        <Amount cents={balances[a.id] ?? 0} currency={currency} locale={locale} blankZero />
                      </td>
                      <td className={`${tdClass} text-right`}>
                        <button type="button" className="text-xs font-semibold text-(--brand)" onClick={() => edit(a)}>
                          {t("edit")}
                        </button>
                        {!a.systemKey && (
                          <button type="button" className="ml-3 text-xs font-semibold text-muted" onClick={() => toggleArchive(a)} disabled={pending}>
                            {a.isArchived ? t("restore") : t("archive")}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassPanel>
        );
      })}

      <GlassPanel className="!p-0 overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">{t("ratesTitle", { tax: taxName })}</p>
          <button type="button" className="text-xs font-semibold text-(--brand)" onClick={() => { setError(null); setRateDraft({ code: "", name: "", pct: "", appliesTo: "both", category: "standard" }); }}>
            {t("newRate")}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>{t("code")}</th>
                <th className={thClass}>{t("name")}</th>
                <th className={`${thClass} text-right`}>{t("rate")}</th>
                <th className={thClass}>{t("appliesTo")}</th>
                <th className={thClass}>{t("category")}</th>
                <th className={thClass} />
              </tr>
            </thead>
            <tbody>
              {rates.filter((r) => showArchived || !r.isArchived).map((r) => (
                <tr key={r.id} style={rowStyle} className={r.isArchived ? "opacity-50" : ""}>
                  <td className={`${tdClass} text-muted`}>{r.code}</td>
                  <td className={tdClass}>
                    {r.name}
                    {r.components.length > 1 && <span className="ml-2 text-xs text-muted">({r.components.map((c) => `${c.name} ${c.rateBp / 100}%`).join(" + ")})</span>}
                  </td>
                  <td className={`${tdClass} text-right tabular-nums`}>{r.rateBp / 100}%</td>
                  <td className={`${tdClass} text-muted`}>{t(`applies.${r.appliesTo}`)}</td>
                  <td className={`${tdClass} text-muted`}>{t(`categories.${r.reportCategory}`)}</td>
                  <td className={`${tdClass} text-right`}>
                    <button
                      type="button"
                      className="text-xs font-semibold text-muted"
                      disabled={pending}
                      onClick={() => start(async () => { const res = await archiveTaxRateAction(r.id, !r.isArchived); if (!res.ok) setError(errorText(res.error)); router.refresh(); })}
                    >
                      {r.isArchived ? t("restore") : t("archive")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-5 pb-4 pt-2 text-xs text-muted">{t("ratesNote")}</p>
      </GlassPanel>

      {draft && (
        <Dialog title={draft.id ? t("editAccount") : t("newAccount")} onClose={() => setDraft(null)}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t("code")}>
              <input className={fieldClass} style={fieldStyle} value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} />
            </Field>
            <Field label={t("name")}>
              <input className={fieldClass} style={fieldStyle} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </Field>
            <Field label={t("subtype")} hint={draft.system ? t("systemHint") : undefined}>
              <select className={fieldClass} style={fieldStyle} value={draft.subtype} disabled={draft.system} onChange={(e) => setDraft({ ...draft, subtype: e.target.value as AccountSubtype })}>
                {ACCOUNT_TYPES.map((type) => (
                  <optgroup key={type} label={tt(type)}>
                    {ACCOUNT_SUBTYPES[type].map((st) => (
                      <option key={st} value={st}>
                        {ts(st)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </Field>
            <Field label={t("taxDefault", { tax: taxName })}>
              <select className={fieldClass} style={fieldStyle} value={draft.defaultTaxRateId} onChange={(e) => setDraft({ ...draft, defaultTaxRateId: e.target.value })}>
                <option value="">{t("noTax")}</option>
                {rates.filter((r) => !r.isArchived).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </Field>
            {draft.subtype === "bank" && (
              <>
                <Field label={t("bankKind")}>
                  <select className={fieldClass} style={fieldStyle} value={draft.bankKind} disabled={draft.system} onChange={(e) => setDraft({ ...draft, bankKind: e.target.value as BankKind })}>
                    {(["bank", "clearing", "cash", "credit_card"] as const).map((k) => (
                      <option key={k} value={k}>
                        {t(`bankKinds.${k}`)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t("bankNumber")}>
                  <input className={fieldClass} style={fieldStyle} value={draft.bankNumber} onChange={(e) => setDraft({ ...draft, bankNumber: e.target.value })} />
                </Field>
              </>
            )}
            <div className="sm:col-span-2">
              <Field label={t("description")}>
                <input className={fieldClass} style={fieldStyle} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </Field>
            </div>
          </div>
          {error && <p className="mt-3 text-sm" role="alert" style={{ color: "var(--danger, #c0392b)" }}>{error}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className={secondaryButton} style={secondaryButtonStyle} onClick={() => setDraft(null)}>
              {t("cancel")}
            </button>
            <button type="button" className={primaryButton} onClick={save} disabled={pending || !draft.code.trim() || !draft.name.trim()}>
              {t("save")}
            </button>
          </div>
        </Dialog>
      )}

      {rateDraft && (
        <Dialog title={t("newRate")} onClose={() => setRateDraft(null)}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t("code")}>
              <input className={fieldClass} style={fieldStyle} value={rateDraft.code} onChange={(e) => setRateDraft({ ...rateDraft, code: e.target.value })} />
            </Field>
            <Field label={t("name")}>
              <input className={fieldClass} style={fieldStyle} value={rateDraft.name} onChange={(e) => setRateDraft({ ...rateDraft, name: e.target.value })} />
            </Field>
            <Field label={t("ratePercent")}>
              <input className={fieldClass} style={fieldStyle} inputMode="decimal" value={rateDraft.pct} onChange={(e) => setRateDraft({ ...rateDraft, pct: e.target.value })} />
            </Field>
            <Field label={t("appliesTo")}>
              <select className={fieldClass} style={fieldStyle} value={rateDraft.appliesTo} onChange={(e) => setRateDraft({ ...rateDraft, appliesTo: e.target.value as "sales" | "purchases" | "both" })}>
                {(["sales", "purchases", "both"] as const).map((v) => (
                  <option key={v} value={v}>
                    {t(`applies.${v}`)}
                  </option>
                ))}
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Field label={t("category")} hint={t("categoryHint")}>
                <select className={fieldClass} style={fieldStyle} value={rateDraft.category} onChange={(e) => setRateDraft({ ...rateDraft, category: e.target.value as TaxReportCategory })}>
                  {TAX_REPORT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {t(`categories.${c}`)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>
          {error && <p className="mt-3 text-sm" role="alert" style={{ color: "var(--danger, #c0392b)" }}>{error}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className={secondaryButton} style={secondaryButtonStyle} onClick={() => setRateDraft(null)}>
              {t("cancel")}
            </button>
            <button type="button" className={primaryButton} onClick={saveRate} disabled={pending || !rateDraft.code.trim() || !rateDraft.name.trim()}>
              {t("save")}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
