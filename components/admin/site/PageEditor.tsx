"use client";

// ============================================================================
//  PageEditor — Wix-style visual page builder.
//  Canvas-first: drag elements to reorder, right-click to add, click to edit.
// ============================================================================

import { confirmDialog } from "@/lib/feedback";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  APPEARANCE_FIELDS,
  BLOCK_LIBRARY,
  BLOCK_MAP,
  LAYOUT_FIELDS,
  STYLE_FIELDS,
  cloneBlock,
  makeBlock,
  type Block,
  type BlockItem,
  type BlockType,
  type FieldDef,
  type PropValue,
} from "@/lib/site/blocks";
import ImageInput from "@/components/admin/site/ImageInput";
import VideoInput from "@/components/admin/site/VideoInput";
import { BackgroundEditor } from "@/components/admin/site/BackgroundEditor";
import { EditorCanvas } from "@/components/admin/site/EditorCanvas";
import { normalizePageBackground, type PageBackground } from "@/lib/site/background";
import { CANVAS_GRID, freeformDefaultsAt, isCanvasWidget, nextCanvasY, normalizeBlockLayoutForSave, seedLayoutDefaults, seedLayoutProps, snapGridHeight, snapGridWidth, snapGridX, snapGridY, snapLayoutPatch, type LayoutPatch } from "@/lib/site/layout";
import { canvasAlignX, snapRotation } from "@/lib/site/block-styles";
import { num, str } from "@/lib/site/props";
import LinkPicker, { isLinkField } from "@/components/admin/site/LinkPicker";
import { useEditorHistory } from "@/lib/site/editor-history";
import { savePageBlocks, updatePageMeta, publishPage } from "@/app/portal/admin/site/actions";
import { buildStudioNavLinks, type SitePageLink, type StudioPageNavSource } from "@/lib/site/page-links";
import { blockLabel } from "@/lib/site/i18n-labels";
import { applySmartAppearance } from "@/lib/site/smart-appearance";
import { APPEARANCE_SWATCHES, blockThumbnail } from "@/lib/site/block-thumbnails";
import type { RenderContext } from "@/lib/site/render-context";

type EditablePage = {
  id: string;
  title: string;
  slug: string;
  status: "draft" | "published";
  isHome: boolean;
  showInNav: boolean;
  navLabel: string;
  navOrder: number;
  seoTitle: string;
  seoDescription: string;
  blocks: Block[];
  background: PageBackground;
};

function seedBlocks(blocks: Block[]): Block[] {
  return blocks.map((b, i) => {
    if (isCanvasWidget(b.type)) {
      return { ...b, props: seedLayoutProps(b.props, i) };
    }
    const props = seedLayoutDefaults(b.props, i);
    props._position = "stack";
    return { ...b, props };
  });
}

function blocksForSave(blocks: Block[]): Block[] {
  return blocks.map((b, i) => ({ ...b, props: normalizeBlockLayoutForSave(b, i) }));
}

