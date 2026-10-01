import { validJpInvoice } from "../tax-numbers";
import { box, endOfMonthAfter, nilRate } from "./helpers";
import type { Jurisdiction, TaxRateTemplate } from "./types";

/**
 * Japanese consumption tax is two taxes collected as one: a national part and
 * a local part. Both post to the same 仮受/仮払 account, but the return reports
 * them on separate lines, so they're modelled as components.
 */
function jct(code: string, name: string, totalBp: number, nationalBp: number, appliesTo: "sales" | "purchases", category: "standard" | "reduced"): TaxRateTemplate {
  return {
    code,
    name,
    rateBp: totalBp,
    appliesTo,
    reportCategory: category,
    components: [
      { name: "国税", rateBp: nationalBp, salesAccountKey: "tax_collected", purchaseAccountKey: "tax_paid" },
      { name: "地方税", rateBp: totalBp - nationalBp, salesAccountKey: "tax_collected", purchaseAccountKey: "tax_paid" },
    ],
  };
}

export const JP: Jurisdiction = {
  code: "JP",
  name: "日本",
  flag: "🇯🇵",
  currency: "JPY",
  locale: "ja-JP",
  chartLanguage: "ja",
  taxName: "消費税",
  taxAuthority: "国税庁",
  taxAuthorityUrl: "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/shohi.htm",
  taxNumber: {
    label: "適格請求書発行事業者登録番号",
    placeholder: "T1234567890123",
    validate: validJpInvoice,
    hint: "T + 13桁（形式を確認します）。",
  },
  registrationThreshold: { amount: 10_000_000, currency: "JPY", label: "基準期間の課税売上高" },
  defaultRegistered: true,
  pricesIncludeTax: true,
  fiscalYearStart: { month: 4, day: 1 },
  filing: { frequencies: ["annual", "quarterly", "monthly"], default: "annual", defaultAnchorMonth: 4 },
  bases: [
    { id: "accrual", label: "発生主義", sales: "accrual", purchases: "accrual" },
    { id: "cash", label: "現金主義（小規模事業者の特例）", sales: "cash", purchases: "cash" },
  ],
  taxRates: [
    jct("10%", "課税売上 10%", 1000, 780, "sales", "standard"),
    jct("8%軽", "課税売上 8%（軽減）", 800, 624, "sales", "reduced"),
    nilRate("非課税", "非課税売上", "exempt", "sales"),
    nilRate("免税", "輸出免税売上", "export", "sales"),
    nilRate("不課税", "対象外（不課税）", "out_of_scope"),
    jct("10%仕", "課税仕入 10%", 1000, 780, "purchases", "standard"),
    jct("8%仕軽", "課税仕入 8%（軽減）", 800, 624, "purchases", "reduced"),
    nilRate("非課税仕", "非課税仕入", "exempt", "purchases"),
  ],
  defaultSalesCode: "10%",
  defaultPurchaseCode: "10%仕",
  zeroSalesCode: "免税",
  exemptSalesCode: "非課税",
  exemptPurchaseCode: "非課税仕",
  separateTaxAccounts: true,
  chartTerms: {
    taxOutput: "仮受消費税",
    taxInput: "仮払消費税",
    taxSettlement: "未払消費税",
    payrollTax: "預り金（源泉所得税）",
    retirement: "法定福利費",
    retirementPayable: "預り金（社会保険料）",
    musicLicensing: "著作権使用料（JASRAC）",
  },
  returnForm: {
    code: "消費税申告書",
    name: "消費税及び地方消費税の確定申告書（一般用）",
    authority: "国税庁",
    authorityUrl: "https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/shohi/annai/1459_04.htm",
    boxes: [
      box("課税標準額", "課税標準額", (q) => q.net("sales", ["standard", "reduced"]), { section: "消費税" }),
      box("消費税額", "消費税額（国税）", (q) => q.componentTax("sales", ["国税"])),
      box("控除対象仕入税額", "控除対象仕入税額（国税）", (q) => q.componentTax("purchases", ["国税"])),
      box("差引税額", "差引税額（国税）", (q) => q.box("消費税額") - q.box("控除対象仕入税額"), { total: true }),
      box("譲渡割額", "地方消費税 譲渡割額", (q) => q.componentTax("sales", ["地方税"]) - q.componentTax("purchases", ["地方税"]), { section: "地方消費税" }),
      box("合計", "消費税及び地方消費税の合計税額", (q) => q.box("差引税額") + q.box("譲渡割額"), { total: true }),
    ],
    net: (q) => q.box("合計"),
    dueDate: (periodEnd) => endOfMonthAfter(periodEnd, 2),
    notes: ["個人事業者の確定申告期限は翌年3月31日です。簡易課税・2割特例は反映していません。"],
  },
  notes: [
    "基準期間の課税売上高が1,000万円以下の事業者は原則として免税事業者です（インボイス登録をした場合を除く）。",
    "簡易課税制度・2割特例を選択している場合、納付税額の計算が異なります。税理士にご確認ください。",
  ],
  reviewedAt: "2026-10-01",
};
