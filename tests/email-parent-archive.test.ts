import { describe, expect, it } from "vitest";
import { messagesForParent, type ParentProfile } from "@/lib/email/parent-archive";
import type { SyncedMessage } from "@/lib/email/types";

const studio = "studio@example.com";
const parentA: ParentProfile = { id: "a", email: "a@example.com" };
const parentB: ParentProfile = { id: "b", email: "b@example.com" };

function msg(id: string, from: string, to: string[], cc: string[] = []) {
  const synced: SyncedMessage = {
    providerMessageId: id,
    providerThreadId: "t1",
    fromAddress: from,
    fromName: null,
    toAddresses: to,
    ccAddresses: cc,
    subject: "Term 4 timetable",
    bodyText: id,
    bodyHtml: null,
    sentAt: null,
    isOutbound: false,
    inReplyTo: null,
    snippet: null,
  };
  return { sourceMessageId: id, synced };
}

describe("parent email archive scope (audit E-01)", () => {
  const thread = [
    msg("1", studio, [parentA.email, parentB.email]), // group send
    msg("2", parentB.email, [studio]), // B replies privately
    msg("3", parentA.email, [studio]), // A replies privately
  ];

  it("archives only the messages each parent sent or received", () => {
    expect(messagesForParent(parentA, thread).map((m) => m.sourceMessageId)).toEqual(["1", "3"]);
    expect(messagesForParent(parentB, thread).map((m) => m.sourceMessageId)).toEqual(["1", "2"]);
  });

  it("counts cc recipients", () => {
    const m = msg("4", studio, ["x@example.com"], ["A@Example.com"]);
    expect(messagesForParent(parentA, [m])).toHaveLength(1);
  });
});
