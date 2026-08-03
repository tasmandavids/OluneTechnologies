# Site Builder v2 — Studio

Studio is the current admin website editor at `/portal/admin/site/studio`. It is
a visual canvas backed by a normalized JSON document in
`site_builder_documents`, separate from the legacy `site_pages.blocks` column.

Studio pages can now be published to the live public site. The public renderer
prefers a published v2 document when one exists and falls back to the legacy v1
block renderer for pages that have not been opened or published in Studio.

---

## Runtime architecture

| Layer | Codepath | Notes |
| --- | --- | --- |
| Admin routes | `app/portal/admin/site/studio/*` | List, edit, save, publish, unpublish, rename, delete. |
| Editor engine | `lib/builder/*` | Schema, normalized document helpers, cascade, tokens, store, v1 converter. |
| Editor UI | `components/builder/*` | Canvas, node renderer, inspector, topbar, publish menu. |
| Persistence | `site_builder_documents` | One v2 document per `site_pages` row. |
| Public home rendering | `app/page.tsx` | Studio subdomains prefer `PublicDocument` for a published v2 home page. |
| Public sub-page rendering | `app/[siteSlug]/page.tsx` | Published v2 document replaces the legacy `PublicSite` page. |
| Public data needs | `lib/builder/publicQueries.ts` | Loads products/classes for `productLoop` and `booking` nodes. |

The v2 document is self-contained: when public rendering selects
`PublicDocument`, it replaces the page chrome rather than slotting into the
legacy `PublicSite` block layout.

---

## JSON document schema

`lib/builder/schema.ts` is the single source of truth. The document is a
**normalized graph**, not a nested tree:

```ts
BuilderDocument {
  version: 2
  rootId: NodeId
  nodes: Record<NodeId, BuilderNode>   // flat map — O(1) node updates
  theme: ThemeTokens                   // design tokens (pillar 5)
  breakpoints: Breakpoint[]            // desktop → mobile portrait
  collections: CmsCollection[]         // no-code relational CMS (pillar 4)
  meta: PageMeta
  cascade: "desktop-first" | "mobile-first"
}

BuilderNode {
  id; type; name; parent; children: NodeId[]
  style: StyleSet                                  // BASE (desktop) styles
  responsive?: Partial<Record<BreakpointId, Partial<StyleSet>>>  // overrides (pillar 2)
  states?: Partial<Record<"hover"|"active"|"focus", Partial<StyleSet>>>  // (pillar 6)
  props: NodeProps                                 // content (rich text, src, href…)
  binding?: CmsBinding                             // dynamic data (pillar 4)
  animation?: AnimationSpec                        // entrance/scroll/hover (pillar 6)
  locked?; hidden?
}
```

Why normalized? Because every editor mutation targets exactly one node. A flat
map means a write is `nodes[id] = …` — no tree walk, no deep clone. Combined
with Immer's structural sharing this is what keeps the canvas fast.

**Hybrid layout (pillar 1).** A node's `StyleSet.layout` is `flow | flex | grid |
absolute`. A container chooses how it arranges children; a child carries its own
`position`/`top`/`left`, so freeform absolute placement and semantic flex/grid
compose in the same tree. `lib/builder/cascade.ts#compileStyle` translates the
`StyleSet` (layout mode, box-edge shorthands, transforms, text gradients, token
refs) into a `React.CSSProperties`.

**Responsive (pillar 2).** `cascadeStyle()` folds the base + each breakpoint
override up to the active breakpoint. Desktop-first cascades wide→narrow; editing
on tablet writes only to `responsive.tablet`, leaving desktop untouched.

**Design tokens (pillar 5).** Style values may be a literal **or** a token
reference `{group.name}` (e.g. `{color.brand}`). `lib/builder/tokens.ts` emits the
theme as CSS custom properties (`--ds-color-brand`) and rewrites token refs to
`var(--ds-color-brand)`. Changing a token re-skins everything instantly with **no
React re-render and no layout shift** — the browser just recomputes the variable.

