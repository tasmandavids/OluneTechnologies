"use client";

import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { toast } from "@/lib/feedback";
import { deleteClass, deleteRecurringGroup } from "@/app/portal/admin/classes/actions";
import type { ClassRow, TeacherOption } from "@/app/portal/admin/classes/page";
import type { XeroAccountOption, XeroItemOption } from "@/lib/xero/chart-of-accounts";
import { ClassDetailPanel } from "@/components/admin/classes/ClassDetailPanel";
import { ClassEditPanel } from "@/components/admin/classes/ClassEditPanel";
import { formatMoney } from "@/lib/currency";
import { useFormatTimeShort } from "@/lib/i18n/client";

const DAY_SHORT_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function DeleteConfirm({
  cls,
  onClose,
}: {
  cls: ClassRow;
  onClose: () => void;
}) {
  const t = useTranslations("admin.classes.delete");
  const tShared = useTranslations("admin.shared");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [deleteSeries, setDeleteSeries] = useState(false);
  const isRecurring = Boolean(cls.recurringGroupId);

  const confirm = () => {
    startTransition(async () => {
      const result =
        isRecurring && deleteSeries
          ? await deleteRecurringGroup(cls.recurringGroupId as string)
          : await deleteClass(cls.id);
      if (!result.ok) { setError(result.error); return; }
      toast.success(tShared("deleted"));
      onClose();
    });
  };

  return (
    <>
      <motion.div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
      >
        <div className="w-full max-w-sm rounded-2xl border border-[--hair] bg-surface p-6 shadow-2xl">
          <h3 className="font-black text-ink mb-1">{t("title", { name: cls.name })}</h3>
          <p className="text-sm text-muted mb-4">{t("description")}</p>
          {isRecurring && (
            <label className="mb-4 flex items-start gap-2 rounded-lg border border-[--hair] bg-base px-3 py-2.5 text-xs text-ink cursor-pointer">
              <input
                type="checkbox"
                checked={deleteSeries}
                onChange={(e) => setDeleteSeries(e.target.checked)}
                className="mt-0.5"
              />
              <span>{t("deleteSeries")}</span>
            </label>
          )}
          {error && <p className="mb-3 text-xs text-red-400">{error}</p>}
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 rounded-xl border border-[--hair] py-2.5 text-sm text-muted hover:text-ink">
              {tCommon("cancel")}
            </button>
            <button
              onClick={confirm}
              disabled={pending}
              className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {pending
                ? tShared("deleting")
                : isRecurring && deleteSeries
                  ? t("deleteSeriesButton")
                  : tCommon("delete")}
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
}

function ClassRowItem({
  cls,
  onView,
  onEdit,
  onDelete,
  readOnly = false,
}: {
  cls: ClassRow;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  readOnly?: boolean;
}) {
  const t = useTranslations("admin.classes");
  const tShared = useTranslations("admin.shared");
  const tCommon = useTranslations("common");
  const fmt = useFormatTimeShort();
  const fill = cls.capacity > 0 ? cls.enrolled / cls.capacity : 0;
  const isFull = fill >= 1;

  return (
    <tr
      className="border-b border-[--hair] last:border-0 hover:bg-[color-mix(in_srgb,var(--brand)_3%,transparent)] transition-colors cursor-pointer"
      onClick={onView}
    >
      <td className="px-4 py-3">
        <p className="flex items-center gap-2 font-semibold text-ink text-sm">
          {cls.name}
          {cls.recurringGroupId && (
            <span
              className="rounded-full px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider"
              style={{
                color: "var(--brand)",
                background: "color-mix(in srgb, var(--brand) 12%, transparent)",
              }}
              title={t("seriesTitle")}
            >
              {t("series")}
            </span>
          )}
        </p>
        <p className="text-xs text-muted mt-0.5">
          {[cls.discipline, cls.level, cls.room].filter(Boolean).join(" · ")}
        </p>
      </td>

      <td className="px-4 py-3 text-sm text-ink">
        <span className="font-medium">{tCommon(`days.${DAY_SHORT_KEYS[cls.dayOfWeek]}`)}</span>
        {cls.startTime && (
          <span className="ml-1 text-muted">{fmt(cls.startTime)}</span>
        )}
      </td>

      <td className="px-4 py-3 text-sm text-muted">
        {cls.teacherName ?? <span className="italic">{tShared("unassigned")}</span>}
      </td>

      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className={`text-sm font-semibold tabular-nums ${isFull ? "text-red-400" : "text-ink"}`}
          >
            {cls.enrolled}/{cls.capacity}
          </span>
          <div className="hidden sm:block h-1.5 w-16 rounded-full bg-[--hair] overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(fill * 100, 100)}%`,
                background: isFull ? "#ef4444" : "var(--brand)",
              }}
            />
          </div>
        </div>
      </td>

      <td className="hidden sm:table-cell px-4 py-3 text-sm tabular-nums text-muted">
        {cls.priceCents > 0 ? formatMoney(cls.priceCents) : tShared("dash")}
      </td>

      {!readOnly && (
        <td className="px-4 py-3 text-right">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="mr-2 text-xs text-muted hover:text-ink transition-colors"
          >
            {tCommon("edit")}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="text-xs text-muted hover:text-red-400 transition-colors"
          >
            {tCommon("delete")}
          </button>
        </td>
      )}
    </tr>
  );
}

