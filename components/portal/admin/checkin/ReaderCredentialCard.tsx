"use client";

// ============================================================================
//  ReaderCredentialCard — generates/rotates the studio's single shared NFC
//  reader credential (studio_integrations, provider='nfc_reader'). The secret
//  is shown once, right after generation — the server never returns it again.
// ============================================================================

import { useState, useTransition } from "react";
import { confirmDialog, toast } from "@/lib/feedback";
import { rotateReaderCredential } from "@/app/portal/admin/checkin/actions";
import type { ReaderCredentialStatus } from "@/lib/checkin/reader-credential";

export function ReaderCredentialCard({ status }: { status: ReaderCredentialStatus }) {
  const [pending, startTransition] = useTransition();
  const [revealed, setRevealed] = useState<{ readerKey: string; readerSecret: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRotate = async () => {
    if (status.connected) {
      const confirmed = await confirmDialog({
        title: "Rotate the reader credential?",
        body: "Every kiosk/reader device configured with the current key and secret will stop working until you enter the new ones.",
        destructive: true,
      });
      if (!confirmed) return;
    }
    setError(null);
    startTransition(async () => {
      const result = await rotateReaderCredential();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRevealed(result.credential);
      toast.success("Reader credential generated.");
    });
  };

  return (
    <div>
      <h2 className="mb-1 text-sm font-bold text-ink">Door reader</h2>
      <p className="mb-3 text-sm text-muted">
        One shared key and secret per studio — enter both into every kiosk/reader device at your entrance.
      </p>

      {error && (
        <p className="mb-3 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-400">
          {error}
        </p>
      )}

      {revealed ? (
        <div className="mb-3 space-y-2 rounded-xl border p-3" style={{ borderColor: "var(--ring)", background: "var(--t1)" }}>
          <p className="text-xs font-semibold text-ink">Shown once — copy it now, it can&apos;t be retrieved again.</p>
          <p className="break-all font-mono text-xs text-muted">Reader key: {revealed.readerKey}</p>
          <p className="break-all font-mono text-xs text-muted">Reader secret: {revealed.readerSecret}</p>
        </div>
      ) : status.connected ? (
        <p className="mb-3 text-xs text-muted">
          Key {status.readerKey} · secret ending {status.secretTail}
        </p>
      ) : (
        <p className="mb-3 text-xs text-muted">No reader configured yet.</p>
      )}

      <button
        type="button"
        onClick={handleRotate}
        disabled={pending}
        className="rounded-xl border px-4 py-2 text-sm font-semibold text-ink transition hover:bg-[--t2] disabled:opacity-60"
        style={{ borderColor: "var(--ring)" }}
      >
        {pending ? "Generating…" : status.connected ? "Rotate credential" : "Generate credential"}
      </button>
    </div>
  );
}
