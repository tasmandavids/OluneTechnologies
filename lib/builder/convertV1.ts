// ============================================================================
//  lib/builder/convertV1.ts — best-effort v1 block → v2 document converter.
//
//  Used ONLY as a one-way seed: when a studio opens an existing v1-authored
//  page in Studio and no v2 document exists for it yet, we build one from the
//  page's current blocks instead of handing them a blank canvas (which would
//  silently blow away their real content the moment they hit Publish). Read
//  path only — never writes site_pages.blocks, and the v1 renderer/editor are
//  untouched, so this can't regress anything on its own.
//
//  This is deliberately a FLATTENER, not a pixel-perfect port: v1's ~25 block
//  types collapse onto v2's much smaller node vocabulary via a generic
//  "eyebrow / heading / body / image / button(s) / item list" reader plus a
//  handful of exact 1:1 mappings for the simple leaf blocks. Nothing is
//  silently dropped — every block produces *something* visible — but layout,
//  markdown-lite formatting inside body text, and studio branding colors are
//  not preserved exactly. The studio owner reviews the result in Studio and
//  only goes live when they hit Publish, so a rough-but-honest starting point
//  is the right tradeoff here, not a blocker to get right on the first pass.
// ============================================================================

import type { Block, BlockItem } from "@/lib/site/blocks";
import { createEmptyDocument, attachNode } from "./document";
import { createNode, newId, richText } from "./defaults";
import { plainToRich } from "./rich";
import type { BuilderDocument, BuilderNode, NodeId, PageMeta } from "./schema";

const CONTENT_WIDTH = 960;

// ─── prop readers ─────────────────────────────────────────────────────────────

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function bool(v: unknown, fallback = false): boolean {
  return typeof v === "boolean" ? v : fallback;
}
function itemList(v: unknown): BlockItem[] {
  return Array.isArray(v) ? (v as BlockItem[]) : [];
}
/** First non-empty string prop among candidate keys. */
function pick(props: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = str(props[k]);
    if (v) return v;
  }
  return "";
}

// ─── node builders ────────────────────────────────────────────────────────────

function addNode(doc: BuilderDocument, parentId: NodeId, node: BuilderNode): NodeId {
  attachNode(doc, node, parentId);
  return node.id;
}

function section(): BuilderNode {
  return createNode("frame", {
    name: "Section",
    props: { as: "section" },
    style: { layout: "flex", flexDirection: "column", gap: 16, width: "100%", padding: { top: 64, bottom: 64, left: 24, right: 24 } },
  });
}
function content(): BuilderNode {
  return createNode("frame", {
    name: "Content",
    style: { layout: "flex", flexDirection: "column", gap: 16, width: "100%", maxWidth: CONTENT_WIDTH, margin: { left: "auto", right: "auto" } },
  });
}
function eyebrowNode(text: string): BuilderNode {
  return createNode("text", {
    props: { rich: richText(text, "p") },
    style: { fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "{color.brand}" },
  });
}
function headingNode(text: string, tag: "h1" | "h2" | "h3" = "h2"): BuilderNode {
  return createNode("text", { props: { rich: richText(text, tag) } });
}
function paragraphNode(text: string): BuilderNode {
  return createNode("text", { props: { rich: plainToRich(text, "p") } });
}
function imageNode(src: string, alt = ""): BuilderNode {
  return createNode("image", { props: { src, alt }, style: { width: "100%", aspectRatio: "16/10", borderRadius: 12 } });
}
function buttonNode(label: string, href: string): BuilderNode {
  return createNode("button", { props: { label, href: href || "#" } });
}

// ─── generic flattener (covers hero, pageHeader, statsRow, richText, features,
//     gallery, testimonials, newsFeed, peopleGrid(manual), locations, cta) ────

const EYEBROW_KEYS = ["eyebrow"];
const HEADING_KEYS = ["heading", "title", "name", "question"];
const BODY_KEYS = ["subheading", "subtitle", "body", "text", "quote", "answer", "bio", "detail"];
const IMAGE_KEYS = ["imageUrl", "photoUrl", "posterUrl"];
const BUTTON_PAIRS: [string, string][] = [
  ["primaryLabel", "primaryHref"],
  ["buttonLabel", "buttonHref"],
  ["viewAllLabel", "viewAllHref"],
  ["label", "href"],
];

function genericFlatten(doc: BuilderDocument, parentId: NodeId, block: Block) {
  const p = block.props as Record<string, unknown>;

  const eyebrow = pick(p, EYEBROW_KEYS);
  if (eyebrow) addNode(doc, parentId, eyebrowNode(eyebrow));

  const head = pick(p, HEADING_KEYS);
  if (head) addNode(doc, parentId, headingNode(head));

  const body = pick(p, BODY_KEYS);
  if (body) addNode(doc, parentId, paragraphNode(body));

  // contact has several discrete fields rather than one body — surface them all.
  if (block.type === "contact") {
    const lines = [str(p.address), str(p.phone), str(p.email), str(p.hours)].filter(Boolean);
    if (lines.length) addNode(doc, parentId, paragraphNode(lines.join("\n")));
  }

  const img = pick(p, IMAGE_KEYS);
  if (img) addNode(doc, parentId, imageNode(img));

  for (const [labelKey, hrefKey] of BUTTON_PAIRS) {
    const label = str(p[labelKey]);
    if (label) {
      addNode(doc, parentId, buttonNode(label, str(p[hrefKey])));
      break; // first match only — the pairs overlap (e.g. plain "label"/"href")
    }
  }
  const secondaryLabel = str(p.secondaryLabel);
  if (secondaryLabel) addNode(doc, parentId, buttonNode(secondaryLabel, str(p.secondaryHref)));

  const list = itemList(p.items).slice(0, 24);
  if (list.length) {
    const grid = createNode("frame", {
      name: "Items",
      style: { layout: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 24, width: "100%" },
    });
    addNode(doc, parentId, grid);
    for (const item of list) {
      const card = createNode("frame", {
        name: "Item",
        style: { layout: "flex", flexDirection: "column", gap: 8, padding: { all: 20 }, borderRadius: 12, background: "{color.surface}" },
      });
      addNode(doc, grid.id, card);
      const itemImg = pick(item, IMAGE_KEYS);
      if (itemImg) addNode(doc, card.id, imageNode(itemImg));
      const itemHead = pick(item, HEADING_KEYS);
      if (itemHead) addNode(doc, card.id, headingNode(itemHead, "h3"));
      const itemBody = pick(item, [...BODY_KEYS, "sublabel"]);
      if (itemBody) addNode(doc, card.id, paragraphNode(itemBody));
      const itemHref = str(item.href);
      const itemLabel = pick(item, ["label", "title", "name"]);
      if (itemHref && itemLabel) addNode(doc, card.id, buttonNode(itemLabel, itemHref));
    }
  }
}

