import { NotificationPreferencesPanel } from "@/components/settings/NotificationPreferencesPanel";
import { getNotificationPreferences } from "./actions";
import { channelsForType } from "@/lib/notify/messages";
import { requirePortalSession } from "@/lib/portal/session";

const ALL_TYPES = [
  { type: "class_reminder",       label: "Class reminders",      description: "Reminder the day before a class" },
  { type: "enrollment_confirmed", label: "Enrollment confirmed",  description: "When a student is enrolled in a class" },
  { type: "waitlist_promoted",    label: "Waitlist promoted",     description: "When a spot opens and a student moves off the waitlist" },
  { type: "payment_failed",       label: "Payment failed",        description: "When an automatic payment fails" },
  { type: "invoice_overdue",      label: "Invoice overdue",       description: "When an invoice becomes overdue" },
  { type: "invoice_sent",         label: "Invoice sent",          description: "When a new invoice is issued" },
  { type: "birthday_greeting",    label: "Birthday greetings",    description: "Birthday messages for students" },
  { type: "schedule_updated",     label: "Schedule changes",      description: "When a class time or day changes" },
  { type: "substitute_needed",    label: "Cover requests",        description: "When a class at your studio needs a substitute teacher" },
  { type: "substitute_filled",    label: "Cover confirmed",       description: "When someone picks up a class you asked to be covered" },
  { type: "payment_reminder",     label: "Payment reminders",     description: "A nudge before or after a payment is due" },
  // Push-only types. They carry no email or SMS destination, so they only
  // became controllable once push existed — before that they were in-app only
  // and there was nothing here to switch off.
  { type: "message_received",     label: "Chat messages",         description: "When your studio sends you a message" },
  { type: "checkin_tap",          label: "Check-ins",             description: "When a student taps in or out of a class" },
];

export type PrefEntry = {
  type: string;
  label: string;
  description: string;
  supportsEmail: boolean;
  supportsSms: boolean;
  supportsPush: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;
};

export default async function NotificationPreferencesPage() {
  await requirePortalSession();
  const saved = await getNotificationPreferences();
  const prefMap = new Map(saved.map((p) => [p.notification_type, p]));

  const prefs: PrefEntry[] = ALL_TYPES.flatMap(({ type, label, description }) => {
    const channels = channelsForType(type);
    if (channels.length === 0) return [];
    const row = prefMap.get(type);
    return [{
      type,
      label,
      description,
      supportsEmail: channels.includes("email"),
      supportsSms:  channels.includes("sms"),
      supportsPush: channels.includes("push"),
      emailEnabled: row ? row.email_enabled : true,
      smsEnabled:   row ? row.sms_enabled   : true,
      // `?? true` rather than `row ? … : true` — rows written before 0120 have
      // no push_enabled value and must read as on, not as off.
      pushEnabled:  row ? (row.push_enabled ?? true) : true,
    }];
  });

  return <NotificationPreferencesPanel prefs={prefs} />;
}
