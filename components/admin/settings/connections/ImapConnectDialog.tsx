"use client";

// ============================================================================
//  ImapConnectDialog — app-password mailbox connect (iCloud, Mail.ru).
//
//  Lifted out of EmailInbox's ConnectPanel so the inbox no longer owns any
//  connection UI; it now lives with every other connection in Settings.
// ============================================================================

import { useEffect, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { PROVIDER_META } from "@/lib/email/types";
import { connectImapAccount } from "@/app/portal/admin/email/actions";
import { ProviderMark } from "./ProviderMark";

const fieldClass =
  "w-full rounded-xl border px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-muted focus:border-[--brand]";
const fieldStyle = { background: "var(--surface)", borderColor: "var(--hair)" } as const;

export type ImapProviderId = "icloud" | "mailru";

export function ImapConnectDialog({
  provider,
  color,
  onClose,
  onConnected,
}: {
  provider: ImapProviderId | null;
  color: string;
  onClose: () => void;
  onConnected: () => void;
}) {
  const t = useTranslations("admin.email");
  const tShared = useTranslations("admin.shared");
  const tCommon = useTranslations("common");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (provider) {
      setEmail("");
      setPassword("");
      setError(null);
    }
  }, [provider]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!provider) return null;
  const meta = PROVIDER_META[provider];

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await connectImapAccount({ provider, email, password });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPassword("");
      onConnected();
    });
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 14, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 14, scale: 0.98 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={t("connectTitle", { provider: meta.label })}
          className="w-full max-w-md rounded-[22px] border p-6"
          style={{
            background: "var(--surface)",
            borderColor: "var(--hair)",
            boxShadow: "var(--shadow)",
          }}
        >
          <div className="mb-4 flex items-center gap-3">
            <ProviderMark name={meta.label} color={color} />
            <div>
              <h2 className="text-base font-bold text-ink">
                {t("connectTitle", { provider: meta.label })}
              </h2>
              <p className="text-xs text-muted">{meta.description}</p>
            </div>
          </div>

          <div className="space-y-3">
            <input
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("emailAddress")}
              className={fieldClass}
              style={fieldStyle}
            />
            <input
              type="password"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={provider === "icloud" ? t("appPassword") : t("password")}
              className={fieldClass}
              style={fieldStyle}
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={submit}
                disabled={pending || !email || !password}
                className="rounded-full px-5 py-2 text-sm font-semibold text-white transition disabled:opacity-50"
                style={{
                  background:
                    "linear-gradient(150deg, var(--tg), var(--brand) 60%, var(--brand-deep))",
                }}
              >
                {pending ? tShared("connecting") : t("connect")}
              </button>
              <button type="button" onClick={onClose} className="text-sm text-muted hover:text-ink">
                {tCommon("cancel")}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
