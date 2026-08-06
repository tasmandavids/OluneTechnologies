"use client";

import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import CheckoutForm from "@/components/payments/CheckoutForm";
import { PaymentModalBody, PaymentModalShell } from "@/components/payments/PaymentModalShell";

export type ParentEvent = {
  id: string;
  name: string;
  description: string | null;
  eventDate: string;
  venueName: string | null;
  venueAddress: string | null;
  ticketPrice: number;
  ticketsRemaining: number;
  imageUrl: string | null;
  myTicket: { quantity: number; status: string; qrCode: string | null } | null;
};

interface Props {
  events: ParentEvent[];
}

const NZD = new Intl.NumberFormat("en-NZ", {
  style: "currency",
  currency: "NZD",
});

export default function EventsTickets({ events }: Props) {
  const t = useTranslations("parent.events");
  const locale = useLocale();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [pendingQr, setPendingQr] = useState<string | null>(null);

  const active = events.find((e) => e.id === activeId) ?? null;

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function openEvent(ev: ParentEvent) {
    setActiveId(ev.id);
    setQty(1);
    setError(null);
    setClientSecret(null);
    setPendingQr(null);
    setQrCode(ev.myTicket?.qrCode ?? null);
  }

  function close() {
    setActiveId(null);
    setQrCode(null);
    setClientSecret(null);
    setPendingQr(null);
    setError(null);
    setBusy(false);
  }

  async function buy() {
    if (!active) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/events/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: active.id, quantity: qty }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("purchaseFailed"));
        return;
      }
      if (data.free) {
        setQrCode(data.qrCode ?? null);
      } else if (data.clientSecret) {
        setPendingQr(data.qrCode ?? null);
        setClientSecret(data.clientSecret);
      } else {
        setError(t("paymentStartFailed"));
      }
    } catch {
      setError(t("networkError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2 className="mb-3 text-xs uppercase tracking-widest text-muted">
        {t("upcoming", { count: events.length })}
      </h2>

      <div className="grid gap-4 sm:grid-cols-2">
        {events.map((ev) => {
          const soldOut = ev.ticketsRemaining <= 0;
          const owned = ev.myTicket && ev.myTicket.status !== "cancelled";
          return (
            <button
              key={ev.id}
              type="button"
              onClick={() => openEvent(ev)}
              className="box group flex flex-col overflow-hidden rounded-2xl text-left transition-shadow hover:shadow-md"
            >
              <div className="flex h-28 items-center justify-center overflow-hidden bg-base">
                {ev.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={ev.imageUrl} alt={ev.name} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-3xl">🎭</span>
                )}
              </div>
              <div className="flex flex-1 flex-col p-4">
                <p className="font-semibold text-ink">{ev.name}</p>
                <p className="mt-0.5 text-xs text-muted">{formatDate(ev.eventDate)}</p>
                {ev.venueName && (
                  <p className="mt-0.5 text-xs text-muted">📍 {ev.venueName}</p>
                )}
                <div className="mt-auto flex items-center justify-between pt-3">
                  <span className="font-black text-brand">
                    {ev.ticketPrice === 0 ? t("free") : NZD.format(ev.ticketPrice / 100)}
                  </span>
                  {owned ? (
                    <span className="rounded-full bg-[color-mix(in_srgb,#22c55e_18%,transparent)] px-2.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wider text-emerald-600">
                      {t("ticketHeld")}
                    </span>
                  ) : soldOut ? (
                    <span className="text-xs text-muted">{t("soldOut")}</span>
                  ) : (
                    <span className="text-xs font-semibold text-brand group-hover:underline">
                      {t("ticketsLeft", { count: ev.ticketsRemaining })}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <AnimatePresence>
        {active && (
          <PaymentModalShell onClose={close}>
            <div className="shrink-0 border-b border-[--hair] px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-black text-ink">{active.name}</h3>
                  <p className="mt-0.5 text-xs text-muted">{formatDate(active.eventDate)}</p>
                  {active.venueName && (
                    <p className="mt-0.5 text-xs text-muted">
                      📍 {active.venueName}
                      {active.venueAddress ? ` — ${active.venueAddress}` : ""}
                    </p>
                  )}
                </div>
                <button onClick={close} className="text-lg text-muted hover:text-ink">
                  ✕
                </button>
              </div>
            </div>

            <PaymentModalBody>
              {qrCode ? (
                <div className="flex flex-col items-center text-center">
                  <p className="mb-3 font-semibold text-ink">{t("allSet")}</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrCode}
                    alt={t("qrAlt")}
                    className="h-48 w-48 rounded-xl border border-[--hair] bg-white p-2"
                  />
                  <p className="mt-3 text-xs text-muted">{t("qrHint")}</p>
                  <button
                    onClick={close}
                    className="mt-4 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
                  >
                    {t("done")}
                  </button>
                </div>
              ) : clientSecret ? (
                <div>
                  <div className="mb-4 flex items-center justify-between">
                    <span className="text-sm text-muted">{t("ticketCount", { count: qty })}</span>
                    <span className="text-lg font-black text-brand">
                      {NZD.format((active.ticketPrice * qty) / 100)}
                    </span>
                  </div>
                  <CheckoutForm
                    clientSecret={clientSecret}
                    submitLabel={t("payAmount", {
                      amount: NZD.format((active.ticketPrice * qty) / 100),
                    })}
                    onSuccess={() => {
                      setClientSecret(null);
                      setQrCode(pendingQr);
                    }}
                    onCancel={() => setClientSecret(null)}
                    cancelLabel={t("back")}
                  />
                </div>
              ) : (
                <>
                  {active.description && (
                    <p className="mb-4 text-sm text-muted">{active.description}</p>
                  )}

                  <div className="mb-4 flex items-center justify-between rounded-xl border border-[--hair] bg-base px-4 py-3">
                    <span className="text-sm font-medium text-ink">{t("ticketsLabel")}</span>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setQty((q) => Math.max(1, q - 1))}
                        className="h-7 w-7 rounded-md border border-[--hair] text-muted hover:text-ink"
                      >
                        −
                      </button>
                      <span className="w-5 text-center text-sm font-semibold text-ink">{qty}</span>
                      <button
                        onClick={() =>
                          setQty((q) => Math.min(10, active.ticketsRemaining, q + 1))
                        }
                        className="h-7 w-7 rounded-md border border-[--hair] text-muted hover:text-ink disabled:opacity-30"
                        disabled={qty >= Math.min(10, active.ticketsRemaining)}
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="mb-4 flex items-center justify-between">
                    <span className="text-sm text-muted">{t("total")}</span>
                    <span className="text-lg font-black text-brand">
                      {active.ticketPrice === 0
                        ? t("free")
                        : NZD.format((active.ticketPrice * qty) / 100)}
                    </span>
                  </div>

                  {error && (
                    <p className="mb-3 rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-500">
                      {error}
                    </p>
                  )}

                  <button
                    onClick={buy}
                    disabled={busy || active.ticketsRemaining <= 0}
                    className="w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
                  >
                    {busy
                      ? t("processing")
                      : active.ticketPrice === 0
                        ? t("reserveTicket")
                        : t("buyTicket")}
                  </button>
                  {active.ticketPrice > 0 && (
                    <p className="mt-2 text-center text-[0.65rem] text-muted">{t("cardAtCheckout")}</p>
                  )}
                </>
              )}
            </PaymentModalBody>
          </PaymentModalShell>
        )}
      </AnimatePresence>
    </section>
  );
}
