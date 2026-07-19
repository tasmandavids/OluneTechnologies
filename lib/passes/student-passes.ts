export type StudentPassStatus = "reserved" | "paid" | "redeemed" | "cancelled" | "refunded";

export type StudentClassPass = {
  id: string;
  status: StudentPassStatus;
  priceCents: number;
  qrCode: string | null;
  purchasedAt: string;
  redeemedAt: string | null;
};

export function listHeldClassPasses<T extends Pick<StudentClassPass, "status" | "purchasedAt">>(
  passes: readonly T[],
): T[] {
  return passes
    .filter((pass) => pass.status === "paid")
    .sort((a, b) => new Date(b.purchasedAt).getTime() - new Date(a.purchasedAt).getTime());
}