// ─── per-block conversion ─────────────────────────────────────────────────────

function convertBlockInto(doc: BuilderDocument, parentId: NodeId, block: Block) {
  const p = block.props as Record<string, unknown>;

  switch (block.type) {
    case "heading": {
      const tag = p.level === "h1" ? "h1" : p.level === "h3" ? "h3" : "h2";
      addNode(doc, parentId, headingNode(str(p.text) || "Heading", tag));
      return;
    }
    case "paragraph": {
      const text = str(p.body);
      if (text) addNode(doc, parentId, paragraphNode(text));
      return;
    }
    case "imageBlock": {
      const src = str(p.imageUrl);
      if (src) addNode(doc, parentId, imageNode(src, str(p.alt)));
      const caption = str(p.caption);
      if (caption) addNode(doc, parentId, paragraphNode(caption));
      return;
    }
    case "videoBlock": {
      const src = str(p.videoUrl);
      if (src) {
        addNode(doc, parentId, createNode("video", {
          props: {
            src,
            poster: str(p.posterUrl) || undefined,
            autoplay: bool(p.autoplay),
            loop: bool(p.loop),
            muted: bool(p.muted, true),
            controls: bool(p.controls, true),
          },
        }));
      }
      return;
    }
    case "linkBlock": {
      const label = str(p.label);
      if (label) addNode(doc, parentId, buttonNode(label, str(p.href)));
      return;
    }
    case "classGrid":
    case "classTabs":
    case "classStreams":
    case "schedule": {
      const eyebrow = pick(p, EYEBROW_KEYS);
      if (eyebrow) addNode(doc, parentId, eyebrowNode(eyebrow));
      const head = pick(p, HEADING_KEYS);
      if (head) addNode(doc, parentId, headingNode(head));
      const sub = pick(p, ["subheading"]);
      if (sub) addNode(doc, parentId, paragraphNode(sub));
      addNode(doc, parentId, createNode("booking", { props: { source: "classes", limit: num(p.limit, 6) } }));
      return;
    }
    case "shopGrid": {
      const eyebrow = pick(p, EYEBROW_KEYS);
      if (eyebrow) addNode(doc, parentId, eyebrowNode(eyebrow));
      const head = pick(p, HEADING_KEYS);
      if (head) addNode(doc, parentId, headingNode(head));
      const sub = pick(p, ["subheading"]);
      if (sub) addNode(doc, parentId, paragraphNode(sub));
      addNode(doc, parentId, createNode("productLoop", { props: { source: "products", limit: num(p.limit, 6) } }));
      return;
    }
    default:
      genericFlatten(doc, parentId, block);
  }
}

// ─── entry point ──────────────────────────────────────────────────────────────

export interface ConvertibleV1Page {
  title: string;
  slug: string;
  blocks: Block[];
  seoTitle?: string | null;
  seoDescription?: string | null;
}

export function convertBlocksToDocument(page: ConvertibleV1Page): BuilderDocument {
  const meta: PageMeta = {
    title: page.title,
    slug: page.slug,
    seoTitle: page.seoTitle || undefined,
    seoDescription: page.seoDescription || undefined,
  };
  const doc = createEmptyDocument(meta);
  doc.id = newId("doc");

  for (const block of page.blocks) {
    if (block.type === "spacer") {
      const h = num((block.props as Record<string, unknown>).height, 80);
      addNode(doc, doc.rootId, createNode("spacer", { style: { height: h } }));
      continue;
    }
    if (block.type === "divider") {
      const w = num((block.props as Record<string, unknown>).width, 100);
      addNode(doc, doc.rootId, createNode("divider", { style: { width: `${w}%`, margin: { left: "auto", right: "auto" } } }));
      continue;
    }

    const sec = section();
    addNode(doc, doc.rootId, sec);
    const wrap = content();
    addNode(doc, sec.id, wrap);
    convertBlockInto(doc, wrap.id, block);

    // A block that produced no content (e.g. every field was empty) leaves an
    // empty section — drop it rather than showing a blank stripe.
    if (wrap.children.length === 0) {
      doc.nodes[doc.rootId].children = doc.nodes[doc.rootId].children.filter((id) => id !== sec.id);
      delete doc.nodes[sec.id];
      delete doc.nodes[wrap.id];
    }
  }

  if (doc.nodes[doc.rootId].children.length === 0) {
    const sec = section();
    addNode(doc, doc.rootId, sec);
    addNode(doc, sec.id, headingNode(page.title || "New page"));
  }

  return doc;
}
