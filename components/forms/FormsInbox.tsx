"use client";

// ============================================================================
//  FormsInbox — the signing surface, shared by every role.
//
//  Replaces the parent-only FormsVault. A form arrives with the subjects the
//  signed-in person is responsible for: their children for a student-scope
//  form, themselves for a staff policy. A form aimed at one class only lists
//  the child who is in it.
//
//  The reading pane is the point for policies — the body is shown in full
//  above the questions, and the signature block sits at the bottom where a
//  paper form would put it.
// ============================================================================

import { useMemo, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useEscToClose } from "@/lib/useEscToClose";
import { fadeLift, overlayFade } from "@/lib/motion";
import { SignaturePad, SignatureStamp } from "./SignaturePad";
import type { AssignedForm, FormResponseRecord, FormSignature, FormSubject } from "@/lib/forms/types";

const TYPE_LABELS: Record<string, string> = {
  policy: "Studio policy",
  handbook: "Handbook",
  code_of_conduct: "Code of conduct",
  waiver: "Waiver",
  medical: "Medical information",
  emergency_contact: "Emergency contact",
  photo_consent: "Photo consent",
  video_consent: "Video consent",
  pickup_permission: "Pickup permission",
  general: "Form",
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" });
}

export type SubmitFormResponse = (input: {
  formId: string;
  subjectId: string;
  data: Record<string, unknown>;
  signature: FormSignature | null;
}) => Promise<{ ok: true } | { ok: false; error: string }>;

