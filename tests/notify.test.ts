import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  channelsForType,
  renderNotificationEmail,
  renderNotificationPush,
  renderNotificationSms,
  type DeliverableNotification,
} from "@/lib/notify/messages";
import {
  deliveryStatus,
  isEmailConfigured,
  isPushConfigured,
  isSmsConfigured,
  unconfiguredDeliveryChannels,
} from "@/lib/notify/config";

const sample = (over: Partial<DeliverableNotification> = {}): DeliverableNotification => ({
  id: "n1",
  type: "class_reminder",
  title: "Class tomorrow: Ballet",
  body: "Starts at 16:00. See you there!",
  link: "/portal/student",
  ...over,
});

describe("channelsForType", () => {
  it("routes imminent action events to email + SMS + push", () => {
    expect(channelsForType("class_reminder")).toEqual(["email", "sms", "push"]);
    expect(channelsForType("waitlist_promoted")).toEqual(["email", "sms", "push"]);
  });

  it("routes money + confirmation events to email + push", () => {
    expect(channelsForType("payment_failed")).toEqual(["email", "push"]);
    expect(channelsForType("invoice_overdue")).toEqual(["email", "push"]);
    expect(channelsForType("enrollment_confirmed")).toEqual(["email", "push"]);
    expect(channelsForType("birthday_greeting")).toEqual(["email", "push"]);
  });

  it("defaults unknown types to in-app only", () => {
    expect(channelsForType("some_future_type")).toEqual([]);
  });

  // A cover request is the most time-critical message the product sends: a
  // class starts in hours and has no teacher. Email alone assumes the teacher
  // is at a desk, so this must stay on SMS.
  it("sends cover requests on SMS as well as email", () => {
    expect(channelsForType("substitute_needed")).toContain("sms");
  });

  it("confirms cover without SMS — the urgency is gone once it's filled", () => {
    expect(channelsForType("substitute_filled")).not.toContain("sms");
  });

  // ── Push routing ─────────────────────────────────────────────────────────
  // Adding push must never have moved an existing email or SMS destination.
  // These two assertions are the regression guard for that.
  it("leaves the SMS set untouched by the arrival of push", () => {
    const smsTypes = [
      "class_reminder",
      "waitlist_promoted",
      "substitute_needed",
    ];
    const nonSmsTypes = [
      "substitute_filled",
      "enrollment_confirmed",
      "payment_failed",
      "invoice_overdue",
      "invoice_sent",
      "payment_reminder",
      "subscription_sent",
      "birthday_greeting",
      "schedule_updated",
      "message_received",
      "checkin_tap",
      "contractor_invoice_received",
    ];
    for (const t of smsTypes) expect(channelsForType(t)).toContain("sms");
    for (const t of nonSmsTypes) expect(channelsForType(t)).not.toContain("sms");
  });

  it("leaves the email set untouched by the arrival of push", () => {
    const emailTypes = [
      "class_reminder",
      "waitlist_promoted",
      "substitute_needed",
      "substitute_filled",
      "enrollment_confirmed",
      "payment_failed",
      "invoice_overdue",
      "invoice_sent",
      "payment_reminder",
      "subscription_sent",
      "birthday_greeting",
      "schedule_updated",
    ];
    const nonEmailTypes = ["message_received", "checkin_tap", "contractor_invoice_received"];
    for (const t of emailTypes) expect(channelsForType(t)).toContain("email");
    for (const t of nonEmailTypes) expect(channelsForType(t)).not.toContain("email");
  });

  // Chat and check-in are the two the native app exists for: worth a lock
  // screen, never worth an email.
  it("makes chat and check-in push-only", () => {
    expect(channelsForType("message_received")).toEqual(["push"]);
    expect(channelsForType("checkin_tap")).toEqual(["push"]);
  });

  // The invoice IS the email; a push on top carries no extra information.
  it("does not push the invoice-delivery types", () => {
    expect(channelsForType("invoice_sent")).toEqual(["email"]);
    expect(channelsForType("subscription_sent")).toEqual(["email"]);
  });

  it("keeps the contractor invoice copy in-app only", () => {
    expect(channelsForType("contractor_invoice_received")).toEqual([]);
  });
});

describe("renderNotificationEmail", () => {
  it("renders subject, html and a plain-text fallback", () => {
    const e = renderNotificationEmail(sample());
    expect(e.subject).toBe("Class tomorrow: Ballet");
    expect(e.html).toContain("Class tomorrow: Ballet");
    expect(e.text).toContain("Starts at 16:00");
  });

  it("escapes HTML in the title/body to prevent injection", () => {
    const e = renderNotificationEmail(sample({ title: "<script>alert(1)</script>" }));
    expect(e.html).not.toContain("<script>");
    expect(e.html).toContain("&lt;script&gt;");
  });

  it("makes a relative link absolute when NEXT_PUBLIC_APP_URL is set", () => {
    const prev = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://demo.olune.app";
    const e = renderNotificationEmail(sample({ link: "/portal/student" }));
    expect(e.html).toContain("https://www.demo.olune.app/portal/student");
    expect(e.text).toContain("https://www.demo.olune.app/portal/student");
    process.env.NEXT_PUBLIC_APP_URL = prev;
  });

  it("omits the CTA when there is no link", () => {
    const e = renderNotificationEmail(sample({ link: null }));
    expect(e.html).not.toContain("Open Olune");
  });
});

