// ============================================================================
//  lib/builder/store.ts — Zustand + Immer builder store (deliverable #2).
//
//  PERFORMANCE STRATEGY (why this prevents canvas lag):
//
//   • Normalized graph. The document keeps a flat `nodes` map. Mutating one node
//     is an O(1) write. Immer gives structural sharing, so producing the next
//     state only allocates new objects along the mutated path — every UNCHANGED
//     node keeps its object identity.
//
//   • Slice subscriptions. Each <NodeView id> selects `s.doc.nodes[id]`. Because
//     unchanged nodes keep identity, Object.is equality means dragging node A
//     re-renders ONLY node A's view and the overlays bound to A — not the tree.
//
//   • Transactions. A drag or a text-typing session calls beginTx() once, then
//     fires many transient mutations (no history push), then endTx() records a
//     SINGLE undo entry. So rapid pointer moves never thrash the history stack
//     or trigger snapshot churn.
//
//   • History via reference snapshots. Undo/redo swap whole-document references.
//     Thanks to structural sharing each snapshot is cheap (shared sub-trees), so
//     a 100-deep history is small.
// ============================================================================

"use client";

import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import {
  type BreakpointId,
  type BuilderDocument,
  type BuilderNode,
  type CmsBinding,
  type CmsField,
  type PageMeta,
  type AnimationSpec,
  type InteractionState,
  type NodeId,
  type RichText,
  type StyleSet,
  type ThemeTokens,
} from "./schema";
import { COMPONENT_LIBRARY, newId, type ComponentDef } from "./defaults";
import {
  attachSubtree,
  cloneSubtree,
  createEmptyDocument,
  moveNode as moveNodeOp,
  removeSubtree,
  reorderChild,
} from "./document";

