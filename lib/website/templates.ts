// ============================================================================
//  lib/website/templates.ts — the 20-template catalog, ported verbatim from
//  the "Olune Website Designer Templates" Claude Design project
//  (Website Designer.dc.html, embedded TEMPLATES/FEATURES consts).
// ============================================================================

import type { WebsiteTemplateKind } from "./types";

export type TemplateVibe = "Calm" | "Classic" | "Bold" | "Playful";

export type WebsiteTemplate = {
  id: string;
  name: string;
  kind: WebsiteTemplateKind;
  vibe: TemplateVibe;
  accent: string;
  paper: string;
  ink: string;
  fontDisplay: string;
  fontBody: string;
  studio: string;
  headline: string;
  tagline: string;
  eyebrow: string;
  /** Popularity score, used for "Most popular" sort. */
  pop: number;
  /** Age in months-ish, used for "Newest" sort (lower = newer). */
  age: number;
  blurb: string;
  long: string;
};

export const TEMPLATES: WebsiteTemplate[] = [
  { id: "aria", name: "Aria", kind: "split", vibe: "Calm", accent: "#6b66c9", paper: "#faf8f3", ink: "#141414", fontDisplay: "Fraunces", fontBody: "Hanken Grotesk", studio: "Aria Dance Collective", headline: "Where your dancer grows up.", tagline: "Small classes, real teachers, and evenings that feel calm again.", eyebrow: "Est. 1998", pop: 98, age: 40, blurb: "Split hero, quiet type", long: "The Olune house style. A calm split hero, generous type, and a booking button that never leaves the fold. Best for studios who want to look established without looking stiff." },
  { id: "meridian", name: "Meridian", kind: "editorial", vibe: "Classic", accent: "#2f4a47", paper: "#f6f4ee", ink: "#12211f", fontDisplay: "Cormorant Garamond", fontBody: "Archivo", studio: "Meridian Academy", headline: "A classical training, a modern studio.", tagline: "Graded syllabus, examined annually, taught with care.", eyebrow: "Since 1974", pop: 91, age: 22, blurb: "Editorial grid, rule lines", long: "Built like a printed programme: a two-column grid, hairline rules, and small-caps navigation. Carries long-form writing better than any other template here." },
  { id: "loft", name: "Loft", kind: "bold", vibe: "Bold", accent: "#e4572e", paper: "#ffffff", ink: "#0d0d0d", fontDisplay: "Syne", fontBody: "DM Sans", studio: "Loft Movement", headline: "Move loud.", tagline: "Street, commercial and heels for people who came to sweat.", eyebrow: "Auckland", pop: 87, age: 9, blurb: "Dark, oversized, stats", long: "Ink-dark, oversized, and unapologetic. Colour blocks and count-up stats do the talking. Strong for competitive and commercial studios." },
  { id: "vespera", name: "Vespera", kind: "poster", vibe: "Calm", accent: "#7a6a9b", paper: "#f7f5f0", ink: "#1b1a38", fontDisplay: "Bodoni Moda", fontBody: "Archivo", studio: "Vespera Ballet", headline: "Evening class.", tagline: "Adult ballet, beginners welcome, no mirrors if you'd rather.", eyebrow: "Six nights a week", pop: 84, age: 4, blurb: "Full-bleed poster hero", long: "One full-bleed image, one enormous line of type. The most cinematic template in the set — best when you have one photograph you love." },
  { id: "kestrel", name: "Kestrel", kind: "sidebar", vibe: "Classic", accent: "#1b4965", paper: "#f8f6f1", ink: "#0f2130", fontDisplay: "Instrument Serif", fontBody: "DM Sans", studio: "Kestrel School of Dance", headline: "Forty years on the same street.", tagline: "Three studios, fifteen teachers, one very worn sprung floor.", eyebrow: "Est. 1984", pop: 79, age: 31, blurb: "Fixed side nav, photo mosaic", long: "A coloured sidebar holds navigation still while the page moves. The mosaic below the hero is made for studios with lots of photography." },
  { id: "marguerite", name: "Marguerite", kind: "frame", vibe: "Calm", accent: "#c08a6b", paper: "#fffdf9", ink: "#241a13", fontDisplay: "Cormorant Garamond", fontBody: "Hanken Grotesk", studio: "Marguerite Studio", headline: "Slow, careful, kind.", tagline: "Pilates and barre in a room that smells faintly of eucalyptus.", eyebrow: "Studio & wellbeing", pop: 76, age: 12, blurb: "Inset frame, delicate serif", long: "A hairline frame gives the page a gallery feel. Delicate serif at large sizes, warm neutral palette — a favourite with wellbeing and pilates studios." },
  { id: "cadence", name: "Cadence", kind: "band", vibe: "Playful", accent: "#d4468a", paper: "#fffdfa", ink: "#2a1020", fontDisplay: "Syne", fontBody: "Hanken Grotesk", studio: "Cadence Dance", headline: "Tuesday, 4.30, be there.", tagline: "Everything a parent needs on one screen — timetable included.", eyebrow: "Ages 3 to 18", pop: 93, age: 6, blurb: "Colour bands, timetable strip", long: "Colour bands and a live timetable strip right under the hero. Built for high-traffic family studios where the top question is always 'when?'." },
  { id: "solstice", name: "Solstice", kind: "stack", vibe: "Calm", accent: "#b8763e", paper: "#faf6ef", ink: "#1f1509", fontDisplay: "Fraunces", fontBody: "Archivo", studio: "Solstice", headline: "Solstice", tagline: "Contemporary technique and improvisation for teens and adults.", eyebrow: "Movement studio", pop: 72, age: 17, blurb: "Centred stack, arched image", long: "Symmetrical and quiet: centred type, an arched image, nothing competing. The simplest template to fill in when you're short on content." },
  { id: "halcyon", name: "Halcyon", kind: "split", vibe: "Calm", accent: "#5b8c7b", paper: "#f7f7f2", ink: "#101d18", fontDisplay: "Cormorant Garamond", fontBody: "Hanken Grotesk", studio: "Halcyon Yoga", headline: "Breathe, then move.", tagline: "Sixty classes a week, all levels, all bodies.", eyebrow: "Yoga & breath", pop: 81, age: 8, blurb: "Split hero, sage palette", long: "The split hero again, dialled softer: lighter serif, sage palette, more air. Popular with yoga and mixed-discipline studios." },
  { id: "pirouette", name: "Pirouette", kind: "poster", vibe: "Playful", accent: "#e86a9a", paper: "#fffaf7", ink: "#2b0f1d", fontDisplay: "Bodoni Moda", fontBody: "DM Sans", studio: "Pirouette Junior", headline: "First steps.", tagline: "Pre-school ballet and creative movement for ages three to six.", eyebrow: "Tiny dancers", pop: 88, age: 3, blurb: "Poster hero, sweet palette", long: "Poster structure with a softer, sweeter palette. Made for pre-school programmes where the parent decides in ten seconds." },
  { id: "atlas", name: "Atlas", kind: "sidebar", vibe: "Bold", accent: "#141414", paper: "#ffffff", ink: "#000000", fontDisplay: "Archivo", fontBody: "Archivo", studio: "Atlas Studios", headline: "Train like it's the job.", tagline: "Pre-professional programme, audition-only, five days a week.", eyebrow: "Pre-professional", pop: 69, age: 5, blurb: "Monochrome, one typeface", long: "One typeface, no colour but yours, a black sidebar. The most serious template in the set — built for pre-professional and audition programmes." },
  { id: "wren", name: "Wren", kind: "stack", vibe: "Calm", accent: "#7e8b6b", paper: "#f9f8f2", ink: "#1a1d12", fontDisplay: "Instrument Serif", fontBody: "Hanken Grotesk", studio: "Wren Music School", headline: "Wren", tagline: "Piano, strings and voice — lessons in a house full of light.", eyebrow: "Music school", pop: 64, age: 14, blurb: "Centred, literary serif", long: "A centred stack set in a literary serif. Written for small music and art schools where the teacher is the brand." },
  { id: "lumen", name: "Lumen", kind: "band", vibe: "Bold", accent: "#6b66c9", paper: "#ffffff", ink: "#1b1a38", fontDisplay: "Syne", fontBody: "Archivo", studio: "Lumen Collective", headline: "Six disciplines, one building.", tagline: "Dance, circus, theatre, voice, film, and a café that stays open late.", eyebrow: "Arts centre", pop: 74, age: 2, blurb: "Iris bands, multi-programme", long: "Bands of brand colour organise a lot of programmes without a menu tree. Best for arts centres and multi-discipline organisations." },
  { id: "odeon", name: "Odeon", kind: "editorial", vibe: "Classic", accent: "#6e2639", paper: "#f6f2ec", ink: "#25101a", fontDisplay: "Bodoni Moda", fontBody: "Archivo", studio: "Odeon Theatre School", headline: "Speak up, stand still, mean it.", tagline: "Acting, voice and musical theatre for ages eight and up.", eyebrow: "Since 1961", pop: 71, age: 25, blurb: "Playbill grid, deep claret", long: "A playbill: heavy display serif, claret palette, two-column body copy. Written for theatre and musical theatre schools." },
  { id: "fable", name: "Fable", kind: "frame", vibe: "Playful", accent: "#e0a83a", paper: "#fffdf6", ink: "#291f06", fontDisplay: "Fraunces", fontBody: "DM Sans", studio: "Fable Art Club", headline: "Make a mess on purpose.", tagline: "After-school art and clay for kids who can't sit still.", eyebrow: "Art club", pop: 66, age: 7, blurb: "Framed, warm and sunny", long: "The framed layout warmed up with sun-yellow and rounder buttons. Made for children's art, craft and holiday programmes." },
  { id: "tempo", name: "Tempo", kind: "bold", vibe: "Bold", accent: "#1f5f8b", paper: "#ffffff", ink: "#0b1a24", fontDisplay: "Syne", fontBody: "DM Sans", studio: "Tempo Athletic", headline: "Rhythm is a sport.", tagline: "Cheer, tumbling and acro — competitive squads and open classes.", eyebrow: "Competitive", pop: 77, age: 11, blurb: "Dark hero, big numbers", long: "Ink hero with three big numbers under it. Written for competitive squads who lead with results." },
  { id: "verdant", name: "Verdant", kind: "split", vibe: "Calm", accent: "#3f6b4f", paper: "#f8f8f3", ink: "#0f1c13", fontDisplay: "Cormorant Garamond", fontBody: "Hanken Grotesk", studio: "Verdant Studio", headline: "A studio in the garden.", tagline: "Barre, mat and mobility, two streets back from the beach.", eyebrow: "Movement & mobility", pop: 62, age: 16, blurb: "Split hero, deep green", long: "Split hero in deep green with a longer intro paragraph. Suits studios whose room is part of the pitch." },
  { id: "novella", name: "Novella", kind: "editorial", vibe: "Classic", accent: "#4a3b6b", paper: "#f7f5f1", ink: "#1a1428", fontDisplay: "Instrument Serif", fontBody: "Archivo", studio: "Novella Writing Room", headline: "Every Thursday, we write.", tagline: "Workshops, mentoring and a reading series in the back room.", eyebrow: "Writing studio", pop: 58, age: 19, blurb: "Text-first editorial", long: "The most text-forward template: two columns of body copy, one photograph, no persuasion. For workshops, courses and studios that write a lot." },
  { id: "rhythm", name: "Rhythm", kind: "band", vibe: "Playful", accent: "#f2762e", paper: "#fffcf8", ink: "#2a1406", fontDisplay: "Archivo", fontBody: "Archivo", studio: "Rhythm Kids", headline: "Loud, fast, wonderful.", tagline: "Hip hop, breaking and crew classes from ages five up.", eyebrow: "Hip hop", pop: 83, age: 1, blurb: "Apricot bands, all-sans", long: "All-sans, apricot bands, timetable chips up front. The newest template in the set and the most energetic." },
  { id: "elysia", name: "Elysia", kind: "poster", vibe: "Calm", accent: "#9b7bb8", paper: "#faf8f5", ink: "#1c1428", fontDisplay: "Bodoni Moda", fontBody: "Hanken Grotesk", studio: "Elysia", headline: "Quiet strength.", tagline: "Ballet and conditioning for adults returning to the barre.", eyebrow: "Adult programme", pop: 68, age: 13, blurb: "Poster hero, lavender dusk", long: "Poster hero in lavender dusk with a single centred call to action. Written for adult and returner programmes." },
];

