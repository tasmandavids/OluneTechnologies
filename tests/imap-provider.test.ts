import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.fn();
const createTransport = vi.fn(() => ({ sendMail }));

vi.mock("nodemailer", () => ({
  default: { createTransport },
}));

vi.mock("imapflow", () => ({
  ImapFlow: class {},
}));

const { sendImapReply } = await import("@/lib/email/providers/imap");

const credentials = {
  kind: "imap" as const,
  email: "studio@example.test",
  password: "not-a-real-password",
  imapHost: "imap.example.test",
  imapPort: 993,
  smtpHost: "smtp.example.test",
  smtpPort: 465,
};

beforeEach(() => {
  createTransport.mockClear();
  sendMail.mockReset();
  sendMail.mockResolvedValue({ messageId: "message-123" });
});

describe("sendImapReply", () => {
  it("keeps the SMTP transport and reply headers compatible with Nodemailer 10", async () => {
    await expect(
      sendImapReply(credentials, {
        to: ["parent@example.test"],
        subject: "Re: Class update",
        bodyText: "Thanks",
        inReplyTo: "original-message",
        references: "thread-root",
      }),
    ).resolves.toEqual({ providerMessageId: "message-123" });

    expect(createTransport).toHaveBeenCalledWith({
      host: "smtp.example.test",
      port: 465,
      secure: true,
      auth: { user: "studio@example.test", pass: "not-a-real-password" },
    });
    expect(sendMail).toHaveBeenCalledWith({
      from: "studio@example.test",
      to: "parent@example.test",
      subject: "Re: Class update",
      text: "Thanks",
      inReplyTo: "original-message",
      references: "thread-root",
    });
  });
});
