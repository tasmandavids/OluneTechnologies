"use client";

import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";

export type FormField = {
  key: string;
  label: string;
  type: "text" | "textarea" | "checkbox" | "select" | "date" | "phone" | "email";
  required?: boolean;
  options?: string[];
  placeholder?: string;
};

export type StudentForm = {
  id: string;
  title: string;
  description: string | null;
  formType: string;
  fields: FormField[];
  isRequired: boolean;
  dueDate: string | null;
};

export type FormResponse = {
  formId: string;
  studentId: string;
  studentName: string | null;
  signedAt: string | null;
  data: Record<string, unknown>;
};

export type FormChild = {
  studentId: string;
  name: string | null;
};

const TYPE_ICONS: Record<string, string> = {
  medical: "🏥",
  emergency_contact: "🚨",
  photo_consent: "📸",
  video_consent: "🎬",
  waiver: "✍️",
  pickup_permission: "🚗",
  general: "📋",
};

const TYPE_LABELS: Record<string, string> = {
  medical: "Medical information",
  emergency_contact: "Emergency contact",
  photo_consent: "Photo consent",
  video_consent: "Video consent",
  waiver: "Waiver",
  pickup_permission: "Pickup permission",
  general: "General form",
};

export function FormsVault({
  forms,
  dancers,
  responses,
  onSubmit,
}: {
  forms: StudentForm[];
  dancers: FormChild[];
  responses: FormResponse[];
  onSubmit: (formId: string, studentId: string, data: Record<string, unknown>) => Promise<void>;
}) {
  const [activeForm, setActiveForm] = useState<{ form: StudentForm; studentId: string } | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [isPending, startTransition] = useTransition();

  function isCompleted(formId: string, studentId: string) {
    return responses.some((r) => r.formId === formId && r.studentId === studentId && r.signedAt);
  }

  function openForm(form: StudentForm, studentId: string) {
    const existing = responses.find((r) => r.formId === form.id && r.studentId === studentId);
    setFormData(existing?.data ?? {});
    setActiveForm({ form, studentId });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeForm) return;
    startTransition(async () => {
      await onSubmit(activeForm.form.id, activeForm.studentId, formData);
      setActiveForm(null);
    });
  }

  const pendingCount = forms.reduce((total, form) => {
    return total + dancers.filter((c) => !isCompleted(form.id, c.studentId) && form.isRequired).length;
  }, 0);

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-ink">Forms & Permissions</h1>
        <p className="text-sm text-muted">
          Medical info, consents, waivers, and permissions for your dancers.
        </p>
      </div>

      {pendingCount > 0 && (
        <div className="rounded-2xl border border-[color-mix(in_srgb,var(--brand-hot)_40%,transparent)] bg-[color-mix(in_srgb,var(--brand-hot)_5%,transparent)] p-4">
          <p className="text-sm font-bold text-[--brand-hot]">
            {pendingCount} form{pendingCount > 1 ? "s" : ""} need{pendingCount === 1 ? "s" : ""} your attention
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Required forms must be completed before your dancers can participate fully.
          </p>
        </div>
      )}

      {forms.length === 0 ? (
        <div className="box rounded-2xl px-6 py-12 text-center text-sm text-muted">
          No forms from your studio yet. They&apos;ll appear here when needed.
        </div>
      ) : (
        <div className="space-y-3">
          {forms.map((form) => (
            <div key={form.id} className="box rounded-2xl p-5">
              <div className="mb-3 flex items-start gap-3">
                <span className="text-xl">{TYPE_ICONS[form.formType] ?? "📋"}</span>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-ink">{form.title}</p>
                    {form.isRequired && (
                      <span className="rounded-full bg-[color-mix(in_srgb,var(--brand-hot)_15%,transparent)] px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-[--brand-hot]">
                        Required
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted">{TYPE_LABELS[form.formType]}</p>
                  {form.description && (
                    <p className="mt-1 text-xs text-muted">{form.description}</p>
                  )}
                  {form.dueDate && (
                    <p className="mt-0.5 text-xs font-semibold text-[--brand-hot]">
                      Due by {new Date(form.dueDate).toLocaleDateString("en-NZ", { day: "numeric", month: "long" })}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                {dancers.map((child) => {
                  const done = isCompleted(form.id, child.studentId);
                  const resp = responses.find((r) => r.formId === form.id && r.studentId === child.studentId);
                  return (
                    <div key={child.studentId} className="box flex items-center justify-between gap-3 rounded-xl px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span
                          className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-black text-white"
                          style={{ background: "var(--brand)" }}
                        >
                          {child.name?.[0]?.toUpperCase() ?? "?"}
                        </span>
                        <p className="text-sm font-medium text-ink">{child.name ?? "Unnamed dancer"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {done ? (
                          <span className="text-xs font-semibold text-[#22c55e]">
                            ✓ Completed {resp?.signedAt ? new Date(resp.signedAt).toLocaleDateString("en-NZ", { day: "numeric", month: "short" }) : ""}
                          </span>
                        ) : (
                          <span className="text-xs text-muted">Not yet completed</span>
                        )}
                        <button
                          type="button"
                          onClick={() => openForm(form, child.studentId)}
                          className="rounded-lg border border-[--brand] px-3 py-1 text-xs font-bold text-[--brand] transition hover:bg-[color-mix(in_srgb,var(--brand)_10%,transparent)]"
                        >
                          {done ? "Update" : "Complete →"}
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

      {/* Form modal */}
      <AnimatePresence>
        {activeForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={(e) => e.target === e.currentTarget && setActiveForm(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-lg rounded-2xl bg-canvas p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black text-ink">{activeForm.form.title}</h2>
                  <p className="text-xs text-muted">
                    For {dancers.find((c) => c.studentId === activeForm.studentId)?.name ?? "dancer"}
                  </p>
                </div>
                <button type="button" onClick={() => setActiveForm(null)} className="text-muted hover:text-ink">✕</button>
              </div>

              {activeForm.form.description && (
                <p className="mb-4 text-sm text-muted">{activeForm.form.description}</p>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {activeForm.form.fields.map((field) => (
                  <div key={field.key}>
                    <label className="block text-xs font-semibold text-muted mb-1">
                      {field.label}
                      {field.required && <span className="ml-1 text-[--brand-hot]">*</span>}
                    </label>
                    {field.type === "textarea" ? (
                      <textarea
                        value={(formData[field.key] as string) ?? ""}
                        onChange={(e) => setFormData((d) => ({ ...d, [field.key]: e.target.value }))}
                        required={field.required}
                        placeholder={field.placeholder}
                        rows={3}
                        className="w-full rounded-xl border border-[--hair] bg-surface px-3 py-2 text-sm text-ink resize-none"
                      />
                    ) : field.type === "checkbox" ? (
                      <label className="flex cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          checked={!!(formData[field.key])}
                          onChange={(e) => setFormData((d) => ({ ...d, [field.key]: e.target.checked }))}
                          className="h-4 w-4 rounded border-[--hair] accent-[--brand]"
                        />
                        <span className="text-sm text-ink">{field.placeholder ?? "Yes"}</span>
                      </label>
                    ) : field.type === "select" ? (
                      <select
                        value={(formData[field.key] as string) ?? ""}
                        onChange={(e) => setFormData((d) => ({ ...d, [field.key]: e.target.value }))}
                        required={field.required}
                        className="w-full rounded-xl border border-[--hair] bg-surface px-3 py-2 text-sm text-ink"
                      >
                        <option value="">Select…</option>
                        {(field.options ?? []).map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={field.type}
                        value={(formData[field.key] as string) ?? ""}
                        onChange={(e) => setFormData((d) => ({ ...d, [field.key]: e.target.value }))}
                        required={field.required}
                        placeholder={field.placeholder}
                        className="w-full rounded-xl border border-[--hair] bg-surface px-3 py-2 text-sm text-ink"
                      />
                    )}
                  </div>
                ))}

                {activeForm.form.fields.length === 0 && (
                  <p className="text-sm text-muted">This form has no fields configured yet.</p>
                )}

                <div className="flex gap-3 pt-2 border-t border-[--hair]">
                  <button
                    type="button"
                    onClick={() => setActiveForm(null)}
                    className="flex-1 rounded-xl border border-[--hair] py-2.5 text-sm font-semibold text-ink"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isPending}
                    className="flex-1 rounded-xl bg-brand py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"
                  >
                    {isPending ? "Saving…" : "Submit & sign"}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
