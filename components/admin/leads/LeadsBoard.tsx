"use client";
import { useEscToClose } from "@/lib/useEscToClose";
import { panelSlide } from "@/lib/motion";
import { useTranslations } from "next-intl";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";

// ============================================================================
//  LeadsBoard — Kanban pipeline for the CRM.
//
//  Columns: New → Contacted → Trial → Converted / Lost
//  Drag cards between columns using @hello-pangea/dnd.
//  Create new leads via a slide-over form.
//  Click a card to expand notes + edit.
// ============================================================================

import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useTransition } from "react";
import type { Lead } from "@/app/portal/admin/leads/page";
import {
  updateLeadStatus,
  createLead,
  deleteLead,
  updateLeadNotes,
  type LeadStatus,
  type LeadFormData,
} from "@/app/portal/admin/leads/actions";

// ─── Column config ───────────────────────────────────────────────────────────

type Column = { id: LeadStatus; color: string };

const COLUMNS: Column[] = [
  { id: "new",       color: "#6366f1" },
  { id: "contacted", color: "#f59e0b" },
  { id: "trial",     color: "#3b82f6" },
  { id: "converted", color: "#22c55e" },
  { id: "lost",      color: "#94a3b8" },
];

// ─── Lead card ───────────────────────────────────────────────────────────────