**Inline rich text (pillar 3).** `text` nodes store `props.rich: RichText` — an
array of blocks of styled runs. Per-run marks support color, gradient and
letter-spacing, so per-character styling round-trips losslessly (no HTML soup).

**CMS (pillar 4)** and **animation (pillar 6)** are first-class fields
(`CmsBinding`, `AnimationSpec`) on every node.

---

## State management

`lib/builder/store.ts` — **Zustand + Immer**. Four mechanisms keep rapid drag /
typing lag-free:

1. **Normalized graph + structural sharing.** Immer's `produce` only allocates
   new objects along the mutated path. Every untouched node keeps its identity.
2. **Slice subscriptions.** Each `<NodeRenderer id>` selects `s.doc.nodes[id]`.
   Because unchanged nodes keep identity, `Object.is` equality means dragging
   node A re-renders **only** node A's renderer and the overlay bound to A.
3. **Transactions.** A drag or a text-editing session calls `beginTx()` once,
   fires many `transient` mutations (no history push), then `endTx()` records a
   **single** undo entry. Pointer moves never thrash history.
4. **Reference-snapshot history.** Undo/redo swap whole-document references;
   structural sharing makes each snapshot cheap, so a 100-deep stack is small.

Store surface: `select / setHover / setEditing`, `setBreakpoint / setMode /
setZoom`, `undo / redo / beginTx / endTx`, `insertComponent / deleteNodes /
duplicateNode / moveNode / reorder`, `updateStyle / setText / updateProps /
setBinding / setAnimation`, `setToken / setCascade`, `loadDocument / markSaved`.

`updateStyle(id, patch)` automatically targets the active breakpoint layer (or an
interaction-state layer), so the inspector "just works" on every breakpoint.

---

## Editor surface

`components/builder/NodeRenderer.tsx` parses a node and renders an interactive,
inline-editable, draggable element, recursing into `children`. It:

- resolves styles via `resolveStyle(node, { breakpoint, cascade })`,
- renders the correct element per `type` (frame → semantic tag, text →
  `RichTextView` or the `InlineText` WYSIWYG when editing, image/video/button/
  form/productLoop/booking…),
- wires selection (`onMouseDown`), hover, and double-click-to-edit,
- exposes `data-builder-node` / `data-builder-frame` for hit-testing,
- delegates entrance/scroll/hover animation to `AnimatedShell` (framer-motion)
  outside the editor.

Surrounding it: `CanvasViewport` (device frame at the breakpoint width, theme
vars injected, zoom, palette drop hit-testing), `SelectionOverlay` (bounding box,
8 resize handles, freeform drag, alignment-guide snapping), `Topbar` (breakpoint
switcher, history, zoom, preview toggle, cascade direction, save), `LeftPanel`
(insert palette + layers tree), `Inspector` (element / theme / page tabs).

`components/builder/PublicDocument.tsx` renders a document without the editor
store (store-independent recursion), so it is safe for SSR and public pages.

---

## Pillar → code map

| Pillar | Where |
| --- | --- |
| 1 Hybrid layout & drag | `StyleSet.layout`, `cascade.ts`, `SelectionOverlay.tsx`, `CanvasViewport` drop hit-testing |
| 2 Multi-breakpoint | `BREAKPOINTS`, `responsive`, `cascadeStyle()`, `Topbar` switcher |
| 3 Inline WYSIWYG | `RichText` model, `rich.ts`, `InlineText.tsx` floating toolbar |
| 4 Relational CMS | `CmsCollection` / `CmsBinding`, `Inspector` CMS section, Page tab |
| 5 Theme tokens | `ThemeTokens`, `tokens.ts`, `Inspector` Theme tab |
| 6 Animation & states | `AnimationSpec` / `states`, `AnimatedShell.tsx` |
| 7 App-market blocks | node types `form / input / productLoop / booking`, renderers in `NodeRenderer` |