function slugifyLocal(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export type EditorMode = "design" | "preview";

interface StyleTarget {
  /** Apply to a breakpoint override layer (default: active breakpoint). */
  breakpoint?: BreakpointId;
  /** Apply to an interaction-state layer instead of a style layer. */
  state?: InteractionState;
  /** Skip the history push (used during drags). */
  transient?: boolean;
}

export interface BuilderState {
  doc: BuilderDocument;

  // view / selection
  selection: NodeId[];
  hoverId: NodeId | null;
  editingId: NodeId | null;
  breakpoint: BreakpointId;
  mode: EditorMode;
  zoom: number;
  dirty: boolean;

  // history
  past: BuilderDocument[];
  future: BuilderDocument[];
  _tx: BuilderDocument | null;

  // ── selection / view ───────────────────────────────────────────────
  select: (id: NodeId | null, additive?: boolean) => void;
  setHover: (id: NodeId | null) => void;
  setEditing: (id: NodeId | null) => void;
  setBreakpoint: (bp: BreakpointId) => void;
  setMode: (mode: EditorMode) => void;
  setZoom: (zoom: number) => void;

  // ── history / transactions ─────────────────────────────────────────
  undo: () => void;
  redo: () => void;
  beginTx: () => void;
  endTx: () => void;
  cancelTx: () => void;

  // ── node ops ───────────────────────────────────────────────────────
  insertComponent: (componentKey: string, parentId?: NodeId, index?: number) => NodeId | null;
  deleteNodes: (ids: NodeId[]) => void;
  duplicateNode: (id: NodeId) => NodeId | null;
  moveNode: (id: NodeId, parentId: NodeId, index?: number) => void;
  reorder: (parentId: NodeId, from: number, to: number) => void;
  renameNode: (id: NodeId, name: string) => void;
  toggleLock: (id: NodeId) => void;
  toggleHidden: (id: NodeId) => void;

  // ── style / content ────────────────────────────────────────────────
  updateStyle: (id: NodeId, patch: Partial<StyleSet>, target?: StyleTarget) => void;
  clearStyleKeys: (id: NodeId, keys: (keyof StyleSet)[], target?: StyleTarget) => void;
  setText: (id: NodeId, rich: RichText, transient?: boolean) => void;
  updateProps: (id: NodeId, patch: Record<string, unknown>) => void;
  setBinding: (id: NodeId, binding: CmsBinding | undefined) => void;
  setAnimation: (id: NodeId, anim: AnimationSpec | undefined) => void;

  // ── theme / doc ────────────────────────────────────────────────────
  setToken: (group: keyof ThemeTokens, key: string, value: string) => void;
  setCascade: (mode: "desktop-first" | "mobile-first") => void;
  loadDocument: (doc: BuilderDocument) => void;
  markSaved: () => void;

  // ── page meta / CMS collections (pillar 4) ───────────────────────────
  setMeta: (patch: Partial<PageMeta>) => void;
  addCollection: (name: string) => string;
  renameCollection: (collectionId: string, name: string) => void;
  deleteCollection: (collectionId: string) => void;
  addCmsField: (collectionId: string, field: Omit<CmsField, "key"> & { key?: string }) => void;
  updateCmsField: (collectionId: string, key: string, patch: Partial<CmsField>) => void;
  removeCmsField: (collectionId: string, key: string) => void;
  addCmsItem: (collectionId: string) => string;
  updateCmsItem: (collectionId: string, itemId: string, fields: Record<string, unknown>) => void;
  deleteCmsItem: (collectionId: string, itemId: string) => void;
}

const HISTORY_LIMIT = 100;

export const useBuilder = create<BuilderState>()(
  immer((set, get) => {
    /** Run an undoable mutation against the doc draft. */
    const edit = (recipe: (doc: BuilderDocument) => void, history = true) => {
      const prev = get().doc;
      set((s) => {
        if (history) {
          s.past.push(prev);
          if (s.past.length > HISTORY_LIMIT) s.past.shift();
          s.future = [];
        }
        recipe(s.doc);
        s.dirty = true;
      });
    };

    /** Locate the StyleSet layer a patch should target, creating it if needed. */
    const styleLayer = (
      node: BuilderNode,
      bp: BreakpointId,
      target?: StyleTarget,
    ): StyleSet => {
      if (target?.state) {
        node.states ??= {};
        node.states[target.state] ??= {};
        return node.states[target.state] as StyleSet;
      }
      const effBp = target?.breakpoint ?? bp;
      if (effBp === "desktop") return node.style;
      node.responsive ??= {};
      node.responsive[effBp] ??= {};
      return node.responsive[effBp] as StyleSet;
    };

    return {
      doc: createPlaceholderDoc(),
      selection: [],
      hoverId: null,
      editingId: null,
      breakpoint: "desktop",
      mode: "design",
      zoom: 1,
      dirty: false,
      past: [],
      future: [],
      _tx: null,

      // selection / view
      select: (id, additive) =>
        set((s) => {
          if (id === null) {
            s.selection = [];
          } else if (additive) {
            s.selection = s.selection.includes(id)
              ? s.selection.filter((n) => n !== id)
              : [...s.selection, id];
          } else {
            s.selection = [id];
          }
          if (s.editingId && !s.selection.includes(s.editingId)) s.editingId = null;
        }),
      setHover: (id) => set((s) => { s.hoverId = id; }),
      setEditing: (id) => {
        // Wrap a text-editing session in a single transaction so the whole
        // edit collapses to one undo step.
        const cur = get().editingId;
        if (id && !cur) get().beginTx();
        if (!id && cur) get().endTx();
        set((s) => { s.editingId = id; });
      },
      setBreakpoint: (bp) => set((s) => { s.breakpoint = bp; }),
      setMode: (mode) => set((s) => { s.mode = mode; if (mode === "preview") { s.selection = []; s.editingId = null; } }),
      setZoom: (zoom) => set((s) => { s.zoom = Math.max(0.25, Math.min(2, zoom)); }),

      // history / transactions
      undo: () => {
        const { past, doc, future, selection } = get();
        if (!past.length) return;
        const prev = past[past.length - 1];
        set({
          doc: prev,
          past: past.slice(0, -1),
          future: [...future, doc],
          selection: selection.filter((id) => prev.nodes[id]),
          editingId: null,
          dirty: true,
        });
      },
      redo: () => {
        const { past, doc, future, selection } = get();
        if (!future.length) return;
        const next = future[future.length - 1];
        set({
          doc: next,
          future: future.slice(0, -1),
          past: [...past, doc],
          selection: selection.filter((id) => next.nodes[id]),
          editingId: null,
          dirty: true,
        });
      },
      beginTx: () => { const snap = get().doc; set((s) => { s._tx = snap; }); },
      endTx: () =>
        set((s) => {
          if (s._tx && s._tx !== s.doc) {
            s.past.push(s._tx);
            if (s.past.length > HISTORY_LIMIT) s.past.shift();
            s.future = [];
          }
          s._tx = null;
        }),
      cancelTx: () => set((s) => { if (s._tx) { s.doc = s._tx; s._tx = null; } }),

      // node ops
      insertComponent: (componentKey, parentId, index) => {
        const def: ComponentDef | undefined = COMPONENT_LIBRARY.find((c) => c.key === componentKey);
        if (!def) return null;
        const parent = parentId ?? get().doc.rootId;
        const subtree = def.build();
        edit((doc) => { attachSubtree(doc, subtree, parent, index); });
        set((s) => { s.selection = [subtree.root.id]; });
        return subtree.root.id;
      },
      deleteNodes: (ids) => {
        edit((doc) => { for (const id of ids) removeSubtree(doc, id); });
        set((s) => { s.selection = s.selection.filter((id) => !ids.includes(id) && s.doc.nodes[id]); });
      },
      duplicateNode: (id) => {
        const clone = cloneSubtree(get().doc, id);
        if (!clone) return null;
        const node = get().doc.nodes[id];
        const parentId = node?.parent;
        if (!parentId) return null;
        const parent = get().doc.nodes[parentId]!;
        const idx = parent.children.indexOf(id) + 1;
        edit((doc) => { attachSubtree(doc, clone, parentId, idx); });
        set((s) => { s.selection = [clone.root.id]; });
        return clone.root.id;
      },
      moveNode: (id, parentId, index) => edit((doc) => { moveNodeOp(doc, id, parentId, index); }),
      reorder: (parentId, from, to) => edit((doc) => { reorderChild(doc, parentId, from, to); }),
      renameNode: (id, name) => edit((doc) => { const n = doc.nodes[id]; if (n) n.name = name; }),
      toggleLock: (id) => edit((doc) => { const n = doc.nodes[id]; if (n) n.locked = !n.locked; }),
      toggleHidden: (id) => edit((doc) => { const n = doc.nodes[id]; if (n) n.hidden = !n.hidden; }),

      // style / content
      updateStyle: (id, patch, target) => {
        const bp = get().breakpoint;
        edit((doc) => {
          const node = doc.nodes[id];
          if (!node) return;
          const layer = styleLayer(node, bp, target);
          for (const [k, v] of Object.entries(patch)) {
            if (v === undefined) delete (layer as Record<string, unknown>)[k];
            else (layer as Record<string, unknown>)[k] = v;
          }
        }, !target?.transient);
      },
      clearStyleKeys: (id, keys, target) => {
        const bp = get().breakpoint;
        edit((doc) => {
          const node = doc.nodes[id];
          if (!node) return;
          const layer = styleLayer(node, bp, target);
          for (const k of keys) delete (layer as Record<string, unknown>)[k];
        });
      },
      setText: (id, rich, transient) =>
        edit((doc) => { const n = doc.nodes[id]; if (n) n.props.rich = rich; }, !transient),
      updateProps: (id, patch) =>
        edit((doc) => { const n = doc.nodes[id]; if (n) Object.assign(n.props, patch); }),
      setBinding: (id, binding) =>
        edit((doc) => { const n = doc.nodes[id]; if (n) n.binding = binding; }),
      setAnimation: (id, anim) =>
        edit((doc) => { const n = doc.nodes[id]; if (n) n.animation = anim; }),

      // theme / doc
      setToken: (group, key, value) =>
        edit((doc) => {
          const bag = doc.theme[group];
          if (bag && typeof bag === "object") (bag as Record<string, string>)[key] = value;
        }),
      setCascade: (mode) => edit((doc) => { doc.cascade = mode; }),
      loadDocument: (doc) =>
        set({
          doc,
          selection: [],
          hoverId: null,
          editingId: null,
          past: [],
          future: [],
          _tx: null,
          dirty: false,
        }),
      markSaved: () => set((s) => { s.dirty = false; }),

      // page meta / CMS collections
      setMeta: (patch) => edit((doc) => { doc.meta = { ...doc.meta, ...patch }; }),
      addCollection: (name) => {
        const id = newId("coll");
        edit((doc) => {
          doc.collections.push({
            id,
            name: name.trim() || "Collection",
            slug: slugifyLocal(name) || id,
            fields: [{ key: "title", label: "Title", type: "text" }],
            items: [],
          });
        });
        return id;
      },
      renameCollection: (collectionId, name) =>
        edit((doc) => {
          const c = doc.collections.find((c) => c.id === collectionId);
          if (c) c.name = name;
        }),
      deleteCollection: (collectionId) =>
        edit((doc) => {
          doc.collections = doc.collections.filter((c) => c.id !== collectionId);
          for (const n of Object.values(doc.nodes)) {
            if (n.binding?.collectionId === collectionId) n.binding = undefined;
          }
        }),
      addCmsField: (collectionId, field) =>
        edit((doc) => {
          const c = doc.collections.find((c) => c.id === collectionId);
          if (!c) return;
          const key = field.key?.trim() || `field_${c.fields.length + 1}`;
          if (c.fields.some((f) => f.key === key)) return;
          c.fields.push({
            key,
            label: field.label || key,
            type: field.type,
            refCollectionId: field.refCollectionId,
            options: field.options,
          });
        }),
      updateCmsField: (collectionId, key, patch) =>
        edit((doc) => {
          const c = doc.collections.find((c) => c.id === collectionId);
          const f = c?.fields.find((f) => f.key === key);
          if (f) Object.assign(f, patch);
        }),
      removeCmsField: (collectionId, key) =>
        edit((doc) => {
          const c = doc.collections.find((c) => c.id === collectionId);
          if (!c) return;
          c.fields = c.fields.filter((f) => f.key !== key);
          for (const item of c.items) delete item.fields[key];
        }),
      addCmsItem: (collectionId) => {
        const id = newId("item");
        edit((doc) => {
          const c = doc.collections.find((c) => c.id === collectionId);
          if (!c) return;
          c.items.push({ id, fields: {} });
        });
        return id;
      },
      updateCmsItem: (collectionId, itemId, fields) =>
        edit((doc) => {
          const c = doc.collections.find((c) => c.id === collectionId);
          const item = c?.items.find((i) => i.id === itemId);
          if (item) Object.assign(item.fields, fields);
        }),
      deleteCmsItem: (collectionId, itemId) =>
        edit((doc) => {
          const c = doc.collections.find((c) => c.id === collectionId);
          if (!c) return;
          c.items = c.items.filter((i) => i.id !== itemId);
        }),
    };
  }),
);

// A minimal valid doc so the store is never empty before loadDocument runs.
function createPlaceholderDoc(): BuilderDocument {
  return createEmptyDocument({ title: "Untitled", slug: "home" });
}

// ─── Convenience selector hooks ─────────────────────────────────────────────────

export const useNode = (id: NodeId): BuilderNode | undefined =>
  useBuilder((s) => s.doc.nodes[id]);

export const useIsSelected = (id: NodeId): boolean =>
  useBuilder((s) => s.selection.includes(id));
