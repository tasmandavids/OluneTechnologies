"use client";

// ============================================================================
//  FormsWorkbench — the Form creation screen.
//
//  A list of everything the studio has written, each row showing who it went
//  to and how far through signing it is, with the builder and the "who's
//  signed" drawer hanging off it. Drafts sit at the top of the list because
//  they're the ones still waiting on a decision.
// ============================================================================

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useEscToClose } from "@/lib/useEscToClose";
import { overlayFade, panelSlide } from "@/lib/motion";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";
import { SignatureStamp } from "@/components/forms/SignaturePad";
import {
  deleteForm,
  duplicateForm,
  getFormResponses,
  setFormActive,
  setFormPublished,
} from "@/app/portal/admin/forms/actions";
import type { AdminFormSummary, FormRecipient } from "@/lib/forms/data";
import type { FormResponseRecord } from "@/lib/forms/types";
import { FormBuilderModal } from "./FormBuilderModal";
import { describeAudience, type ClassOption, type PersonOption } from "./AudiencePicker";

type Filter = "all" | "live" | "draft" | "archived";
type Status = Exclude<Filter, "all">;

function statusOf(form: AdminFormSummary): Status {
  if (!form.active) return "archived";
  return form.publishedAt ? "live" : "draft";
}

const STATUS_STYLES: Record<Status, { label: string; color: string; background: string }> = {
  live: { label: "Live", color: "#16a34a", background: "color-mix(in srgb, #16a34a 12%, transparent)" },
  draft: { label: "Draft", color: "var(--muted)", background: "var(--t3)" },
  archived: { label: "Archived", color: "var(--muted)", background: "transparent" },
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" });
}

