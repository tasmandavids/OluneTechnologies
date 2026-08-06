"use client";

// ============================================================================
//  FormBuilderModal — write the form, choose who gets it, decide whether it
//  needs signing.
//
//  Two columns: the document on the left (title, policy text, questions), the
//  delivery on the right (audience, who signs, due date). The signature block
//  is deliberately last in the left column, because that's where it lands on
//  the form itself.
// ============================================================================

import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import { useEscToClose } from "@/lib/useEscToClose";
import { fadeLift, overlayFade } from "@/lib/motion";
import { saveForm } from "@/app/portal/admin/forms/actions";
import {
  FORM_FIELD_TYPES,
  FORM_TYPES,
  fieldKeyFromLabel,
  type FormField,
  type FormFieldType,
  type FormAudienceTarget,
  type FormSubjectScope,
  type FormType,
} from "@/lib/forms/types";
import type { AdminFormSummary } from "@/lib/forms/data";
import { AudiencePicker, type ClassOption, type PersonOption } from "./AudiencePicker";

const TYPE_LABELS: Record<FormType, string> = {
  policy: "Studio policy",
  handbook: "Handbook",
  code_of_conduct: "Code of conduct",
  waiver: "Waiver",
  medical: "Medical information",
  emergency_contact: "Emergency contact",
  photo_consent: "Photo consent",
  video_consent: "Video consent",
  pickup_permission: "Pickup permission",
  general: "General form",
};

const FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  text: "Short text",
  textarea: "Long text",
  checkbox: "Tick box",
  select: "Choose one",
  date: "Date",
  phone: "Phone",
  email: "Email",
};

const inputStyle = { borderColor: "var(--hair)", background: "var(--base)" } as const;

