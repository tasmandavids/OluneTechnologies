"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { connectTelegramBot, verifyTelegramBot } from "@/app/portal/admin/advertising/actions";

type Step = 1 | 2 | 3;

export function TelegramWizard({
  open,
  onClose,
  onConnected,
}: {
  open: boolean;
  onClose: () => void;
  onConnected: () => void;
}) {
  const t = useTranslations("admin.advertising.telegram");
  const tShared = useTranslations("admin.shared");
  const [step, setStep] = useState<Step>(1);
  const [botToken, setBotToken] = useState("");
  const [channelInput, setChannelInput] = useState("");
  const [sendTest, setSendTest] = useState(true);
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verifying, startVerify] = useTransition();
  const [connecting, startConnect] = useTransition();

  function reset() {
    setStep(1);
    setBotToken("");
    setChannelInput("");
    setBotUsername(null);
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleVerifyToken() {
    setError(null);
    startVerify(async () => {
      const res = await verifyTelegramBot(botToken);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setBotUsername(res.username);
      setStep(2);
    });
  }

  function handleConnect() {
    setError(null);
    startConnect(async () => {
      const res = await connectTelegramBot({ botToken, channelInput, sendTest });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setStep(3);
      onConnected();
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={handleClose} aria-label="Close" />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative z-10 w-full max-w-lg overflow-hidden rounded-3xl border border-(--hair) bg-surface shadow-2xl"
      >
        <div className="bg-gradient-to-br from-[#26A5E4] to-[#229ED9] px-6 py-5 text-white">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[0.62rem] font-semibold uppercase tracking-widest text-white/70">{t("badge")}</p>
              <h2 className="text-xl font-black">{t("title")}</h2>
            </div>
            <button type="button" onClick={handleClose} className="rounded-lg px-2 py-1 text-white/80 hover:bg-white/10">✕</button>
          </div>
          <div className="mt-4 flex gap-2">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full transition ${step >= s ? "bg-white" : "bg-white/30"}`}
              />
            ))}
          </div>
        </div>

        <div className="p-6">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div key="s1" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="space-y-4">
                <p className="text-sm text-muted">{t("step1Intro")}</p>
                <ol className="space-y-3 text-sm text-ink">
                  <li className="flex gap-3">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#26A5E4]/10 text-xs font-bold text-[#26A5E4]">1</span>
                    <span>{t("step1a")}</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#26A5E4]/10 text-xs font-bold text-[#26A5E4]">2</span>
                    <span>{t("step1b")}</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#26A5E4]/10 text-xs font-bold text-[#26A5E4]">3</span>
                    <span>{t("step1c")}</span>
                  </li>
                </ol>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink">{t("tokenLabel")}</label>
                  <input
                    type="password"
                    value={botToken}
                    onChange={(e) => setBotToken(e.target.value)}
                    placeholder={t("tokenPlaceholder")}
                    className="w-full rounded-xl border border-(--hair) bg-base px-4 py-3 font-mono text-sm text-ink placeholder:text-muted focus:border-[#26A5E4] focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleVerifyToken}
                  disabled={verifying || botToken.length < 20}
                  className="w-full rounded-xl bg-[#26A5E4] px-5 py-3 text-sm font-bold text-white hover:brightness-105 disabled:opacity-50"
                >
                  {verifying ? tShared("verifying") : t("verifyToken")}
                </button>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div key="s2" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="space-y-4">
                {botUsername && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    {t("botVerified", { username: botUsername })}
                  </div>
                )}
                <p className="text-sm text-muted">{t("step2Intro")}</p>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink">{t("channelLabel")}</label>
                  <input
                    type="text"
                    value={channelInput}
                    onChange={(e) => setChannelInput(e.target.value)}
                    placeholder={t("channelPlaceholder")}
                    className="w-full rounded-xl border border-(--hair) bg-base px-4 py-3 text-sm text-ink placeholder:text-muted focus:border-[#26A5E4] focus:outline-none"
                  />
                  <p className="mt-1.5 text-[0.65rem] text-muted">{t("channelHint")}</p>
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
                  <input type="checkbox" checked={sendTest} onChange={(e) => setSendTest(e.target.checked)} className="rounded border-(--hair)" />
                  {t("sendTest")}
                </label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setStep(1)} className="rounded-xl border border-(--hair) px-4 py-2.5 text-sm font-semibold text-muted hover:text-ink">
                    {t("back")}
                  </button>
                  <button
                    type="button"
                    onClick={handleConnect}
                    disabled={connecting || !channelInput.trim()}
                    className="flex-1 rounded-xl bg-[#26A5E4] px-5 py-2.5 text-sm font-bold text-white hover:brightness-105 disabled:opacity-50"
                  >
                    {connecting ? tShared("connecting") : t("connectChannel")}
                  </button>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div key="s3" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="space-y-4 text-center">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-3xl">✓</div>
                <h3 className="text-lg font-black text-ink">{t("successTitle")}</h3>
                <p className="text-sm text-muted">{t("successBody")}</p>
                <button type="button" onClick={handleClose} className="rounded-xl bg-brand px-6 py-2.5 text-sm font-bold text-white hover:brightness-105">
                  {t("done")}
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        </div>
      </motion.div>
    </div>
  );
}
