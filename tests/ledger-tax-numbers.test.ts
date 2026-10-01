import { describe, expect, it } from "vitest";
import {
  validAuAbn,
  validCaBn,
  validDeVat,
  validFrVat,
  validGbVat,
  validIeVat,
  validItVat,
  validJpInvoice,
  validKrBrn,
  validNlVat,
  validNzIrd,
  validSgGst,
  validUsEin,
  validZaVat,
} from "@/lib/ledger/tax-numbers";

// Valid samples are the authorities' own published examples where they exist
// (IRD's check-digit spec, the ATO's ABN example, the Belastingdienst test
// number); invalid ones flip the check digit.
describe.each([
  ["NZ IRD", validNzIrd, ["49091850", "35-901-981", "136410132"], ["136410133", "9125568", "12345678"]],
  ["AU ABN", validAuAbn, ["51 824 753 556"], ["51 824 753 557", "1234567890"]],
  ["GB VAT", validGbVat, ["GB999999973", "GB 980 7806 84", "GD123"], ["GB123456789", "FR40303265045"]],
  ["IE VAT", validIeVat, ["IE6388047V", "IE3628739UA"], ["IE6388047W", "IE123"]],
  ["CA BN", validCaBn, ["123456782", "123456782 RT0001"], ["123456789", "12345678"]],
  ["US EIN", validUsEin, ["12-3456789"], ["07-3456789", "1234"]],
  ["DE USt-IdNr", validDeVat, ["DE136695976", "1234567890"], ["DE136695977", "DE12345"]],
  ["FR TVA", validFrVat, ["FR40303265045", "303265045"], ["FR41303265045", "FR40303265"]],
  ["IT P.IVA", validItVat, ["IT00743110157"], ["00743110158", "IT123"]],
  ["NL btw-id", validNlVat, ["NL000099998B57"], ["NL000099998B58", "NL123456789"]],
  ["KR BRN", validKrBrn, ["220-81-62517"], ["220-81-62518", "12345"]],
  ["ZA VAT", validZaVat, ["4123456789"], ["5123456789", "412345678"]],
  ["JP invoice", validJpInvoice, ["T1234567890123"], ["1234567890123", "T123"]],
  ["SG GST", validSgGst, ["201912345K", "M2-1234567-K"], ["12345", "ABCDEFG"]],
] as const)("%s", (_name, validate, good, bad) => {
  it.each(good)("accepts %s", (n) => expect(validate(n)).toBe(true));
  it.each(bad)("rejects %s", (n) => expect(validate(n)).toBe(false));
});