export function FormBuilderModal({
  form,
  classes,
  people,
  onClose,
}: {
  /** null = create a new form. */
  form: AdminFormSummary | null;
  classes: ClassOption[];
  people: PersonOption[];
  onClose: () => void;
}) {
  const [title, setTitle] = useState(form?.title ?? "");
  const [formType, setFormType] = useState<FormType>(form?.formType ?? "policy");
  const [description, setDescription] = useState(form?.description ?? "");
  const [body, setBody] = useState(form?.body ?? "");
  const [fields, setFields] = useState<FormField[]>(form?.fields ?? []);
  const [signatureRequired, setSignatureRequired] = useState(form?.signatureRequired ?? true);
  const [signatureStatement, setSignatureStatement] = useState(form?.signatureStatement ?? "");
  const [subjectScope, setSubjectScope] = useState<FormSubjectScope>(form?.subjectScope ?? "student");
  const [isRequired, setIsRequired] = useState(form?.isRequired ?? true);
  const [dueDate, setDueDate] = useState(form?.dueDate ?? "");
  const [audience, setAudience] = useState<FormAudienceTarget[]>(form?.audience ?? []);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  useEscToClose(onClose, !saving);

  function addField() {
    const taken = new Set(fields.map((f) => f.key));
    setFields([
      ...fields,
      { key: fieldKeyFromLabel(`question ${fields.length + 1}`, taken), label: "", type: "text", required: false },
    ]);
  }

  function updateField(index: number, patch: Partial<FormField>) {
    setFields((prev) => prev.map((field, i) => (i === index ? { ...field, ...patch } : field)));
  }

  function moveField(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    [next[index], next[target]] = [next[target], next[index]];
    setFields(next);
  }

  function submit(publish: boolean) {
    setError(null);
    if (!title.trim()) {
      setError("Give the form a title.");
      return;
    }
    const blank = fields.findIndex((f) => !f.label.trim());
    if (blank >= 0) {
      setError(`Question ${blank + 1} needs a label.`);
      return;
    }
    if (publish && audience.length === 0) {
      setError("Choose who this form is for before publishing it.");
      return;
    }

    // Keys are derived from labels at save time so a renamed question keeps a
    // readable key, while existing keys (with responses behind them) are left
    // alone.
    const taken = new Set<string>();
    const payloadFields = fields.map((field) => {
      const key = field.key || fieldKeyFromLabel(field.label, taken);
      taken.add(key);
      return {
        key,
        label: field.label.trim(),
        type: field.type,
        required: field.required ?? false,
        options: field.type === "select" ? (field.options ?? []).filter(Boolean) : undefined,
        placeholder: field.placeholder?.trim() || undefined,
      };
    });

    startSaving(async () => {
      const result = await saveForm({
        id: form?.id,
        title: title.trim(),
        description: description.trim() || undefined,
        body: body.trim() || undefined,
        formType,
        fields: payloadFields,
        isRequired,
        dueDate: dueDate || undefined,
        signatureRequired,
        signatureStatement: signatureStatement.trim() || undefined,
        subjectScope,
        audience,
        publish: publish || Boolean(form?.publishedAt),
      });
      if (result.ok) onClose();
      else setError(result.error);
    });
  }

  return (
    <motion.div
      {...overlayFade}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 p-4 py-8"
      onClick={(e) => e.target === e.currentTarget && !saving && onClose()}
    >
      <motion.div
        {...fadeLift}
        className="w-full max-w-5xl rounded-[22px] border p-6"
        style={{
          background: "linear-gradient(148deg, var(--refract), transparent 42%), var(--glass)",
          borderColor: "var(--edge)",
          backdropFilter: "blur(var(--blur-lg)) saturate(1.9)",
          WebkitBackdropFilter: "blur(var(--blur-lg)) saturate(1.9)",
          boxShadow: "var(--shadow)",
        }}
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-ink">
              {form ? "Edit form" : "New form"}
            </h2>
            <p className="text-xs text-muted">
              Write it, choose who it goes to, and decide whether it has to be signed.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-muted transition hover:text-ink disabled:opacity-40"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="grid gap-6 md:grid-cols-[1.35fr_1fr]">
          {/* ─── The document ─────────────────────────────────────────────── */}
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[1.6fr_1fr]">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-muted">Title</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Studio code of conduct 2026"
                  className="w-full rounded-xl border px-3 py-2 text-sm text-ink"
                  style={inputStyle}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-muted">Type</span>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as FormType)}
                  className="w-full rounded-xl border px-3 py-2 text-sm text-ink"
                  style={inputStyle}
                >
                  {FORM_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-muted">
                Short summary <span className="font-normal">(optional)</span>
              </span>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="One line shown under the title"
                className="w-full rounded-xl border px-3 py-2 text-sm text-ink"
                style={inputStyle}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-muted">
                Policy text — what people read before signing
              </span>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={10}
                placeholder={"Paste or write the policy here.\n\nBlank lines and line breaks are kept exactly as typed."}
                className="w-full resize-y rounded-xl border px-3 py-2 text-sm leading-relaxed text-ink"
                style={inputStyle}
              />
            </label>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-muted">
                  Questions <span className="font-normal">(optional)</span>
                </span>
                <button
                  type="button"
                  onClick={addField}
                  className="rounded-lg border px-2.5 py-1 text-xs font-semibold text-muted transition hover:text-ink"
                  style={{ borderColor: "var(--hair)" }}
                >
                  + Add question
                </button>
              </div>

              {fields.length === 0 ? (
                <p className="rounded-xl border border-dashed px-3 py-4 text-center text-xs text-muted" style={{ borderColor: "var(--hair)" }}>
                  No questions — this form is read-and-sign only.
                </p>
              ) : (
                <div className="space-y-2">
                  {fields.map((field, index) => (
                    <div
                      key={index}
                      className="rounded-xl border p-3"
                      style={{ borderColor: "var(--hair)", background: "var(--surface)" }}
                    >
                      <div className="flex gap-2">
                        <input
                          value={field.label}
                          onChange={(e) => updateField(index, { label: e.target.value })}
                          placeholder="Question label"
                          className="min-w-0 flex-1 rounded-lg border px-2.5 py-1.5 text-sm text-ink"
                          style={inputStyle}
                        />
                        <select
                          value={field.type}
                          onChange={(e) => updateField(index, { type: e.target.value as FormFieldType })}
                          className="rounded-lg border px-2 py-1.5 text-xs text-ink"
                          style={inputStyle}
                        >
                          {FORM_FIELD_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {FIELD_TYPE_LABELS[type]}
                            </option>
                          ))}
                        </select>
                      </div>

                      {field.type === "select" && (
                        <input
                          value={(field.options ?? []).join(", ")}
                          onChange={(e) =>
                            updateField(index, {
                              options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean),
                            })
                          }
                          placeholder="Options, comma separated"
                          className="mt-2 w-full rounded-lg border px-2.5 py-1.5 text-xs text-ink"
                          style={inputStyle}
                        />
                      )}

                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted">
                          <input
                            type="checkbox"
                            checked={field.required ?? false}
                            onChange={(e) => updateField(index, { required: e.target.checked })}
                            className="h-3.5 w-3.5 accent-[--brand]"
                          />
                          Required
                        </label>
                        <input
                          value={field.placeholder ?? ""}
                          onChange={(e) => updateField(index, { placeholder: e.target.value })}
                          placeholder={field.type === "checkbox" ? "Tick-box wording" : "Hint text"}
                          className="min-w-0 flex-1 rounded-lg border px-2.5 py-1 text-xs text-ink"
                          style={inputStyle}
                        />
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => moveField(index, -1)}
                            disabled={index === 0}
                            className="rounded-md border px-1.5 py-0.5 text-xs text-muted disabled:opacity-30"
                            style={{ borderColor: "var(--hair)" }}
                            aria-label="Move question up"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => moveField(index, 1)}
                            disabled={index === fields.length - 1}
                            className="rounded-md border px-1.5 py-0.5 text-xs text-muted disabled:opacity-30"
                            style={{ borderColor: "var(--hair)" }}
                            aria-label="Move question down"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            onClick={() => setFields(fields.filter((_, i) => i !== index))}
                            className="rounded-md border px-1.5 py-0.5 text-xs text-muted"
                            style={{ borderColor: "var(--hair)" }}
                            aria-label="Remove question"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border p-3" style={{ borderColor: "var(--hair)", background: "var(--surface)" }}>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={signatureRequired}
                  onChange={(e) => setSignatureRequired(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[--brand]"
                />
                <span>
                  <span className="block text-sm font-semibold text-ink">Signature block at the bottom</span>
                  <span className="block text-xs text-muted">
                    Signers draw or type their signature and give their full legal name. The time,
                    IP address and device are recorded with it.
                  </span>
                </span>
              </label>
              {signatureRequired && (
                <label className="mt-3 block">
                  <span className="mb-1 block text-xs font-semibold text-muted">
                    Declaration above the signature
                  </span>
                  <textarea
                    value={signatureStatement}
                    onChange={(e) => setSignatureStatement(e.target.value)}
                    rows={2}
                    placeholder="I have read, understood and agree to the policy above."
                    className="w-full resize-none rounded-lg border px-2.5 py-2 text-sm text-ink"
                    style={inputStyle}
                  />
                </label>
              )}
            </div>
          </div>

          {/* ─── Delivery ─────────────────────────────────────────────────── */}
          <div className="space-y-4">
            <div className="rounded-xl border p-3" style={{ borderColor: "var(--hair)", background: "var(--surface)" }}>
              <p className="mb-2 text-xs font-semibold text-muted">Who is this for?</p>
              <AudiencePicker value={audience} onChange={setAudience} classes={classes} people={people} />
            </div>

            <div className="rounded-xl border p-3" style={{ borderColor: "var(--hair)", background: "var(--surface)" }}>
              <p className="mb-2 text-xs font-semibold text-muted">Who signs it?</p>
              <div className="space-y-2">
                {(
                  [
                    {
                      value: "student" as const,
                      label: "One per student",
                      hint: "A guardian signs for each of their dancers. Adult students sign their own.",
                    },
                    {
                      value: "person" as const,
                      label: "One per person",
                      hint: "Everyone it reaches signs once for themselves — staff policies, for example.",
                    },
                  ]
                ).map((option) => (
                  <label
                    key={option.value}
                    className="flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5"
                    style={{
                      borderColor: subjectScope === option.value ? "var(--brand)" : "var(--hair)",
                      background:
                        subjectScope === option.value
                          ? "color-mix(in srgb, var(--brand) 8%, transparent)"
                          : "transparent",
                    }}
                  >
                    <input
                      type="radio"
                      name="subject-scope"
                      checked={subjectScope === option.value}
                      onChange={() => setSubjectScope(option.value)}
                      className="mt-0.5 h-3.5 w-3.5 accent-[--brand]"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-ink">{option.label}</span>
                      <span className="block text-xs text-muted">{option.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-3 rounded-xl border p-3" style={{ borderColor: "var(--hair)", background: "var(--surface)" }}>
              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={isRequired}
                  onChange={(e) => setIsRequired(e.target.checked)}
                  className="h-4 w-4 accent-[--brand]"
                />
                <span className="text-sm text-ink">Required — chase until it&apos;s signed</span>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-muted">
                  Due date <span className="font-normal">(optional)</span>
                </span>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full rounded-lg border px-2.5 py-1.5 text-sm text-ink"
                  style={inputStyle}
                />
              </label>
            </div>
          </div>
        </div>

        {error && (
          <p
            className="mt-4 rounded-lg border px-3 py-2 text-xs"
            style={{ borderColor: "#fca5a5", color: "#dc2626" }}
          >
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2 border-t pt-4" style={{ borderColor: "var(--hair)" }}>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border px-4 py-2 text-sm font-semibold text-muted transition hover:text-ink disabled:opacity-50"
            style={{ borderColor: "var(--hair)" }}
          >
            Cancel
          </button>
          {!form?.publishedAt && (
            <button
              type="button"
              onClick={() => submit(false)}
              disabled={saving}
              className="rounded-xl border px-4 py-2 text-sm font-semibold text-ink transition disabled:opacity-50"
              style={{ borderColor: "var(--hair)" }}
            >
              {saving ? "Saving…" : "Save draft"}
            </button>
          )}
          <button
            type="button"
            onClick={() => submit(true)}
            disabled={saving}
            className="rounded-xl px-4 py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"
            style={{ background: "var(--brand)" }}
          >
            {saving ? "Saving…" : form?.publishedAt ? "Save changes" : "Publish & send"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
