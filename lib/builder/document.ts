// ============================================================================
//  lib/builder/document.ts — pure graph operations + load-time normalization.
//
//  Every mutator here mutates the passed document IN PLACE. That is intentional:
//  they are designed to run inside an Immer `produce` draft (see store.ts), where
//  mutation is the idiom and Immer turns it into an immutable next-state with
//  structural sharing. They also work on a freshly-created plain document.
// ============================================================================

import {
  BUILDER_SCHEMA_VERSION,
  BREAKPOINTS,
  type BuilderDocument,
  type BuilderNode,
  type NodeId,
  type PageMeta,
  type ThemeTokens,
} from "./schema";
import { createNode } from "./defaults";
import { DEFAULT_THEME } from "./tokens";

// ─── Construction ───────────────────────────────────────────────────────────────

export function createEmptyDocument(
  meta: PageMeta,
  theme: ThemeTokens = DEFAULT_THEME,
): BuilderDocument {
  const root = createNode("frame", {
    name: "Page",
    props: { as: "main" },
    style: { layout: "flex", flexDirection: "column", gap: 0, width: "100%", minHeight: 600, background: "{color.base}" },
  });
  return {
    version: BUILDER_SCHEMA_VERSION,
    id: root.id.replace(/^frame_/, "doc_"),
    rootId: root.id,
    nodes: { [root.id]: root },
    theme,
    breakpoints: BREAKPOINTS,
    collections: [],
    meta,
    cascade: "desktop-first",
  };
}

// ─── Reads ───────────────────────────────────────────────────────────────────────

export function getNode(doc: BuilderDocument, id: NodeId): BuilderNode | undefined {
  return doc.nodes[id];
}

export function getAncestors(doc: BuilderDocument, id: NodeId): NodeId[] {
  const out: NodeId[] = [];
  let cur = doc.nodes[id]?.parent ?? null;
  while (cur) {
    out.push(cur);
    cur = doc.nodes[cur]?.parent ?? null;
  }
  return out;
}

/** Depth-first ids of the subtree rooted at id (includes id). */
export function collectSubtree(doc: BuilderDocument, id: NodeId): NodeId[] {
  const out: NodeId[] = [];
  const walk = (n: NodeId) => {
    out.push(n);
    const node = doc.nodes[n];
    if (node) for (const c of node.children) walk(c);
  };
  walk(id);
  return out;
}

/** True if `maybeAncestor` is an ancestor of (or equal to) `id` — cycle guard. */
export function isAncestor(doc: BuilderDocument, maybeAncestor: NodeId, id: NodeId): boolean {
  if (maybeAncestor === id) return true;
  return getAncestors(doc, id).includes(maybeAncestor);
}

// ─── Mutations (in-place; Immer-friendly) ────────────────────────────────────────

/** Insert an already-built node under parent at index (default: end). */
export function attachNode(
  doc: BuilderDocument,
  node: BuilderNode,
  parentId: NodeId,
  index?: number,
): void {
  const parent = doc.nodes[parentId];
  if (!parent) return;
  node.parent = parentId;
  doc.nodes[node.id] = node;
  const at = index === undefined ? parent.children.length : clamp(index, 0, parent.children.length);
  parent.children.splice(at, 0, node.id);
}

/** Insert a detached subtree (root + extras) under a parent. */
export function attachSubtree(
  doc: BuilderDocument,
  subtree: { root: BuilderNode; extra?: BuilderNode[] },
  parentId: NodeId,
  index?: number,
): NodeId {
  for (const n of subtree.extra ?? []) doc.nodes[n.id] = n;
  attachNode(doc, subtree.root, parentId, index);
  return subtree.root.id;
}

/** Remove a node from its parent's child list (keeps it in the map). */
function detachFromParent(doc: BuilderDocument, id: NodeId): void {
  const node = doc.nodes[id];
  if (!node?.parent) return;
  const parent = doc.nodes[node.parent];
  if (parent) parent.children = parent.children.filter((c) => c !== id);
}

/** Delete a node and its whole subtree from the document. */
export function removeSubtree(doc: BuilderDocument, id: NodeId): void {
  if (id === doc.rootId) return; // never delete the page root
  const ids = collectSubtree(doc, id);
  detachFromParent(doc, id);
  for (const n of ids) delete doc.nodes[n];
}

