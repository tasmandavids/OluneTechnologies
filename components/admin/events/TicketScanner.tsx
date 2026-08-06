"use client";

// ============================================================================
//  TicketScanner — recital door check-in.
//
//  Deliberately NOT shaped like PassScanner. That one is a front-desk flow:
//  scan one pass, pick a class, submit, reset. A door has a queue, so the
//  camera stays live and results stack underneath it — the operator never
//  taps between families, they just point the phone.
//
//  Everything the door needs to see is in the result row: who, how many, and
//  whether the code was already used. Nothing is trusted from the QR itself;
//  the server reads party size and status from the ticket row.
//
//  html5-qrcode is dynamically imported — it touches navigator.mediaDevices
//  and must never run during SSR. Manual entry covers camera-less devices and
//  makes the flow testable without a camera.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";
import { parseTicketPayload, type DecodedTicket } from "@/lib/events/ticket-scan";

export type ScannableEvent = { id: string; name: string; eventDate: string };

type ScanOutcome = {
  key: string;
  at: number;
  ok: boolean;
  holderName: string | null;
  quantity: number | null;
  message: string;
};

const SCANNER_ELEMENT_ID = "event-ticket-scanner-viewport";

/** How long the same code is ignored after being seen, so a QR held in front
 *  of the camera fires once rather than ten times a second. */
const DEDUPE_MS = 4000;