export const TEMPLATE_MAP: Record<string, WebsiteTemplate> = Object.fromEntries(
  TEMPLATES.map((t) => [t.id, t]),
);

export function getTemplate(id: string): WebsiteTemplate {
  return TEMPLATE_MAP[id] ?? TEMPLATES[0];
}

/** "Comes with" chips shown in the template preview modal — same for every
 *  template today (the mockup doesn't vary these per-template). */
export const TEMPLATE_FEATURES = [
  "Timetable",
  "Online booking",
  "Fees & payments",
  "Photo gallery",
  "Term dates",
  "Teacher profiles",
  "News",
  "Contact form",
];

export type TemplateSort = "popular" | "newest";

export function sortTemplates(templates: WebsiteTemplate[], sort: TemplateSort): WebsiteTemplate[] {
  return [...templates].sort((a, b) => (sort === "newest" ? a.age - b.age : b.pop - a.pop));
}

/** All unique Google Font families used across the template catalog — for
 *  loading every font the gallery/preview screens might render at once. */
export function allTemplateFontFamilies(): string[] {
  const names = new Set<string>();
  for (const t of TEMPLATES) {
    names.add(t.fontDisplay);
    names.add(t.fontBody);
  }
  return [...names];
}

export const VIBES: TemplateVibe[] = ["Calm", "Classic", "Bold", "Playful"];

export const DENSITIES: { label: string; value: number }[] = [
  { label: "Cosy", value: 40 },
  { label: "Balanced", value: 56 },
  { label: "Airy", value: 80 },
];

/** Brand colour swatch presets for the customizer — ported from the mockup's
 *  BRANDS const. */
export const BRAND_SWATCHES: string[] = ["#6b66c9", "#2f4a47", "#e4572e", "#1b4965", "#c08a6b", "#d4468a", "#b8763e", "#141414"];

/** Page/ink colour pairs for the customizer — ported from the mockup's
 *  PAPERS const (hex = page background, ink = matching legible text colour). */
export const PAPER_SWATCHES: { paper: string; ink: string }[] = [
  { paper: "#faf8f3", ink: "#141414" },
  { paper: "#ffffff", ink: "#141414" },
  { paper: "#f6f2ec", ink: "#141414" },
  { paper: "#1b1a38", ink: "#f7f4ee" },
];
