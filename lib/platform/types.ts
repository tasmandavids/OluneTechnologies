// Platform console domain types.

export type PlatformTaskStatus = "todo" | "in_progress" | "blocked" | "done";
export type PlatformTaskPriority = "low" | "normal" | "high" | "urgent";
export type SupportThreadStatus = "open" | "pending" | "resolved";
export type AnnouncementSeverity = "info" | "warning" | "critical";
export type AnnouncementTarget = "all" | "trial" | "active" | "suspended";

export type PlatformSettings = {
  maintenanceMode?: boolean;
  defaultTrialDays?: number;
  supportEmail?: string;
  signupEnabled?: boolean;
  welcomeMessage?: string;
};

export type PlatformStudioSummary = {
  id: string;
  name: string;
  slug: string;
  status: string;
  customDomain: string | null;
  createdAt: string;
  ownerName: string | null;
  ownerEmail: string | null;
  studentCount: number;
  adminCount: number;
  stripeConnected: boolean;
  xeroConnected: boolean;
  /** Which activity vertical this tenant runs. Drives its pack and modules. */
  vertical: string;
};

export type PlatformOwner = {
  profileId: string;
  studioId: string;
  studioName: string;
  studioSlug: string;
  studioStatus: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  createdAt: string;
  notes: string | null;
  tags: string[];
};

export type PlatformTask = {
  id: string;
  taskType: string;
  title: string;
  description: string | null;
  studioId: string | null;
  studioName: string | null;
  status: PlatformTaskStatus;
  priority: PlatformTaskPriority;
  dueAt: string | null;
  assignedTo: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  completedAt: string | null;
};

export type SupportThread = {
  id: string;
  studioId: string;
  studioName: string;
  subject: string;
  status: SupportThreadStatus;
  priority: PlatformTaskPriority;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  lastMessageAt: string | null;
};

export type SupportMessage = {
  id: string;
  body: string;
  isOperator: boolean;
  senderName: string | null;
  createdAt: string;
};

export type FeatureFlag = {
  id: string;
  featureKey: string;
  label: string;
  description: string | null;
  studioId: string | null;
  studioName: string | null;
  enabled: boolean;
};

export type PlatformAnnouncement = {
  id: string;
  title: string;
  body: string;
  severity: AnnouncementSeverity;
  target: AnnouncementTarget;
  publishedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

export type AuditEntry = {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
  operatorName: string | null;
  createdAt: string;
};

/** Preset ops task types for the work queue. */
export const PLATFORM_TASK_TYPES = [
  { key: "onboarding_review", label: "Review new signup", desc: "Walk through a fresh studio setup" },
  { key: "trial_followup", label: "Trial conversion call", desc: "Reach out before trial expires" },
  { key: "domain_verify", label: "Verify custom domain", desc: "Check DNS and SSL provisioning" },
  { key: "billing_issue", label: "Billing reconciliation", desc: "Stripe mismatch or refund request" },
  { key: "feature_rollout", label: "Feature rollout", desc: "Enable beta feature for a studio" },
  { key: "data_export", label: "Data export request", desc: "GDPR or studio migration export" },
  { key: "churn_outreach", label: "Churn risk outreach", desc: "Studio inactive or downgrading" },
  { key: "security_review", label: "Security review", desc: "Investigate suspicious activity" },
  { key: "content_moderation", label: "Content moderation", desc: "Review published site content" },
  { key: "platform_health", label: "Platform health check", desc: "Cron, webhooks, delivery audit" },
] as const;