export function TicketScanner({ events }: { events: ScannableEvent[] }) {
  const t = useTranslations("admin.events.scanner");
  const [eventId, setEventId] = useState<string>(events[0]?.id ?? "");
  const [cameraRequested, setCameraRequested] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualPayload, setManualPayload] = useState("");
  const [outcomes, setOutcomes] = useState<ScanOutcome[]>([]);

  const scannerRef = useRef<import("html5-qrcode").Html5Qrcode | null>(null);
  // Codes seen recently, so one QR held up to the lens submits once.
  const recentRef = useRef<Map<string, number>>(new Map());
  // Read inside the scan callback, which html5-qrcode captures once at start().
  const eventIdRef = useRef(eventId);
  eventIdRef.current = eventId;

  const admittedCount = outcomes.reduce((n, o) => n + (o.ok ? (o.quantity ?? 1) : 0), 0);

  const submitScan = useCallback(
    async (decoded: DecodedTicket) => {
      const dedupeKey = decoded.qrToken ?? `${decoded.eventId}:${decoded.userId}`;
      const now = Date.now();
      const lastSeen = recentRef.current.get(dedupeKey);
      if (lastSeen && now - lastSeen < DEDUPE_MS) return;
      recentRef.current.set(dedupeKey, now);

      const push = (o: Omit<ScanOutcome, "key" | "at">) =>
        setOutcomes((prev) => [{ ...o, key: `${dedupeKey}-${now}`, at: now }, ...prev].slice(0, 50));

      try {
        const res = await fetch("/api/events/tickets/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventId: eventIdRef.current,
            qrToken: decoded.qrToken,
            userId: decoded.userId,
          }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          holderName?: string | null;
          quantity?: number | null;
          checkedInAt?: string;
          alreadyCheckedIn?: boolean;
        };

        if (res.ok && data.ok) {
          push({
            ok: true,
            holderName: data.holderName ?? null,
            quantity: data.quantity ?? null,
            message: t("admitted"),
          });
          return;
        }

        push({
          ok: false,
          holderName: data.holderName ?? null,
          quantity: data.quantity ?? null,
          message: data.alreadyCheckedIn
            ? t("alreadyScannedAt", { time: formatTime(data.checkedInAt) })
            : (data.error ?? t("scanFailed")),
        });
      } catch {
        push({ ok: false, holderName: null, quantity: null, message: t("networkError") });
      }
    },
    [t],
  );

  useEffect(() => {
    if (!cameraRequested) return;
    let cancelled = false;

    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;
        const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID);
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: 250 },
          (decodedText) => {
            const parsed = parseTicketPayload(decodedText);
            // Camera stays running — a door queue shouldn't need a tap between
            // families. Dedupe in submitScan keeps one code to one submission.
            if (parsed) void submitScan(parsed);
          },
          undefined,
        );
      } catch {
        if (!cancelled) {
          setCameraError(t("cameraUnavailable"));
          setCameraRequested(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (scanner?.isScanning) scanner.stop().catch(() => {});
    };
  }, [cameraRequested, submitScan, t]);

  function submitManual() {
    const parsed = parseTicketPayload(manualPayload);
    if (!parsed) {
      setCameraError(t("invalidPayload"));
      return;
    }
    setCameraError(null);
    setManualPayload("");
    void submitScan(parsed);
  }

  if (events.length === 0) {
    return (
      <GlassPanel className="text-center">
        <p className="font-semibold text-ink">{t("noEventsTitle")}</p>
        <p className="mt-1 text-sm text-muted">{t("noEventsBody")}</p>
      </GlassPanel>
    );
  }

  return (
    <div className="space-y-4">
      <GlassPanel>
        <h2 className="mb-1 text-lg font-black text-ink">{t("title")}</h2>
        <p className="mb-4 text-sm text-muted">{t("subtitle")}</p>

        <label
          htmlFor="ticket-scanner-event"
          className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted"
        >
          {t("eventLabel")}
        </label>
        <select
          id="ticket-scanner-event"
          value={eventId}
          onChange={(e) => setEventId(e.target.value)}
          className="mb-4 w-full rounded-xl border border-[--hair] bg-base px-3 py-2 text-sm text-ink"
        >
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.name} — {formatDate(ev.eventDate)}
            </option>
          ))}
        </select>

        {cameraRequested && (
          <div
            id={SCANNER_ELEMENT_ID}
            className="mb-4 h-64 w-full overflow-hidden rounded-xl bg-black"
          />
        )}

        <button
          type="button"
          onClick={() => {
            setCameraError(null);
            setCameraRequested((v) => !v);
          }}
          className={
            cameraRequested
              ? "mb-4 w-full rounded-xl border border-[--hair] bg-base py-3 text-sm font-semibold text-muted hover:text-ink"
              : "mb-4 w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white hover:opacity-90"
          }
        >
          {cameraRequested ? t("stopCamera") : t("startCamera")}
        </button>

        {cameraError && <p className="mb-3 text-sm text-red-500">{cameraError}</p>}

        <div className="border-t border-[--hair] pt-4">
          <label
            htmlFor="ticket-scanner-manual"
            className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted"
          >
            {t("manualEntryLabel")}
          </label>
          <textarea
            id="ticket-scanner-manual"
            value={manualPayload}
            onChange={(e) => setManualPayload(e.target.value)}
            placeholder={t("manualEntryPlaceholder")}
            rows={3}
            className="w-full rounded-xl border border-[--hair] bg-base px-3 py-2 font-mono text-xs text-ink"
          />
          <button
            type="button"
            onClick={submitManual}
            className="mt-2 w-full rounded-xl border border-[--hair] bg-base py-2 text-sm font-semibold text-ink hover:bg-surface"
          >
            {t("useManualEntry")}
          </button>
        </div>
      </GlassPanel>

      {outcomes.length > 0 && (
        <GlassPanel>
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="font-semibold text-ink">{t("recentScans")}</h3>
            <p className="text-sm text-muted">{t("admittedCount", { count: admittedCount })}</p>
          </div>
          {/* aria-live so a door operator using a screen reader hears each
              result without having to move focus into the list. */}
          <ul className="space-y-2" aria-live="polite">
            {outcomes.map((o) => (
              <li
                key={o.key}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-sm ${
                  o.ok
                    ? "border-green-500/30 bg-green-500/10"
                    : "border-red-500/30 bg-red-500/10"
                }`}
              >
                <span aria-hidden="true" className="text-lg">
                  {o.ok ? "✅" : "⚠️"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink">
                    {o.holderName ?? t("unknownHolder")}
                    {o.quantity ? ` · ${t("guests", { count: o.quantity })}` : ""}
                  </span>
                  <span className={`block text-xs ${o.ok ? "text-green-700" : "text-red-600"}`}>
                    {o.message}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </GlassPanel>
      )}
    </div>
  );
}

function formatTime(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" });
}
