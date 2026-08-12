// ============================================================================
//  lib/content/guides.ts — /guides editorial content.
//
//  These pages exist to answer the questions studio owners type into Google
//  before they know Olune exists; the marketing pages only answer questions
//  from people who already do. NZ-first: NZD, GST, terms, NZ spelling.
//
//  Every claim about Olune here has to be true of the shipped product — these
//  answers are emitted as Article + FAQPage structured data and get quoted
//  verbatim by assistants.
// ============================================================================

import type { ContentDoc } from "./types";

export const GUIDES: ContentDoc[] = [
  {
    slug: "dance-studio-software-nz",
    title: "Choosing dance studio software in New Zealand",
    metaTitle: "Dance Studio Software in New Zealand — How to Choose",
    description:
      "What to look for in dance studio management software as a New Zealand studio: GST and NZD invoicing, term-based enrolment, registers, and who holds your data.",
    eyebrow: "Buyer's guide",
    intro:
      "Most class management software is built for American terms, American tax and American dollars. Here's what actually matters when you're running a studio in New Zealand.",
    updated: "2026-08-11",
    sections: [
      {
        h: "Start with how your year is actually shaped",
        p: [
          "New Zealand studios run on four school terms, not semesters or rolling monthly memberships. That sounds like a small difference until you try to invoice for it. Software built around a monthly membership model will happily charge every family the same amount every month, which is not how a ten-week term with a two-week break works.",
          "Before you look at a feature list, write down how you actually charge: per term, per class, per hour, family discounts, sibling discounts, casual drop-ins. Then check whether the software can express that without you doing arithmetic in a spreadsheet first. If you have to work out the numbers yourself and type them in, the software is a filing cabinet, not a system.",
        ],
      },
      {
        h: "Check that GST is handled, not bolted on",
        p: [
          "If you're GST-registered, every invoice you send has to show GST correctly, and your prices need to be consistently inclusive or exclusive. Overseas software often treats tax as an afterthought or assumes a US sales-tax model where tax is added at checkout and varies by state.",
          "Ask directly: can I set my prices as GST-inclusive, does the invoice show the GST component, and does that flow to my accounting software? In New Zealand the retail convention is GST-inclusive pricing, so if a system forces you to enter exclusive prices you will spend the year explaining to parents why the invoice doesn't match the advertised fee.",
        ],
      },
      {
        h: "Work out what you're really paying",
        p: [
          "Class management software is usually priced one of three ways: a flat licence fee, a tier based on how many students you have, or per-student. Tiered pricing sounds fair until you notice the tier boundaries — going from 100 to 101 students can step your bill up sharply, and a busy Term 1 can push you into a bracket you stay in all year.",
          "Also look for the costs that sit outside the monthly fee: setup fees, a separate charge for a branded parent app, payment processing on top of the platform fee, and whether a website is included or something you buy elsewhere. And check the currency. A plan billed in US dollars moves with the exchange rate, so the price you budgeted in March isn't the price you pay in October.",
        ],
        list: [
          "Is the price in NZD, or converted from USD?",
          "Is there a setup or onboarding fee?",
          "Does the price change as your student numbers grow, and at what points?",
          "Is a website included, or is that a separate subscription?",
          "What does taking a card payment cost on top?",
        ],
      },
      {
        h: "The register is the part you use every single day",
        p: [
          "It's easy to choose software on the strength of its reporting and then discover the bit you touch most — marking who turned up — is slow. You mark registers in a studio, often on a phone, sometimes with a class waiting. It needs to take seconds.",
          "Two questions worth asking: does the register work when the internet doesn't, and does marking attendance actually update anything else? A register that syncs nowhere is a paper roll with extra steps. Attendance should feed the student's record, so when a parent asks how many classes their child has missed this term you can answer without counting.",
        ],
      },
      {
        h: "Ask who holds the data and how you get it back",
        p: [
          "Your student list, family contact details and fee history are the most valuable thing your studio owns. Before you commit, find out how you export them. A vendor that can only give you a PDF, or that charges to release your own data, has made switching away expensive on purpose.",
          "Also worth checking where the data is stored and what the privacy position is, particularly since you're holding information about children. Under the Privacy Act 2020 you're responsible for that information regardless of which software you chose, so 'the vendor handles it' isn't an answer you can give a parent.",
        ],
      },
      {
        h: "Where Olune sits",
        p: [
          "Olune is built for New Zealand studios: prices in NZD, GST handled at studio level so your invoices match your advertised fees, and a term-based fee model with payment plans for families who need to spread the cost. Enrolments come in through your own public page, registers can be marked on a phone or taken by a tap at the door, and your studio website is included rather than bought separately.",
          "It's free to use while it's in development, with general release due in December, so you can put a real term through it before deciding.",
        ],
      },
    ],
    faq: [
      {
        q: "What is the best dance studio software in New Zealand?",
        a: "There isn't one answer — it depends on whether you charge by term or by month, whether you're GST-registered, and how many teachers you run. The practical test is whether the software can express your actual fee structure without you calculating it first, whether it handles GST-inclusive pricing, and whether you can get your student data back out. Most of the well-known options are US-built and priced in US dollars.",
      },
      {
        q: "How much does dance studio software cost?",
        a: "Commonly somewhere between NZ$30 and NZ$200 a month, depending on how many students you have and whether extras like a branded parent app or a website are included. Watch for tiered pricing that steps up with student numbers, one-off setup fees, and payment processing charged on top. Olune's plans start at $29/month in NZD, GST-inclusive, with unlimited students on every tier.",
      },
      {
        q: "Do I need separate software for my studio website?",
        a: "Not necessarily. Some class management systems include a website; others expect you to run one elsewhere, which means your timetable lives in two places and one of them is always out of date. Olune includes a studio website you edit yourself, so changing a class time changes the public timetable at the same moment.",
      },
    ],
    related: ["take-enrolments-online", "term-fee-invoicing", "switch-studio-software-mid-year"],
  },

  {
    slug: "take-enrolments-online",
    title: "How to take dance class enrolments online",
    metaTitle: "How to Take Dance Class Enrolments Online",
    description:
      "Move studio enrolments off paper forms and email threads: what an online enrolment page needs, how to handle waitlists and siblings, and how to stop enquiries going cold.",
    eyebrow: "Guide",
    intro:
      "Enrolment week is the busiest admin fortnight of a studio's year. Most of the work is avoidable — it comes from collecting the same information three times in three formats.",
    updated: "2026-08-11",
    sections: [
      {
        h: "The real cost of a paper or PDF form",
        p: [
          "A paper form has to be printed, handed out, filled in, brought back, chased when it isn't, read, and then typed into wherever your class lists live. A PDF emailed back is the same job with worse handwriting. Every one of those steps is a place a student goes missing, and the typing at the end is where the errors get in — a misread mobile number is a parent you can't reach all term.",
          "The point of enrolling online isn't that it's modern. It's that the family types their own details once, into the same system that holds the class list, and nobody transcribes anything.",
        ],
      },
      {
        h: "What an enrolment page actually needs",
        p: [
          "Keep it short. Every extra field loses people, and most of what studios collect at enrolment could be collected later. You need enough to put the student in the right class, contact the family, and know about anything that affects their safety.",
        ],
        list: [
          "Student name and date of birth, so you can check the age band for the class",
          "The class or classes they want, with the ones that are full clearly shown as full",
          "A parent or guardian name, email and mobile",
          "Medical notes and anything you need to know before they're in the room",
          "Agreement to your terms, and photo permission if you post class pictures",
        ],
      },
      {
        h: "Show the timetable and the price on the same page",
        p: [
          "The most common reason an enrolment doesn't finish is that the family had to go somewhere else to find out when the class runs or what a term costs. If your timetable lives on a website that's edited separately from your class list, it will drift out of date, and by Term 2 you're fielding calls about a class that moved.",
          "Keeping the public timetable and the actual class records in one system removes that gap entirely. Change the class time and the page a parent is looking at changes with it.",
        ],
      },
      {
        h: "Handle full classes properly",
        p: [
          "Hiding a full class loses you the student. Letting people enrol into a class that's already full costs you an awkward email. The middle path is to show it as full and take an expression of interest, so when someone drops out in week three you have a name to call instead of an empty spot.",
          "The same applies to enquiries that don't finish. Someone who started enrolling and stopped is the warmest lead your studio will get all year. If those half-finished enrolments land somewhere you can see, you can follow up while the family is still deciding, rather than never knowing they were interested.",
        ],
      },
      {
        h: "Siblings and families, not just students",
        p: [
          "Studios bill families, not individuals. If your system treats every student as a separate account, a family with three dancers gets three invoices, three logins and three reminder emails, and your sibling discount becomes a manual adjustment you have to remember every term.",
          "Enrolling a second child should reuse everything you already know about that family. One invoice, one set of contact details, one conversation.",
        ],
      },
      {
        h: "How this works in Olune",
        p: [
          "Turn registration on and your studio gets a public enrolment page. Families pick classes, enter their details once, and land directly on the class roll — there's nothing to retype. Enquiries that don't complete collect in your leads list so you can follow them up. Siblings attach to the same family record, so fees and messages go out per family rather than per child.",
        ],
      },
    ],
    faq: [
      {
        q: "Can parents enrol their children online?",
        a: "Yes. With registration enabled, your studio has a public enrolment page where families choose classes and enter their own details, which places the student straight onto the class roll without anyone retyping the form.",
      },
      {
        q: "What happens if a class is full?",
        a: "Full classes should be visible but marked full, so families can still register interest rather than silently going elsewhere. That gives you a list to work through when a place opens up mid-term.",
      },
      {
        q: "Do I have to enrol siblings separately?",
        a: "Siblings should attach to one family record so the studio bills the family once. Enrolling a second child reuses the contact details and fee arrangements already on file.",
      },
    ],
    related: ["term-fee-invoicing", "class-registers-without-paper", "dance-studio-software-nz"],
  },

  {
    slug: "term-fee-invoicing",
    title: "How to invoice term fees without chasing everyone",
    metaTitle: "How to Invoice Dance Studio Term Fees",
    description:
      "A practical approach to term fee invoicing for dance and fitness studios: what to send, when to send it, how to handle GST and sibling discounts, and how to chase late fees without it taking a week.",
    eyebrow: "Guide",
    intro:
      "Term invoicing is the single biggest admin job in a studio year, and most of the pain is in the chasing rather than the sending.",
    updated: "2026-08-11",
    sections: [
      {
        h: "Invoice from the roll, not from a spreadsheet",
        p: [
          "The slow way to invoice a term is to open last term's spreadsheet, update who's still enrolled, work out each family's total, and then create invoices one at a time. It takes a weekend and it goes wrong in the same two places every time: a student who left is still being billed, and a student who joined in week one isn't.",
          "If your invoices are generated from who is actually enrolled, both of those problems disappear. The enrolment is the source of truth, and the invoice is derived from it rather than maintained alongside it.",
        ],
      },
      {
        h: "Send before the term starts, not after it",
        p: [
          "Fees invoiced in week three are fees you're chasing in week eight. Sending before the term begins puts the payment in the same mental slot as the school stationery list and the uniform, which is when families are expecting studio costs.",
          "It also gives you a real number to work with. If you know in the week before term what has been paid and what hasn't, you know whether you can afford the extra Saturday hire.",
        ],
      },
      {
        h: "Get GST right once",
        p: [
          "If you're GST-registered, decide whether your advertised fees are GST-inclusive and then hold that line everywhere. New Zealand retail convention is inclusive pricing, and parents compare the invoice against the fee on your website. If one says $180 and the other says $207, you'll spend the term explaining it.",
          "Set it at the studio level rather than per invoice, so it can't drift. And make sure it carries through to your accounting — invoices that land in Xero already correct are invoices you never touch twice.",
        ],
      },
      {
        h: "Sibling and multi-class discounts",
        p: [
          "Most studios discount the second child or the third class. If that discount is applied by hand at invoice time, it will be missed at least once a year, and the family who spots it will not be quiet about it.",
          "Whatever your discount rule is, write it down and make it part of how the fee is calculated rather than something you remember to subtract. And bill the family once, not each child separately — a family with three dancers should get one invoice with three lines.",
        ],
      },
      {
        h: "Offer a payment plan before you're asked",
        p: [
          "A full term's fees for two children lands as a large single number, and for a lot of families that's the reason they hesitate rather than any doubt about the classes. Splitting it into instalments across the term usually costs you nothing and keeps a family enrolled.",
          "The important part is that the instalments are collected automatically. A payment plan you have to chase each fortnight is worse than a single invoice, because now you're chasing four times instead of once.",
        ],
      },
      {
        h: "Make chasing a short list, not a project",
        p: [
          "Chasing is only painful when you have to rebuild the picture first — cross-referencing bank statements against a spreadsheet against your memory. If unpaid invoices collect in one place with the family attached, the job becomes a list you work down for twenty minutes.",
          "Record payments made outside the system too. A parent who paid cash at the desk and still gets a reminder is a parent who feels the studio is disorganised, and they're right.",
        ],
      },
      {
        h: "How this works in Olune",
        p: [
          "Term invoices are generated from who's enrolled, so the roll and the billing can't disagree. GST is set once at studio level, payment plans split a term into instalments that collect automatically, and everything unpaid gathers in one collections view with the family attached. Invoices and payments flow through to Xero rather than being keyed in twice.",
        ],
      },
    ],
    faq: [
      {
        q: "When should a dance studio invoice for term fees?",
        a: "Before the term starts, ideally in the week or two beforehand. Families are already budgeting for term costs at that point, and it means you know what's been paid before you commit to hire and staffing.",
      },
      {
        q: "Should studio fees include GST?",
        a: "If you're GST-registered in New Zealand, the usual convention is to advertise and invoice GST-inclusive so the invoice matches the fee families saw on your website. Set it at studio level so it stays consistent across every invoice.",
      },
      {
        q: "How do I handle families who can't pay a term in full?",
        a: "Offer a payment plan that splits the term into scheduled instalments collected automatically. It keeps families enrolled and, because collection is automatic, it doesn't turn one invoice into four chase-ups.",
      },
    ],
    related: ["payment-plans-for-studio-fees", "take-enrolments-online", "dance-studio-software-nz"],
  },

  {
    slug: "class-registers-without-paper",
    title: "How to run class registers without paper",
    metaTitle: "How to Run Dance Class Registers Without Paper",
    description:
      "Replace the paper roll: marking attendance on a phone, check-in at the door, what to do when the studio has no signal, and why attendance data is worth keeping.",
    eyebrow: "Guide",
    intro:
      "The paper register survives because it always works. Anything replacing it has to be faster than a pen, and has to work in a hall with no reception.",
    updated: "2026-08-11",
    sections: [
      {
        h: "Why the paper roll persists",
        p: [
          "Paper has real advantages and it's worth being honest about them. It never loads, never logs you out, never runs out of battery mid-class, and works in the church hall where the mobile signal dies at the door. Any replacement that fails on one of those is going back in the drawer by week three.",
          "What paper is bad at is everything afterwards. The roll has to come back to the office, someone has to read it, and the information only becomes useful once it's been typed up — which, realistically, it often isn't.",
        ],
      },
      {
        h: "Marking on a phone has to take seconds",
        p: [
          "A teacher marks the roll with a class in front of them. If it takes more than about twenty seconds it will be done later, and later means at home, and at home means from memory.",
          "The test is simple: open the app, see the class that's on now, tap the names who aren't here, done. If you're navigating through menus to find today's class you've already lost.",
        ],
      },
      {
        h: "Offline is not optional",
        p: [
          "Studios are frequently in buildings that were not designed with mobile coverage in mind. A register that needs a live connection will fail, and it will fail in the middle of a class when you have no attention to spare for it.",
          "What you want is a register that records the marks locally and syncs when the connection returns, so the teacher never has to think about it. Olune's mobile register works with no signal and syncs once you're back online.",
        ],
      },
      {
        h: "Check-in at the door as an alternative",
        p: [
          "For studios with a lot of students moving through, having students check themselves in is faster than any register. A tap at the door logs the arrival against the class and the student without a teacher touching anything.",
          "It also solves a problem the paper roll never could: parents knowing their child arrived. If a tap can notify the family automatically, the office stops fielding calls asking whether a teenager actually turned up.",
        ],
      },
      {
        h: "What attendance data is actually for",
        p: [
          "Attendance is worth collecting properly for three reasons that have nothing to do with tidiness. First, a student quietly missing classes is the earliest signal you get that a family is about to leave, and it's the only point where a conversation still helps. Second, when a parent asks how their child is going, a real answer beats an impression. Third, exam and performance eligibility usually depends on attendance, and reconstructing it from paper in October is miserable.",
          "None of that works if attendance stops at the roll. It has to land against the student's record automatically.",
        ],
      },
      {
        h: "How this works in Olune",
        p: [
          "Registers can be marked from any device, including with no signal — marks sync when the connection comes back. Students can also tap in at the door with a check-in card, which logs arrival against the class and can notify their family automatically. Either way the attendance lands on the student's record straight away, so who's in and who's been away is always current.",
        ],
      },
    ],
    faq: [
      {
        q: "Can I mark a class register without internet?",
        a: "With the right app, yes. Olune's mobile register keeps working with no signal and syncs the marks once you're back on a connection, which matters because a lot of studio spaces have poor coverage.",
      },
      {
        q: "Is check-in at the door better than a teacher marking the roll?",
        a: "It's faster for busy studios and it frees the teacher entirely, but it depends on students remembering to tap. Many studios use both — tap check-in at the door, with the teacher able to adjust the roll in class.",
      },
      {
        q: "Can parents be told when their child arrives at class?",
        a: "Yes, if arrivals are logged electronically. In Olune a tap at the door can notify the family automatically, so parents know their child made it without ringing the studio.",
      },
    ],
    related: ["take-enrolments-online", "dance-studio-software-nz", "term-fee-invoicing"],
  },

  {
    slug: "payment-plans-for-studio-fees",
    title: "Offering payment plans for studio fees",
    metaTitle: "Payment Plans for Dance Studio Fees — How to Set Them Up",
    description:
      "How to split term fees into instalments without creating more chasing: how many instalments, when to collect, what to do about failed payments, and how to keep it fair.",
    eyebrow: "Guide",
    intro:
      "A payment plan is usually cheaper than losing the student. The trick is setting it up so it doesn't multiply your admin by four.",
    updated: "2026-08-11",
    sections: [
      {
        h: "Why studios offer them",
        p: [
          "A term of classes for two children is a meaningful amount of money arriving as one bill, often in the same fortnight as school costs. Families who hesitate at that number are usually not questioning the value of the classes — the timing is the problem.",
          "Splitting the same total across the term removes the obstacle without discounting. You get the same revenue, slightly later, and you keep a family who might otherwise have sat the term out.",
        ],
      },
      {
        h: "Keep the structure simple",
        p: [
          "Two to four instalments across a ten-week term covers most situations. More than that and the admin outweighs the benefit; fewer and you haven't really solved the problem you set out to solve.",
          "Align the dates to when people are actually paid — fortnightly or monthly, not on the studio's own calendar. And take the first instalment at or before the start of term, so a family who disappears in week two hasn't had free classes.",
        ],
      },
      {
        h: "Automatic collection is the whole point",
        p: [
          "A payment plan where you send four invoices and chase four times is worse than a single invoice. The value only exists if the instalments collect themselves on the dates agreed.",
          "That means the family authorises the schedule once, at setup, and the rest happens without either of you thinking about it. Anything less and you've taken one admin job and turned it into several.",
        ],
      },
      {
        h: "Decide in advance what happens when one fails",
        p: [
          "Cards expire and accounts run short — a failed instalment is a normal event, not a crisis, and it shouldn't need a decision each time. Agree a rule and write it into your terms: it retries after a few days, the family is told, and if it still doesn't clear you have a conversation.",
          "Having that written down keeps it unembarrassing for everyone, which matters when the parent is standing in your foyer at pickup.",
        ],
      },
      {
        h: "Be even-handed about who gets one",
        p: [
          "Deciding case by case puts you in the position of judging families' finances, which is uncomfortable and tends to be applied inconsistently. Either offer plans to everyone or set a clear threshold — over a certain invoice amount, or for families with more than one child enrolled.",
          "Publishing the rule also removes the awkward conversation entirely. Families who need it take it up without having to ask for a favour.",
        ],
      },
      {
        h: "How this works in Olune",
        p: [
          "Payment plans split a term's fees into scheduled instalments that are collected automatically once the family has set them up, so a plan doesn't turn into repeated chasing. Everything still ties back to the same term invoice, and anything outstanding shows in the same collections view as the rest of your unpaid fees.",
        ],
      },
    ],
    faq: [
      {
        q: "How many instalments should a studio payment plan have?",
        a: "Two to four across a ten-week term suits most studios. Fewer doesn't really ease the burden on families; more creates administrative work that outweighs the benefit.",
      },
      {
        q: "Do payment plans mean more chasing?",
        a: "Only if the instalments aren't collected automatically. When the family authorises the schedule once and collection happens on the agreed dates, a plan is less work than a single invoice you have to chase.",
      },
      {
        q: "Should I offer payment plans to every family?",
        a: "Either offer them to everyone or set a clear published threshold, such as invoices over a certain amount. Deciding case by case is inconsistent and puts you in the position of assessing families' finances.",
      },
    ],
    related: ["term-fee-invoicing", "dance-studio-software-nz", "take-enrolments-online"],
  },

  {
    slug: "switch-studio-software-mid-year",
    title: "How to switch studio software mid-year",
    metaTitle: "How to Switch Dance Studio Software Mid-Year",
    description:
      "Moving to new studio management software without losing a term: what to export, when to switch, how to run parallel safely, and what to tell families.",
    eyebrow: "Guide",
    intro:
      "Most studios stay on software they've outgrown because switching feels like it will cost them a term. Done in the right order, it costs a weekend.",
    updated: "2026-08-11",
    sections: [
      {
        h: "Switch in a term break, not during a term",
        p: [
          "The natural moment is the gap between terms, when no classes are running and no fees are mid-collection. You have two weeks where the timetable is settled, nothing is being invoiced, and a mistake costs you nothing.",
          "Switching in week four means running two systems while parents are paying into one of them. Avoid it if you possibly can.",
        ],
      },
      {
        h: "Get your data out first — before you commit",
        p: [
          "Export from your current system before you sign anything new, because that's when you find out what you can actually take with you. You want students, families and contact details, current enrolments, the class timetable, and the fee history for the current financial year.",
          "If the export is a PDF rather than a spreadsheet, that's worth knowing early. It doesn't necessarily stop you moving, but it changes how long it takes.",
        ],
        list: [
          "Students, with dates of birth and any medical notes",
          "Families, with the contact details you actually use",
          "Who is currently enrolled in what",
          "The class timetable, including teachers and rooms",
          "Invoice and payment history for the current financial year",
          "Anything you're legally required to retain, such as signed consents",
        ],
      },
      {
        h: "Leave the accounting history where it is",
        p: [
          "You don't need to migrate years of financial records into the new system. Your accounts live in your accounting software, and that's where the historical record should stay.",
          "Bring across what's outstanding and what's needed for the current year. Trying to reconstruct three years of invoices in a new system is a large amount of work that helps nobody.",
        ],
      },
      {
        h: "Run one term in parallel, deliberately",
        p: [
          "Keep read-only access to the old system for a term. Not to keep using it, but so that when a question comes up about what a family paid in April you can answer it without a panic.",
          "Set a date for turning it off and tell yourself that's the date. Parallel running that has no end turns into paying for two systems indefinitely.",
        ],
      },
      {
        h: "Tell families once, plainly",
        p: [
          "Families need to know three things: that the enrolment or payment link is changing, when, and what to do if something looks wrong. They don't need to know why you switched.",
          "Send it once before the change and once when it goes live. The most common failure is a family paying into a system you've stopped watching, so make the new payment path unambiguous.",
        ],
      },
      {
        h: "How this works in Olune",
        p: [
          "Students, families and classes can be brought in rather than retyped, so switching between terms doesn't mean rebuilding your roll by hand. Your data stays exportable — you can take students, families, invoices and site content out at any time, which is the same thing you should be asking of any system before you move onto it.",
        ],
      },
    ],
    faq: [
      {
        q: "When is the best time to change studio management software?",
        a: "During a term break, when no classes are running and no fees are being collected. You get a settled timetable and a couple of weeks where mistakes are cheap.",
      },
      {
        q: "Will I lose my student data if I switch?",
        a: "Not if you export before you commit. Take students, families, current enrolments, the timetable and the current year's fee history. Check the export format early — a PDF-only export is much harder to work with than a spreadsheet.",
      },
      {
        q: "Do I need to move my old invoices into the new system?",
        a: "Generally no. Historical financial records belong in your accounting software. Bring across what's still outstanding plus the current year, and leave the rest where it is.",
      },
    ],
    related: ["dance-studio-software-nz", "term-fee-invoicing", "take-enrolments-online"],
  },
];

export const GUIDE_SLUGS = GUIDES.map((g) => g.slug);

export function guideBySlug(slug: string): ContentDoc | undefined {
  return GUIDES.find((g) => g.slug === slug);
}
