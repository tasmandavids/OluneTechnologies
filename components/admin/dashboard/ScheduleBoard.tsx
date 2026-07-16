"use client";

// ============================================================================
//  ScheduleBoard — unified weekly schedule + capacity view.
//  Drag classes into day/time cells; click a class to edit. Cell colour shows
//  enrollment vs capacity. Grid times are derived from actual class data.
// ============================================================================

import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
  type DraggableProvidedDragHandleProps,
} from "@hello-pangea/dnd";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useFormatTimeShort } from "@/lib/i18n/client";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { rescheduleClass } from "@/app/portal/admin/classes/schedule-actions";
import { ClassDetailPanel } from "@/components/admin/classes/ClassDetailPanel";
import { ClassEditPanel } from "@/components/admin/classes/ClassEditPanel";
import type { ClassRow, TeacherOption } from "@/app/portal/admin/classes/page";
import {
  slotKey,
  SCHEDULE_DAYS,
  normalizeTime,
  buildTimeSlots,
  type ScheduleClass,
} from "./types";

type Lists = Record<string, ScheduleClass[]>;

function classesFingerprint(classes: ScheduleClass[]): string {
  return classes
    .map((c) =>
      `${c.id}:${c.dayOfWeek ?? "x"}:${c.startTime ?? "x"}:${c.enrolled}:${c.capacity}`,
    )
    .sort()
    .join("|");
}

function isScheduled(cls: ScheduleClass): boolean {
  return cls.dayOfWeek !== null && normalizeTime(cls.startTime) !== null;
}

function buildLists(classes: ScheduleClass[], timeSlots: string[]): Lists {
  const lists: Lists = { tray: [] };

  SCHEDULE_DAYS.forEach((d) =>
    timeSlots.forEach((time) => {
      lists[slotKey(String(d.dow), time)] = [];
    }),
  );

  for (const cls of classes) {
    const time = normalizeTime(cls.startTime);
    if (cls.dayOfWeek !== null && time !== null && SCHEDULE_DAYS.some((d) => d.dow === cls.dayOfWeek)) {
      const key = slotKey(String(cls.dayOfWeek), time);
      if (lists[key] !== undefined) {
        lists[key].push(cls);
      } else {
        lists.tray.push(cls);
      }
    } else {
      lists.tray.push(cls);
    }
  }

  return lists;
}

function fillColor(ratio: number) {
  if (ratio >= 1) return "var(--brand-deep)";
  return `color-mix(in srgb, var(--brand) ${Math.round(ratio * 100)}%, var(--heat-empty))`;
}

function toScheduleClass(row: ClassRow): ScheduleClass {
  let durationMin = 60;
  const startTime = normalizeTime(row.startTime);
  const endTime = normalizeTime(row.endTime);
  if (startTime && endTime) {
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    durationMin = (eh * 60 + em) - (sh * 60 + sm);
  }
  return {
    id: row.id,
    name: row.name,
    discipline: row.discipline ?? "",
    level: row.level ?? "",
    room: row.room,
    durationMin,
    dayOfWeek: row.dayOfWeek,
    startTime,
    endTime,
    enrolled: row.enrolled,
    capacity: row.capacity,
    priceCents: row.priceCents,
    teacherId: row.teacherId,
    teacherName: row.teacherName,
    recurringGroupId: row.recurringGroupId,
  };
}

function ClassCard({
  block,
  dragging,
  durationLabel,
  onView,
  dragHandleProps,
}: {
  block: ScheduleClass;
  dragging?: boolean;
  durationLabel?: string;
  onView: () => void;
  dragHandleProps?: DraggableProvidedDragHandleProps | null;
}) {
  const ratio = block.capacity > 0 ? block.enrolled / block.capacity : 0;
  const full = ratio >= 1;
  const textColor = ratio > 0.5 ? "#fff" : "var(--text)";

  return (
    <div
      className={`group relative rounded-lg border px-2.5 py-2 transition-transform hover:-translate-y-0.5 ${
        dragging ? "border-[--brand] shadow-2xl" : "border-transparent"
      }`}
      style={{
        background: fillColor(ratio),
        boxShadow: full ? "inset 0 0 0 1.5px var(--brand-hot)" : "inset 0 0 0 1px var(--hair)",
      }}
    >
      <div className="flex items-start gap-1.5">
        <div
          {...(dragHandleProps ?? {})}
          className="mt-0.5 flex flex-none cursor-grab flex-col gap-0.5 opacity-60 active:cursor-grabbing"
        >
          <span className="h-0.5 w-2.5 rounded-full" style={{ background: textColor }} />
          <span className="h-0.5 w-2.5 rounded-full" style={{ background: textColor }} />
          <span className="h-0.5 w-2.5 rounded-full" style={{ background: textColor }} />
        </div>
        <button
          type="button"
          onClick={onView}
          className="min-w-0 flex-1 text-left"
        >
          <span className="block truncate text-xs font-bold" style={{ color: textColor }}>
            {block.name}
          </span>
          <span className="mt-0.5 block truncate text-[0.62rem]" style={{ color: textColor, opacity: 0.85 }}>
            {[block.level, block.room, durationLabel].filter(Boolean).join(" · ")}
          </span>
          <span className="mt-0.5 block text-[0.62rem] font-bold tabular-nums" style={{ color: textColor }}>
            {block.enrolled}/{block.capacity}
          </span>
        </button>
      </div>
    </div>
  );
}

