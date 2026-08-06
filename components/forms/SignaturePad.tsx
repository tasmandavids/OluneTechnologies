"use client";

// ============================================================================
//  SignaturePad — draw-or-type signature capture.
//
//  The things that make a signature pad actually work, all of which are easy
//  to get wrong:
//
//   · Strokes are kept as *normalised* points (0–1 of the box), never as
//     device pixels. The canvas can be resized, rotated, or moved between
//     displays and the signature redraws identically — and the exported image
//     is rendered from the same points at a fixed size, so what the studio
//     files away doesn't depend on the width of the signer's phone.
//   · Pointer events with capture, so a stroke that leaves the canvas mid-flick
//     still finishes cleanly. One code path covers mouse, touch and stylus.
//   · touch-action: none, or a finger stroke scrolls the page instead of
//     drawing on iOS and Android.
//   · The backing store is sized to devicePixelRatio, so strokes are crisp on
//     retina rather than a blurry upscale.
//   · A stroke is a polyline through every sampled point with round joins;
//     drawing individual segments on their own paths leaves visible seams at
//     speed.
// ============================================================================

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FormSignature } from "@/lib/forms/types";

type Point = { x: number; y: number };
type Stroke = Point[];

/** Fixed size of the exported PNG, in device-independent pixels. */
const EXPORT_WIDTH = 720;
const EXPORT_HEIGHT = 240;
const INK = "#111827";

function drawStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  width: number,
  height: number,
  lineWidth: number,
) {
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = INK;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const stroke of strokes) {
    if (stroke.length === 0) continue;
    // A single tap is a dot, which a polyline of one point would not paint.
    if (stroke.length === 1) {
      ctx.beginPath();
      ctx.arc(stroke[0].x * width, stroke[0].y * height, lineWidth / 2, 0, Math.PI * 2);
      ctx.fillStyle = INK;
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(stroke[0].x * width, stroke[0].y * height);
    for (let i = 1; i < stroke.length; i += 1) {
      ctx.lineTo(stroke[i].x * width, stroke[i].y * height);
    }
    ctx.stroke();
  }
}

function exportStrokes(strokes: Stroke[]): string | null {
  if (strokes.length === 0) return null;
  const canvas = document.createElement("canvas");
  const dpr = 2;
  canvas.width = EXPORT_WIDTH * dpr;
  canvas.height = EXPORT_HEIGHT * dpr;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(dpr, dpr);
  drawStrokes(ctx, strokes, EXPORT_WIDTH, EXPORT_HEIGHT, 3);
  return canvas.toDataURL("image/png");
}

