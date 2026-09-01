// ============================================================================
//  lib/content/compare.ts — /compare editorial content.
//
//  RULES FOR THIS FILE. Everything asserted about another company must be
//  something published on their own site and verifiable, and the `checked`
//  date must be updated whenever it's re-verified. Competitor pricing moves;
//  a stale claim here is a claim Olune is publishing, not a claim they are.
//
//  Prefer describing the pricing *model* over quoting exact figures, say where
//  the other product is genuinely stronger, and never assert an absence of a
//  feature that hasn't been confirmed. Comparison pages that overreach get
//  found out by exactly the buyer they were written for.
//
//  Sources last verified 2026-08-11:
//    jackrabbitdance.com/pricing — tiered by end-of-month student count,
//      from US$49/mo (0–100 students), US$89 (101–250), US$129 (251–500);
//      the branded parent app (Plus) carries a one-time US$169 setup fee;
//      enterprise tiers listed at US$245 and US$331/mo.
//    classmanager.com — single flat monthly licence covering all features,
//      with unlimited students and teachers.
// ============================================================================

import type { CompareDoc } from "./types";

export const COMPARISONS: CompareDoc[] = [
  {
    slug: "jackrabbit-alternative",
    them: "Jackrabbit Dance",
    checked: "2026-08-11",
    title: "A New Zealand alternative to Jackrabbit Dance",
    metaTitle: "Jackrabbit Dance Alternative for NZ Studios",
    description:
      "Comparing Olune with Jackrabbit Dance for New Zealand studios: NZD versus USD pricing, per-student tiers versus flat plans, GST, and what's included.",
    eyebrow: "Compare",
    intro:
      "Jackrabbit is one of the most established class management systems in the world. The question for a New Zealand studio isn't whether it works — it's whether you're paying for scale you don't have, in a currency you don't earn.",
    updated: "2026-08-11",
    table: [
      { label: "Pricing model", them: "Tiered by student count", olune: "Flat, by capability" },
      { label: "Student limit", them: "Drives the price", olune: "Unlimited on every plan" },
      { label: "Currency", them: "USD", olune: "NZD, GST-inclusive" },
      { label: "NZ GST handling", them: "Not NZ-specific", olune: "Studio-level, inclusive or exclusive" },
      { label: "Studio website", them: "Sold separately", olune: "Included from Studio" },
      { label: "Branded parent app", them: "Add-on with setup fee", olune: "Not offered" },
      { label: "Track record", them: "Long-established", olune: "In development until December" },
    ],
    sections: [
      {
        h: "The honest summary",
        p: [
          "Jackrabbit has been running studios for a long time and has the depth that comes with it. If you're a large multi-location school that needs mature reporting and a branded parent app, it's a serious system and this page isn't going to talk you out of it.",
          "Olune is a better fit if you're a New Zealand studio that wants NZD pricing, GST handled properly, and your website in the same place as your class list — and if a flat monthly price matters more to you than a branded app.",
        ],
      },
      {
        h: "You shouldn't pay more for having a good year",
        p: [
          "Jackrabbit's published pricing is tiered on your student count at the end of each month, starting at US$49/month for up to 100 students and stepping up from there. That model is fair in principle: small studios pay less.",
          "The catch is the boundaries. A strong Term 1 that pushes you from 100 students to 105 moves you into the next bracket, and studio numbers rarely go back down neatly. Every dancer you recruit costs you a little more, which is a strange incentive for software whose job is to help you grow.",
          "Olune's plans are unlimited students on every tier. What separates the tiers is capability — which parts of Olune you switch on — never headcount. Fill the room and the price doesn't move.",
        ],
      },
      {
        h: "Being billed in US dollars from New Zealand",
        p: [
          "Every US-priced plan carries an exchange rate you didn't agree to. A subscription budgeted at one rate in March is a different number in October, plus whatever your bank adds for the conversion. Over a year that's real money and it's completely outside your control.",
          "Olune is priced in New Zealand dollars because Olune is built for New Zealand studios. What you're quoted is what leaves your account.",
        ],
      },
      {
        h: "GST, terms and the New Zealand shape of things",
        p: [
          "This is the difference that shows up weekly rather than annually. New Zealand studios run four school terms and, if registered, advertise GST-inclusive fees. Software built primarily for the US market is built around semesters, monthly memberships and a sales-tax model where tax is added at checkout.",
          "You can make an American system work — plenty of NZ studios do — but you end up doing small translations constantly. Olune sets GST once at studio level so your invoices match your advertised fees, and bills by the term because that's how your year runs.",
        ],
      },
      {
        h: "Where Jackrabbit is genuinely ahead",
        p: [
          "Two things, and they matter. Jackrabbit has years of production use behind it, which is not something a newer product can claim — Olune is still in development, with general release due in December. And Jackrabbit offers a custom-branded parent app, which Olune does not.",
          "If either of those is decisive for your studio, that's a reasonable place to land.",
        ],
      },
    ],
    faq: [
      {
        q: "Is Olune cheaper than Jackrabbit Dance?",
        a: "Olune's plans start at NZ$29/month, GST-inclusive, with unlimited students on every tier. Jackrabbit's published pricing starts at US$49/month for up to 100 students and steps up as your roll grows. Beyond the headline figures, the practical differences are the currency and whether your bill changes as you grow.",
      },
      {
        q: "Does Jackrabbit handle New Zealand GST?",
        a: "Jackrabbit is built primarily for the US market, so its tax handling isn't NZ-specific. Olune sets GST at studio level, inclusive or exclusive, so invoices match the fees you advertise.",
      },
      {
        q: "Can I move my students from Jackrabbit to Olune?",
        a: "Yes. Students, families and classes can be brought in rather than retyped. Export from your current system before you commit, ideally during a term break so no fees are mid-collection.",
      },
    ],
    related: ["class-manager-alternative", "spreadsheets"],
  },

  {
    slug: "class-manager-alternative",
    them: "Class Manager",
    checked: "2026-08-11",
    title: "A New Zealand alternative to Class Manager",
    metaTitle: "Class Manager Alternative for NZ Studios",
    description:
      "Comparing Olune with Class Manager for New Zealand dance studios: pricing model, NZD and GST, and whether your studio website comes with it.",
    eyebrow: "Compare",
    intro:
      "Class Manager's flat licence with unlimited students is a genuinely good pricing model — better than most of its competitors. The difference is what sits around the class list.",
    updated: "2026-08-11",
    table: [
      { label: "Pricing model", them: "Flat monthly licence", olune: "Flat, by capability" },
      { label: "Student limit", them: "Unlimited", olune: "Unlimited on every plan" },
      { label: "NZ GST handling", them: "Not NZ-specific", olune: "Studio-level, inclusive or exclusive" },
      { label: "Studio website", them: "Sold separately", olune: "Included from Studio" },
      { label: "Xero connection", them: "Check current docs", olune: "Built in" },
      { label: "Track record", them: "Established", olune: "In development until December" },
    ],
    sections: [
      {
        h: "The honest summary",
        p: [
          "Class Manager publishes a single monthly licence covering its full feature set with unlimited students and teachers. That's a straightforward, defensible model, and if pure cost-per-student is your deciding factor at a large roll, it's hard to beat.",
          "Olune's case is narrower and more specific: it's built for New Zealand studios, it includes your studio website rather than expecting you to run one elsewhere, and it connects to Xero out of the box.",
        ],
      },
      {
        h: "Your website is the part that quietly costs you",
        p: [
          "Most class management software manages classes and stops there. Your public timetable then lives on a separate website — Squarespace, Wix, WordPress, or a developer you email — and the two are updated independently.",
          "That gap is where studios lose time and credibility. A class moves, the system knows, the website doesn't, and a family turns up on Tuesday for a class that now runs Wednesday. It also means a second subscription and a second thing to learn. Olune includes the studio website, edited in the same place as the class list, so changing a class time changes the public timetable at the same moment.",
        ],
      },
      {
        h: "Built for the New Zealand year",
        p: [
          "Four school terms, GST-inclusive advertised fees, NZD, and families who expect to pay by term rather than by month. Olune's fee model, GST handling and currency are all built around that rather than adapted to it.",
          "If you're a New Zealand studio, this is the axis on which the comparison actually turns — not feature counts.",
        ],
      },
      {
        h: "Where Class Manager is genuinely ahead",
        p: [
          "Maturity, and the simplicity of one licence. Class Manager is an established product with a real user base and years of production use behind it; Olune is still in development, with general release due in December. For a studio that can't afford to be an early adopter, that difference is the whole decision.",
          "Class Manager also puts every feature behind a single fee, where Olune's tiers gate capability — so a small studio wanting one Scale-tier module has to move up a plan to get it. On student numbers the two are the same: both are unlimited.",
        ],
      },
      {
        h: "How to decide",
        p: [
          "Ask what your website situation costs you today — in subscription, in time, and in the number of times a term your public timetable has been wrong. If that number is zero, the case for switching is weaker. If you're paying for a site you dread editing, that's the gap Olune is built to close.",
          "Olune is free to use until general release, so you can put a real term through it before committing either way.",
        ],
      },
    ],
    faq: [
      {
        q: "Does Class Manager include a website?",
        a: "Class Manager focuses on class management; a public studio website is generally something you run separately. Olune includes a studio website you edit in the same place as your class list, so your public timetable can't drift out of sync.",
      },
      {
        q: "Is Olune a good Class Manager alternative for a New Zealand studio?",
        a: "It's built specifically for the NZ context — NZD pricing, GST at studio level, term-based fees and Xero — and includes the studio website. Class Manager's flat licence with unlimited students remains a strong option, particularly at a large roll.",
      },
      {
        q: "Can I try Olune before switching?",
        a: "Yes. Olune is free to use as much as you like until general release in December, which is long enough to run a full term through it before deciding.",
      },
    ],
    related: ["jackrabbit-alternative", "spreadsheets"],
  },

  {
    slug: "spreadsheets",
    them: "spreadsheets",
    checked: "2026-08-11",
    title: "Olune vs running your studio on spreadsheets",
    metaTitle: "Studio Management Software vs Spreadsheets",
    description:
      "When spreadsheets stop working for a dance studio: the specific failures, what they cost in hours and lost fees, and how to tell you've reached the point of switching.",
    eyebrow: "Compare",
    intro:
      "Plenty of good studios run on spreadsheets for years, and there's no shame in it. It's worth knowing the specific points where they stop being free.",
    updated: "2026-08-11",
    table: [
      { label: "Cost", them: "Free", olune: "From NZ$29/month" },
      { label: "Setup", them: "Already done", olune: "An evening" },
      { label: "Enrolment", them: "Retyped from forms", olune: "Families enter their own" },
      { label: "Term invoicing", them: "Built by hand", olune: "Generated from the roll" },
      { label: "Attendance", them: "Paper, if kept", olune: "On the student record" },
      { label: "If you're away", them: "Only you can run it", olune: "Anyone with access can" },
    ],
    sections: [
      {
        h: "Spreadsheets are genuinely good at some of this",
        p: [
          "They're free, you already know how they work, and they bend to whatever odd thing your studio does without asking permission. For a single teacher with sixty students and a simple fee structure, a well-kept spreadsheet is a perfectly reasonable way to run a studio, and swapping it for software you resent is not an improvement.",
          "The failures below are specific. If none of them describe your studio, stay where you are.",
        ],
      },
      {
        h: "Failure one: the same information in three places",
        p: [
          "The class list, the invoice sheet and the public timetable each hold a version of the truth. A student changes classes and you update two of them. Which two varies.",
          "This is the failure that produces the term-fee error you find in week six, and it gets worse with every teacher you add, because now there are more hands and more copies.",
        ],
      },
      {
        h: "Failure two: invoicing takes a weekend",
        p: [
          "Building term invoices by hand from a spreadsheet is a few hours of careful work four times a year, plus the corrections afterwards. Say five hours a term including fixes — twenty hours a year, on a weekend, doing arithmetic.",
          "That's the clearest comparison available. Twenty hours of your time against a subscription. Most studio owners, asked to price their own weekend, find the software is cheaper.",
        ],
      },
      {
        h: "Failure three: money quietly leaks",
        p: [
          "Spreadsheets are bad at chasing. Unpaid fees are only visible if you go looking, and reconciling against the bank account is a manual scan. Studios that switch usually find at least one family who hasn't paid for something — occasionally a whole term.",
          "This is the failure that pays for the subscription outright, and it's the one people are most surprised by.",
        ],
      },
      {
        h: "Failure four: it only runs if you do",
        p: [
          "The spreadsheet has your conventions in it. The colour that means paid, the tab that's out of date but you know not to use, the formula you'd have to explain.",
          "That's fine until you're sick in enrolment week, or you want to hire an administrator, or you want to sell the studio. At that point the system existing only in your head becomes the constraint on the business growing.",
        ],
      },
      {
        h: "How to tell you've reached the point",
        p: [
          "Three signals, any one of which is enough: you have more than one person who needs to update the same information; you've found a fee error you can't explain; or you've started avoiding the spreadsheet on a Sunday.",
          "If you're there, Olune is free until general release in December, so you can move a term across and see the comparison honestly before spending anything.",
        ],
      },
    ],
    faq: [
      {
        q: "Is studio management software worth it for a small dance studio?",
        a: "It depends on where your time goes. If term invoicing takes a weekend and you're chasing fees from memory, the subscription is usually cheaper than the hours. For a single teacher with a simple fee structure and a well-kept spreadsheet, staying put is a reasonable choice.",
      },
      {
        q: "What do studios usually get wrong with spreadsheets?",
        a: "The same information ending up in several places — class list, invoice sheet and public timetable — so they drift apart. That's what produces term-fee errors and out-of-date timetables, and it gets worse as soon as more than one person is editing.",
      },
      {
        q: "Can I move my spreadsheet data into Olune?",
        a: "Yes. Students, families and classes can be brought in rather than retyped. A term break is the easiest time to do it, since no fees are mid-collection.",
      },
    ],
    related: ["jackrabbit-alternative", "class-manager-alternative"],
  },
];

export const COMPARE_SLUGS = COMPARISONS.map((c) => c.slug);

export function comparisonBySlug(slug: string): CompareDoc | undefined {
  return COMPARISONS.find((c) => c.slug === slug);
}