/** Re-parent a node (with cycle guard) and place it at index. */
export function moveNode(
  doc: BuilderDocument,
  id: NodeId,
  newParentId: NodeId,
  index?: number,
): void {
  if (id === doc.rootId) return;
  if (isAncestor(doc, id, newParentId)) return; // can't drop into own descendant
  const node = doc.nodes[id];
  const newParent = doc.nodes[newParentId];
  if (!node || !newParent) return;
  detachFromParent(doc, id);
  node.parent = newParentId;
  const at = index === undefined ? newParent.children.length : clamp(index, 0, newParent.children.length);
  newParent.children.splice(at, 0, id);
}

/** Reorder a child within its current parent. */
export function reorderChild(doc: BuilderDocument, parentId: NodeId, from: number, to: number): void {
  const parent = doc.nodes[parentId];
  if (!parent) return;
  const arr = parent.children;
  if (from < 0 || from >= arr.length) return;
  const [moved] = arr.splice(from, 1);
  arr.splice(clamp(to, 0, arr.length), 0, moved);
}

/** Deep-clone a subtree, assigning fresh ids; returns the new root id (detached). */
export function cloneSubtree(doc: BuilderDocument, id: NodeId): { root: BuilderNode; extra: BuilderNode[] } | null {
  const src = doc.nodes[id];
  if (!src) return null;
  const created: BuilderNode[] = [];
  const cloneRec = (nid: NodeId, parent: NodeId | null): BuilderNode => {
    const original = doc.nodes[nid]!;
    const copy = createNode(original.type, {
      name: original.name,
      style: structuredClone(original.style),
      responsive: original.responsive ? structuredClone(original.responsive) : undefined,
      states: original.states ? structuredClone(original.states) : undefined,
      props: structuredClone(original.props),
      binding: original.binding ? structuredClone(original.binding) : undefined,
      animation: original.animation ? structuredClone(original.animation) : undefined,
      locked: original.locked,
      hidden: original.hidden,
      parent,
    });
    copy.children = original.children.map((c) => cloneRec(c, copy.id).id);
    created.push(copy);
    return copy;
  };
  const root = cloneRec(id, null);
  const extra = created.filter((n) => n.id !== root.id);
  return { root, extra };
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** What live platform data (products / classes) a published document needs, and how much. */
export function scanBuilderDataNeeds(doc: BuilderDocument): { productLimit: number; classLimit: number } {
  let productLimit = 0;
  let classLimit = 0;
  for (const node of Object.values(doc.nodes)) {
    if (node.hidden) continue;
    if (node.type === "productLoop") productLimit = Math.max(productLimit, node.props.limit ?? 6);
    if (node.type === "booking") classLimit = Math.max(classLimit, node.props.limit ?? 6);
  }
  return { productLimit, classLimit };
}

// ─── Load-time normalization (defensive; the column is admin-writable) ───────────

export function normalizeDocument(raw: unknown): BuilderDocument | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Partial<BuilderDocument>;
  if (typeof d.rootId !== "string") return null;
  if (!d.nodes || typeof d.nodes !== "object") return null;
  if (!d.nodes[d.rootId]) return null;

  // Drop any node that is structurally invalid; ensure children only reference
  // surviving nodes so the renderer can't crash on a dangling id.
  const nodes: Record<string, BuilderNode> = {};
  for (const [nid, n] of Object.entries(d.nodes)) {
    if (
      n && typeof n === "object" &&
      typeof (n as BuilderNode).id === "string" &&
      typeof (n as BuilderNode).type === "string" &&
      Array.isArray((n as BuilderNode).children)
    ) {
      const node = n as BuilderNode;
      nodes[nid] = {
        ...node,
        style: node.style ?? {},
        props: node.props ?? {},
        children: node.children.slice(),
      };
    }
  }
  if (!nodes[d.rootId]) return null;
  for (const node of Object.values(nodes)) {
    node.children = node.children.filter((c) => !!nodes[c]);
  }

  return {
    version: BUILDER_SCHEMA_VERSION,
    id: typeof d.id === "string" ? d.id : "doc",
    rootId: d.rootId,
    nodes,
    theme: (d.theme as ThemeTokens) ?? DEFAULT_THEME,
    breakpoints: Array.isArray(d.breakpoints) && d.breakpoints.length ? d.breakpoints : BREAKPOINTS,
    collections: Array.isArray(d.collections) ? d.collections : [],
    meta: (d.meta as PageMeta) ?? { title: "Untitled", slug: "home" },
    cascade: d.cascade === "mobile-first" ? "mobile-first" : "desktop-first",
  };
}
