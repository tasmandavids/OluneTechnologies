// ============================================================================
//  components/marketing/landing/faq-data.ts — FAQ copy, shared by the Server
//  Component (app/faq/page.tsx, for JSON-LD) and the client accordion UI
//  (FaqPageClient.tsx). Kept out of the "use client" module: a Server
//  Component importing a plain data export from a client-boundary file gets
//  an opaque client reference back, not the real array, at build/render time.
// ============================================================================

export type FaqItem = { q: string; a: string };
export type FaqCategory = { label: string; items: FaqItem[] };

export const CATEGORIES: FaqCategory[] = [
  {
    label: "What Olune does",
    items: [
      { q: "What is Olune?", a: "Olune is one home for running a creative studio or freelance business: projects and tasks, quotes, invoices, expenses and cash flow, plus live client websites — all behind one login. Instead of stitching four tools together, everything lives in one calm place and stays in sync automatically." },
      { q: "Who is Olune for?", a: "Freelancers, small studios and agencies who juggle client work, money and websites. If you run projects, send invoices and look after client sites, Olune was built for your week." },
      { q: "What does Olune replace?", a: "Typically a project-management tool, an accounting or invoicing app, a website builder, and the spreadsheets holding it all together. One subscription, one login, no copy-pasting data between apps." },
      { q: "Do my clients need an Olune account?", a: "No. Quotes and invoices arrive as simple links your clients can view, accept and pay. Their websites are just live websites — no logins or portals for them to learn." },
    ],
  },
  {
    label: "Pricing & plans",
    items: [
      { q: "How much does Olune cost?", a: "Plans start at $19/month for Solo, $49/month for Studio, and $99/month for Scale. For comparison, a separate PM tool, accounting app and website builder usually run $80–150/month combined." },
      { q: "Is there a free trial?", a: "Better — Olune is completely free to use as much as you like until general release in early August. After that, every plan starts with 14 days free and no card is needed to sign up." },
      { q: "Can I change plans or cancel?", a: "Anytime. Upgrade, downgrade or cancel from your settings in a couple of clicks — no lock-in contracts, no cancellation fees." },
      { q: "Are there setup fees or hidden costs?", a: "No. The plan price is the whole price. Hosting for your client sites is included, and updates ship free to every plan." },
    ],
  },
  {
    label: "Websites & connections",
    items: [
      { q: "How does live site building work?", a: "You build and edit client sites right inside Olune, and every change publishes the moment you make it — no staging environments, no deploys, no waiting on a developer for a copy change. Edit on a call and the client sees it refresh in real time." },
      { q: "Can I connect my own domain?", a: "Yes. Point your domain (or your client's) at Olune and the site goes live on it, SSL certificate included. Every site also gets an olune.co.nz address so you can share work before the domain is ready." },
      { q: "Is hosting included?", a: "Yes — fast, managed hosting is included on every plan for every site you build. Nothing extra to configure or pay for." },
      { q: "How do payments and accounting connect?", a: "Invoices can be paid online by card or bank transfer, and payments are matched off automatically so your cash flow view is always current. Come tax time, export everything as CSV for your accountant." },
      { q: "Can I get my data out?", a: "Always. Your projects, invoices, contacts and site content are yours — export them anytime, no questions asked." },
    ],
  },
];