export function FormsInbox({
  forms,
  responses,
  signerName,
  onSubmit,
  title = "Forms & policies",
  subtitle = "Everything your studio needs you to read, complete and sign.",
}: {
  forms: AssignedForm[];
  responses: FormResponseRecord[];
  signerName: string | null;
  onSubmit: SubmitFormResponse;
  title?: string;
  subtitle?: string;
}) {
  const [active, setActive] = useState<{ entry: AssignedForm; subject: FormSubject } | null>(null);

  const responseFor = useMemo(() => {
    const map = new Map<string, FormResponseRecord>();
    for (const r of responses) map.set(`${r.formId}:${r.subjectId}`, r);
    return map;
  }, [responses]);

  const outstanding = forms.reduce((total, entry) => {
    if (!entry.form.isRequired) return total;
    return (
      total +
      entry.subjects.filter((s) => !responseFor.get(`${entry.form.id}:${s.profileId}`)?.signedAt).length
    );
  }, 0);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-ink">{title}</h1>
        <p className="text-sm text-muted">{subtitle}</p>
      </div>

      {outstanding > 0 && (
        <div
          className="rounded-2xl border p-4"
          style={{
            borderColor: "color-mix(in srgb, var(--brand-hot) 40%, transparent)",
            background: "color-mix(in srgb, var(--brand-hot) 5%, transparent)",
          }}
        >
          <p className="text-sm font-bold" style={{ color: "var(--brand-hot)" }}>
            {outstanding} {outstanding === 1 ? "form needs" : "forms need"} your attention
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Required forms have to be completed before taking part.
          </p>
        </div>
      )}

      {forms.length === 0 ? (
        <div className="box rounded-2xl px-6 py-12 text-center text-sm text-muted">
          Nothing to sign right now. Anything your studio sends will land here.
        </div>
      ) : (
        <div className="space-y-3">
          {forms.map((entry) => (
            <div key={entry.form.id} className="box rounded-2xl p-5">
              <div className="mb-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold text-ink">{entry.form.title}</p>
                  {entry.form.isRequired && (
                    <span
                      className="rounded-full px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider"
                      style={{
                        background: "color-mix(in srgb, var(--brand-hot) 15%, transparent)",
                        color: "var(--brand-hot)",
                      }}
                    >
                      Required
                    </span>
                  )}
                  {entry.form.signatureRequired && (
                    <span className="rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider text-muted" style={{ borderColor: "var(--hair)" }}>
                      Signature
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted">{TYPE_LABELS[entry.form.formType] ?? "Form"}</p>
                {entry.form.description && (
                  <p className="mt-1 text-xs text-muted">{entry.form.description}</p>
                )}
                {entry.form.dueDate && (
                  <p className="mt-0.5 text-xs font-semibold" style={{ color: "var(--brand-hot)" }}>
                    Due by {formatDate(entry.form.dueDate)}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                {entry.subjects.map((subject) => {
                  const response = responseFor.get(`${entry.form.id}:${subject.profileId}`);
                  const done = Boolean(response?.signedAt);
                  return (
                    <div
                      key={subject.profileId}
                      className="box flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-2.5"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-black text-white"
                          style={{ background: "var(--brand)" }}
                        >
                          {(subject.isSelf ? signerName : subject.name)?.[0]?.toUpperCase() ?? "?"}
                        </span>
                        <p className="text-sm font-medium text-ink">
                          {subject.isSelf ? "You" : (subject.name ?? "Unnamed")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {done ? (
                          <span className="text-xs font-semibold" style={{ color: "#22c55e" }}>
                            ✓ Signed {response?.signedAt ? formatDate(response.signedAt) : ""}
                          </span>
                        ) : (
                          <span className="text-xs text-muted">Not yet completed</span>
                        )}
                        <button
                          type="button"
                          onClick={() => setActive({ entry, subject })}
                          className="rounded-lg border px-3 py-1 text-xs font-bold transition"
                          style={{ borderColor: "var(--brand)", color: "var(--brand)" }}
                        >
                          {done ? "View" : "Read & sign →"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {active && (
          <FormReader
            entry={active.entry}
            subject={active.subject}
            existing={responseFor.get(`${active.entry.form.id}:${active.subject.profileId}`) ?? null}
            signerName={signerName}
            onClose={() => setActive(null)}
            onSubmit={onSubmit}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function FormReader({
  entry,
  subject,
  existing,
  signerName,
  onClose,
  onSubmit,
}: {
  entry: AssignedForm;
  subject: FormSubject;
  existing: FormResponseRecord | null;
  signerName: string | null;
  onClose: () => void;
  onSubmit: SubmitFormResponse;
}) {
  const { form } = entry;
  const [data, setData] = useState<Record<string, unknown>>(existing?.data ?? {});
  const [signature, setSignature] = useState<FormSignature | null>(
    existing?.signature
      ? {
          value: existing.signature,
          type: existing.signatureType ?? "typed",
          name: existing.signatureName ?? signerName ?? "",
        }
      : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  useEscToClose(onClose, !saving);

  const signedAlready = Boolean(existing?.signedAt);

  function set(key: string, value: unknown) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.signatureRequired && !signature) {
      setError("Add your signature at the bottom before submitting.");
      return;
    }
    startSaving(async () => {
      const result = await onSubmit({
        formId: form.id,
        subjectId: subject.profileId,
        data,
        signature,
      });
      if (result.ok) onClose();
      else setError(result.error);
    });
  }

  return (
    <motion.div
      {...overlayFade}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 p-4 py-8"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        {...fadeLift}
        className="w-full max-w-2xl rounded-2xl p-6 shadow-2xl"
        style={{ background: "var(--canvas, var(--surface))" }}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-ink">{form.title}</h2>
            <p className="text-xs text-muted">
              {TYPE_LABELS[form.formType] ?? "Form"} ·{" "}
              {subject.isSelf ? "For you" : `For ${subject.name ?? "your dancer"}`}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-muted transition hover:text-ink" aria-label="Close">
            ✕
          </button>
        </div>

        {form.description && <p className="mb-4 text-sm text-muted">{form.description}</p>}

        {form.body && (
          <div
            className="mb-5 max-h-[42vh] overflow-y-auto rounded-xl border p-4 text-sm leading-relaxed text-ink"
            style={{ borderColor: "var(--hair)", background: "var(--base)", whiteSpace: "pre-wrap" }}
          >
            {form.body}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {form.fields.map((field) => (
            <div key={field.key}>
              <label className="mb-1 block text-xs font-semibold text-muted">
                {field.label}
                {field.required && <span className="ml-1" style={{ color: "var(--brand-hot)" }}>*</span>}
              </label>
              {field.type === "textarea" ? (
                <textarea
                  value={(data[field.key] as string) ?? ""}
                  onChange={(e) => set(field.key, e.target.value)}
                  required={field.required}
                  placeholder={field.placeholder}
                  rows={3}
                  disabled={saving}
                  className="w-full resize-none rounded-xl border px-3 py-2 text-sm text-ink"
                  style={{ borderColor: "var(--hair)", background: "var(--surface)" }}
                />
              ) : field.type === "checkbox" ? (
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={data[field.key] === true}
                    onChange={(e) => set(field.key, e.target.checked)}
                    required={field.required}
                    disabled={saving}
                    className="h-4 w-4 rounded accent-[--brand]"
                  />
                  <span className="text-sm text-ink">{field.placeholder ?? "Yes"}</span>
                </label>
              ) : field.type === "select" ? (
                <select
                  value={(data[field.key] as string) ?? ""}
                  onChange={(e) => set(field.key, e.target.value)}
                  required={field.required}
                  disabled={saving}
                  className="w-full rounded-xl border px-3 py-2 text-sm text-ink"
                  style={{ borderColor: "var(--hair)", background: "var(--surface)" }}
                >
                  <option value="">Select…</option>
                  {(field.options ?? []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.type}
                  value={(data[field.key] as string) ?? ""}
                  onChange={(e) => set(field.key, e.target.value)}
                  required={field.required}
                  placeholder={field.placeholder}
                  disabled={saving}
                  className="w-full rounded-xl border px-3 py-2 text-sm text-ink"
                  style={{ borderColor: "var(--hair)", background: "var(--surface)" }}
                />
              )}
            </div>
          ))}

          {form.signatureRequired && (
            <SignaturePad
              signerName={signerName}
              statement={
                form.signatureStatement ??
                `I have read and agree to ${form.title}${subject.isSelf ? "" : ` on behalf of ${subject.name ?? "my dancer"}`}.`
              }
              value={signature}
              onChange={setSignature}
              disabled={saving}
            />
          )}

          {signedAlready && existing?.signature && (
            <p className="text-xs text-muted">
              Previously signed{existing.signedAt ? ` on ${formatDate(existing.signedAt)}` : ""} by{" "}
              {existing.signatureName ?? "—"}{" "}
              <SignatureStamp
                signature={existing.signature}
                type={existing.signatureType}
                name={existing.signatureName}
                className="ml-1 align-middle"
              />
            </p>
          )}

          {error && (
            <p className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: "#fca5a5", color: "#dc2626" }}>
              {error}
            </p>
          )}

          <div className="flex gap-3 border-t pt-3" style={{ borderColor: "var(--hair)" }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 rounded-xl border py-2.5 text-sm font-semibold text-ink disabled:opacity-50"
              style={{ borderColor: "var(--hair)" }}
            >
              Close
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"
              style={{ background: "var(--brand)" }}
            >
              {saving ? "Saving…" : signedAlready ? "Re-sign & save" : "Submit & sign"}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
