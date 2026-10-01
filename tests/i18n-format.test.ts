import { describe, expect, it } from "vitest";
import { formatMoney } from "@/lib/i18n/format";

describe("locale-aware money formatting", () => {
  it("uses the reader's grouping and decimal conventions", () => {
    expect(formatMoney(123456, "en-NZ")).toMatch(/1,234\.56/);
    expect(formatMoney(123456, "de-DE")).toMatch(/1\.234,56/);
  });

  it("keeps caller formatting options while converting cents", () => {
    expect(formatMoney(123456, "en-NZ", { maximumFractionDigits: 0 })).toContain("1,235");
  });
});