export function FormsWorkbench({
  forms,
  classes,
  people,
}: {
  forms: AdminFormSummary[];
  classes: ClassOption[];
  people: PersonOption[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [builder, setBuilder] = useState<{ form: AdminFormSummary | null } | null>(null);
  const [responsesFor, setResponsesFor] = useState<AdminFormSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const ordered = [...forms].sort((a, b) => {
    const rank = (f: AdminFormSummary) => (statusOf(f) === "draft" ? 0 : statusOf(f) === "live" ? 1 : 2);
    return rank(a) - rank(b) || b.createdAt.localeCompare(a.createdAt);
  });
  const visible = filter === "all" ? ordered : ordered.filter((f) => statusOf(f) === filter);

  function run(action: () => Promise<{ ok: true; id: string } | { ok: false; error: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-ink">Form creation</h1>
          <p className="text-sm text-muted">
            Policies, codes of conduct and consent forms — written here, signed in the portal.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setBuilder({ form: null })}
          className="rounded-xl px-4 py-2 text-sm font-bold text-white transition hover:opacity-90"
          style={{ background: "var(--brand)" }}
        >
          + New form
        </button>
      </div>

      <div className="flex w-fit gap-1 rounded-[14px] border p-1.5" style={{ borderColor: "var(--edge)" }}>
        {(["all", "live", "draft", "archived"] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className="rounded-[10px] px-4 py-1.5 text-xs font-semibold capitalize transition-all"
            style={{
              color: filter === id ? "var(--ink, var(--text))" : "var(--muted)",
              background: filter === id ? "var(--t3)" : "transparent",
              border: filter === id ? "1px solid var(--tb)" : "1px solid transparent",
            }}
          >
            {id}
          </button>
        ))}
      </div>

      {error && (
        <p className="rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "#fca5a5", color: "#dc2626" }}>
          {error}
        </p>
      )}

      {visible.length === 0 ? (
        <GlassPanel className="!p-14 text-center">
          <p className="text-sm font-semibold text-ink">
            {forms.length === 0 ? "No forms yet" : "Nothing in this view"}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
            {forms.length === 0
              ? "Start with the policy people ask about most — the studio code of conduct, the photo consent, the medical form."
              : "Try another filter."}
          </p>
        </GlassPanel>
      ) : (
        <div className="space-y-2.5">
          {visible.map((form) => {
            const status = statusOf(form);
            const chip = STATUS_STYLES[status];
            const progress =
              form.recipientCount > 0 ? Math.round((form.signedCount / form.recipientCount) * 100) : 0;
            return (
              <GlassPanel key={form.id}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-ink">{form.title}</p>
                      <span
                        className="rounded-full px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider"
                        style={{ color: chip.color, background: chip.background }}
                      >
                        {chip.label}
                      </span>
                      {form.signatureRequired && (
                        <span className="rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider text-muted" style={{ borderColor: "var(--hair)" }}>
                          Signature
                        </span>
                      )}
                      {form.isRequired && (
                        <span className="rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider text-muted" style={{ borderColor: "var(--hair)" }}>
                          Required
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      {describeAudience(form.audience, classes, people)} ·{" "}
                      {form.subjectScope === "student" ? "one per student" : "one per person"}
                      {form.dueDate ? ` · due ${formatDate(form.dueDate)}` : ""}
                    </p>
                    {form.description && (
                      <p className="mt-1 truncate text-xs text-muted">{form.description}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-4">
                    {status === "live" && (
                      <button
                        type="button"
                        onClick={() => setResponsesFor(form)}
                        className="text-left"
                      >
                        <p className="text-sm font-bold text-ink">
                          {form.signedCount}
                          <span className="text-muted">/{form.recipientCount}</span>
                        </p>
                        <p className="text-[11px] text-muted">signed · view</p>
                        <div className="mt-1 h-1 w-24 overflow-hidden rounded-full" style={{ background: "var(--t3)" }}>
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${progress}%`, background: "var(--brand)" }}
                          />
                        </div>
                      </button>
                    )}

                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => setBuilder({ form })}
                        className="rounded-lg border px-2.5 py-1 text-xs font-semibold text-ink transition"
                        style={{ borderColor: "var(--hair)" }}
                      >
                        Edit
                      </button>
                      {status === "draft" && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => run(() => setFormPublished(form.id, true))}
                          className="rounded-lg px-2.5 py-1 text-xs font-bold text-white transition disabled:opacity-50"
                          style={{ background: "var(--brand)" }}
                        >
                          Publish
                        </button>
                      )}
                      {status === "live" && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => run(() => setFormPublished(form.id, false))}
                          className="rounded-lg border px-2.5 py-1 text-xs font-semibold text-muted transition disabled:opacity-50"
                          style={{ borderColor: "var(--hair)" }}
                        >
                          Unpublish
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => duplicateForm(form.id))}
                        className="rounded-lg border px-2.5 py-1 text-xs font-semibold text-muted transition disabled:opacity-50"
                        style={{ borderColor: "var(--hair)" }}
                      >
                        Duplicate
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => setFormActive(form.id, !form.active))}
                        className="rounded-lg border px-2.5 py-1 text-xs font-semibold text-muted transition disabled:opacity-50"
                        style={{ borderColor: "var(--hair)" }}
                      >
                        {form.active ? "Archive" : "Restore"}
                      </button>
                      {status === "draft" && form.signedCount === 0 && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => run(() => deleteForm(form.id))}
                          className="rounded-lg border px-2.5 py-1 text-xs font-semibold transition disabled:opacity-50"
                          style={{ borderColor: "var(--hair)", color: "#dc2626" }}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </GlassPanel>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {builder && (
          <FormBuilderModal
            form={builder.form}
            classes={classes}
            people={people}
            onClose={() => {
              setBuilder(null);
              router.refresh();
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {responsesFor && (
          <ResponsesDrawer form={responsesFor} onClose={() => setResponsesFor(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Who's signed ───────────────────────────────────────────────────────────

function ResponsesDrawer({ form, onClose }: { form: AdminFormSummary; onClose: () => void }) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; recipients: FormRecipient[]; responses: FormResponseRecord[] }
  >({ status: "loading" });

  useEscToClose(onClose);

  // Loaded once per open — the drawer is a snapshot, not a live view.
  useEffect(() => {
    let cancelled = false;
    getFormResponses(form.id).then((result) => {
      if (cancelled) return;
      setState(
        result.ok
          ? { status: "ready", recipients: result.recipients, responses: result.responses }
          : { status: "error", message: result.error },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [form.id]);

  const bySubject =
    state.status === "ready"
      ? new Map(state.responses.map((r) => [r.subjectId, r]))
      : new Map<string, FormResponseRecord>();

  return (
    <>
      <motion.div {...overlayFade} className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <motion.aside
        {...panelSlide}
        className="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-xl flex-col border-l"
        style={{ background: "var(--canvas, var(--surface))", borderColor: "var(--hair)" }}
      >
        <div className="flex items-start justify-between gap-3 border-b p-5" style={{ borderColor: "var(--hair)" }}>
          <div>
            <h2 className="text-base font-black text-ink">{form.title}</h2>
            <p className="text-xs text-muted">
              {form.signedCount} of {form.recipientCount} signed
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-muted transition hover:text-ink" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {state.status === "loading" && (
            <p className="animate-pulse py-8 text-center text-sm text-muted">Loading…</p>
          )}
          {state.status === "error" && (
            <p className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "#fca5a5", color: "#dc2626" }}>
              {state.message}
            </p>
          )}
          {state.status === "ready" && state.recipients.length === 0 && (
            <p className="py-8 text-center text-sm text-muted">
              Nobody is in this form&apos;s audience yet.
            </p>
          )}
          {state.status === "ready" && state.recipients.length > 0 && (
            <div className="space-y-2">
              {state.recipients
                .slice()
                .sort((a, b) => {
                  const aSigned = bySubject.get(a.subjectId)?.signedAt ? 1 : 0;
                  const bSigned = bySubject.get(b.subjectId)?.signedAt ? 1 : 0;
                  return aSigned - bSigned || (a.subjectName ?? "").localeCompare(b.subjectName ?? "");
                })
                .map((recipient) => {
                  const response = bySubject.get(recipient.subjectId);
                  return (
                    <div
                      key={recipient.subjectId}
                      className="rounded-xl border p-3"
                      style={{ borderColor: "var(--hair)", background: "var(--surface)" }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-ink">
                          {recipient.subjectName ?? "Unnamed"}
                        </p>
                        {response?.signedAt ? (
                          <span className="text-xs font-semibold" style={{ color: "#16a34a" }}>
                            ✓ {formatDate(response.signedAt)}
                          </span>
                        ) : (
                          <span className="text-xs text-muted">Not signed</span>
                        )}
                      </div>
                      {response?.signedAt && (
                        <div className="mt-2 flex flex-wrap items-center gap-3">
                          <SignatureStamp
                            signature={response.signature}
                            type={response.signatureType}
                            name={response.signatureName}
                          />
                          {response.signatureName && (
                            <span className="text-xs text-muted">
                              Signed by {response.signatureName}
                            </span>
                          )}
                        </div>
                      )}
                      {response && Object.keys(response.data).length > 0 && (
                        <dl className="mt-2 space-y-0.5">
                          {form.fields.map((field) => {
                            const raw = response.data[field.key];
                            if (raw === undefined || raw === null || raw === "") return null;
                            const value =
                              typeof raw === "boolean" ? (raw ? "Yes" : "No") : String(raw);
                            return (
                              <div key={field.key} className="flex gap-2 text-xs">
                                <dt className="shrink-0 text-muted">{field.label}:</dt>
                                <dd className="text-ink">{value}</dd>
                              </div>
                            );
                          })}
                        </dl>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </motion.aside>
    </>
  );
}
