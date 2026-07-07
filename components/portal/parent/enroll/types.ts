// Shared types + formatter for the enrol flow steps. Pure file split from
// EnrollModal.tsx (1.6.1) — no logic changes.

export const NZD = new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD" });

export type SelectedClass = {
  classId: string;
  className: string;
  priceCents: number;
  billableCents: number;
  includedInProgramme: boolean;
  recurringGroupId: string | null;
};

export type EnrollData = {
  childId: string;
  childName: string | null;
  classes: SelectedClass[];
  waitlisted: boolean;
  payLater?: boolean;
  paidOnline?: boolean;
  payMonthly?: boolean;
  installmentCents?: number;
};
