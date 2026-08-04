// ============================================================================
//  People — shared row shapes for the Students / Families / Leads tabs.
//  Deliberately no "Studio" column like the design mock's: this app scopes
//  one admin session to one studio, so every row already belongs to the same
//  studio — a per-row studio label would be redundant, not real data.
// ============================================================================

export type PeopleBadge = { name: string; tier: string };

export type PeopleStudentRow = {
  id: string;
  name: string | null;
  initials: string;
  programme: string | null;
  attendancePercent: number | null; // null = studio has no attendance data at all
  balanceCents: number;
  flag: "overdue" | "new" | null;
  guardianName: string | null;
  joinedAt: string;
  nextClassLabel: string | null;
  badges: PeopleBadge[];
  attendanceWeeks: number[] | null; // 12 values, 0-100, oldest -> newest
};

export type PeopleFamilyRow = {
  id: string;
  name: string | null;
  initials: string;
  email: string | null;
  phone: string | null;
  childrenNames: string[];
  balanceCents: number;
  joinedAt: string;
};

export type PeopleLeadRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: "new" | "contacted" | "trial" | "converted" | "lost";
  notes: string | null;
  createdAt: string;
};