describe("renderNotificationSms", () => {
  it("joins title, body and link with em-dashes", () => {
    const prev = process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    const sms = renderNotificationSms(sample({ link: null }));
    expect(sms).toBe("Class tomorrow: Ballet — Starts at 16:00. See you there!");
    process.env.NEXT_PUBLIC_APP_URL = prev;
  });

  it("truncates very long messages", () => {
    const sms = renderNotificationSms(sample({ body: "x".repeat(500), link: null }));
    expect(sms.length).toBeLessThanOrEqual(320);
    expect(sms.endsWith("...")).toBe(true);
  });
});

describe("renderNotificationPush", () => {
  it("uses the title and body verbatim and keeps the link in data", () => {
    const p = renderNotificationPush(sample());
    expect(p.title).toBe("Class tomorrow: Ballet");
    expect(p.body).toBe("Starts at 16:00. See you there!");
    expect(p.data.link).toBe("/portal/student");
    expect(p.data.notificationId).toBe("n1");
    expect(p.data.type).toBe("class_reminder");
  });

  // A visible URL in a push is untappable as text and eats the two lines a
  // lock screen gives you. The app routes from data.link instead.
  it("never appends the link to the visible body", () => {
    const p = renderNotificationPush(sample({ link: "/portal/parent/billing" }));
    expect(p.body).not.toContain("/portal/parent/billing");
  });

  it("keeps the link relative for the app's own router", () => {
    const prev = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://demo.olune.app";
    const p = renderNotificationPush(sample({ link: "/portal/student" }));
    expect(p.data.link).toBe("/portal/student");
    process.env.NEXT_PUBLIC_APP_URL = prev;
  });

  it("truncates a long body to what a notification shade will show", () => {
    const p = renderNotificationPush(sample({ body: "x".repeat(500) }));
    expect(p.body.length).toBeLessThanOrEqual(240);
    expect(p.body.endsWith("...")).toBe(true);
  });

  it("renders an empty body rather than the string 'null'", () => {
    const p = renderNotificationPush(sample({ body: null }));
    expect(p.body).toBe("");
  });
});

describe("provider configuration gates", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM;
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_FROM;
    delete process.env.EXPO_ACCESS_TOKEN;
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it("reports email unconfigured until both key and from are present", () => {
    expect(isEmailConfigured()).toBe(false);
    process.env.RESEND_API_KEY = "re_test";
    expect(isEmailConfigured()).toBe(false); // still missing RESEND_FROM
    process.env.RESEND_FROM = "Olune <a@b.com>";
    expect(isEmailConfigured()).toBe(true);
  });

  // Regression: production ran with RESEND_API_KEY unset, sendEmail returned
  // {skipped:true}, and the cron marked the notification delivered. Nothing
  // threw and nothing logged. These assert the reporting that makes that
  // visible to /api/health/secrets.
  it("names an unconfigured channel and what it silently drops", () => {
    const silent = unconfiguredDeliveryChannels();
    const email = silent.find((c) => c.channel === "email");
    expect(email).toBeDefined();
    expect(email!.requires).toContain("RESEND_API_KEY");
    expect(email!.requires).toContain("RESEND_FROM");
    expect(email!.drops.trim().length).toBeGreaterThan(0);
  });

  it("drops a channel out of the unconfigured list once its keys are set", () => {
    expect(unconfiguredDeliveryChannels().map((c) => c.channel)).toContain("email");
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_FROM = "Olune <a@b.com>";
    expect(unconfiguredDeliveryChannels().map((c) => c.channel)).not.toContain("email");
  });

  it("reports every channel, configured or not, and leaks no values", () => {
    process.env.RESEND_API_KEY = "re_secret_value";
    process.env.RESEND_FROM = "Olune <a@b.com>";
    const all = deliveryStatus();
    expect(all.map((c) => c.channel).sort()).toEqual(["email", "push", "sms"]);
    expect(JSON.stringify(all)).not.toContain("re_secret_value");
  });

  it("reports SMS unconfigured until sid, token and from are all present", () => {
    expect(isSmsConfigured()).toBe(false);
    process.env.TWILIO_ACCOUNT_SID = "AC1";
    process.env.TWILIO_AUTH_TOKEN = "tok";
    expect(isSmsConfigured()).toBe(false); // still missing TWILIO_FROM
    process.env.TWILIO_FROM = "+6421234567";
    expect(isSmsConfigured()).toBe(true);
  });

  // Expo accepts unauthenticated sends, so gating on the access token is our
  // choice: it turns on Expo's push security and keeps push consistent with
  // the other two providers, which silently no-op in an unconfigured env.
  it("reports push unconfigured until the Expo access token is present", () => {
    expect(isPushConfigured()).toBe(false);
    process.env.EXPO_ACCESS_TOKEN = "expo_tok";
    expect(isPushConfigured()).toBe(true);
  });
});
