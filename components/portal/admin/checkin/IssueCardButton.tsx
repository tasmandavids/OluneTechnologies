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
//
//  Once active, staff can also pull the family's Apple Wallet pass — the same
//  file the parent/student portals offer, downloadable here so the front desk
//  can hand it over directly (AirDrop, email) instead of talking someone
//  through finding it themselves. 0103's nfc_cards_ops_all policy is what
//  authorises the download route for staff.
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
  appleWalletEnabled = false,
}: {
  studentId: string;
  currentCard: CurrentCard;
  /** False when the deployment has no Pass Type ID certificate — see docs/APPLE_WALLET.md. */
  appleWalletEnabled?: boolean;
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

      {currentCard?.status === "active" && appleWalletEnabled && (
        <p className="mb-3 text-xs text-muted">
          The family can add this to Apple Wallet from their own portal — download it here to hand
          it over directly. It carries a QR of the same token; the plastic card is what taps the
          reader.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {currentCard?.status === "active" && appleWalletEnabled && (
          <a
            href={`/api/apple-wallet/checkin-card/${currentCard.id}`}
            className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold text-ink transition hover:bg-[--t2]"
            style={{ borderColor: "var(--ring)" }}
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <rect x="2.5" y="5.5" width="19" height="13" rx="3" />
              <path d="M2.5 10.5h19" />
              <path d="M16.5 14.5h2" strokeLinecap="round" />
            </svg>
            Wallet pass
          </a>
        )}
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
