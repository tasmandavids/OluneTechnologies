import type { Role } from "@/lib/types";
import type { ModuleKey } from "@/lib/verticals/types";
import type { Entitlements } from "./entitlements";

export type NavItem = {
  href: string;
  labelKey: string;
  exact?: boolean;
  children?: NavItem[];
  /**
   * Gate this item behind a module. ABSENT MEANS ALWAYS SHOWN — a missing
   * module key is "not gated", never "hidden". Dashboards, settings and the
   * people directories are deliberately ungated.
   */
  module?: ModuleKey;
};

export type NavSection = {
  titleKey?: string;
  items: NavItem[];
};

// 1.6.1 IA: one job-to-be-done = one door. Old routes redirect to their new
// homes.
//
// 1.6.3: sections now mirror the StudioRail spaces one for one, so the mobile
// drawer and the desktop rail flyout tell the same story. Two items moved to
// where people actually look for them: class passes is a front-desk scanner
// like check-in (People, not Schedule), and the billing catalogue gets its own
// door as Products (Money) now that pricing lives there.
export const ADMIN_NAV: NavSection[] = [
  {
    items: [{ href: "/portal/admin", labelKey: "nav.admin.dashboard", exact: true }],
  },
  {
    titleKey: "nav.sections.people",
    items: [
      { href: "/portal/admin/people", labelKey: "nav.admin.people" },
      { href: "/portal/admin/leads", labelKey: "nav.admin.leads", module: "leads" },
      { href: "/portal/admin/badges", labelKey: "nav.admin.badges", module: "badges" },
      { href: "/portal/admin/checkin", labelKey: "nav.admin.checkin" },
      { href: "/portal/admin/passes", labelKey: "nav.admin.passes", module: "passes" },
      { href: "/portal/admin/forms", labelKey: "nav.admin.forms", module: "forms" },
    ],
  },
  {
    titleKey: "nav.sections.schedule",
    items: [
      { href: "/portal/admin/classes", labelKey: "nav.admin.classes", module: "classes" },
      { href: "/portal/admin/events", labelKey: "nav.admin.events", module: "production" },
    ],
  },
  {
    titleKey: "nav.sections.teamManagement",
    items: [
      {
        href: "/portal/admin/staff",
        labelKey: "nav.admin.staff",
        module: "staff",
        children: [
          { href: "/portal/admin/availability", labelKey: "nav.admin.availability", module: "availability" },
          { href: "/portal/admin/substitutes", labelKey: "nav.admin.substitutes", module: "substitutes" },
          { href: "/portal/admin/private-lessons", labelKey: "nav.admin.privateLessons", module: "privateLessons" },
        ],
      },
    ],
  },
  {
    // Every item here is billing-gated, which is what lets the whole section
    // disappear for a studio without the billing module.
    titleKey: "nav.sections.finance",
    items: [
      { href: "/portal/admin/money", labelKey: "nav.admin.money", module: "billing" },
      { href: "/portal/admin/money?tab=products", labelKey: "nav.admin.products", module: "billing" },
    ],
  },
  {
    titleKey: "nav.sections.digital",
    items: [
      {
        href: "/portal/admin/site",
        labelKey: "nav.admin.website",
        module: "site",
        children: [
          { href: "/portal/admin/advertising", labelKey: "nav.admin.advertising", module: "site" },
        ],
      },
      { href: "/portal/admin/shop", labelKey: "nav.admin.shop", module: "shop" },
    ],
  },
  {
    items: [
      { href: "/portal/admin/messages", labelKey: "nav.admin.inbox", module: "messaging" },
      { href: "/portal/admin/support", labelKey: "nav.admin.support" },
    ],
  },
  {
    items: [{ href: "/portal/admin/settings", labelKey: "nav.admin.settings" }],
  },
];

export const OFFICE_NAV: NavSection[] = [
  {
    items: [{ href: "/portal/office", labelKey: "nav.office.dashboard", exact: true }],
  },
  {
    titleKey: "nav.sections.clientManagement",
    items: [
      { href: "/portal/admin/people", labelKey: "nav.admin.people" },
      { href: "/portal/admin/leads", labelKey: "nav.admin.leads", module: "leads" },
      { href: "/portal/admin/classes", labelKey: "nav.admin.classes", module: "classes" },
    ],
  },
  {
    titleKey: "nav.sections.communications",
    items: [{ href: "/portal/admin/messages", labelKey: "nav.admin.messages", module: "messaging" }],
  },
  {
    items: [{ href: "/portal/forms", labelKey: "nav.portal.forms", module: "forms" }],
  },
];

