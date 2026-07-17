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
  const [cameraActive, setCameraActive] = useState(false);
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
    return () => {
      scannerRef.current?.stop().catch(() => {});
    };
  }, []);

  async function startCamera() {
    setCameraError(null);
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
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
            setCameraActive(false);
          }
        },
        undefined,
      );
      setCameraActive(true);
    } catch {
      setCameraError(t("cameraUnavailable"));
      setCameraActive(false);
    }
  }

  async function stopCamera() {
    await scannerRef.current?.stop().catch(() => {});
    setCameraActive(false);
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
      <div className="rounded-2xl border border-[--hair] bg-surface p-6 text-center">
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
      </div>
    );
  }

  if (decoded) {
    return (
      <div className="rounded-2xl border border-[--hair] bg-surface p-6">
        <h3 className="mb-4 font-semibold text-ink">{t("pickOccurrence")}</h3>
        {classesError ? (
          <p className="text-sm text-red-500">{classesError}</p>
        ) : (
          <ClassOccurrencePicker classes={classes} onConfirm={redeem} busy={busy} />
        )}
        <button onClick={reset} className="mt-3 text-xs text-muted hover:text-ink">
          {t("cancel")}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[--hair] bg-surface p-6">
      <h2 className="mb-1 text-lg font-black text-ink">{t("scanTitle")}</h2>
      <p className="mb-4 text-sm text-muted">{t("scanSubtitle")}</p>

      <div
        id={SCANNER_ELEMENT_ID}
        className={`mb-4 overflow-hidden rounded-xl ${cameraActive ? "block" : "hidden"}`}
      />

      {!cameraActive && (
        <button
          onClick={startCamera}
          className="mb-4 w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white hover:opacity-90"
        >
          {t("startCamera")}
        </button>
      )}
      {cameraActive && (
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
    </div>
  );
}
