import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import type { ImapCredentials, SyncedMessage } from "../types";

// Threads are keyed on the reply chain only. Grouping by subject merged unrelated
// families who both wrote "Question" into one thread (audit E-01).
function threadKey(references: string | null, messageId: string): string {
  const first = references?.split(/\s+/)[0]?.replace(/[<>]/g, "");
  return first || messageId.replace(/[<>]/g, "");
}

export async function syncImapInbox(
  creds: ImapCredentials,
  syncCursor: string | null,
): Promise<{ messages: SyncedMessage[]; nextCursor: string | null }> {
  const client = new ImapFlow({
    host: creds.imapHost,
    port: creds.imapPort,
    secure: creds.imapPort === 993,
    auth: { user: creds.email, pass: creds.password },
    logger: false,
  });

  const messages: SyncedMessage[] = [];
  const sinceUid = syncCursor ? Number(syncCursor) : 0;

  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const range = sinceUid > 0 ? `${sinceUid + 1}:*` : "1:50";
      for await (const msg of client.fetch(range, {
        uid: true,
        envelope: true,
        source: true,
        internalDate: true,
      })) {
        if (!msg.envelope || !msg.uid) continue;
        const raw = msg.source?.toString("utf8") ?? "";
        const htmlMatch = raw.match(/Content-Type: text\/html[\s\S]*?\r?\n\r?\n([\s\S]*?)(?=\r?\n--|\r?\nContent-Type:|$)/i);
        const textMatch = raw.match(/Content-Type: text\/plain[\s\S]*?\r?\n\r?\n([\s\S]*?)(?=\r?\n--|\r?\nContent-Type:|$)/i);
        const html = htmlMatch?.[1]?.trim() ?? null;
        const text = textMatch?.[1]?.trim() ?? null;
        const messageId = msg.envelope.messageId ?? String(msg.uid);
        const references = msg.envelope.inReplyTo ?? null;
        const subject = msg.envelope.subject ?? null;
        const from = msg.envelope.from?.[0];

        messages.push({
          providerMessageId: String(msg.uid),
          providerThreadId: threadKey(references, messageId),
          fromAddress: from?.address?.toLowerCase() ?? null,
          fromName: from?.name ?? null,
          toAddresses: (msg.envelope.to ?? []).map((a) => a.address?.toLowerCase()).filter(Boolean) as string[],
          ccAddresses: (msg.envelope.cc ?? []).map((a) => a.address?.toLowerCase()).filter(Boolean) as string[],
          subject,
          bodyText: text,
          bodyHtml: html,
          sentAt: msg.internalDate instanceof Date ? msg.internalDate.toISOString() : (typeof msg.envelope.date === "string" ? msg.envelope.date : msg.envelope.date?.toISOString?.() ?? null),
          isOutbound: false,
          inReplyTo: references,
          snippet: text?.slice(0, 200) ?? html?.replace(/<[^>]+>/g, " ").slice(0, 200) ?? null,
        });
      }
    } finally {
      lock.release();
    }

    const status = await client.status("INBOX", { uidNext: true });
    const nextCursor = status.uidNext ? String(Math.max(0, status.uidNext - 1)) : syncCursor;
    return { messages, nextCursor };
  } finally {
    await client.logout();
  }
}

export async function sendImapReply(
  creds: ImapCredentials,
  input: {
    to: string[];
    subject: string;
    bodyText: string;
    inReplyTo?: string;
    references?: string;
  },
): Promise<{ providerMessageId: string }> {
  const transport = nodemailer.createTransport({
    host: creds.smtpHost,
    port: creds.smtpPort,
    secure: creds.smtpPort === 465,
    auth: { user: creds.email, pass: creds.password },
  });

  const info = await transport.sendMail({
    from: creds.email,
    to: input.to.join(", "),
    subject: input.subject,
    text: input.bodyText,
    inReplyTo: input.inReplyTo,
    references: input.references,
  });

  return { providerMessageId: info.messageId ?? `imap-${Date.now()}` };
}