export function ScheduleBoard({
  studioId,
  classes: classRows,
  teachers,
}: {
  studioId: string;
  classes: ClassRow[];
  teachers: TeacherOption[];
}) {
  const classRowMap = useMemo(() => new Map(classRows.map((c) => [c.id, c])), [classRows]);
  const classes = useMemo(() => classRows.map(toScheduleClass), [classRows]);
  const t = useTranslations("admin.dashboard.schedule");
  const tCapacity = useTranslations("admin.dashboard.capacity");
  const tShared = useTranslations("admin.shared");
  const tDays = useTranslations("common.days");
  const formatTime = useFormatTimeShort();

  const dayKey: Record<string, "mon" | "tue" | "wed" | "thu" | "fri" | "sat"> = {
    Mon: "mon", Tue: "tue", Wed: "wed", Thu: "thu", Fri: "fri", Sat: "sat",
  };

  const [roomFilter, setRoomFilter] = useState("");
  const rooms = useMemo(
    () => [...new Set(classes.map((c) => c.room).filter(Boolean))] as string[],
    [classes],
  );
  const filteredClasses = useMemo(
    () => (roomFilter ? classes.filter((c) => c.room === roomFilter) : classes),
    [classes, roomFilter],
  );

  const timeSlots = useMemo(() => buildTimeSlots(filteredClasses), [filteredClasses]);
  const serverFingerprint = useMemo(() => classesFingerprint(filteredClasses), [filteredClasses]);
  const [lists, setLists] = useState<Lists>(() => buildLists(filteredClasses, timeSlots));
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [panel, setPanel] = useState<{ type: "view" | "edit"; cls: ClassRow } | null>(null);

  useEffect(() => {
    if (isPending) return;
    setLists(buildLists(filteredClasses, timeSlots));
    setErrorMsg(null);
  }, [studioId, serverFingerprint, isPending, filteredClasses, timeSlots]);

  function parseDropId(id: string): { dayOfWeek: number; startTime: string } | null {
    if (id === "tray") return null;
    const sepIdx = id.indexOf(":");
    const dow = id.slice(0, sepIdx);
    const time = id.slice(sepIdx + 1);
    return { dayOfWeek: Number(dow), startTime: time };
  }

  const onDragEnd = useCallback(
    ({ source, destination }: DropResult) => {
      if (!destination) return;
      if (
        source.droppableId === destination.droppableId &&
        source.index === destination.index
      ) {
        return;
      }

      let movedBlock!: ScheduleClass;
      let previousLists!: Lists;

      setLists((prev) => {
        previousLists = prev;
        const next: Lists = { ...prev };
        const src = Array.from(next[source.droppableId]);
        const [moved] = src.splice(source.index, 1);
        movedBlock = moved;
        const dst =
          source.droppableId === destination.droppableId
            ? src
            : Array.from(next[destination.droppableId]);
        dst.splice(destination.index, 0, moved);

        if (destination.droppableId !== "tray" && dst.length > 1) {
          const tray =
            source.droppableId === "tray"
              ? src
              : Array.from(next.tray);
          const displaced = dst.find((c) => c.id !== moved.id)!;
          dst.splice(dst.indexOf(displaced), 1);
          tray.push(displaced);
          next.tray = tray;
        }

        next[source.droppableId] = src;
        next[destination.droppableId] = dst;
        return next;
      });

      const target = parseDropId(destination.droppableId);
      startTransition(async () => {
        const result = await rescheduleClass(
          movedBlock.id,
          target?.dayOfWeek ?? null,
          target?.startTime ?? null,
        );
        if (!result.ok) {
          setLists(previousLists);
          setErrorMsg(result.error);
        } else {
          setErrorMsg(null);
        }
      });
    },
    [],
  );

  const placed = filteredClasses.filter(isScheduled).length;
  const unscheduled = lists.tray.length;

  return (
    <>
      <DragDropContext onDragEnd={onDragEnd}>
        <motion.section
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="rounded-2xl border border-[--hair] bg-surface p-6"
          style={{ ["--heat-empty" as string]: "color-mix(in srgb, var(--text) 7%, var(--surface))" }}
        >
          <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-ink">{t("title")}</h2>
              <p className="text-sm text-muted">{t("subtitle")}</p>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              {rooms.length > 0 && (
                <select
                  value={roomFilter}
                  onChange={(e) => setRoomFilter(e.target.value)}
                  className="rounded-lg border border-[--hair] bg-base px-3 py-1.5 text-xs text-ink
                             focus:outline-none focus:ring-1 focus:ring-[--brand]"
                >
                  <option value="">{tShared("allRooms")}</option>
                  {rooms.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              )}
              <div className="flex items-center gap-2 text-xs text-muted">
                <span>{tCapacity("empty")}</span>
                <span
                  className="h-2.5 w-24 rounded-full"
                  style={{
                    background:
                      "linear-gradient(90deg, var(--heat-empty), var(--brand) 80%, var(--brand-deep))",
                  }}
                />
                <span>{tCapacity("full")}</span>
              </div>
              <div className="flex items-center gap-3">
                {isPending && (
                  <span className="animate-pulse text-xs text-muted">{tShared("saving")}</span>
                )}
                {errorMsg && <span className="text-xs text-red-500">{errorMsg}</span>}
                <span className="text-xs text-muted">
                  {tShared("placedCount", { placed, unscheduled })}
                </span>
              </div>
            </div>
          </header>

          {unscheduled > 0 && (
            <Droppable droppableId="tray" direction="horizontal">
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="mb-5 flex min-h-[56px] flex-wrap gap-2 rounded-xl border border-dashed p-3 transition-colors"
                  style={{
                    borderColor: snapshot.isDraggingOver ? "var(--brand)" : "var(--hair)",
                  }}
                >
                  <span className="w-full text-[0.65rem] font-semibold uppercase tracking-wider text-muted">
                    {t("unscheduled")}
                  </span>
                  {lists.tray.map((block, i) => (
                    <Draggable key={block.id} draggableId={block.id} index={i}>
                      {(p, snap) => (
                        <div
                          ref={p.innerRef}
                          {...p.draggableProps}
                          className="w-[140px]"
                        >
                          <ClassCard
                            block={block}
                            dragging={snap.isDragging}
                            dragHandleProps={p.dragHandleProps}
                            durationLabel={
                              block.durationMin
                                ? t("durationMin", { minutes: block.durationMin })
                                : undefined
                            }
                            onView={() => {
                              const row = classRowMap.get(block.id);
                              if (row) setPanel({ type: "view", cls: row });
                            }}
                          />
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          )}

          <div className="overflow-x-auto">
            <div
              className="grid min-w-[640px] gap-1.5"
              style={{
                gridTemplateColumns: `72px repeat(${SCHEDULE_DAYS.length}, minmax(88px, 1fr))`,
              }}
            >
              <div />
              {SCHEDULE_DAYS.map((day) => (
                <div
                  key={day.dow}
                  className="pb-1 text-center text-sm font-semibold text-ink"
                >
                  {tDays(dayKey[day.label])}
                </div>
              ))}

              {timeSlots.map((time) => (
                <div key={time} className="contents">
                  <div className="flex items-center text-xs font-semibold uppercase tracking-wider text-muted">
                    {formatTime(time)}
                  </div>
                  {SCHEDULE_DAYS.map((day) => {
                    const id = slotKey(String(day.dow), time);
                    return (
                      <Droppable key={id} droppableId={id}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            className="min-h-[72px] rounded-lg p-1 transition-colors"
                            style={{
                              background: snapshot.isDraggingOver
                                ? "color-mix(in srgb, var(--brand) 16%, var(--surface))"
                                : "color-mix(in srgb, var(--text) 3%, var(--surface))",
                              boxShadow: "inset 0 0 0 1px var(--hair)",
                            }}
                          >
                            {lists[id]?.map((block, i) => (
                              <Draggable
                                key={block.id}
                                draggableId={block.id}
                                index={i}
                              >
                                {(p, snap) => (
                                  <div ref={p.innerRef} {...p.draggableProps}>
                                    <ClassCard
                                      block={block}
                                      dragging={snap.isDragging}
                                      dragHandleProps={p.dragHandleProps}
                                      durationLabel={
                                        block.durationMin
                                          ? t("durationMin", { minutes: block.durationMin })
                                          : undefined
                                      }
                                      onView={() => {
                                        const row = classRowMap.get(block.id);
                                        if (row) setPanel({ type: "view", cls: row });
                                      }}
                                    />
                                  </div>
                                )}
                              </Draggable>
                            ))}
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </motion.section>
      </DragDropContext>

      <AnimatePresence>
        {panel?.type === "view" && (
          <ClassDetailPanel
            cls={panel.cls}
            onClose={() => setPanel(null)}
            onEdit={() => setPanel({ type: "edit", cls: panel.cls })}
          />
        )}
        {panel?.type === "edit" && (
          <ClassEditPanel
            mode="edit"
            editing={panel.cls}
            teachers={teachers}
            onClose={() => setPanel(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
