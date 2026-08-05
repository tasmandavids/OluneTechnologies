"use client";

// ============================================================================
//  PassScanner — admin front-desk flow: scan (or manually enter) a class-pass
//  QR payload, pick the class occurrence it's redeemed against, and submit.
//
//  Camera scanning uses html5-qrcode (dynamically imported — it touches
//  navigator.mediaDevices, so it must never run during SSR). A manual
//  fallback (paste the JSON payload) covers camera-less devices and lets the
//  whole flow be exercised without a live camera during testing.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import ClassOccurrencePicker, { type PickableClass } from "./ClassOccurrencePicker";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";

type DecodedPass = { passId: string; qrToken: string };

const SCANNER_ELEMENT_ID = "class-pass-scanner-viewport";

function parsePayload(raw: string): DecodedPass | null {
  try {
    const data = JSON.parse(raw) as { kind?: string; pass_id?: string; qr_token?: string };
    if (data.kind !== "class_pass" || !data.pass_id || !data.qr_token) return null;
    return { passId: data.pass_id, qrToken: data.qr_token };
  } catch {
    return null;
  }
}

export default function PassScanner() {
  const t = useTranslations("admin.passes");
  // Intent, not scanner state — the container div below only mounts (with
  // real dimensions) once this flips true. html5-qrcode measures the
  // container's clientWidth/clientHeight *synchronously* when start() runs;
  // if that div were only CSS-hidden (display:none) rather than unmounted,
  // it would measure 0x0 at that instant and the video/scan-box canvas would
  // render at zero size forever, even after the div is later shown — which
  // is exactly "camera permission granted, nothing appears". Gating the
  // effect below on this same flag guarantees React has already committed
  // the real-sized div to the DOM before start() ever runs.
  const [cameraRequested, setCameraRequested] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualPayload, setManualPayload] = useState("");
  const [decoded, setDecoded] = useState<DecodedPass | null>(null);
  const [classes, setClasses] = useState<PickableClass[]>([]);
  const [classesError, setClassesError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: true; className: string } | { ok: false; error: string } | null>(
    null,
  );

  const scannerRef = useRef<import("html5-qrcode").Html5Qrcode | null>(null);

  useEffect(() => {
    fetch("/api/passes/classes")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setClassesError(data.error);
        else setClasses(data.classes ?? []);
      })
      .catch(() => setClassesError(t("classesLoadFailed")));
  }, [t]);

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
            const parsed = parsePayload(decodedText);
            if (parsed) {
              setDecoded(parsed);
              scanner.stop().catch(() => {});
              setCameraRequested(false);
            }
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
  }, [cameraRequested, t]);

  function startCamera() {
    setCameraError(null);
    setCameraRequested(true);
  }

  function stopCamera() {
    setCameraRequested(false);
  }

  function submitManual() {
    const parsed = parsePayload(manualPayload);
    if (!parsed) {
      setCameraError(t("invalidPayload"));
      return;
    }
    setCameraError(null);
    setDecoded(parsed);
  }

  async function redeem(classId: string, date: string) {
    if (!decoded) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/passes/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passId: decoded.passId, qrToken: decoded.qrToken, classId, date }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ ok: false, error: data.error ?? t("redeemFailed") });
        return;
      }
      setResult({ ok: true, className: data.className });
    } catch {
      setResult({ ok: false, error: t("networkError") });
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setDecoded(null);
    setResult(null);
    setManualPayload("");
    setCameraError(null);
  }

  if (result) {
    return (
      <GlassPanel className="text-center">
        {result.ok ? (
          <>
            <p className="mb-1 text-2xl">✅</p>
            <p className="font-semibold text-ink">{t("redeemedFor", { className: result.className })}</p>
          </>
        ) : (
          <>
            <p className="mb-1 text-2xl">⚠️</p>
            <p className="font-semibold text-red-500">{result.error}</p>
          </>
        )}
        <button
          onClick={reset}
          className="mt-4 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          {t("scanAnother")}
        </button>
      </GlassPanel>
    );
  }

  if (decoded) {
    return (
      <GlassPanel>
        <h3 className="mb-4 font-semibold text-ink">{t("pickOccurrence")}</h3>
        {classesError ? (
          <p className="text-sm text-red-500">{classesError}</p>
        ) : (
          <ClassOccurrencePicker classes={classes} onConfirm={redeem} busy={busy} />
        )}
        <button onClick={reset} className="mt-3 text-xs text-muted hover:text-ink">
          {t("cancel")}
        </button>
      </GlassPanel>
    );
  }

  return (
    <GlassPanel>
      <h2 className="mb-1 text-lg font-black text-ink">{t("scanTitle")}</h2>
      <p className="mb-4 text-sm text-muted">{t("scanSubtitle")}</p>

      {cameraRequested && (
        <div id={SCANNER_ELEMENT_ID} className="mb-4 h-64 w-full overflow-hidden rounded-xl bg-black" />
      )}

      {!cameraRequested && (
        <button
          onClick={startCamera}
          className="mb-4 w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white hover:opacity-90"
        >
          {t("startCamera")}
        </button>
      )}
      {cameraRequested && (
        <button
          onClick={stopCamera}
          className="mb-4 w-full rounded-xl border border-[--hair] bg-base py-3 text-sm font-semibold text-muted hover:text-ink"
        >
          {t("stopCamera")}
        </button>
      )}

      {cameraError && <p className="mb-3 text-sm text-red-500">{cameraError}</p>}

      <div className="border-t border-[--hair] pt-4">
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">
          {t("manualEntryLabel")}
        </label>
        <textarea
          value={manualPayload}
          onChange={(e) => setManualPayload(e.target.value)}
          placeholder={t("manualEntryPlaceholder")}
          rows={3}
          className="w-full rounded-xl border border-[--hair] bg-base px-3 py-2 font-mono text-xs text-ink"
        />
        <button
          onClick={submitManual}
          className="mt-2 w-full rounded-xl border border-[--hair] bg-base py-2 text-sm font-semibold text-ink hover:bg-surface"
        >
          {t("useManualEntry")}
        </button>
      </div>
    </GlassPanel>
  );
}
