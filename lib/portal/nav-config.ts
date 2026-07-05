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
    items: [{ href: "/portal/admin/staff", labelKey: "nav.admin.staff" }],
  },
  {
    titleKey: "nav.sections.clientManagement",
    items: [
      { href: "/portal/admin/parents", labelKey: "nav.admin.parents" },
      { href: "/portal/admin/students", labelKey: "nav.admin.students" },
      { href: "/portal/admin/leads", labelKey: "nav.admin.leads" },
    ],
  },
  {
    titleKey: "nav.sections.finance",
    items: [
      { href: "/portal/admin/billing", labelKey: "nav.admin.billing" },
      { href: "/portal/admin/accounting", labelKey: "nav.admin.accounting" },
      { href: "/portal/admin/subscriptions", labelKey: "nav.admin.subscriptions" },
      { href: "/portal/admin/payment-plans", labelKey: "nav.admin.paymentPlans" },
    ],
  },
  {
    titleKey: "nav.sections.digital",
    items: [
      { href: "/portal/admin/site", labelKey: "nav.admin.website" },
      { href: "/portal/admin/advertising", labelKey: "nav.admin.advertising" },
      { href: "/portal/admin/shop", labelKey: "nav.admin.shop" },
    ],
  },
  {
    titleKey: "nav.sections.communications",
    items: [
      { href: "/portal/admin/email", labelKey: "nav.admin.email" },
      { href: "/portal/admin/messages", labelKey: "nav.admin.messages" },
      { href: "/portal/admin/support", labelKey: "nav.admin.support" },
    ],
  },
  {
    titleKey: "nav.sections.staffing",
    items: [
      { href: "/portal/admin/substitutes", labelKey: "nav.admin.substitutes" },
      { href: "/portal/admin/availability", labelKey: "nav.admin.availability" },
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
    { href: "/portal/teacher/substitutes", labelKey: "nav.teacher.substitutes" },
    { href: "/portal/teacher/messages", labelKey: "nav.teacher.messages" },
    { href: "/portal/teacher/affiliations", labelKey: "nav.teacher.affiliations" },
    { href: "/settings/notifications", labelKey: "nav.teacher.notifications" },
  ],
  office: [{ href: "/portal/office", labelKey: "nav.office.dashboard", exact: true }],
  parent: [
    { href: "/portal/parent", labelKey: "nav.parent.familyHub", exact: true },
    { href: "/portal/parent/schedule", labelKey: "nav.parent.schedule" },
    { href: "/portal/parent/studio-schedule", labelKey: "nav.parent.fullStudioSchedule" },
    { href: "/portal/parent/absences", labelKey: "nav.parent.absences" },
    { href: "/portal/parent/recital", labelKey: "nav.parent.recital" },
    { href: "/portal/parent/forms", labelKey: "nav.parent.forms" },
    {
      href: "/portal/parent/wallet",
      labelKey: "nav.parent.wallet",
      children: [
        { href: "/portal/parent/billing", labelKey: "nav.parent.billing" },
      ],
    },
    { href: "/portal/parent/chat", labelKey: "nav.parent.studioChat" },
    { href: "/portal/parent/messages", labelKey: "nav.parent.studioEmail" },
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
  { href: "/platform/announcements", labelKey: "nav.platform.announcements" },
  { href: "/platform/settings", labelKey: "nav.platform.settings" },
  { href: "/platform/audit", labelKey: "nav.platform.auditLog" },
];