function LeadCard({
  lead,
  colColor,
  onDelete,
  onNotesUpdate,
}: {
  lead: Lead;
  colColor: string;
  onDelete: () => void;
  onNotesUpdate: (notes: string) => void;
}) {
  const t = useTranslations("admin.leads");
  const tShared = useTranslations("admin.shared");
  const tCommon = useTranslations("common");
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [saving, startSave] = useTransition();

  function handleSaveNotes() {
    startSave(async () => {
      await updateLeadNotes(lead.id, notes);
      onNotesUpdate(notes);
    });
  }

  return (
    <div className="box rounded-xl p-3 text-sm">
      <div className="flex items-start gap-2">
        <span
          className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
          style={{ background: colColor }}
        />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-ink truncate">
            {lead.firstName} {lead.lastName ?? ""}
          </p>
          {lead.email && (
            <p className="text-[0.65rem] text-muted truncate">{lead.email}</p>
          )}
          {lead.phone && (
            <p className="text-[0.65rem] text-muted">{lead.phone}</p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {lead.source && (
              <span className="inline-block rounded-full bg-[--surface] px-2 py-0.5 text-[0.58rem] font-medium uppercase tracking-wide text-muted">
                {lead.source}
              </span>
            )}
            {/* The acquisition channel. "Direct" is a real answer, not a
                missing one — it means we looked and there was no campaign. */}
            <span
              className="inline-block rounded-full bg-[--surface] px-2 py-0.5 text-[0.58rem] font-medium uppercase tracking-wide text-muted"
              title={lead.campaign ? t("campaignTitle", { campaign: lead.campaign }) : undefined}
            >
              {lead.channel ?? t("directChannel")}
            </span>
          </div>
          {/* Getting back to a lead was previously a copy-paste job — the board
              recorded that they existed and offered no way to reach them. */}
          {(lead.email || lead.phone) && (
            <div className="mt-1.5 flex flex-wrap gap-2">
              {lead.email && (
                <a
                  href={`mailto:${lead.email}`}
                  className="text-[0.65rem] font-semibold text-brand hover:underline"
                >
                  {t("emailLead")}
                </a>
              )}
              {lead.phone && (
                <>
                  <a
                    href={`tel:${lead.phone.replace(/\s+/g, "")}`}
                    className="text-[0.65rem] font-semibold text-brand hover:underline"
                  >
                    {t("callLead")}
                  </a>
                  <a
                    href={`sms:${lead.phone.replace(/\s+/g, "")}`}
                    className="text-[0.65rem] font-semibold text-brand hover:underline"
                  >
                    {t("textLead")}
                  </a>
                </>
              )}
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="grid h-6 w-6 place-items-center rounded-md text-muted transition-colors hover:bg-surface hover:text-ink"
            title={t("notes")}
          >
            ✎
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="grid h-6 w-6 place-items-center rounded-md text-muted transition-colors hover:bg-red-50 hover:text-red-500"
            title={t("deleteTitle")}
          >
            ×
          </button>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder={t("notesPlaceholder")}
              className="mt-3 w-full resize-none rounded-lg border border-[--hair] bg-surface px-2.5 py-2 text-xs text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-[--brand]"
            />
            <div className="mt-1.5 flex justify-end">
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveNotes}
                className="rounded-lg px-3 py-1 text-[0.65rem] font-bold text-white disabled:opacity-50"
                style={{ background: "var(--brand)" }}
              >
                {saving ? tShared("saving") : tCommon("save")}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── New lead form (slide-over) ──────────────────────────────────────────────

function NewLeadSlideOver({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (lead: Lead) => void;
}) {
  useEscToClose(onClose);
  const t = useTranslations("admin.leads");
  const tShared = useTranslations("admin.shared");
  const [form, setForm] = useState<LeadFormData>({
    firstName: "", lastName: "", email: "", phone: "", source: "", notes: "",
  });
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const formFields = [
    { field: "firstName" as const, label: t("form.firstName"), required: true },
    { field: "lastName" as const, label: t("form.lastName") },
    { field: "email" as const, label: t("form.email"), type: "email" },
    { field: "phone" as const, label: t("form.phone"), type: "tel" },
    { field: "source" as const, label: t("form.source") },
  ];

  function handleChange(field: keyof LeadFormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit() {
    startSave(async () => {
      const res = await createLead(form);
      if (!res.ok) { setError(res.error); return; }
      // Optimistically add to board — page will revalidate in background
      onCreated({
        id: crypto.randomUUID(),
        firstName: form.firstName,
        lastName: form.lastName || null,
        email: form.email || null,
        phone: form.phone || null,
        source: form.source || null,
        // A hand-added lead has no click to attribute — it came from a phone
        // call or the front desk.
        channel: null,
        campaign: null,
        status: "new",
        notes: form.notes || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-end bg-black/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        {...panelSlide}
        className="h-full w-full max-w-sm overflow-y-auto bg-base p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-base font-bold text-ink">{t("form.title")}</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-surface"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          {formFields.map(({ field, label, required, type }) => (
            <div key={field}>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">
                {label}
              </label>
              <input
                type={type ?? "text"}
                value={form[field] as string}
                required={required}
                onChange={(e) => handleChange(field, e.target.value)}
                className="w-full rounded-lg border border-[--hair] bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-[--brand]"
              />
            </div>
          ))}

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">
              {t("notes")}
            </label>
            <textarea
              value={form.notes as string}
              onChange={(e) => handleChange("notes", e.target.value)}
              rows={4}
              className="w-full resize-none rounded-lg border border-[--hair] bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-[--brand]"
            />
          </div>

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
              {error}
            </p>
          )}

          <button
            type="button"
            disabled={saving || !form.firstName}
            onClick={handleSubmit}
            className="w-full rounded-xl py-3 text-sm font-bold text-white disabled:opacity-40"
            style={{ background: "var(--brand)" }}
          >
            {saving ? tShared("creating") : t("form.createLead")}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Main board ──────────────────────────────────────────────────────────────

type Columns = Record<LeadStatus, Lead[]>;

function buildColumns(leads: Lead[]): Columns {
  const cols: Columns = { new: [], contacted: [], trial: [], converted: [], lost: [] };
  for (const lead of leads) cols[lead.status].push(lead);
  return cols;
}

export function LeadsBoard({ initialLeads }: { initialLeads: Lead[] }) {
  const t = useTranslations("admin.leads");
  const tShared = useTranslations("admin.shared");
  const tCommon = useTranslations("common");
  const [columns, setColumns] = useState<Columns>(() => buildColumns(initialLeads));
  const [showNew, setShowNew] = useState(false);
  const [, startTransition] = useTransition();

  function onDragEnd({ source, destination, draggableId }: DropResult) {
    if (!destination) return;
    const srcCol = source.droppableId as LeadStatus;
    const dstCol = destination.droppableId as LeadStatus;
    if (srcCol === dstCol && source.index === destination.index) return;

    setColumns((prev) => {
      const next = { ...prev };
      const srcItems = Array.from(next[srcCol]);
      const [moved] = srcItems.splice(source.index, 1);
      const dstItems = srcCol === dstCol ? srcItems : Array.from(next[dstCol]);
      dstItems.splice(destination.index, 0, { ...moved, status: dstCol });
      next[srcCol] = srcItems;
      next[dstCol] = dstItems;
      return next;
    });

    if (srcCol !== dstCol) {
      startTransition(async () => {
        await updateLeadStatus(draggableId, dstCol);
      });
    }
  }

  function handleDelete(col: LeadStatus, leadId: string) {
    setColumns((prev) => ({
      ...prev,
      [col]: prev[col].filter((l) => l.id !== leadId),
    }));
    startTransition(async () => { await deleteLead(leadId); });
  }

  function handleNotesUpdate(col: LeadStatus, leadId: string, notes: string) {
    setColumns((prev) => ({
      ...prev,
      [col]: prev[col].map((l) => l.id === leadId ? { ...l, notes } : l),
    }));
  }

  function handleCreated(lead: Lead) {
    setColumns((prev) => ({
      ...prev,
      new: [lead, ...prev.new],
    }));
  }

  const total = Object.values(columns).reduce((n, col) => n + col.length, 0);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[--hair] px-6 py-4">
        <div>
          <h1 className="text-xl font-black text-ink">{t("title")}</h1>
          <p className="text-xs text-muted">{t("subtitle", { count: total })}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowNew(true)}
          className="rounded-xl px-4 py-2 text-sm font-bold text-white shadow-sm"
          style={{ background: "var(--brand)" }}
        >
          {t("newLead")}
        </button>
      </div>

      {/* Kanban board */}
      <div className="flex-1 overflow-x-auto">
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex min-h-full gap-4 p-6" style={{ minWidth: `${COLUMNS.length * 260}px` }}>
            {COLUMNS.map((col) => {
              const items = columns[col.id];
              return (
                <GlassPanel key={col.id} className="flex w-60 shrink-0 flex-col !p-3">
                  {/* Column header */}
                  <div className="mb-3 flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: col.color }}
                    />
                    <span className="text-xs font-bold uppercase tracking-wider text-muted">
                      {t(`columns.${col.id}`)}
                    </span>
                    <span className="ml-auto rounded-full bg-surface px-1.5 py-0.5 text-[0.6rem] font-semibold text-muted">
                      {items.length}
                    </span>
                  </div>

                  <Droppable droppableId={col.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className="flex-1 space-y-2 rounded-xl p-2 transition-colors"
                        style={{
                          background: snapshot.isDraggingOver
                            ? `color-mix(in srgb, ${col.color} 8%, var(--surface))`
                            : "var(--surface)",
                          boxShadow: "inset 0 0 0 1px var(--hair)",
                          minHeight: 80,
                        }}
                      >
                        {items.map((lead, i) => (
                          <Draggable key={lead.id} draggableId={lead.id} index={i}>
                            {(p, snap) => (
                              <div
                                ref={p.innerRef}
                                {...p.draggableProps}
                                {...p.dragHandleProps}
                                style={{
                                  ...p.draggableProps.style,
                                  opacity: snap.isDragging ? 0.9 : 1,
                                }}
                              >
                                <LeadCard
                                  lead={lead}
                                  colColor={col.color}
                                  onDelete={() => handleDelete(col.id, lead.id)}
                                  onNotesUpdate={(notes) => handleNotesUpdate(col.id, lead.id, notes)}
                                />
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                        {items.length === 0 && !snapshot.isDraggingOver && (
                          <p className="py-4 text-center text-xs text-muted">{t("dropHere")}</p>
                        )}
                      </div>
                    )}
                  </Droppable>
                </GlassPanel>
              );
            })}
          </div>
        </DragDropContext>
      </div>

      {/* New lead slide-over */}
      <AnimatePresence>
        {showNew && (
          <NewLeadSlideOver
            onClose={() => setShowNew(false)}
            onCreated={handleCreated}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