export default function ClassesManager({
  classes,
  teachers,
  xeroAccounts,
  xeroItems,
  readOnly = false,
}: {
  classes: ClassRow[];
  teachers: TeacherOption[];
  xeroAccounts: XeroAccountOption[];
  xeroItems: XeroItemOption[];
  readOnly?: boolean;
}) {
  const t = useTranslations("admin.classes");
  const tShared = useTranslations("admin.shared");

  type Panel =
    | { type: "create" }
    | { type: "view"; cls: ClassRow }
    | { type: "edit"; cls: ClassRow }
    | { type: "delete"; cls: ClassRow }
    | null;

  const [panel, setPanel] = useState<Panel>(null);
  const [search, setSearch] = useState("");
  const [roomFilter, setRoomFilter] = useState("");

  const rooms = [...new Set(classes.map((c) => c.room).filter(Boolean))] as string[];

  const filtered = classes.filter(
    (c) =>
      (!search ||
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        (c.discipline ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (c.level ?? "").toLowerCase().includes(search.toLowerCase())) &&
      (!roomFilter || c.room === roomFilter),
  );

  const tableHeaders = [
    t("table.class"),
    t("table.schedule"),
    t("table.teacher"),
    t("table.enrolled"),
    t("table.price"),
    ...(readOnly ? [] : [""]),
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-5xl space-y-6 p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-ink">{t("title")}</h1>
          <p className="text-sm text-muted">
            {t("subtitle", { count: classes.length })}
          </p>
        </div>
        {!readOnly && (
          <button
            onClick={() => setPanel({ type: "create" })}
            className="rounded-xl px-4 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90"
            style={{ background: "var(--brand)" }}
          >
            {t("newClass")}
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="w-full max-w-sm rounded-xl border border-[--hair] bg-surface px-4 py-2.5 text-sm
                     text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-[--brand]"
        />
        {rooms.length > 0 && (
          <select
            value={roomFilter}
            onChange={(e) => setRoomFilter(e.target.value)}
            className="rounded-xl border border-[--hair] bg-surface px-4 py-2.5 text-sm
                       text-ink focus:outline-none focus:ring-1 focus:ring-[--brand]"
          >
            <option value="">{tShared("allRooms")}</option>
            {rooms.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-[--hair] bg-surface">
        {filtered.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-muted">
              {search ? t("emptySearch") : t("empty")}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left">
              <thead>
                <tr className="border-b border-[--hair]">
                  {tableHeaders.map((h) => (
                    <th
                      key={h || "actions"}
                      className={`px-4 py-3 text-[0.62rem] font-semibold uppercase tracking-wider text-muted ${
                        !h ? "text-right" : ""
                      } ${h === t("table.price") ? "hidden sm:table-cell" : ""}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((cls) => (
                  <ClassRowItem
                    key={cls.id}
                    cls={cls}
                    readOnly={readOnly}
                    onView={() => setPanel({ type: "view", cls })}
                    onEdit={() => setPanel({ type: "edit", cls })}
                    onDelete={() => setPanel({ type: "delete", cls })}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AnimatePresence>
        {panel?.type === "view" && (
          <ClassDetailPanel
            cls={panel.cls}
            readOnly={readOnly}
            onClose={() => setPanel(null)}
            onEdit={() => setPanel({ type: "edit", cls: panel.cls })}
          />
        )}
        {(panel?.type === "create" || panel?.type === "edit") && (
          <ClassEditPanel
            mode={panel.type}
            editing={panel.type === "edit" ? panel.cls : null}
            teachers={teachers}
            allClasses={classes}
            xeroAccounts={xeroAccounts}
            xeroItems={xeroItems}
            onClose={() => setPanel(null)}
          />
        )}
        {panel?.type === "delete" && (
          <DeleteConfirm cls={panel.cls} onClose={() => setPanel(null)} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