---

## Persistence, publishing, and tenant isolation

Migrations:

| Migration | Purpose |
| --- | --- |
| `0057_site_builder_v2.sql` | Creates `site_builder_documents (page_id PK, studio_id, document jsonb, template_id)` and base RLS. |
| `0094_site_builder_document_tenant_guard.sql` | Adds a composite `(page_id, studio_id)` foreign key and tightens admin/public RLS so a document cannot be attached to another studio's page. |

Server actions live in `app/portal/admin/site/studio/actions.ts`:

| Action | Behavior |
| --- | --- |
| `createStudioPage` | Creates a non-home, hidden, draft `site_pages` row and inserts a starter v2 document. |
| `saveBuilderDocument` | Verifies the target page belongs to the admin's studio, normalizes the document, then upserts it. |
| `publishStudioPage` | Sets the linked `site_pages` row to `published`, optionally makes it the home page and/or shows it in nav, then revalidates public caches. |
| `unpublishStudioPage` | Returns the page to `draft`, removes it from home/nav, then revalidates public caches. |
| `renameStudioPage` | Updates title and/or slug on `site_pages`; reserved slugs are rejected. |
| `deleteStudioPage` | Deletes the linked `site_pages` row; the v2 document cascades. |

Public reads use the cookieless Supabase public client. RLS only exposes a
document when the linked `site_pages` row is published and belongs to the same
studio. If the table is missing in an environment, `getPublishedBuilderDocument`
returns `null` and the public routes fall back to v1 rendering.

## v1 coexistence and conversion

Studio is the admin editing surface, but the legacy public renderer remains
important for pages that have never been published from Studio:

- Published v2 document exists -> `PublicDocument`.
- No published v2 document -> legacy `PublicSite` / `site_pages.blocks`.

When an admin opens an existing v1 page in Studio and no v2 document exists,
`lib/builder/convertV1.ts` seeds the editor with a best-effort conversion of the
current blocks. The converter is a flattener, not a pixel-perfect port:

- every block produces something visible when it has usable content,
- layout, markdown-lite formatting, and exact branding colors may change,
- nothing is written until the admin saves/publishes,
- admins should review the converted page before publishing it live.

## The 5 starter templates

`lib/builder/templates.ts`: **Aurora** (SaaS), **Atelier** (portfolio, freeform
hero), **Ledger** (editorial), **Pulse** (community + booking), **Market**
(commerce). Each ships its own theme to demonstrate one-click reskinning.

## Operational checklist

- Apply migrations `0057` and `0094`.
- Use `/portal/admin/site/studio` for page editing; v1-only public pages still
  render until a v2 document is published.
- After publishing, check the studio subdomain root or `/<slug>` path, depending
  on whether the page was published as home.
- If a page unexpectedly renders through v1, verify the `site_pages` row is
  `published` and that a matching `site_builder_documents.page_id/studio_id`
  row exists.
- If a save fails with "Page not found", check tenant ownership first; both app
  code and migration `0094` reject cross-studio page/document pairs.

## Deliberate simplifications / next steps

- **WYSIWYG** uses a contenteditable surface (no TipTap/Slate dependency). The
  `RichText` model is editor-agnostic, so swapping in TipTap is localised to
  `InlineText.tsx`.
- **Responsive published output** currently resolves at one active breakpoint;
  production rendering should compile `responsive` overrides into a media-query
  stylesheet.
- **CMS** schema + binding UI exist; dynamic-page generation (one page per
  collection item) and a collection editor UI are the next build.
- **App-market blocks** render visually; form submission / cart / booking
  backends are stubs to be wired to existing server actions.
- **Canvas sibling reordering** is via the layers panel + absolute drag; in-flow
  drag-to-reorder with insertion indicators is a follow-up.
