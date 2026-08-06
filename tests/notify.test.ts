import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  channelsForType,
  renderNotificationEmail,
  renderNotificationSms,
  type DeliverableNotification,
} from "@/lib/notify/messages";
import { isEmailConfigured, isSmsConfigured } from "@/lib/notify/config";

const sample = (over: Partial<DeliverableNotification> = {}): DeliverableNotification => ({
  id: "n1",
  type: "class_reminder",
  title: "Class tomorrow: Ballet",
  body: "Starts at 16:00. See you there!",
  link: "/portal/student",
  ...over,
});

describe("channelsForType", () => {
  it("routes imminent action events to email + SMS", () => {
    expect(channelsForType("class_reminder")).toEqual(["email", "sms"]);
    expect(channelsForType("waitlist_promoted")).toEqual(["email", "sms"]);
  });

  it("routes money + confirmation events to email only", () => {
    expect(channelsForType("payment_failed")).toEqual(["email"]);
    expect(channelsForType("invoice_overdue")).toEqual(["email"]);
    expect(channelsForType("enrollment_confirmed")).toEqual(["email"]);
    expect(channelsForType("birthday_greeting")).toEqual(["email"]);
  });

  it("keeps chat messages in-app only (no outbound channels)", () => {
    expect(channelsForType("message_received")).toEqual([]);
  });

  it("defaults unknown types to in-app only", () => {
    expect(channelsForType("some_future_type")).toEqual([]);
  });

  // A cover request is the most time-critical message the product sends: a
  // class starts in hours and has no teacher. Email alone assumes the teacher
  // is at a desk, so this must stay on SMS.
  it("sends cover requests on SMS as well as email", () => {
    expect(channelsForType("substitute_needed")).toEqual(["email", "sms"]);
  });

  it("confirms cover by email only — the urgency is gone once it's filled", () => {
    expect(channelsForType("substitute_filled")).toEqual(["email"]);
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

describe("provider configuration gates", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM;
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_FROM;
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

  it("reports SMS unconfigured until sid, token and from are all present", () => {
    expect(isSmsConfigured()).toBe(false);
    process.env.TWILIO_ACCOUNT_SID = "AC1";
    process.env.TWILIO_AUTH_TOKEN = "tok";
    expect(isSmsConfigured()).toBe(false); // still missing TWILIO_FROM
    process.env.TWILIO_FROM = "+6421234567";
    expect(isSmsConfigured()).toBe(true);
  });
});