export function SignaturePad({
  signerName,
  statement,
  value,
  onChange,
  disabled = false,
}: {
  /** Pre-fills the legal-name field with the signed-in person's name. */
  signerName: string | null;
  statement: string | null;
  value: FormSignature | null;
  onChange: (signature: FormSignature | null) => void;
  disabled?: boolean;
}) {
  const [mode, setMode] = useState<"drawn" | "typed">(value?.type ?? "drawn");
  const [name, setName] = useState(value?.name ?? signerName ?? "");
  const [typed, setTyped] = useState(value?.type === "typed" ? value.value : "");
  const [hasInk, setHasInk] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const activeRef = useRef<Stroke | null>(null);
  const sizeRef = useRef({ width: 0, height: 0 });

  // Keep the latest onChange without making the pointer handlers depend on it.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const repaint = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const { width, height } = sizeRef.current;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const dpr = window.devicePixelRatio || 1;
    ctx.scale(dpr, dpr);
    drawStrokes(ctx, strokesRef.current, width, height, 2.2);
  }, []);

  // Size the backing store to the CSS box × DPR, and redraw on every resize.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const dpr = window.devicePixelRatio || 1;
      sizeRef.current = { width: rect.width, height: rect.height };
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      repaint();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    window.addEventListener("orientationchange", resize);
    return () => {
      observer.disconnect();
      window.removeEventListener("orientationchange", resize);
    };
  }, [repaint]);

  // An already-signed drawn signature is shown as-is rather than as a blank
  // pad. It is kept in a ref so editing the name doesn't quietly discard it —
  // only drawing over it or clearing does.
  const existingDrawn = useRef<string | null>(value?.type === "drawn" ? value.value : null);
  const hydratedFor = useRef<string | null>(null);
  useEffect(() => {
    if (value?.type === "drawn" && value.value && hydratedFor.current !== value.value) {
      hydratedFor.current = value.value;
      existingDrawn.current = value.value;
      setHasInk(true);
    }
  }, [value]);

  const emit = useCallback(
    (next: { mode?: "drawn" | "typed"; name?: string; typed?: string }) => {
      const activeMode = next.mode ?? mode;
      const activeName = (next.name ?? name).trim();
      if (!activeName) {
        onChangeRef.current(null);
        return;
      }
      if (activeMode === "typed") {
        const text = (next.typed ?? typed).trim();
        onChangeRef.current(text ? { value: text, type: "typed", name: activeName } : null);
        return;
      }
      const png = exportStrokes(strokesRef.current) ?? existingDrawn.current;
      onChangeRef.current(png ? { value: png, type: "drawn", name: activeName } : null);
    },
    [mode, name, typed],
  );

  function pointFrom(e: React.PointerEvent<HTMLCanvasElement>): Point {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1),
      y: Math.min(Math.max((e.clientY - rect.top) / rect.height, 0), 1),
    };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const stroke: Stroke = [pointFrom(e)];
    activeRef.current = stroke;
    strokesRef.current = [...strokesRef.current, stroke];
    setHasInk(true);
    repaint();
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!activeRef.current) return;
    e.preventDefault();
    // getCoalescedEvents keeps fast strokes smooth on high-rate pointers.
    const events = typeof e.nativeEvent.getCoalescedEvents === "function"
      ? e.nativeEvent.getCoalescedEvents()
      : [e.nativeEvent];
    const rect = e.currentTarget.getBoundingClientRect();
    for (const native of events.length > 0 ? events : [e.nativeEvent]) {
      activeRef.current.push({
        x: Math.min(Math.max((native.clientX - rect.left) / rect.width, 0), 1),
        y: Math.min(Math.max((native.clientY - rect.top) / rect.height, 0), 1),
      });
    }
    repaint();
  }

  function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!activeRef.current) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    activeRef.current = null;
    emit({});
  }

  function clear() {
    strokesRef.current = [];
    activeRef.current = null;
    hydratedFor.current = null;
    existingDrawn.current = null;
    setHasInk(false);
    repaint();
    emit({});
  }

  function undo() {
    strokesRef.current = strokesRef.current.slice(0, -1);
    setHasInk(strokesRef.current.length > 0);
    repaint();
    emit({});
  }

  const showExisting = mode === "drawn" && strokesRef.current.length === 0 && value?.type === "drawn";

  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: "var(--hair)", background: "var(--surface)" }}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Signature</p>
      {statement && <p className="mt-2 text-sm leading-relaxed text-ink">{statement}</p>}

      <div className="mt-3 flex flex-col gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted">Full legal name</span>
          <input
            type="text"
            value={name}
            disabled={disabled}
            onChange={(e) => {
              setName(e.target.value);
              emit({ name: e.target.value });
            }}
            placeholder="e.g. Jane Smith"
            className="w-full rounded-xl border px-3 py-2 text-sm text-ink"
            style={{ borderColor: "var(--hair)", background: "var(--base)" }}
          />
        </label>

        <div className="flex w-fit gap-1 rounded-xl border p-1" style={{ borderColor: "var(--hair)" }}>
          {(["drawn", "typed"] as const).map((option) => (
            <button
              key={option}
              type="button"
              disabled={disabled}
              onClick={() => {
                setMode(option);
                emit({ mode: option });
              }}
              className="rounded-lg px-3 py-1 text-xs font-semibold transition"
              style={{
                color: mode === option ? "var(--ink, var(--text))" : "var(--muted)",
                background: mode === option ? "var(--t3)" : "transparent",
              }}
            >
              {option === "drawn" ? "Draw" : "Type"}
            </button>
          ))}
        </div>

        {mode === "drawn" ? (
          <div>
            <div
              className="relative overflow-hidden rounded-xl border"
              style={{ borderColor: "var(--hair)", background: "#ffffff" }}
            >
              {showExisting && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={value!.value}
                  alt="Current signature"
                  className="pointer-events-none absolute inset-0 h-full w-full object-contain p-2"
                />
              )}
              <canvas
                ref={canvasRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onPointerLeave={handlePointerUp}
                className="relative block h-[160px] w-full"
                style={{ touchAction: "none", cursor: disabled ? "not-allowed" : "crosshair" }}
                aria-label="Signature drawing area"
              />
              {!hasInk && !showExisting && (
                <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-5">
                  <span className="text-xs" style={{ color: "#9ca3af" }}>
                    Sign here with your finger, stylus or mouse
                  </span>
                </div>
              )}
              <div
                className="pointer-events-none absolute bottom-9 left-6 right-6 border-b border-dashed"
                style={{ borderColor: "#d1d5db" }}
              />
            </div>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={undo}
                disabled={disabled || strokesRef.current.length === 0}
                className="rounded-lg border px-3 py-1 text-xs font-semibold text-muted transition hover:text-ink disabled:opacity-40"
                style={{ borderColor: "var(--hair)" }}
              >
                Undo stroke
              </button>
              <button
                type="button"
                onClick={clear}
                disabled={disabled || (!hasInk && !showExisting)}
                className="rounded-lg border px-3 py-1 text-xs font-semibold text-muted transition hover:text-ink disabled:opacity-40"
                style={{ borderColor: "var(--hair)" }}
              >
                Clear
              </button>
            </div>
          </div>
        ) : (
          <div>
            <input
              type="text"
              value={typed}
              disabled={disabled}
              onChange={(e) => {
                setTyped(e.target.value);
                emit({ typed: e.target.value });
              }}
              placeholder="Type your name to sign"
              className="w-full rounded-xl border px-4 py-3 text-2xl text-ink"
              style={{
                borderColor: "var(--hair)",
                background: "var(--base)",
                fontFamily: "'Snell Roundhand', 'Brush Script MT', 'Segoe Script', cursive",
              }}
            />
            <p className="mt-1.5 text-[11px] text-muted">
              Typing your name here counts as your signature.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Read-only render of a stored signature — admin response table, receipts. */
export function SignatureStamp({
  signature,
  type,
  name,
  className = "",
}: {
  signature: string | null;
  type: "drawn" | "typed" | null;
  name: string | null;
  className?: string;
}) {
  if (!signature) return null;
  if (type === "drawn") {
    return (
      <div
        className={`inline-flex items-center rounded-lg border px-2 py-1 ${className}`}
        style={{ borderColor: "var(--hair)", background: "#ffffff" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={signature} alt={name ? `Signature of ${name}` : "Signature"} className="h-10 w-auto" />
      </div>
    );
  }
  return (
    <span
      className={`text-lg text-ink ${className}`}
      style={{ fontFamily: "'Snell Roundhand', 'Brush Script MT', 'Segoe Script', cursive" }}
    >
      {signature}
    </span>
  );
}
