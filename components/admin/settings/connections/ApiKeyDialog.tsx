"use client";

// ============================================================================
//  ApiKeyDialog — the generic "paste your credentials" form.
//
//  The fields come from the catalog entry, so a new API-key provider needs no
//  new UI: declare its fields and this renders them. Secrets are write-only —
//  once saved, the form shows the stored tail (•••• a21f) and an empty box,
//  and leaving it empty keeps the existing value.
// ============================================================================

import { useEffect, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { IntegrationField, IntegrationProvider } from "@/lib/integrations/types";
import { saveApiKeyConnection } from "@/app/portal/admin/settings/connections/actions";
import { ProviderMark } from "./ProviderMark";

const fieldClass =
  "w-full rounded-xl border px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-muted focus:border-[--brand]";
const fieldStyle = { background: "var(--surface)", borderColor: "var(--hair)" } as const;

export function ApiKeyDialog({
  provider,
  /** Non-secret values already stored, plus `<key>Tail` entries for secrets. */
  metadata,
  connected,
  onClose,
  onSaved,
}: {
  provider: IntegrationProvider | null;
  metadata: Record<string, string>;
  connected: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!provider || provider.auth.kind !== "api_key") return;
    const seed: Record<string, string> = {};
    for (const field of provider.auth.fields) {
      seed[field.key] = field.type === "secret" ? "" : (metadata[field.key] ?? "");
    }
    setValues(seed);
    setError(null);
  }, [provider, metadata]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!provider || provider.auth.kind !== "api_key") return null;
  const fields = provider.auth.fields;

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await saveApiKeyConnection({ provider: provider.id, values });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onSaved();
    });
  };

  const secretHint = (field: IntegrationField) => {
    const tail = metadata[`${field.key}Tail`];
    if (field.type !== "secret" || !tail) return field.hint;
    return `Currently •••• ${tail} — leave blank to keep it.`;
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
          aria-label={`Connect ${provider.name}`}
          className="w-full max-w-md rounded-[22px] border p-6"
          style={{
            background: "var(--surface)",
            borderColor: "var(--hair)",
            boxShadow: "var(--shadow)",
          }}
        >
          <div className="mb-4 flex items-center gap-3">
            <ProviderMark name={provider.name} color={provider.color} />
            <div>
              <h2 className="text-base font-bold text-ink">
                {connected ? `Update ${provider.name}` : `Connect ${provider.name}`}
              </h2>
              <p className="text-xs text-muted">{provider.tagline}</p>
            </div>
          </div>

          <div className="space-y-3.5">
            {fields.map((field) => {
              const hint = secretHint(field);
              return (
                <label key={field.key} className="block text-sm">
                  <span className="mb-1.5 flex items-center gap-2 font-medium text-ink">
                    {field.label}
                    {field.optional && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                        optional
                      </span>
                    )}
                  </span>
                  <input
                    type={field.type === "secret" ? "password" : "text"}
                    autoComplete="off"
                    spellCheck={false}
                    value={values[field.key] ?? ""}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                    placeholder={field.placeholder}
                    className={fieldClass}
                    style={fieldStyle}
                  />
                  {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
                </label>
              );
            })}
          </div>

          <p className="mt-4 text-xs leading-relaxed text-muted">
            Keys are encrypted before they&apos;re stored and are only ever decrypted on the
            server. They are never sent back to this page.
          </p>

          {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

          <div className="mt-5 flex items-center gap-3">
            <button
              type="button"
              onClick={submit}
              disabled={pending}
              className="rounded-full px-5 py-2 text-sm font-semibold text-white transition disabled:opacity-50"
              style={{
                background: "linear-gradient(150deg, var(--tg), var(--brand) 60%, var(--brand-deep))",
              }}
            >
              {pending ? "Saving…" : connected ? "Save changes" : "Connect"}
            </button>
            <button type="button" onClick={onClose} className="text-sm text-muted hover:text-ink">
              Cancel
            </button>
            {provider.docsUrl && (
              <a
                href={provider.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-xs font-semibold text-brand hover:underline"
              >
                Where do I find this?
              </a>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
