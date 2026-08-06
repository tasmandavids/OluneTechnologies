"use client";

// ============================================================================
//  Settings → Billing → GST.
//
//  Studio-wide because Xero's lineAmountTypes is a property of the invoice, not
//  the line — a single invoice can't mix GST-inclusive and GST-exclusive
//  pricing, so the studio picks one and every catalogue price is read under it.
//  Whether a particular product is standard-rated, zero-rated or exempt is a
//  per-product choice and lives in Money → Products.
// ============================================================================

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { updateTaxSettings } from "@/app/portal/admin/settings/actions";

const fieldClass =
  "w-full rounded-xl border px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-muted focus:border-[--brand]";
const fieldStyle = { background: "var(--surface)", borderColor: "var(--hair)" } as const;

export type StudioTaxInfo = {
  pricesIncludeTax: boolean;
  gstRegistered: boolean;
  gstNumber: string | null;
};

export default function TaxSettings({ tax }: { tax: StudioTaxInfo }) {
  const t = useTranslations("admin.settings.tax");
  const [pricesIncludeTax, setPricesIncludeTax] = useState(tax.pricesIncludeTax);
  const [gstRegistered, setGstRegistered] = useState(tax.gstRegistered);
  const [gstNumber, setGstNumber] = useState(tax.gstNumber ?? "");
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await updateTaxSettings({ pricesIncludeTax, gstRegistered, gstNumber });
      if (!result.ok) {
        setStatus("error");
        setMessage(result.error);
        return;
      }
      setStatus("saved");
      setMessage(null);
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="font-medium text-ink">{t("title")}</p>
        <p className="mt-0.5 text-sm text-muted">{t("description")}</p>
      </div>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={gstRegistered}
          onChange={(e) => {
            setGstRegistered(e.target.checked);
            setStatus("idle");
          }}
        />
        {t("registered")}
      </label>

      {gstRegistered && (
        <>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-ink">{t("pricing")}</span>
            <select
              value={pricesIncludeTax ? "inclusive" : "exclusive"}
              onChange={(e) => {
                setPricesIncludeTax(e.target.value === "inclusive");
                setStatus("idle");
              }}
              className={fieldClass}
              style={fieldStyle}
            >
              <option value="inclusive">{t("inclusive")}</option>
              <option value="exclusive">{t("exclusive")}</option>
            </select>
            <span className="mt-1 block text-xs text-muted">{t("pricingHint")}</span>
          </label>

          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-ink">{t("gstNumber")}</span>
            <input
              value={gstNumber}
              onChange={(e) => {
                setGstNumber(e.target.value);
                setStatus("idle");
              }}
              placeholder="123-456-789"
              className={fieldClass}
              style={fieldStyle}
            />
          </label>
        </>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={pending}
          className="rounded-full px-5 py-2 text-sm font-semibold text-white transition disabled:opacity-50"
          style={{ background: "linear-gradient(150deg, var(--tg), var(--brand) 60%, var(--brand-deep))" }}
        >
          {pending ? t("saving") : t("save")}
        </button>
        {status === "saved" && <span className="text-xs text-muted">{t("saved")}</span>}
        {status === "error" && message && <span className="text-xs text-red-500">{message}</span>}
      </div>

      <p className="text-xs text-muted">
        {t("productsHint")}{" "}
        <Link href="/portal/admin/money?tab=products" className="font-semibold text-[--brand]">
          {t("productsLink")}
        </Link>
      </p>
    </div>
  );
}
