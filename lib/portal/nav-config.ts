import type { Role } from "@/lib/types";

export type NavItem = {
  href: string;
  labelKey: string;
  exact?: boolean;
  children?: NavItem[];
};

export type NavSection = {
  titleKey?: string;
  items: NavItem[];
};

// 1.6.1 IA: one job-to-be-done = one door. 13 top-level items across 4 titled
// sections (was 20 / 7). Old routes redirect to their new homes.
export const ADMIN_NAV: NavSection[] = [
  {
    items: [
      { href: "/portal/admin", labelKey: "nav.admin.dashboard", exact: true },
      { href: "/portal/admin/classes", labelKey: "nav.admin.classes" },
      { href: "/portal/admin/events", labelKey: "nav.admin.events" },
    ],
  },
  {
    titleKey: "nav.sections.teamManagement",
    items: [
      {
        href: "/portal/admin/staff",
        labelKey: "nav.admin.staff",
        children: [
          { href: "/portal/admin/substitutes", labelKey: "nav.admin.substitutes" },
          { href: "/portal/admin/availability", labelKey: "nav.admin.availability" },
          { href: "/portal/admin/private-lessons", labelKey: "nav.admin.privateLessons" },
        ],
      },
    ],
  },
  {
    titleKey: "nav.sections.families",
    items: [
      { href: "/portal/admin/parents", labelKey: "nav.admin.parents" },
      { href: "/portal/admin/students", labelKey: "nav.admin.students" },
      { href: "/portal/admin/badges", labelKey: "nav.admin.badges" },
      { href: "/portal/admin/leads", labelKey: "nav.admin.leads" },
    ],
  },
  {
    titleKey: "nav.sections.finance",
    items: [
      { href: "/portal/admin/billing", labelKey: "nav.admin.billing" },
      { href: "/portal/admin/accounting", labelKey: "nav.admin.accounting" },
    ],
  },
  {
    titleKey: "nav.sections.digital",
    items: [
      {
        href: "/portal/admin/site",
        labelKey: "nav.admin.website",
        children: [
          { href: "/portal/admin/advertising", labelKey: "nav.admin.advertising" },
        ],
      },
      { href: "/portal/admin/shop", labelKey: "nav.admin.shop" },
    ],
  },
  {
    items: [
      { href: "/portal/admin/messages", labelKey: "nav.admin.inbox" },
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
      { href: "/portal/admin/parents", labelKey: "nav.admin.parents" },
      { href: "/portal/admin/students", labelKey: "nav.admin.students" },
      { href: "/portal/admin/leads", labelKey: "nav.admin.leads" },
      { href: "/portal/admin/classes", labelKey: "nav.admin.classes" },
    ],
  },
  {
    titleKey: "nav.sections.communications",
    items: [{ href: "/portal/admin/messages", labelKey: "nav.admin.messages" }],
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
    { href: "/portal/teacher/availability", labelKey: "nav.teacher.availability" },
    { href: "/portal/teacher/private-lessons", labelKey: "nav.teacher.privateLessons" },
    { href: "/portal/teacher/substitutes", labelKey: "nav.teacher.substitutes" },
    { href: "/portal/teacher/messages", labelKey: "nav.teacher.messages" },
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
    { href: "/portal/parent/private-lessons", labelKey: "nav.parent.privateLessons" },
    { href: "/portal/parent/absences", labelKey: "nav.parent.absences" },
    { href: "/portal/parent/recital", labelKey: "nav.parent.recital" },
    { href: "/portal/parent/forms", labelKey: "nav.parent.forms" },
    { href: "/portal/parent/billing", labelKey: "nav.parent.billing" },
    { href: "/portal/parent/chat", labelKey: "nav.parent.messages" },
  ],
  student: [
    { href: "/portal/student", labelKey: "nav.student.timetable", exact: true },
    { href: "/portal/student/progress", labelKey: "nav.student.progress" },
  ],
};

export const SELF_MANAGED_STUDENT_NAV: NavItem[] = [
  { href: "/portal/student", labelKey: "nav.student.hub", exact: true },
  { href: "/portal/parent/billing", labelKey: "nav.parent.billing" },
  { href: "/portal/parent/forms", labelKey: "nav.parent.forms" },
  { href: "/portal/student/progress", labelKey: "nav.student.progress" },
  { href: "/portal/student/messages", labelKey: "nav.student.messages" },
];

export const ROLE_BADGE_KEYS: Record<Role, string> = {
  admin: "roles.admin",
  teacher: "roles.teacher",
  office: "roles.office",
  parent: "roles.parent",
  student: "roles.student",
};

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