export default function PageEditor({
  page,
  sitePages = [],
  studioPages = [],
  studioName,
  logoUrl,
  portalLabel = "Portal",
  livePreviewUrl,
  previewContext,
}: {
  page: EditablePage;
  sitePages?: SitePageLink[];
  studioPages?: StudioPageNavSource[];
  studioName: string;
  logoUrl: string | null;
  portalLabel?: string;
  livePreviewUrl: string;
  previewContext: RenderContext;
}) {
  const t = useTranslations("site.editor");
  const tSite = useTranslations("site");
  const tManager = useTranslations("site.manager");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const initialSnapshot = useMemo(
    () => ({
      blocks: seedBlocks(page.blocks),
      background: normalizePageBackground(page.background),
    }),
    [page.blocks, page.background],
  );

  const editor = useEditorHistory(initialSnapshot);
  const { blocks, background, apply, checkpoint, undo, redo, resetHistory, canUndo, canRedo } = editor;

  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    page.blocks[0]?.id ? [page.blocks[0].id] : [],
  );
  const [backgroundSelected, setBackgroundSelected] = useState(false);
  const [panel, setPanel] = useState<"none" | "edit" | "settings" | "elements" | "background">("edit");
  const [previewMode, setPreviewMode] = useState(false);
  const [status, setStatus] = useState<"draft" | "published">(page.status);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const layoutGesturing = useRef(false);

  const [meta, setMeta] = useState({
    title: page.title,
    slug: page.slug,
    navLabel: page.navLabel,
    showInNav: page.showInNav,
    navOrder: page.navOrder,
    seoTitle: page.seoTitle,
    seoDescription: page.seoDescription,
  });

  const selected = useMemo(
    () => blocks.find((b) => b.id === selectedIds[selectedIds.length - 1]) ?? null,
    [blocks, selectedIds],
  );

  const navPages = useMemo(
    () =>
      studioPages.map((p) =>
        p.id === page.id
          ? {
              ...p,
              title: meta.title || p.title,
              showInNav: meta.showInNav,
              navLabel: meta.navLabel || null,
              navOrder: meta.navOrder,
            }
          : p,
      ),
    [studioPages, page.id, meta.title, meta.showInNav, meta.navLabel, meta.navOrder],
  );

  const navLinks = useMemo(() => buildStudioNavLinks(navPages), [navPages]);

  const touch = () => setDirty(true);

  const commit = (next: { blocks?: Block[]; background?: PageBackground }, record = true) => {
    apply(
      {
        blocks: next.blocks ?? blocks,
        background: next.background ?? background,
      },
      record,
    );
    touch();
  };

  const selectedIdsKey = selectedIds.join(",");

  useEffect(() => {
    if (selectedIds.length) {
      setBackgroundSelected(false);
      setPanel((p) => (p === "settings" || p === "background" ? p : "edit"));
    }
  }, [selectedIdsKey, selectedIds.length]);

  const handleSelect = (id: string | null, opts?: { shift?: boolean }) => {
    if (!id) {
      setSelectedIds([]);
      return;
    }
    setBackgroundSelected(false);
    if (opts?.shift) {
      setSelectedIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
      );
    } else {
      setSelectedIds([id]);
    }
  };

  // Keyboard shortcuts bind to editor helpers defined below in this component.
  useEffect(() => {
    const isEditable = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    };

    const onKey = (e: KeyboardEvent) => {
      if (isEditable(e.target)) return;
      const col = 100 / CANVAS_GRID.columns;
      const targets = selectedIds.length ? selectedIds : [];

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        if (undo()) touch();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
        e.preventDefault();
        if (redo()) touch();
        return;
      }

      if (!targets.length) return;
      const ids = targets;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        nudgeBlocks(ids, { dx: -col });
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        nudgeBlocks(ids, { dx: col });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        nudgeBlocks(ids, { dy: -CANVAS_GRID.rowHeight });
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        nudgeBlocks(ids, { dy: CANVAS_GRID.rowHeight });
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteBlocks(ids);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateBlock(ids[ids.length - 1]);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- editor helpers below close over latest blocks/background
  }, [selectedIds, blocks, background]);

  const nudgeBlocks = (ids: string[], { dx, dy }: { dx?: number; dy?: number }) => {
    commit({
      blocks: blocks.map((b) => {
        if (!ids.includes(b.id) || !isCanvasWidget(b.type)) return b;
        const props: Record<string, PropValue> = { ...b.props, _position: "freeform" };
        if (dx !== undefined) props._x = snapGridX(num(b.props, "_x", 0) + dx);
        if (dy !== undefined) props._y = snapGridY(num(b.props, "_y", 0) + dy);
        return { ...b, props };
      }),
    });
  };

  const alignBlock = (align: "left" | "center" | "right") => {
    if (!selected) return;
    const w = num(selected.props, "_width", snapGridWidth(33));
    updateBlockLayout([selected.id], { _x: snapGridX(canvasAlignX(w, align)) });
  };

  const rotateBlock = (delta: number) => {
    if (!selected) return;
    const next = snapRotation(num(selected.props, "_rotate", 0) + delta);
    setProp("_rotate", next);
  };

  const layerBlock = (dir: 1 | -1) => {
    if (!selected) return;
    setProp("_zIndex", Math.max(1, num(selected.props, "_zIndex", 1) + dir));
  };

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const confirmLeave = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!dirty) return;
    // preventDefault must be synchronous, so block the navigation, ask, then
    // resume it ourselves if the user confirms.
    const href = e.currentTarget.getAttribute("href");
    e.preventDefault();
    void confirmDialog({ title: t("confirmLeave"), destructive: true }).then((confirmed) => {
      if (confirmed && href) router.push(href);
    });
  };

  const addBlockAt = (type: BlockType, index: number, at?: { x: number; y: number }) => {
    let b = applySmartAppearance(makeBlock(type), blocks);

    if (isCanvasWidget(type)) {
      let width = snapGridWidth(70);
      if (type === "heading" || type === "paragraph" || type === "linkBlock") width = snapGridWidth(50);
      if (type === "imageBlock") width = snapGridWidth(40);
      if (type === "spacer") width = snapGridWidth(100);
      if (type === "divider") width = snapGridWidth(60);

      const y = at?.y ?? nextCanvasY(blocks);
      const x = at?.x !== undefined ? snapGridX(at.x) : snapGridX(5);
      Object.assign(b.props, freeformDefaultsAt(y, width));
      b.props._x = x;
      b.props._zIndex = blocks.length + 1;
      if (type === "spacer") {
        b.props._height = snapGridHeight(num(b.props, "height", 80));
      }
    } else {
      Object.assign(b.props, seedLayoutDefaults(b.props, index));
      b.props._position = "stack";
    }

    const next = [...blocks];
    next.splice(index, 0, b);
    commit({ blocks: next });
    setSelectedIds([b.id]);
    setPanel("edit");
  };

  const onLayoutGestureStart = () => {
    if (!layoutGesturing.current) {
      layoutGesturing.current = true;
      checkpoint();
    }
  };

  const onLayoutGestureEnd = () => {
    layoutGesturing.current = false;
    touch();
  };

  const updateBlockLayout = (
    ids: string[],
    patch: LayoutPatch | ((props: Block["props"]) => LayoutPatch),
  ) => {
    const idSet = new Set(ids);
    commit(
      {
        blocks: blocks.map((b) => {
          if (!idSet.has(b.id)) return b;
          const p = typeof patch === "function" ? patch(b.props) : patch;
          const snapped = snapLayoutPatch(p);
          const merged = { ...b.props, ...snapped, _position: "freeform" as const };
          if (snapped._width !== undefined && snapped._x === undefined) {
            merged._x = Math.min(num(merged, "_x", 0), 100 - snapped._width);
          }
          return { ...b, props: merged };
        }),
      },
      false,
    );
  };

  const deleteBlocks = (ids: string[]) => {
    const idSet = new Set(ids);
    commit({ blocks: blocks.filter((b) => !idSet.has(b.id)) });
    setSelectedIds((prev) => prev.filter((id) => !idSet.has(id)));
  };

  const deleteBlock = (id: string) => deleteBlocks([id]);

  const duplicateBlock = (id: string) => {
    const idx = blocks.findIndex((b) => b.id === id);
    if (idx === -1) return;
    const copy = cloneBlock(blocks[idx]);
    copy.props._position = "freeform";
    copy.props._y = snapGridY(num(copy.props, "_y", 0) + CANVAS_GRID.rowHeight);
    copy.props._x = snapGridX(num(copy.props, "_x", 0) + snapGridWidth(8));
    copy.props._zIndex = blocks.length + 1;
    const next = [...blocks];
    next.splice(idx + 1, 0, copy);
    commit({ blocks: next });
    setSelectedIds([copy.id]);
  };

  const setProp = (key: string, value: PropValue) => {
    if (!selected) return;
    const isText = key === "body" || key === "text" || key === "heading" || key === "subheading";
    commit({
      blocks: blocks.map((b) => {
        if (b.id !== selected.id) return b;
        let v = value;
        if (key === "_x" && typeof v === "number") v = snapGridX(v);
        if (key === "_y" && typeof v === "number") v = snapGridY(v);
        if (key === "_width" && typeof v === "number") v = snapGridWidth(v);
        if (key === "_height" && typeof v === "number") v = v > 0 ? snapGridHeight(v) : 0;
        if (key === "_rotate" && typeof v === "number") v = snapRotation(v);
        if (key === "height" && typeof v === "number") v = snapGridHeight(v);
        const props = { ...b.props, [key]: v };
        if (key === "autoplay" && value === true) props.muted = true;
        if (["_x", "_y", "_width", "_height"].includes(key)) props._position = "freeform";
        if (key === "height" && b.type === "spacer") props._height = snapGridHeight(Number(v));
        return { ...b, props };
      }),
    }, !isText);
  };

  const getList = (key: string): BlockItem[] => {
    const v = selected?.props[key];
    return Array.isArray(v) ? v : [];
  };

  const updateItem = (key: string, index: number, itemKey: string, value: string) => {
    const next = getList(key).map((it, i) => (i === index ? { ...it, [itemKey]: value } : it));
    setProp(key, next);
  };

  const addItem = (key: string, def: BlockItem) => setProp(key, [...getList(key), { ...def }]);
  const removeItem = (key: string, index: number) => setProp(key, getList(key).filter((_, i) => i !== index));

  const moveItem = (key: string, index: number, dir: -1 | 1) => {
    const arr = [...getList(key)];
    const j = index + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[index], arr[j]] = [arr[j], arr[index]];
    setProp(key, arr);
  };

  const save = () =>
    startTransition(async () => {
      setMsg(null);
      const metaRes = await updatePageMeta({ pageId: page.id, ...meta });
      if (!metaRes.ok) return setMsg(metaRes.error);
      const res = await savePageBlocks(page.id, blocksForSave(blocks), background);
      if (!res.ok) return setMsg(res.error);
      setDirty(false);
      resetHistory({ blocks, background });
      setMsg(t("saved"));
      router.refresh();
      setTimeout(() => setMsg(null), 2000);
    });

  const saveAndPublish = () =>
    startTransition(async () => {
      setMsg(null);
      const metaRes = await updatePageMeta({ pageId: page.id, ...meta });
      if (!metaRes.ok) return setMsg(metaRes.error);
      const blkRes = await savePageBlocks(page.id, blocksForSave(blocks), background);
      if (!blkRes.ok) return setMsg(blkRes.error);
      const pubRes = await publishPage(page.id);
      if (!pubRes.ok) return setMsg(pubRes.error);
      setStatus("published");
      setDirty(false);
      resetHistory({ blocks, background });
      setMsg(t("published"));
      router.refresh();
      setTimeout(() => setMsg(null), 2000);
    });

  const draftPreviewHref = `/site-preview/${page.id}`;
  const previewTitle = t("previewDraftTitle");
  const showPanel = panel !== "none";

  return (
    <div className="flex h-[100dvh] flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-[--hair] bg-surface px-5 py-3">
        <div className="flex items-center gap-3">
          <Link href="/portal/admin/site" onClick={confirmLeave} className="text-sm text-muted hover:text-ink">
            {t("backToPages")}
          </Link>
          <span className="font-semibold text-ink">{meta.title || t("untitled")}</span>
          <span
            className="rounded-full px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider"
            style={{
              background: status === "published" ? "rgba(34,197,94,.15)" : "var(--hair)",
              color: status === "published" ? "#22c55e" : "var(--muted)",
            }}
          >
            {status === "published" ? tManager("statusPublished") : tManager("statusDraft")}
          </span>
          {dirty && <span className="text-xs text-amber-500">{t("unsavedChanges")}</span>}
        </div>
        <div className="flex items-center gap-2">
          {msg && (
            <span className="text-xs" style={{ color: msg === t("saved") || msg === t("published") ? "var(--brand-hot)" : "#ef4444" }}>
              {msg}
            </span>
          )}
          <button
            type="button"
            disabled={!canUndo}
            onClick={() => {
              if (undo()) touch();
            }}
            title={t("undoTitle")}
            className="rounded-full border border-[--hair] px-3 py-1.5 text-sm text-ink transition hover:bg-base disabled:opacity-40"
          >
            ↶
          </button>
          <button
            type="button"
            disabled={!canRedo}
            onClick={() => {
              if (redo()) touch();
            }}
            title={t("redoTitle")}
            className="rounded-full border border-[--hair] px-3 py-1.5 text-sm text-ink transition hover:bg-base disabled:opacity-40"
          >
            ↷
          </button>
          <button
            type="button"
            onClick={() => setPanel((p) => (p === "elements" ? "none" : "elements"))}
            className={`rounded-full border px-4 py-1.5 text-sm transition ${
              panel === "elements" ? "border-brand bg-brand/10 text-brand" : "border-[--hair] text-ink hover:bg-base"
            }`}
          >
            {t("add")}
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedIds([]);
              setBackgroundSelected(true);
              setPanel("background");
            }}
            className={`rounded-full border px-4 py-1.5 text-sm transition ${
              panel === "background" ? "border-brand bg-brand/10 text-brand" : "border-[--hair] text-ink hover:bg-base"
            }`}
          >
            {t("background")}
          </button>
          <button
            type="button"
            onClick={() => setPanel((p) => (p === "settings" ? "none" : "settings"))}
            className={`rounded-full border px-4 py-1.5 text-sm transition ${
              panel === "settings" ? "border-brand bg-brand/10 text-brand" : "border-[--hair] text-ink hover:bg-base"
            }`}
          >
            {t("settings")}
          </button>
          <button
            type="button"
            onClick={() => {
              setPreviewMode((on) => {
                const next = !on;
                if (next) {
                  setPanel("none");
                  setSelectedIds([]);
                  setBackgroundSelected(false);
                }
                return next;
              });
            }}
            className={`rounded-full border px-4 py-1.5 text-sm transition ${
              previewMode ? "border-brand bg-brand/10 text-brand" : "border-[--hair] text-ink hover:bg-base"
            }`}
          >
            {previewMode ? t("exitPreview") : t("previewMode")}
          </button>
          <a
            href={draftPreviewHref}
            target="_blank"
            rel="noreferrer noopener"
            title={previewTitle}
            className="rounded-full border border-[--hair] px-4 py-1.5 text-sm text-ink transition hover:bg-base"
          >
            {t("preview")}
          </a>
          {status === "published" && (
            <a
              href={livePreviewUrl}
              target="_blank"
              rel="noreferrer noopener"
              title={t("previewLiveTitle", { url: livePreviewUrl.replace(/^https?:\/\//, "") })}
              className="rounded-full border border-[--hair] px-4 py-1.5 text-sm text-ink transition hover:bg-base"
            >
              {t("openLiveSite")}
            </a>
          )}
          <button onClick={save} disabled={pending} className="rounded-full border border-[--hair] px-4 py-1.5 text-sm font-medium text-ink transition hover:bg-base disabled:opacity-50">
            {pending ? t("saving") : t("saveDraft")}
          </button>
          <button onClick={saveAndPublish} disabled={pending} className="rounded-full bg-brand px-4 py-1.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50">
            {t("publish")}
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1 overflow-y-auto">
          <EditorCanvas
            blocks={blocks}
            background={background}
            backgroundSelected={backgroundSelected}
            selectedIds={selectedIds}
            previewMode={previewMode}
            studioName={studioName}
            logoUrl={logoUrl}
            nav={navLinks}
            portalLabel={portalLabel}
            previewContext={previewContext}
            currentPageId={page.id}
            navPages={navPages}
            onSelect={(id, opts) => {
              handleSelect(id, opts);
            }}
            onSelectBackground={() => {
              setSelectedIds([]);
              setBackgroundSelected(true);
              setPanel("background");
            }}
            onAddAt={addBlockAt}
            onDelete={deleteBlock}
            onDuplicate={duplicateBlock}
            onUpdateLayout={updateBlockLayout}
            onLayoutGestureStart={onLayoutGestureStart}
            onLayoutGestureEnd={onLayoutGestureEnd}
          />
        </main>

        {showPanel && !previewMode && (
          <aside className="flex w-[340px] shrink-0 flex-col overflow-y-auto border-l border-[--hair] bg-base">
            {panel === "settings" ? (
              <PageSettings meta={meta} isHome={page.isHome} onChange={(m) => { setMeta(m); touch(); }} />
            ) : panel === "background" ? (
              <BackgroundEditor
                background={background}
                onChange={(bg) => {
                  commit({ background: bg });
                }}
              />
            ) : panel === "elements" ? (
              <ElementsPanel onAdd={(type) => addBlockAt(type, blocks.length)} />
            ) : selected ? (
              <Inspector
                key={selected.id}
                block={selected}
                selectionCount={selectedIds.length}
                fields={BLOCK_MAP[selected.type].fields}
                hasAppearance={!!BLOCK_MAP[selected.type].appearance}
                sitePages={sitePages}
                onSet={setProp}
                onAlign={alignBlock}
                onRotate={rotateBlock}
                onLayer={layerBlock}
                list={{ get: getList, update: updateItem, add: addItem, remove: removeItem, move: moveItem }}
              />
            ) : selectedIds.length > 1 ? (
              <div className="space-y-4 p-4">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted">
                  {t("elementsSelected", { count: selectedIds.length })}
                </h3>
                <p className="text-sm text-muted">{t("multiSelectHint")}</p>
                <button
                  type="button"
                  onClick={() => deleteBlocks(selectedIds)}
                  className="w-full rounded-lg border border-red-500/40 px-3 py-2 text-sm text-red-500 hover:bg-red-500/10"
                >
                  {t("deleteSelected")}
                </button>
              </div>
            ) : (
              <div className="p-6 text-center text-sm text-muted">
                <p>{t("clickToEdit")}</p>
                <p className="mt-2 text-xs">{t("rightClickHint")}</p>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

function BlockElementThumb({ type }: { type: BlockType }) {
  const spec = blockThumbnail(type);
  return (
    <div className="relative h-14 overflow-hidden border-b border-[--hair]/60" style={{ background: spec.headerBg }}>
      <div className="absolute inset-0 flex flex-col justify-center gap-1 px-2.5">
        {spec.bars.map((bar, i) => (
          <div
            key={i}
            className="h-1.5 rounded-sm"
            style={{ width: `${bar.w}%`, background: spec.accent, opacity: bar.o }}
          />
        ))}
      </div>
    </div>
  );
}

function ElementsPanel({ onAdd }: { onAdd: (type: BlockType) => void }) {
  const t = useTranslations("site.editor");
  const tSite = useTranslations("site");
  const basic: BlockType[] = ["heading", "paragraph", "imageBlock", "linkBlock", "spacer", "divider", "videoBlock"];
  const sections = BLOCK_LIBRARY.filter((d) => !basic.includes(d.type) && ["hero", "pageHeader", "richText", "cta"].includes(d.type));
  const content = BLOCK_LIBRARY.filter((d) => !basic.includes(d.type) && !sections.some((s) => s.type === d.type));

  const renderGroup = (title: string, defs: typeof BLOCK_LIBRARY) => (
    <div className="space-y-2">
      <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted">{title}</p>
      <div className="grid grid-cols-2 gap-2">
        {defs.map((def) => (
          <button
            key={def.type}
            type="button"
            onClick={() => onAdd(def.type)}
            title={def.description}
            className="group overflow-hidden rounded-xl border border-[--hair] bg-surface text-left transition hover:border-brand hover:shadow-sm"
          >
            <BlockElementThumb type={def.type} />
            <span className="block px-2.5 py-2 text-xs font-medium text-ink">{blockLabel(tSite, def.type)}</span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-5 p-4">
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted">{t("addElement")}</h2>
        <p className="mt-1 text-xs text-muted">{t("addElementHint")}</p>
      </div>
      {renderGroup(
        t("groupBasic"),
        BLOCK_LIBRARY.filter((d) => basic.includes(d.type)),
      )}
      {renderGroup(t("groupSections"), sections)}
      {renderGroup(t("groupStudioContent"), content)}
    </div>
  );
}

type ListOps = {
  get: (key: string) => BlockItem[];
  update: (key: string, index: number, itemKey: string, value: string) => void;
  add: (key: string, def: BlockItem) => void;
  remove: (key: string, index: number) => void;
  move: (key: string, index: number, dir: -1 | 1) => void;
};

function BlockQuickActions({
  onAlign,
  onRotate,
  onLayer,
}: {
  onAlign: (a: "left" | "center" | "right") => void;
  onRotate: (delta: number) => void;
  onLayer: (dir: 1 | -1) => void;
}) {
  const t = useTranslations("site.editor");
  const btn =
    "rounded-md border border-[--hair] bg-surface px-2 py-1 text-[0.65rem] font-medium text-ink transition hover:border-brand hover:text-brand";
  return (
    <div className="space-y-2 rounded-xl border border-[--hair] bg-base p-3">
      <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted">{t("quickActions")}</p>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className={btn} onClick={() => onAlign("left")} title={t("alignLeft")}>
          {t("alignLeft")}
        </button>
        <button type="button" className={btn} onClick={() => onAlign("center")} title={t("alignCenter")}>
          {t("alignCenter")}
        </button>
        <button type="button" className={btn} onClick={() => onAlign("right")} title={t("alignRight")}>
          {t("alignRight")}
        </button>
        <button type="button" className={btn} onClick={() => onRotate(-15)} title={t("rotateMinus")}>
          {t("rotateMinus")}
        </button>
        <button type="button" className={btn} onClick={() => onRotate(15)} title={t("rotatePlus")}>
          {t("rotatePlus")}
        </button>
        <button type="button" className={btn} onClick={() => onLayer(1)} title={t("layerUp")}>
          {t("layerUp")}
        </button>
        <button type="button" className={btn} onClick={() => onLayer(-1)} title={t("layerDown")}>
          {t("layerDown")}
        </button>
      </div>
      <p className="text-[0.6rem] text-muted">{t("keyboardHint")}</p>
    </div>
  );
}

function Inspector({
  block,
  selectionCount,
  fields,
  hasAppearance,
  sitePages,
  onSet,
  onAlign,
  onRotate,
  onLayer,
  list,
}: {
  block: Block;
  selectionCount: number;
  fields: FieldDef[];
  hasAppearance: boolean;
  sitePages: SitePageLink[];
  onSet: (key: string, value: PropValue) => void;
  onAlign: (a: "left" | "center" | "right") => void;
  onRotate: (delta: number) => void;
  onLayer: (dir: 1 | -1) => void;
  list: ListOps;
}) {
  const t = useTranslations("site.editor");
  const tSite = useTranslations("site");
  const visibleFields = fields.filter((f) => {
    if (f.key === "buttonStyle" && block.type === "linkBlock" && str(block.props, "variant") === "text") {
      return false;
    }
    if (f.key === "buttonSize" && block.type === "linkBlock" && str(block.props, "variant") === "text") {
      return false;
    }
    if (f.key === "customColor" && str(block.props, "textColor") !== "custom") {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-4 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted">
        {blockLabel(tSite, block.type)}
        {selectionCount > 1 && (
          <span className="ml-2 font-normal normal-case text-muted">
            {t("selectedMore", { count: selectionCount - 1 })}
          </span>
        )}
      </h3>
      <BlockQuickActions onAlign={onAlign} onRotate={onRotate} onLayer={onLayer} />
      {visibleFields.map((f) =>
        f.type === "list" ? (
          <ListField key={f.key} field={f} list={list} />
        ) : (
          <ScalarField key={f.key} field={f} value={block.props[f.key]} onSet={onSet} sitePages={sitePages} />
        ),
      )}
      {hasAppearance && (
        <>
          <hr className="border-[--hair]" />
          <h4 className="text-xs font-semibold uppercase tracking-widest text-muted">{t("sectionAppearance")}</h4>
          {APPEARANCE_FIELDS.map((f) => (
            <ScalarField key={f.key} field={f} value={block.props[f.key]} onSet={onSet} sitePages={sitePages} />
          ))}
        </>
      )}
      <hr className="border-[--hair]" />
      <h4 className="text-xs font-semibold uppercase tracking-widest text-muted">{t("frameEffects")}</h4>
      {STYLE_FIELDS.map((f) => (
        <ScalarField key={f.key} field={f} value={block.props[f.key]} onSet={onSet} sitePages={sitePages} />
      ))}
      <hr className="border-[--hair]" />
      <h4 className="text-xs font-semibold uppercase tracking-widest text-muted">{t("positionSize")}</h4>
      {LAYOUT_FIELDS.map((f) => (
        <ScalarField key={f.key} field={f} value={block.props[f.key]} onSet={onSet} sitePages={sitePages} />
      ))}
    </div>
  );
}

function AppearanceSwatchSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {options.map((opt) => {
        const swatch = APPEARANCE_SWATCHES[opt.value];
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`flex flex-col items-center gap-1.5 rounded-lg border p-2 transition ${
              selected ? "border-brand ring-2 ring-brand/25" : "border-[--hair] hover:border-brand/50"
            }`}
          >
            <span
              className="h-8 w-full rounded-md border border-[--hair]/60 shadow-inner"
              style={swatch?.style ?? { background: "var(--base)" }}
            />
            <span className="text-[0.65rem] font-medium leading-tight text-ink">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function ScalarField({
  field,
  value,
  onSet,
  sitePages = [],
}: {
  field: FieldDef;
  value: PropValue | undefined;
  onSet: (key: string, value: PropValue) => void;
  sitePages?: SitePageLink[];
}) {
  const strVal = typeof value === "string" ? value : value == null ? "" : String(value);
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-ink">{field.label}</span>
      {field.type === "image" ? (
        <ImageInput value={strVal} onChange={(url) => onSet(field.key, url)} />
      ) : field.type === "video" ? (
        <VideoInput value={strVal} onChange={(url) => onSet(field.key, url)} />
      ) : isLinkField(field.key) ? (
        <LinkPicker value={strVal} pages={sitePages} onChange={(href) => onSet(field.key, href)} />
      ) : field.type === "select" && (field.key === "_bg" || field.key === "_fill") ? (
        <AppearanceSwatchSelect
          value={strVal}
          options={field.options ?? []}
          onChange={(v) => onSet(field.key, v)}
        />
      ) : field.type === "select" ? (
        <select value={strVal} onChange={(e) => onSet(field.key, e.target.value)} className="field-premium">
          {(field.options ?? []).map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      ) : field.type === "textarea" && field.toolbar ? (
        <RichTextArea value={strVal} placeholder={field.placeholder} onChange={(v) => onSet(field.key, v)} />
      ) : field.type === "textarea" ? (
        <textarea value={strVal} rows={4} placeholder={field.placeholder} onChange={(e) => onSet(field.key, e.target.value)} className="field-premium" />
      ) : field.type === "color" ? (
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={/^#[0-9a-f]{6}$/i.test(strVal) ? strVal : "#6B66C9"}
            onChange={(e) => onSet(field.key, e.target.value)}
            className="h-9 w-12 cursor-pointer rounded border border-[--hair] bg-base"
          />
          <input
            type="text"
            value={strVal}
            placeholder="#6B66C9"
            onChange={(e) => onSet(field.key, e.target.value)}
            className="field-premium flex-1"
          />
        </div>
      ) : field.type === "boolean" ? (
        <input type="checkbox" checked={value === true} onChange={(e) => onSet(field.key, e.target.checked)} className="h-4 w-4 accent-[--brand]" />
      ) : field.type === "number" ? (
        <input type="number" value={strVal} onChange={(e) => onSet(field.key, e.target.value === "" ? 0 : Number(e.target.value))} className="field-premium" />
      ) : (
        <input type="text" value={strVal} placeholder={field.placeholder} onChange={(e) => onSet(field.key, e.target.value)} className="field-premium" />
      )}
      {field.help && <span className="mt-1 block text-xs text-muted">{field.help}</span>}
    </label>
  );
}

function RichTextArea({ value, placeholder, onChange }: { value: string; placeholder?: string; onChange: (v: string) => void }) {
  const t = useTranslations("site.editor");
  const ref = useRef<HTMLTextAreaElement>(null);
  const pendingSel = useRef<[number, number] | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (pendingSel.current && el) {
      const [s, e] = pendingSel.current;
      el.focus();
      el.setSelectionRange(s, e);
      pendingSel.current = null;
    }
  });

  const apply = (next: string, selStart: number, selEnd: number) => {
    pendingSel.current = [selStart, selEnd];
    onChange(next);
  };

  const wrap = (token: string, fallback: string) => {
    const el = ref.current;
    if (!el) return;
    const s = el.selectionStart;
    const e = el.selectionEnd;
    const sel = value.slice(s, e) || fallback;
    const next = value.slice(0, s) + token + sel + token + value.slice(e);
    apply(next, s + token.length, s + token.length + sel.length);
  };

  const insertLink = () => {
    const el = ref.current;
    if (!el) return;
    const s = el.selectionStart;
    const e = el.selectionEnd;
    const text = value.slice(s, e) || t("linkText");
    const url = "https://";
    const inserted = `[${text}](${url})`;
    const next = value.slice(0, s) + inserted + value.slice(e);
    const urlStart = s + 1 + text.length + 2;
    apply(next, urlStart, urlStart + url.length);
  };

  const btn = "rounded-md border border-[--hair] bg-surface px-2 py-1 text-xs font-medium text-ink transition hover:border-brand hover:text-brand";

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => wrap("**", t("boldText"))} title={t("boldTitle")} className={`${btn} font-bold`}>B</button>
        <button type="button" onClick={insertLink} title={t("insertLinkTitle")} className={btn}>{t("linkButton")}</button>
      </div>
      <textarea ref={ref} value={value} rows={6} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="field-premium font-mono text-xs leading-relaxed" />
    </div>
  );
}

function ListField({ field, list }: { field: FieldDef; list: ListOps }) {
  const t = useTranslations("site.editor");
  const items = list.get(field.key);
  const itemFields = field.itemFields ?? [];
  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium text-ink">{field.label}</span>
      {items.map((item, i) => (
        <div key={i} className="space-y-2 rounded-lg border border-[--hair] bg-surface p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">{t("itemN", { n: i + 1 })}</span>
            <span className="flex items-center gap-1">
              <button type="button" onClick={() => list.move(field.key, i, -1)} className="px-1 text-xs text-muted hover:text-ink">↑</button>
              <button type="button" onClick={() => list.move(field.key, i, 1)} className="px-1 text-xs text-muted hover:text-ink">↓</button>
              <button type="button" onClick={() => list.remove(field.key, i)} className="px-1 text-xs text-red-500">✕</button>
            </span>
          </div>
          {itemFields.map((itf) => (
            <label key={itf.key} className="block text-xs">
              <span className="mb-0.5 block text-muted">{itf.label}</span>
              {itf.type === "image" ? (
                <ImageInput value={item[itf.key] ?? ""} onChange={(url) => list.update(field.key, i, itf.key, url)} />
              ) : itf.type === "textarea" ? (
                <textarea rows={2} value={item[itf.key] ?? ""} onChange={(e) => list.update(field.key, i, itf.key, e.target.value)} className="field-premium" />
              ) : (
                <input type="text" value={item[itf.key] ?? ""} onChange={(e) => list.update(field.key, i, itf.key, e.target.value)} className="field-premium" />
              )}
            </label>
          ))}
        </div>
      ))}
      <button type="button" onClick={() => list.add(field.key, field.itemDefault ?? {})} className="w-full rounded-lg border border-dashed border-[--hair] py-2 text-xs text-muted transition hover:border-brand hover:text-ink">
        + {t("addItem")}
      </button>
    </div>
  );
}

type Meta = {
  title: string;
  slug: string;
  navLabel: string;
  showInNav: boolean;
  navOrder: number;
  seoTitle: string;
  seoDescription: string;
};

function PageSettings({ meta, isHome, onChange }: { meta: Meta; isHome: boolean; onChange: (m: Meta) => void }) {
  const t = useTranslations("site.editor");
  const set = <K extends keyof Meta>(key: K, value: Meta[K]) => onChange({ ...meta, [key]: value });
  return (
    <div className="space-y-4 p-4">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-muted">{t("pageSettings")}</h2>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-ink">{t("pageTitle")}</span>
        <input value={meta.title} onChange={(e) => set("title", e.target.value)} className="field-premium" />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-ink">{t("urlSlug")}</span>
        <input value={isHome ? "home" : meta.slug} disabled={isHome} onChange={(e) => set("slug", e.target.value)} className="field-premium disabled:opacity-60" />
        <span className="mt-1 block text-xs text-muted">
          {isHome ? t("homepageSlugHint") : t("publicUrlHint", { slug: meta.slug })}
        </span>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={meta.showInNav} onChange={(e) => set("showInNav", e.target.checked)} className="h-4 w-4 accent-[--brand]" />
        <span className="text-ink">{t("showInNav")}</span>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-ink">{t("navLabel")}</span>
        <input value={meta.navLabel} onChange={(e) => set("navLabel", e.target.value)} className="field-premium" />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-ink">{t("navOrder")}</span>
        <input type="number" value={meta.navOrder} onChange={(e) => set("navOrder", e.target.value === "" ? 0 : Number(e.target.value))} className="field-premium" />
      </label>
      <hr className="border-[--hair]" />
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-ink">{t("seoTitle")}</span>
        <input value={meta.seoTitle} onChange={(e) => set("seoTitle", e.target.value)} className="field-premium" />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-ink">{t("seoDescription")}</span>
        <textarea rows={3} value={meta.seoDescription} onChange={(e) => set("seoDescription", e.target.value)} className="field-premium" />
      </label>
    </div>
  );
}
