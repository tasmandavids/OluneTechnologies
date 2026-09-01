// ============================================================================
//  components/marketing/landing/faq-data.ts — FAQ copy, shared by the Server
//  Component (app/faq/page.tsx, for JSON-LD) and the client accordion UI
//  (FaqPageClient.tsx). Kept out of the "use client" module: a Server
//  Component importing a plain data export from a client-boundary file gets
//  an opaque client reference back, not the real array, at build/render time.
//
//  Answers double as the source for the FAQPage structured data, so every
//  claim here has to be true of the shipped product — Google discards markup
//  that contradicts the page, and assistants quote these answers verbatim.
// ============================================================================

export type FaqItem = { q: string; a: string };
export type FaqCategory = { label: string; items: FaqItem[] };

export const CATEGORIES: FaqCategory[] = [
  {
    label: "What Olune does",
    items: [
      { q: "What is Olune?", a: "Olune is studio management software for dance and fitness studios: classes and timetables, online enrolments, attendance, term fees and payments, family records, and a live studio website — all behind one login. Instead of stitching four tools together, everything lives in one calm place and stays in sync automatically." },
      { q: "Who is Olune for?", a: "Dance schools, ballet studios, performing arts academies and fitness studios — anywhere people enrol in classes by the term. Whether you teach a handful of classes yourself or run several teachers across two locations, Olune was built for your week." },
      { q: "What does Olune replace?", a: "Typically a class management or booking app, an accounting or invoicing tool, a separate website builder, paper registers, and the spreadsheets holding it all together. One subscription, one login, no copy-pasting between apps." },
      { q: "Do parents need an Olune account?", a: "Parents get their own portal to enrol children, see the timetable, and view and pay invoices — but they never have to learn a system to get started. Enrolment and payment links work straight from an email, and your studio website is just a website." },
      { q: "Is Olune only for dance studios?", a: "No. Anything run as scheduled classes with enrolled students fits — dance, ballet, cheer, gymnastics, martial arts, yoga and fitness studios all use the same enrolments, registers and fees." },
    ],
  },
  {
    label: "Classes, enrolments & attendance",
    items: [
      { q: "Can students enrol online?", a: "Yes. Turn on registration and your studio gets a public enrolment page where new families sign up, pick classes and are placed straight onto the roll — no forms to retype. Enquiries that don't finish enrolling land in your leads list so nobody gets lost." },
      { q: "How does attendance work?", a: "Mark the roll from any device, or let students tap in at the door with an Olune check-in card. Attendance lands against the class and the student's record the moment it happens, so who's in and who's away is always current." },
      { q: "Does the register work without internet?", a: "Yes. The mobile register keeps working with no signal — mark the class in the studio and it syncs as soon as you're back on a connection." },
      { q: "Can parents be told when their child arrives?", a: "Yes. When a student taps in, their family can be notified automatically, so parents know their child made it to class without ringing the office." },
      { q: "Can I run private lessons and casual classes too?", a: "Yes. Alongside the regular term timetable you can run private lessons, class passes for casual attendance, and one-off events, all billed through the same system." },
      { q: "What happens when a teacher can't make a class?", a: "Record the absence and cover it from your own staff, or look for an available instructor through the Olune Network — a shared pool of teachers open to cover work." },
    ],
  },
  {
    label: "Fees & payments",
    items: [
      { q: "How do term fees work?", a: "Generate invoices for a whole term in one go from who's enrolled, then send them to families. Payments are tracked against each invoice, so at any point you can see what's come in and what's still owed." },
      { q: "Can families pay in instalments?", a: "Yes. Payment plans split a term's fees into scheduled instalments that are collected automatically, so families can spread the cost without you chasing each part." },
      { q: "How do families pay?", a: "Invoices can be paid online by card. Payments made another way — a bank transfer or cash at the desk — can be recorded against the invoice so your books stay straight." },
      { q: "Does Olune handle GST?", a: "Yes. You set whether your prices include or exclude GST at the studio level, and invoices are produced accordingly for New Zealand studios." },
      { q: "Does it work with Xero?", a: "Yes. Olune connects to Xero so invoices and payments flow through to your accounts instead of being keyed in twice." },
      { q: "How do I chase unpaid fees?", a: "Overdue invoices collect in one place with the family attached, so a term's chasing is a short list you work through rather than a spreadsheet you rebuild each time." },
    ],
  },
  {
    label: "Your studio website",
    items: [
      { q: "Do I get a website with Olune?", a: "Yes — every studio gets a live website built in, showing your classes, timetable and prices. You edit it yourself inside Olune and changes publish the moment you make them. No developer, no waiting on a copy change." },
      { q: "Can I use my own domain?", a: "Yes. Point your domain at Olune and your site goes live on it, SSL certificate included. Every studio also gets an olune.co.nz address so you can share the site before the domain is ready." },
      { q: "Is hosting included?", a: "Yes — fast, managed hosting is included on every plan. Nothing extra to configure or pay for." },
    ],
  },
  {
    label: "Pricing & plans",
    items: [
      { q: "How much does Olune cost?", a: "Plans are NZ$29/month for Solo, NZ$59/month for Studio and NZ$120/month for Scale, GST-inclusive. Annual billing works out to two months free. Every plan has unlimited students — the tiers differ by which parts of Olune they unlock, not by how many dancers you enrol." },
      { q: "Does the price go up as I enrol more students?", a: "No. Every plan has unlimited students, so a strong enrolment term doesn't move you into a more expensive bracket. Most studio software prices on student count; Olune charges for capability instead." },
      { q: "Is there a free trial?", a: "Better — Olune is completely free to use as much as you like until general release in December. After that, every plan starts with 14 days free and no card is needed to sign up." },
      { q: "Can I change plans or cancel?", a: "Anytime. Upgrade, downgrade or cancel from your settings in a couple of clicks — no lock-in contracts, no cancellation fees." },
      { q: "Are there setup fees or hidden costs?", a: "No. The plan price is the whole price — no onboarding fee and no charge to bring your students across. Studio website hosting is included on the plans that carry the website, and updates ship free to every plan." },
      { q: "Can I move my students across from another system?", a: "Yes. Students, families and classes can be brought in rather than retyped, so switching mid-year doesn't mean rebuilding your roll by hand." },
      { q: "Can I get my data out?", a: "Always. Your students, families, invoices and site content are yours — export them anytime, no questions asked." },
    ],
  },
];