export const PORTAL_NAV: Record<Exclude<Role, "admin">, NavItem[]> = {
  teacher: [
    { href: "/portal/teacher", labelKey: "nav.teacher.schedule", exact: true },
    { href: "/portal/teacher/profile", labelKey: "nav.teacher.profile" },
    { href: "/portal/teacher/clients", labelKey: "nav.teacher.clients" },
    { href: "/portal/teacher/invoices", labelKey: "nav.teacher.invoices" },
    { href: "/portal/teacher/expenses", labelKey: "nav.teacher.expenses" },
    { href: "/portal/teacher/vault", labelKey: "nav.teacher.vault" },
    { href: "/portal/teacher/availability", labelKey: "nav.teacher.availability", module: "availability" },
    { href: "/portal/teacher/private-lessons", labelKey: "nav.teacher.privateLessons", module: "privateLessons" },
    { href: "/portal/teacher/substitutes", labelKey: "nav.teacher.substitutes", module: "substitutes" },
    { href: "/portal/teacher/messages", labelKey: "nav.teacher.messages", module: "messaging" },
    // Studio policies land on staff too, so the signing screen isn't a
    // parents-only door any more.
    { href: "/portal/forms", labelKey: "nav.portal.forms", module: "forms" },
    { href: "/portal/teacher/affiliations", labelKey: "nav.teacher.affiliations" },
    { href: "/settings/notifications", labelKey: "nav.teacher.notifications" },
  ],
  office: [{ href: "/portal/office", labelKey: "nav.office.dashboard", exact: true }],
  // 1.6.1 IA: 7 items, no submenus. Schedule folds in the studio timetable
  // (?view=studio), Billing folds in the old Family Wallet, Messages folds in
  // chat + studio email (?tab=email). Old routes redirect.
  parent: [
    { href: "/portal/parent", labelKey: "nav.parent.familyHub", exact: true },
    { href: "/portal/parent/schedule", labelKey: "nav.parent.schedule" },
    { href: "/portal/parent/private-lessons", labelKey: "nav.parent.privateLessons", module: "privateLessons" },
    { href: "/portal/parent/absences", labelKey: "nav.parent.absences", module: "attendance" },
    { href: "/portal/parent/recital", labelKey: "nav.parent.recital", module: "costumes" },
    { href: "/portal/parent/forms", labelKey: "nav.parent.forms", module: "forms" },
    { href: "/portal/parent/billing", labelKey: "nav.parent.billing", module: "billing" },
    { href: "/portal/parent/chat", labelKey: "nav.parent.messages", module: "messaging" },
  ],
  student: [
    { href: "/portal/student", labelKey: "nav.student.timetable", exact: true },
    { href: "/portal/student/progress", labelKey: "nav.student.progress", module: "progress" },
    { href: "/portal/forms", labelKey: "nav.portal.forms", module: "forms" },
  ],
};

export const SELF_MANAGED_STUDENT_NAV: NavItem[] = [
  { href: "/portal/student", labelKey: "nav.student.hub", exact: true },
  { href: "/portal/parent/billing", labelKey: "nav.parent.billing", module: "billing" },
  { href: "/portal/parent/forms", labelKey: "nav.parent.forms", module: "forms" },
  { href: "/portal/student/progress", labelKey: "nav.student.progress", module: "progress" },
  { href: "/portal/student/messages", labelKey: "nav.student.messages", module: "messaging" },
];

export const ROLE_BADGE_KEYS: Record<Role, string> = {
  admin: "roles.admin",
  teacher: "roles.teacher",
  office: "roles.office",
  parent: "roles.parent",
  student: "roles.student",
};

// ============================================================================
//  Entitlement-aware builders.
//
//  These are the ONLY way the shell should read nav. The raw ADMIN_NAV /
//  PORTAL_NAV exports remain for the parity test and for callers that
//  genuinely want the unfiltered shape.
//
//  Invariant enforced by tests/entitlements.test.ts: for a dance studio with
//  no studio_modules rows and no flags, these return today's arrays byte for
//  byte. If that snapshot fails, the change is wrong — do not update it to
//  match new output.
// ============================================================================

/** Every destination in a nav tree, parents and children alike. */
export function flattenNav(sections: NavSection[]): NavItem[] {
  const out: NavItem[] = [];
  for (const section of sections) {
    for (const item of section.items) {
      out.push(item);
      if (item.children) out.push(...item.children);
    }
  }
  return out;
}

function keeps(item: NavItem, ent: Entitlements | null): boolean {
  // No entitlements resolved (or no module tag) ⇒ show it. Failing open here
  // is correct: this layer is presentation, and the page + action guards are
  // the ones that actually enforce.
  if (!ent || !item.module) return true;
  return ent.modules.has(item.module);
}

function filterItems(items: NavItem[], ent: Entitlements | null): NavItem[] {
  const out: NavItem[] = [];
  for (const item of items) {
    if (!keeps(item, ent)) continue;
    if (!item.children) {
      out.push(item);
      continue;
    }
    const children = filterItems(item.children, ent);
    // Preserve the exact shape: an item that had no surviving children keeps
    // an empty array rather than losing the key, so deep-equal parity holds.
    out.push({ ...item, children });
  }
  return out;
}

export function buildAdminNav(ent: Entitlements | null): NavSection[] {
  return ADMIN_NAV.map((section) => ({ ...section, items: filterItems(section.items, ent) })).filter(
    (section) => section.items.length > 0,
  );
}

export function buildOfficeNav(ent: Entitlements | null): NavSection[] {
  return OFFICE_NAV.map((section) => ({ ...section, items: filterItems(section.items, ent) })).filter(
    (section) => section.items.length > 0,
  );
}

export function buildPortalNav(role: Exclude<Role, "admin">, ent: Entitlements | null): NavItem[] {
  return filterItems(PORTAL_NAV[role], ent);
}

export function buildSelfManagedStudentNav(ent: Entitlements | null): NavItem[] {
  return filterItems(SELF_MANAGED_STUDENT_NAV, ent);
}

export const PLATFORM_NAV: NavItem[] = [
  { href: "/platform", labelKey: "nav.platform.overview", exact: true },
  { href: "/platform/studios", labelKey: "nav.platform.studios" },
  { href: "/platform/owners", labelKey: "nav.platform.owners" },
  { href: "/platform/messages", labelKey: "nav.platform.supportInbox" },
  { href: "/platform/tasks", labelKey: "nav.platform.opsTasks" },
  { href: "/platform/features", labelKey: "nav.platform.featureFlags" },
  { href: "/platform/badges", labelKey: "nav.platform.badges" },
  { href: "/platform/announcements", labelKey: "nav.platform.announcements" },
  { href: "/platform/settings", labelKey: "nav.platform.settings" },
  { href: "/platform/audit", labelKey: "nav.platform.auditLog" },
];
