"use client";

// ============================================================================
//  IssueCardButton — staff-initiated NFC card issuance for one student.
//  Deliberately not automatic: staff click this only when they decide to
//  hand out a physical card. Writes an opaque token onto a blank NTAG card
//  via the Web NFC API (NDEFReader) — Chrome on Android only; every other
//  browser gets a disabled button with an explanatory note, no dead end.
//
//  Flow: issueCardStart (server pre-creates a `pending` row + token) → prompt
//  "hold a blank card to your phone" → NDEFReader.scan() + .write(token) →
//  success calls issueCardConfirm (flips pending → active); failure/cancel
//  calls issueCardCancel (deletes the never-written pending row) with retry.
// ============================================================================

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmDialog, toast } from "@/lib/feedback";
import {
  issueCardStart,
  issueCardConfirm,
  issueCardCancel,
  freezeCard,
  unfreezeCard,
  revokeCard,
} from "@/app/portal/admin/checkin/actions";

type NDEFMessageInit = { records: { recordType?: string; data?: BufferSource | string }[] };

interface NDEFReaderLike {
  scan(): Promise<void>;
  write(message: NDEFMessageInit): Promise<void>;
}

declare global {
  interface Window {
    NDEFReader?: new () => NDEFReaderLike;
  }
}

export type CardStatus = "pending" | "active" | "frozen" | "lost" | "revoked";

export type CurrentCard = { id: string; status: CardStatus } | null;

type WriteState = "idle" | "starting" | "waiting" | "writing" | "error";

const STATUS_LABEL: Record<CardStatus, string> = {
  pending: "Being issued…",
  active: "Active",
  frozen: "Frozen",
  lost: "Lost",
  revoked: "Revoked",
};

const STATUS_COLOR: Record<CardStatus, string> = {
  pending: "#f59e0b",
  active: "#22c55e",
  frozen: "#3b82f6",
  lost: "#ef4444",
  revoked: "var(--muted)",
};

export function IssueCardButton({
  studentId,
  currentCard,
}: {
  studentId: string;
  currentCard: CurrentCard;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [writeState, setWriteState] = useState<WriteState>("idle");
  const [writeError, setWriteError] = useState<string | null>(null);

  const supportsWebNfc = typeof window !== "undefined" && "NDEFReader" in window;

  const handleIssue = async () => {
    setWriteError(null);
    setWriteState("starting");

    const started = await issueCardStart({ studentId });
    if (!started.ok) {
      setWriteState("error");
      setWriteError(started.error);
      return;
    }

    setWriteState("waiting");
    try {
      const Ctor = window.NDEFReader!;
      const reader = new Ctor();
      await reader.scan();
      setWriteState("writing");
      await reader.write({ records: [{ recordType: "text", data: started.token }] });

      const confirmed = await issueCardConfirm({ cardId: started.cardId });
      if (!confirmed.ok) {
        setWriteState("error");
        setWriteError(confirmed.error);
        return;
      }
      setWriteState("idle");
      toast.success("Card issued.");
      router.refresh();
    } catch (e) {
      await issueCardCancel({ cardId: started.cardId });
      const name = e instanceof DOMException ? e.name : null;
      const message =
        name === "NotAllowedError"
          ? "NFC permission was denied."
          : name === "NotSupportedError"
            ? "This device doesn't support writing NFC tags."
            : name === "NetworkError"
              ? "The card was moved before the write finished. Try again."
              : "Could not write the card. Try again.";
      setWriteState("error");
      setWriteError(message);
    }
  };

  const handleLifecycle = (action: "freeze" | "unfreeze" | "revoke") => {
    if (!currentCard) return;
    startTransition(async () => {
      if (action === "revoke") {
        const confirmed = await confirmDialog({
          title: "Revoke this card?",
          body: "The card will stop working immediately. This can't be undone — issue a new one if the student needs a replacement.",
          destructive: true,
        });
        if (!confirmed) return;
      }
      const fn = action === "freeze" ? freezeCard : action === "unfreeze" ? unfreezeCard : revokeCard;
      const result = await fn({ cardId: currentCard.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(action === "freeze" ? "Card frozen." : action === "unfreeze" ? "Card unfrozen." : "Card revoked.");
      router.refresh();
    });
  };

  if (!supportsWebNfc && !currentCard) {
    return (
      <div>
        <h2 className="mb-1 text-sm font-bold text-ink">Check-in card</h2>
        <p className="text-xs text-muted">Card issuance needs Chrome on Android — try this from a staff Android phone.</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-1 text-sm font-bold text-ink">Check-in card</h2>

      {currentCard ? (
        <div className="mb-3 flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_COLOR[currentCard.status] }} />
          <span className="text-sm text-ink">{STATUS_LABEL[currentCard.status]}</span>
        </div>
      ) : (
        <p className="mb-3 text-sm text-muted">No card issued yet.</p>
      )}

      {writeState === "waiting" && (
        <p className="mb-3 text-sm font-medium text-ink">Hold a blank card to the back of your phone…</p>
      )}
      {writeState === "writing" && <p className="mb-3 text-sm font-medium text-ink">Writing…</p>}
      {writeError && (
        <p className="mb-3 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-400">
          {writeError}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {!currentCard && supportsWebNfc && (
          <button
            type="button"
            onClick={handleIssue}
            disabled={writeState === "starting" || writeState === "waiting" || writeState === "writing"}
            className="rounded-xl border px-4 py-2 text-sm font-semibold text-ink transition hover:bg-[--t2] disabled:opacity-60"
            style={{ borderColor: "var(--ring)" }}
          >
            {writeState === "starting" || writeState === "waiting" || writeState === "writing"
              ? "Issuing…"
              : "Issue card"}
          </button>
        )}
        {currentCard?.status === "active" && (
          <button
            type="button"
            onClick={() => handleLifecycle("freeze")}
            disabled={pending}
            className="rounded-xl border px-4 py-2 text-sm font-semibold text-ink transition hover:bg-[--t2] disabled:opacity-60"
            style={{ borderColor: "var(--ring)" }}
          >
            Freeze
          </button>
        )}
        {currentCard?.status === "frozen" && (
          <button
            type="button"
            onClick={() => handleLifecycle("unfreeze")}
            disabled={pending}
            className="rounded-xl border px-4 py-2 text-sm font-semibold text-ink transition hover:bg-[--t2] disabled:opacity-60"
            style={{ borderColor: "var(--ring)" }}
          >
            Unfreeze
          </button>
        )}
        {currentCard && currentCard.status !== "revoked" && (
          <button
            type="button"
            onClick={() => handleLifecycle("revoke")}
            disabled={pending}
            className="rounded-xl border border-red-400/40 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-400/10 disabled:opacity-60"
          >
            Revoke
          </button>
        )}
      </div>
    </div>
  );
}
