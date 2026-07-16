// ============================================================================
//  components/builder/Inspector.tsx — element / theme / page inspector.
//
//  Element controls READ the cascaded (effective) value for the active
//  breakpoint but WRITE to the active layer: editing on Tablet records an
//  override under responsive.tablet and leaves Desktop untouched (pillar 2).
//  The Theme tab edits design tokens, which re-skin the whole canvas instantly
//  via CSS variables (pillar 5).
// ============================================================================

"use client";

import { useEffect, useRef, useState } from "react";
import { useBuilder } from "@/lib/builder/store";
import { cascadeStyle } from "@/lib/builder/cascade";
import type {
  BoxEdges, BreakpointId, BuilderNode, CmsBinding, CmsCollection, CmsField, CmsFieldType, CmsItem,
  Dim, NodeId, StyleSet, ThemeTokens,
} from "@/lib/builder/schema";
import { Section, Row, TextInput, NumberInput, SelectInput, SegMode, ColorInput } from "./controls";
import { useStudioHost } from "./HostContext";

export function Inspector() {
  const selection = useBuilder((s) => s.selection);
  const [tab, setTab] = useState<"element" | "theme" | "page">("element");
  const id = selection.length === 1 ? selection[0] : null;

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-black/10 bg-white">
      <div className="flex border-b border-black/10 text-xs font-medium">
        {(["element", "theme", "page"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 capitalize ${tab === t ? "border-b-2 border-violet-600 text-violet-700" : "text-neutral-500"}`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto">
        {tab === "element" ? id ? <ElementInspector id={id} /> : <Empty /> : null}
        {tab === "theme" && <ThemeInspector />}
        {tab === "page" && <PageInspector />}
      </div>
    </aside>
  );
}

function Empty() {
  return <div className="p-6 text-center text-xs text-neutral-400">Select an element to edit its styles.</div>;
}

const asNum = (v: Dim | undefined): number | "" => (typeof v === "number" ? v : v === undefined ? "" : "");

function ElementInspector({ id }: { id: NodeId }) {
  const node = useBuilder((s) => s.doc.nodes[id]) as BuilderNode | undefined;
  const breakpoint = useBuilder((s) => s.breakpoint);
  const cascade = useBuilder((s) => s.doc.cascade);
  const theme = useBuilder((s) => s.doc.theme);
  const parentLayout = useBuilder((s) => {
    const p = node?.parent ? s.doc.nodes[node.parent] : undefined;
    return p?.style.layout;
  });
  if (!node) return <Empty />;

  const m = cascadeStyle(node, { breakpoint, cascade });
  const set = (patch: Partial<StyleSet>) => useBuilder.getState().updateStyle(id, patch);
  const setProp = (patch: Record<string, unknown>) => useBuilder.getState().updateProps(id, patch);

  const isContainer = node.type === "frame" || node.type === "form";
  const isText = node.type === "text" || node.type === "button" || node.type === "input";
  const canPosition = parentLayout === "absolute" || m.position === "absolute";

  const fontTokenOptions = [
    ...Object.keys(theme.font).map((k) => ({ value: `{font.${k}}`, label: k })),
  ];

  return (
    <div>
      {/* header */}
      <div className="flex items-center justify-between border-b border-neutral-100 px-3 py-2">
        <input
          className="w-full bg-transparent text-sm font-medium text-neutral-800 focus:outline-none"
          value={node.name}
          onChange={(e) => useBuilder.getState().renameNode(id, e.target.value)}
        />
        <span className="ml-2 shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] uppercase text-neutral-500">{node.type}</span>
      </div>
      {breakpoint !== "desktop" && (
        <div className="bg-amber-50 px-3 py-1.5 text-[11px] text-amber-700">
          Editing <b>{breakpoint}</b> overrides — desktop stays unchanged.
        </div>
      )}

      {/* content props */}
      <ContentProps node={node} setProp={setProp} />

      {/* layout */}
      {isContainer && (
        <Section title="Layout">
          <Row label="Type">
            <SegMode
              value={m.layout ?? "flow"}
              onChange={(v) => set({ layout: v })}
              options={[
                { value: "flow", label: "Flow" },
                { value: "flex", label: "Flex" },
                { value: "grid", label: "Grid" },
                { value: "absolute", label: "Free" },
              ]}
            />
          </Row>
          {m.layout === "flex" && (
            <>
              <Row label="Direction">
                <SegMode
                  value={m.flexDirection ?? "row"}
                  onChange={(v) => set({ flexDirection: v })}
                  options={[{ value: "row", label: "→" }, { value: "column", label: "↓" }]}
                />
              </Row>
              <Row label="Justify">
                <SelectInput
                  value={m.justifyContent ?? "flex-start"}
                  onChange={(v) => set({ justifyContent: v })}
                  options={[
                    { value: "flex-start", label: "Start" }, { value: "center", label: "Center" },
                    { value: "flex-end", label: "End" }, { value: "space-between", label: "Between" },
                    { value: "space-around", label: "Around" },
                  ]}
                />
              </Row>
              <Row label="Align">
                <SelectInput
                  value={m.alignItems ?? "stretch"}
                  onChange={(v) => set({ alignItems: v })}
                  options={[
                    { value: "stretch", label: "Stretch" }, { value: "flex-start", label: "Start" },
                    { value: "center", label: "Center" }, { value: "flex-end", label: "End" },
                  ]}
                />
              </Row>
            </>
          )}
          {m.layout === "grid" && (
            <Row label="Columns">
              <TextInput value={String(m.gridTemplateColumns ?? "repeat(3, 1fr)")} onChange={(v) => set({ gridTemplateColumns: v })} />
            </Row>
          )}
          {(m.layout === "flex" || m.layout === "grid") && (
            <Row label="Gap"><NumberInput value={asNum(m.gap)} onChange={(v) => set({ gap: v })} /></Row>
          )}
        </Section>
      )}

      {/* position */}
      {canPosition && (
        <Section title="Position">
          <Row label="Mode">
            <SelectInput
              value={m.position ?? "static"}
              onChange={(v) => set({ position: v })}
              options={[
                { value: "static", label: "Static" }, { value: "relative", label: "Relative" },
                { value: "absolute", label: "Absolute" }, { value: "sticky", label: "Sticky" },
              ]}
            />
          </Row>
          <Row label="X / Left"><NumberInput value={asNum(m.left)} onChange={(v) => set({ left: v })} /></Row>
          <Row label="Y / Top"><NumberInput value={asNum(m.top)} onChange={(v) => set({ top: v })} /></Row>
          <Row label="Z-index"><NumberInput value={typeof m.zIndex === "number" ? m.zIndex : ""} onChange={(v) => set({ zIndex: v })} /></Row>
        </Section>
      )}

      {/* size */}
      <Section title="Size">
        <Row label="Width"><DimField value={m.width} onChange={(v) => set({ width: v })} /></Row>
        <Row label="Height"><DimField value={m.height} onChange={(v) => set({ height: v })} /></Row>
        <Row label="Max-w"><DimField value={m.maxWidth} onChange={(v) => set({ maxWidth: v })} /></Row>
        <Row label="Aspect"><TextInput value={String(m.aspectRatio ?? "")} placeholder="16/9" onChange={(v) => set({ aspectRatio: v || undefined })} /></Row>
      </Section>

      {/* spacing */}
      <Section title="Spacing">
        <div className="text-[10px] text-neutral-400">Padding</div>
        <EdgeEditor edges={m.padding} onChange={(e) => set({ padding: e })} />
        <div className="mt-1 text-[10px] text-neutral-400">Margin</div>
        <EdgeEditor edges={m.margin} onChange={(e) => set({ margin: e })} />
      </Section>

      {/* typography */}
      {isText && (
        <Section title="Typography">
          <Row label="Font">
            <SelectInput value={(m.fontFamily as string) ?? "{font.body}"} onChange={(v) => set({ fontFamily: v })} options={fontTokenOptions} />
          </Row>
          <Row label="Size"><DimField value={m.fontSize} onChange={(v) => set({ fontSize: v })} /></Row>
          <Row label="Weight">
            <SelectInput
              value={String(m.fontWeight ?? "400")}
              onChange={(v) => set({ fontWeight: Number(v) })}
              options={[300, 400, 500, 600, 700, 800].map((w) => ({ value: String(w), label: String(w) }))}
            />
          </Row>
          <Row label="Line height"><NumberInput value={typeof m.lineHeight === "number" ? m.lineHeight : ""} onChange={(v) => set({ lineHeight: v })} placeholder="1.5" /></Row>
          <Row label="Letter sp."><NumberInput value={asNum(m.letterSpacing)} onChange={(v) => set({ letterSpacing: v })} /></Row>
          <Row label="Align">
            <SegMode
              value={m.textAlign ?? "left"}
              onChange={(v) => set({ textAlign: v })}
              options={[{ value: "left", label: "⌫" }, { value: "center", label: "≡" }, { value: "right", label: "⌦" }]}
            />
          </Row>
          <Row label="Color"><ColorInput value={(m.color as string) ?? "{color.ink}"} onChange={(v) => set({ color: v })} /></Row>
        </Section>
      )}

      {/* effects */}
      <Section title="Fill & effects">
        <Row label="Background"><ColorInput value={(m.background as string) ?? ""} onChange={(v) => set({ background: v || undefined })} /></Row>
        <Row label="Radius"><DimField value={m.borderRadius} onChange={(v) => set({ borderRadius: v })} /></Row>
        <Row label="Border w"><NumberInput value={asNum(m.borderWidth)} onChange={(v) => set({ borderWidth: v, borderStyle: v ? "solid" : undefined })} /></Row>
        <Row label="Border c"><ColorInput value={(m.borderColor as string) ?? "{color.line}"} onChange={(v) => set({ borderColor: v })} /></Row>
        <Row label="Shadow">
          <SelectInput
            value={(m.boxShadow as string) ?? "none"}
            onChange={(v) => set({ boxShadow: v === "none" ? undefined : v })}
            options={["none", "{shadow.sm}", "{shadow.md}", "{shadow.lg}", "{shadow.xl}"].map((s) => ({ value: s, label: s.replace(/[{}]/g, "").replace("shadow.", "") }))}
          />
        </Row>
        <Row label="Opacity"><NumberInput value={typeof m.opacity === "number" ? m.opacity : ""} onChange={(v) => set({ opacity: v })} placeholder="1" /></Row>
        <Row label="Rotate°"><NumberInput value={typeof m.rotate === "number" ? m.rotate : ""} onChange={(v) => set({ rotate: v })} /></Row>
      </Section>

      <AnimationInspector node={node} />
      <CmsInspector node={node} />

      {/* actions */}
      <div className="flex gap-2 p-3">
        <button onClick={() => useBuilder.getState().duplicateNode(id)} className="flex-1 rounded-md border border-neutral-200 py-1.5 text-xs hover:bg-neutral-50">Duplicate</button>
        <button onClick={() => useBuilder.getState().deleteNodes([id])} className="flex-1 rounded-md border border-red-200 py-1.5 text-xs text-red-600 hover:bg-red-50">Delete</button>
      </div>
    </div>
  );
}

function ContentProps({ node, setProp }: { node: BuilderNode; setProp: (p: Record<string, unknown>) => void }) {
  if (node.type === "image")
    return (
      <Section title="Image">
        <Row label="Source"><TextInput value={String(node.props.src ?? "")} onChange={(v) => setProp({ src: v })} placeholder="https://…" /></Row>
        <Row label="Alt"><TextInput value={String(node.props.alt ?? "")} onChange={(v) => setProp({ alt: v })} /></Row>
      </Section>
    );
  if (node.type === "button")
    return (
      <Section title="Button">
        <Row label="Label"><TextInput value={String(node.props.label ?? "")} onChange={(v) => setProp({ label: v })} /></Row>
        <Row label="Link"><TextInput value={String(node.props.href ?? "")} onChange={(v) => setProp({ href: v })} /></Row>
      </Section>
    );
  if (node.type === "video")
    return (
      <Section title="Video">
        <Row label="Source"><TextInput value={String(node.props.src ?? "")} onChange={(v) => setProp({ src: v })} /></Row>
        <Row label="Poster"><TextInput value={String(node.props.poster ?? "")} onChange={(v) => setProp({ poster: v })} /></Row>
      </Section>
    );
  if (node.type === "icon")
    return (
      <Section title="Icon">
        <Row label="Glyph"><TextInput value={String(node.props.glyph ?? "")} onChange={(v) => setProp({ glyph: v })} /></Row>
      </Section>
    );
  if (node.type === "embed")
    return (
      <Section title="Embed">
        <textarea
          className="w-full rounded-md border border-neutral-200 p-2 text-xs"
          rows={4}
          value={String(node.props.html ?? "")}
          onChange={(e) => setProp({ html: e.target.value })}
          placeholder="<iframe …>"
        />
      </Section>
    );
  if (node.type === "input")
    return (
      <Section title="Field">
        <Row label="Name"><TextInput value={String(node.props.fieldName ?? "")} onChange={(v) => setProp({ fieldName: v })} /></Row>
        <Row label="Placeholder"><TextInput value={String(node.props.placeholder ?? "")} onChange={(v) => setProp({ placeholder: v })} /></Row>
        <Row label="Type">
          <SelectInput
            value={(node.props.fieldType as string) ?? "text"}
            onChange={(v) => setProp({ fieldType: v })}
            options={["text", "email", "tel", "textarea", "select", "checkbox"].map((t) => ({ value: t, label: t }))}
          />
        </Row>
      </Section>
    );
  if (node.type === "productLoop")
    return (
      <Section title="Product grid">
        <Row label="Source"><span className="text-[11px] text-neutral-400">Shop products</span></Row>
        <Row label="Limit">
          <NumberInput value={typeof node.props.limit === "number" ? node.props.limit : ""} onChange={(v) => setProp({ limit: v })} placeholder="6" />
        </Row>
      </Section>
    );
  if (node.type === "booking")
    return (
      <Section title="Booking">
        <Row label="Source"><span className="text-[11px] text-neutral-400">Classes</span></Row>
        <Row label="Limit">
          <NumberInput value={typeof node.props.limit === "number" ? node.props.limit : ""} onChange={(v) => setProp({ limit: v })} placeholder="6" />
        </Row>
      </Section>
    );
  return null;
}

function AnimationInspector({ node }: { node: BuilderNode }) {
  const set = (a: Partial<NonNullable<BuilderNode["animation"]>> | undefined) => {
    if (a === undefined) return useBuilder.getState().setAnimation(node.id, undefined);
    useBuilder.getState().setAnimation(node.id, { trigger: "inview", preset: "fade-up", ...node.animation, ...a });
  };
  const a = node.animation;
  return (
    <Section title="Animation" right={a ? <button onClick={() => set(undefined)} className="text-[10px] text-neutral-400 hover:text-red-500">remove</button> : null}>
      {!a ? (
        <button onClick={() => set({ trigger: "inview", preset: "fade-up" })} className="w-full rounded-md border border-dashed border-neutral-300 py-1.5 text-xs text-neutral-500 hover:bg-neutral-50">
          + Add animation
        </button>
      ) : (
        <>
          <Row label="Trigger">
            <SelectInput value={a.trigger} onChange={(v) => set({ trigger: v })} options={[
              { value: "inview", label: "On scroll in" }, { value: "load", label: "On load" }, { value: "hover", label: "On hover" },
            ]} />
          </Row>
          <Row label="Preset">
            <SelectInput
              value={a.preset ?? "fade-up"}
              onChange={(v) => set({ preset: v as NonNullable<BuilderNode["animation"]>["preset"] })}
              options={(["fade", "fade-up", "fade-down", "fade-left", "fade-right", "zoom-in", "zoom-out", "blur-in", "slide-up"] as const).map((p) => ({ value: p, label: p }))}
            />
          </Row>
          <Row label="Duration"><NumberInput value={a.duration ?? ""} onChange={(v) => set({ duration: v })} placeholder="0.6" /></Row>
          <Row label="Delay"><NumberInput value={a.delay ?? ""} onChange={(v) => set({ delay: v })} placeholder="0" /></Row>
        </>
      )}
    </Section>
  );
}

function CmsInspector({ node }: { node: BuilderNode }) {
  const collections = useBuilder((s) => s.doc.collections);
  const b = node.binding;
  const update = (patch: Partial<CmsBinding> | undefined) => {
    if (patch === undefined) return useBuilder.getState().setBinding(node.id, undefined);
    const next: CmsBinding = { collectionId: collections[0]?.id ?? "", mode: "field", ...b, ...patch };
    useBuilder.getState().setBinding(node.id, next);
  };
  if (collections.length === 0)
    return <Section title="CMS"><p className="text-[11px] text-neutral-400">Create a collection in the Page tab to bind dynamic data.</p></Section>;
  const coll = collections.find((c) => c.id === b?.collectionId) ?? collections[0];
  return (
    <Section title="CMS binding" right={b ? <button onClick={() => update(undefined)} className="text-[10px] text-neutral-400 hover:text-red-500">unbind</button> : null}>
      {!b ? (
        <button onClick={() => update({ mode: node.type === "frame" ? "repeater" : "field" })} className="w-full rounded-md border border-dashed border-neutral-300 py-1.5 text-xs text-neutral-500 hover:bg-neutral-50">
          + Bind to collection
        </button>
      ) : (
        <>
          <Row label="Collection">
            <SelectInput value={b.collectionId} onChange={(v) => update({ collectionId: v })} options={collections.map((c) => ({ value: c.id, label: c.name }))} />
          </Row>
          <Row label="Mode">
            <SegMode value={b.mode} onChange={(v) => update({ mode: v })} options={[{ value: "field", label: "Field" }, { value: "repeater", label: "Repeater" }]} />
          </Row>
          {b.mode === "field" && (
            <Row label="Field">
              <SelectInput value={b.field ?? ""} onChange={(v) => update({ field: v })} options={coll.fields.map((f) => ({ value: f.key, label: f.label }))} />
            </Row>
          )}
        </>
      )}
    </Section>
  );
}

// ─── shared field widgets ────────────────────────────────────────────────────────

function DimField({ value, onChange }: { value: Dim | undefined; onChange: (v: Dim | undefined) => void }) {
  // Accepts a number (px) or a string ("50%", "auto", "{fontSize.lg}").
  return (
    <TextInput
      value={value === undefined ? "" : String(value)}
      placeholder="auto"
      onChange={(v) => {
        if (v === "") return onChange(undefined);
        const n = Number(v);
        onChange(Number.isFinite(n) && v.trim() !== "" && !v.endsWith("%") ? n : v);
      }}
    />
  );
}

function EdgeEditor({ edges, onChange }: { edges: BoxEdges | undefined; onChange: (e: BoxEdges) => void }) {
  const e = edges ?? {};
  const set = (k: keyof BoxEdges, v: number | undefined) => onChange({ ...e, [k]: v });
  return (
    <div className="grid grid-cols-4 gap-1">
      {(["top", "right", "bottom", "left"] as const).map((edge) => (
        <input
          key={edge}
          type="number"
          title={edge}
          placeholder={edge[0].toUpperCase()}
          className="w-full rounded border border-neutral-200 px-1 py-1 text-center text-[11px] tabular-nums focus:border-violet-400 focus:outline-none"
          value={typeof e[edge] === "number" ? (e[edge] as number) : ""}
          onChange={(ev) => set(edge, ev.target.value === "" ? undefined : Number(ev.target.value))}
        />
      ))}
    </div>
  );
}

// ─── theme + page tabs ────────────────────────────────────────────────────────────

function ThemeInspector() {
  const theme = useBuilder((s) => s.doc.theme);
  const setToken = useBuilder((s) => s.setToken);
  const groups: { group: keyof ThemeTokens; label: string; color?: boolean }[] = [
    { group: "color", label: "Colors", color: true },
    { group: "font", label: "Fonts" },
    { group: "radius", label: "Radii" },
    { group: "shadow", label: "Shadows" },
  ];
  return (
    <div>
      <div className="bg-violet-50 px-3 py-2 text-[11px] text-violet-700">
        Editing a token re-skins the whole canvas instantly — no layout shift.
      </div>
      {groups.map(({ group, label, color }) => (
        <Section key={group} title={label}>
          {Object.entries(theme[group] as Record<string, string>).map(([k, v]) => (
            <Row key={k} label={k}>
              {color ? <ColorInput value={v} onChange={(val) => setToken(group, k, val)} /> : <TextInput value={v} onChange={(val) => setToken(group, k, val)} />}
            </Row>
          ))}
        </Section>
      ))}
    </div>
  );
}

function PageInspector() {
  const meta = useBuilder((s) => s.doc.meta);
  const cascade = useBuilder((s) => s.doc.cascade);
  const collections = useBuilder((s) => s.doc.collections);
  const host = useStudioHost();
  const [slugDraft, setSlugDraft] = useState(meta.slug);
  const [slugError, setSlugError] = useState<string | null>(null);
  const renameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The slug can also change from the Topbar's publish flow / server round
  // trip — keep the draft in sync when that happens underneath us.
  useEffect(() => { setSlugDraft(meta.slug); }, [meta.slug]);

  const commitTitle = (title: string) => {
    useBuilder.getState().setMeta({ title });
    if (renameTimer.current) clearTimeout(renameTimer.current);
    renameTimer.current = setTimeout(() => { void host.rename({ title }); }, 700);
  };
  const commitSlug = (slug: string) => {
    setSlugDraft(slug);
    setSlugError(null);
    if (renameTimer.current) clearTimeout(renameTimer.current);
    renameTimer.current = setTimeout(() => {
      void host.rename({ slug }).then((res) => {
        if (res.ok && res.data) {
          useBuilder.getState().setMeta({ slug: res.data.slug });
          setSlugDraft(res.data.slug);
        } else {
          setSlugError(res.error ?? "Couldn't update the URL.");
        }
      });
    }, 700);
  };

  return (
    <div>
      <Section title="Page">
        <Row label="Title"><TextInput value={meta.title} onChange={commitTitle} /></Row>
        <Row label="Slug"><TextInput value={slugDraft} onChange={commitSlug} /></Row>
        {slugError && <p className="text-[10px] text-red-500">{slugError}</p>}
        <Row label="SEO title">
          <TextInput value={meta.seoTitle ?? ""} placeholder={meta.title} onChange={(v) => useBuilder.getState().setMeta({ seoTitle: v || undefined })} />
        </Row>
        <Row label="SEO description">
          <TextInput value={meta.seoDescription ?? ""} onChange={(v) => useBuilder.getState().setMeta({ seoDescription: v || undefined })} />
        </Row>
        <Row label="Cascade">
          <SegMode
            value={cascade}
            onChange={(v) => useBuilder.getState().setCascade(v)}
            options={[{ value: "desktop-first", label: "Desktop" }, { value: "mobile-first", label: "Mobile" }]}
          />
        </Row>
      </Section>
      <CmsCollectionsEditor collections={collections} />
    </div>
  );
}

// ─── CMS collections CRUD (Page tab) ─────────────────────────────────────────────

function CmsCollectionsEditor({ collections }: { collections: CmsCollection[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <Section
      title="CMS collections"
      right={
        <button
          onClick={() => setOpenId(useBuilder.getState().addCollection("New collection"))}
          className="text-[10px] font-semibold text-violet-600 hover:underline"
        >
          + New
        </button>
      }
    >
      {collections.length === 0 && (
        <p className="text-[11px] text-neutral-400">No collections yet — add one to bind dynamic content like team members, FAQs, or testimonials.</p>
      )}
      <div className="space-y-2">
        {collections.map((c) => (
          <div key={c.id} className="rounded-md border border-neutral-200">
            <button
              onClick={() => setOpenId(openId === c.id ? null : c.id)}
              className="flex w-full items-center justify-between px-2 py-1.5 text-left text-xs"
            >
              <span className="font-medium">{c.name}</span>
              <span className="text-[10px] text-neutral-400">
                {c.fields.length} fields · {c.items.length} items {openId === c.id ? "▲" : "▼"}
              </span>
            </button>
            {openId === c.id && <CollectionEditor collection={c} />}
          </div>
        ))}
      </div>
    </Section>
  );
}

function CollectionEditor({ collection }: { collection: CmsCollection }) {
  const [fieldLabel, setFieldLabel] = useState("");
  const [fieldType, setFieldType] = useState<CmsFieldType>("text");

  const addField = () => {
    const label = fieldLabel.trim();
    if (!label) return;
    const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || `field_${collection.fields.length + 1}`;
    useBuilder.getState().addCmsField(collection.id, { key, label, type: fieldType });
    setFieldLabel("");
  };

  return (
    <div className="space-y-2 border-t border-neutral-100 p-2">
      <div className="flex items-center justify-between gap-2">
        <input
          className="w-full bg-transparent text-xs font-medium text-neutral-800 focus:outline-none"
          value={collection.name}
          onChange={(e) => useBuilder.getState().renameCollection(collection.id, e.target.value)}
        />
        <button
          onClick={() => useBuilder.getState().deleteCollection(collection.id)}
          className="shrink-0 text-[10px] text-neutral-400 hover:text-red-500"
        >
          delete
        </button>
      </div>

      <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Fields</div>
      {collection.fields.map((f) => (
        <div key={f.key} className="flex items-center gap-1.5">
          <span className="flex-1 truncate text-[11px] text-neutral-700">{f.label}</span>
          <span className="text-[10px] text-neutral-400">{f.type}</span>
          <button onClick={() => useBuilder.getState().removeCmsField(collection.id, f.key)} className="text-[10px] text-neutral-300 hover:text-red-500">
            ✕
          </button>
        </div>
      ))}
      <div className="flex gap-1">
        <TextInput value={fieldLabel} onChange={setFieldLabel} placeholder="Field name" />
        <SelectInput
          value={fieldType}
          onChange={setFieldType}
          options={(["text", "richText", "number", "boolean", "image", "url", "date", "option"] as CmsFieldType[]).map((t) => ({ value: t, label: t }))}
        />
        <button onClick={addField} className="shrink-0 rounded-md border border-neutral-200 px-2 text-xs hover:bg-neutral-50">+</button>
      </div>

      <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Items</div>
      {collection.items.map((item) => (
        <ItemEditor key={item.id} collection={collection} item={item} />
      ))}
      <button
        onClick={() => useBuilder.getState().addCmsItem(collection.id)}
        className="w-full rounded-md border border-dashed border-neutral-300 py-1 text-[11px] text-neutral-500 hover:bg-neutral-50"
      >
        + Add item
      </button>
    </div>
  );
}

function ItemEditor({ collection, item }: { collection: CmsCollection; item: CmsItem }) {
  return (
    <div className="rounded-md border border-neutral-100 bg-neutral-50 p-1.5">
      <div className="mb-1 flex justify-end">
        <button onClick={() => useBuilder.getState().deleteCmsItem(collection.id, item.id)} className="text-[10px] text-neutral-400 hover:text-red-500">
          remove
        </button>
      </div>
      {collection.fields.map((f: CmsField) => (
        <Row key={f.key} label={f.label}>
          {f.type === "boolean" ? (
            <input
              type="checkbox"
              checked={Boolean(item.fields[f.key])}
              onChange={(e) => useBuilder.getState().updateCmsItem(collection.id, item.id, { [f.key]: e.target.checked })}
            />
          ) : (
            <TextInput
              value={item.fields[f.key] == null ? "" : String(item.fields[f.key])}
              onChange={(v) =>
                useBuilder.getState().updateCmsItem(collection.id, item.id, {
                  [f.key]: f.type === "number" ? (v === "" ? undefined : Number(v)) : v,
                })
              }
            />
          )}
        </Row>
      ))}
    </div>
  );
}
