// ============================================================================
//  Tax registration number checks.
//
//  Where the authority publishes a check-digit algorithm we run it, so a typo
//  is caught at setup rather than on the first return. Where it doesn't (or
//  the format has too many legitimate variants) we check shape only and say
//  so in the pack's hint. A pass here means "well formed", never "registered"
//  — only the authority's own lookup can confirm that.
// ============================================================================

const digitsOnly = (raw: string) => raw.replace(/\D/g, "");
const compact = (raw: string) => raw.replace(/[\s.\-/]/g, "").toUpperCase();

function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** NZ IRD number: 8–9 digits, mod-11 with a secondary weighting (IR's spec). */
export function validNzIrd(raw: string): boolean {
  const d = digitsOnly(raw);
  if (d.length < 8 || d.length > 9) return false;
  const n = Number(d);
  if (n < 10_000_000 || n > 150_000_000) return false;
  const body = d.slice(0, -1).padStart(8, "0");
  const check = Number(d.slice(-1));
  const calc = (weights: number[]) => {
    const sum = [...body].reduce((s, c, i) => s + Number(c) * weights[i], 0);
    const rem = sum % 11;
    return rem === 0 ? 0 : 11 - rem;
  };
  let digit = calc([3, 2, 7, 6, 5, 4, 3, 2]);
  if (digit === 10) digit = calc([7, 4, 3, 2, 5, 2, 7, 6]);
  return digit !== 10 && digit === check;
}

/** AU ABN: 11 digits, weighted mod-89 after subtracting 1 from the first digit. */
export function validAuAbn(raw: string): boolean {
  const d = digitsOnly(raw);
  if (d.length !== 11) return false;
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const sum = [...d].reduce((s, c, i) => s + (Number(c) - (i === 0 ? 1 : 0)) * weights[i], 0);
  return sum % 89 === 0;
}

/** UK VAT: GB + 9 digits (12 for group branches); mod-97 or the 9755 variant. */
export function validGbVat(raw: string): boolean {
  const v = compact(raw).replace(/^GB/, "");
  if (/^(GD[0-4]\d{2}|HA[5-9]\d{2})$/.test(v)) return true; // government departments / health authorities
  if (!/^\d{9}(\d{3})?$/.test(v)) return false;
  const body = v.slice(0, 9);
  const weighted = [...body.slice(0, 7)].reduce((s, c, i) => s + Number(c) * (8 - i), 0);
  const total = weighted + Number(body.slice(7, 9));
  return total % 97 === 0 || (total + 55) % 97 === 0;
}

/** Ireland VAT: 7 digits + check letter (+ optional second letter), or the pre-2013 form. */
export function validIeVat(raw: string): boolean {
  const v = compact(raw).replace(/^IE/, "");
  const modern = /^(\d{7})([A-W])([A-IW]?)$/.exec(v);
  if (modern) {
    const [, digits, check, second] = modern;
    let sum = [...digits].reduce((s, c, i) => s + Number(c) * (8 - i), 0);
    if (second) sum += (second === "W" ? 0 : second.charCodeAt(0) - 64) * 9;
    return "WABCDEFGHIJKLMNOPQRSTUV"[sum % 23] === check;
  }
  return /^\d[A-Z+*]\d{5}[A-W]$/.test(v);
}

/** Canada Business Number: 9 digits (Luhn), optionally with the RT program account. */
export function validCaBn(raw: string): boolean {
  const v = compact(raw);
  const m = /^(\d{9})(RT\d{4})?$/.exec(v);
  return !!m && luhn(m[1]);
}

/** US EIN: 9 digits, NN-NNNNNNN. The IRS publishes valid prefixes, not a checksum. */
export function validUsEin(raw: string): boolean {
  const d = digitsOnly(raw);
  if (d.length !== 9) return false;
  const prefix = Number(d.slice(0, 2));
  return ![0, 7, 8, 9, 17, 18, 19, 28, 29, 49, 69, 70, 78, 79, 89, 96, 97].includes(prefix);
}

/** Singapore GST registration: UEN formats or the M2-/MR- GST number. */
export function validSgGst(raw: string): boolean {
  const v = compact(raw);
  return (
    /^\d{8}[A-Z]$/.test(v) || // business (ROB)
    /^(19|20)\d{7}[A-Z]$/.test(v) || // local company (ROC)
    /^[TSR]\d{2}[A-Z]{2}\d{4}[A-Z]$/.test(v) || // other entities
    /^M[2-9R]\d{7}[A-Z0-9]$/.test(v) // GST-only number
  );
}

/** South Africa VAT: 10 digits starting with 4. */
export function validZaVat(raw: string): boolean {
  return /^4\d{9}$/.test(digitsOnly(raw)) && digitsOnly(raw).length === compact(raw).replace(/^ZA/, "").length;
}

/** Germany: USt-IdNr (DE + 9 digits, ISO 7064 MOD 11,10) or a domestic Steuernummer. */
export function validDeVat(raw: string): boolean {
  const v = compact(raw);
  if (v.startsWith("DE")) {
    const d = v.slice(2);
    if (!/^\d{9}$/.test(d)) return false;
    let product = 10;
    for (let i = 0; i < 8; i++) {
      let sum = (Number(d[i]) + product) % 10;
      if (sum === 0) sum = 10;
      product = (2 * sum) % 11;
    }
    const check = (11 - product) % 10;
    return check === Number(d[8]);
  }
  return /^\d{10,13}$/.test(v);
}

/** France: FR + 2-char key + 9-digit SIREN (Luhn). Numeric keys are verified. */
export function validFrVat(raw: string): boolean {
  const v = compact(raw);
  const m = /^FR([0-9A-HJ-NP-Z]{2})(\d{9})$/.exec(v);
  if (!m) return /^\d{9}$/.test(v) && luhn(v); // a bare SIREN
  const [, key, siren] = m;
  if (/^\d{2}$/.test(key)) {
    return Number(key) === (12 + 3 * (Number(siren) % 97)) % 97;
  }
  return true;
}

/** Italy Partita IVA: 11 digits, Luhn-style check. */
export function validItVat(raw: string): boolean {
  const d = compact(raw).replace(/^IT/, "");
  return /^\d{11}$/.test(d) && luhn(d);
}

/** Spain NIF / CIF / NIE. Shape only — the letter rules differ by entity type. */
export function validEsVat(raw: string): boolean {
  const v = compact(raw).replace(/^ES/, "");
  return /^([0-9]{8}[A-Z]|[XYZ][0-9]{7}[A-Z]|[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J])$/.test(v);
}

/** Netherlands btw-id: NL + 9 digits + B + 2 digits; mod-97 (2020+) or the elfproef. */
export function validNlVat(raw: string): boolean {
  const v = compact(raw);
  const m = /^NL(\d{9})B(\d{2})$/.exec(v);
  if (!m) return false;
  const numeric = [...v].map((c) => (/[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c)).join("");
  let rem = 0;
  for (const c of numeric) rem = (rem * 10 + Number(c)) % 97;
  if (rem === 1) return true;
  const d = m[1];
  const sum = [...d].reduce((s, c, i) => s + Number(c) * (i === 8 ? -1 : 9 - i), 0);
  return sum % 11 === 0;
}

/** Japan qualified invoice issuer number: T + 13 digits. */
export function validJpInvoice(raw: string): boolean {
  return /^T\d{13}$/.test(compact(raw));
}

/** Korea business registration number: 10 digits, weighted check digit. */
export function validKrBrn(raw: string): boolean {
  const d = digitsOnly(raw);
  if (d.length !== 10) return false;
  const w = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(d[i]) * w[i];
  sum += Math.floor((Number(d[8]) * 5) / 10);
  return (10 - (sum % 10)) % 10 === Number(d[9]);
}

/** Custom jurisdiction: anything non-empty and plausible. */
export function validGeneric(raw: string): boolean {
  return /^[A-Z0-9][A-Z0-9 .\-/]{2,29}$/i.test(raw.trim());
}
