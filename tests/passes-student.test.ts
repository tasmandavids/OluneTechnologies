import { describe, expect, it } from "vitest";
import { listHeldClassPasses, type StudentClassPass } from "@/lib/passes/student-passes";

describe("student class passes", () => {
  const passes: StudentClassPass[] = [
    {
      id: "reserved-pass",
      status: "reserved",
      priceCents: 2500,
      qrCode: null,
      purchasedAt: "2026-07-19T09:00:00.000Z",
      redeemedAt: null,
    },
    {
      id: "older-paid-pass",
      status: "paid",
      priceCents: 2500,
      qrCode: "qr-old",
      purchasedAt: "2026-07-18T09:00:00.000Z",
      redeemedAt: null,
    },
    {
      id: "newer-paid-pass",
      status: "paid",
      priceCents: 2500,
      qrCode: "qr-new",
      purchasedAt: "2026-07-19T10:00:00.000Z",
      redeemedAt: null,
    },
    {
      id: "redeemed-pass",
      status: "redeemed",
      priceCents: 2500,
      qrCode: "qr-redeemed",
      purchasedAt: "2026-07-17T09:00:00.000Z",
      redeemedAt: "2026-07-17T11:00:00.000Z",
    },
    {
      id: "refunded-pass",
      status: "refunded",
      priceCents: 2500,
      qrCode: "qr-refunded",
      purchasedAt: "2026-07-16T09:00:00.000Z",
      redeemedAt: null,
    },
    {
      id: "cancelled-pass",
      status: "cancelled",
      priceCents: 2500,
      qrCode: "qr-cancelled",
      purchasedAt: "2026-07-15T09:00:00.000Z",
      redeemedAt: null,
    },
  ];

  it("shows only paid passes with the newest QR first", () => {
    expect(listHeldClassPasses(passes).map((pass) => pass.id)).toEqual([
      "newer-paid-pass",
      "older-paid-pass",
    ]);
  });

  it("does not mutate the original pass order", () => {
    listHeldClassPasses(passes);

    expect(passes.map((pass) => pass.id)).toEqual([
      "reserved-pass",
      "older-paid-pass",
      "newer-paid-pass",
      "redeemed-pass",
      "refunded-pass",
      "cancelled-pass",
    ]);
  });
});
