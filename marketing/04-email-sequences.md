# Olune — Email Sequences

Four sequences plus the weekly newsletter. All send from **Tasman Davids · tasman@olune.co.nz** — a person, not a brand. One CTA per email. Plain-text-feeling HTML: no hero images, no button stacks, no three-column footer.

**Before the first send:** SPF, DKIM and DMARC on `olune.co.nz` (the production domain — *not* `olune.app`), a visible unsubscribe on every marketing send, and a physical address in the footer. Cold outreach in Phase 1 goes out in batches of 20, by hand — deliverability on a cold domain is fragile and the first line has to be personal to earn a reply.

> Product claims here have been checked against the codebase. See `05-claims-check.md`.

---

# SEQUENCE A · Waitlist welcome
**Trigger:** joins the waitlist · **5 emails over 12 days** · **Goal:** turn a curious signup into a founding studio

---

### A1 · Immediate
**Subject:** You're on the list
**Preview:** And here's the useful bit, straight away

```
Hi {{first_name}},

You're on the list for olune. Thank you.

Rather than make you wait for something useful, here's the thing I wish someone had handed me when I started a studio:

→ The Studio Term Reset
   A term-fee calculator that handles siblings and late joiners.
   Four enrolment emails you can copy tonight.
   A roll-reconciliation checklist that turns Sunday night into fifteen minutes.

[Download it here]

It works whether or not you ever use our software.

A bit about what you've signed up for: olune is studio management software — classes, rolls, fees, families, messaging — built by someone who has actually run the studio office. I trained at the Vaganova Academy, danced professionally for eleven years, then came home and co-founded a ballet school, and discovered the real job happens after everyone's gone home.

I'll write once a week. If that's one week too many, the unsubscribe link is right there and I won't take it personally.

Tasman
Founder, olune
```

---

### A2 · Day 2
**Subject:** The four hours
**Preview:** Where a studio owner's week actually goes

```
Hi {{first_name}},

Ask five studio owners where their week goes and you get the same shape of answer. It lands at about four hours.

Roughly three quarters of an hour chasing fees. About the same again on enrolments and waitlists. Over an hour on the roll and reconciling it. And the messages — always the messages.

None of it is teaching, and none of it is why anyone opens a studio.

The uncomfortable part is that most of those four hours aren't caused by having a lot of students. They're caused by the same information living in four places that don't talk to each other: a spreadsheet, an accounting package, a WhatsApp group, and your memory.

That's the problem olune is built around. One place, so the reconciling stops being a job.

I'll show you what that looks like on Thursday.

Tasman
```

---

### A3 · Day 5
**Subject:** Why we don't charge per student
**Preview:** A good enrolment term shouldn't come with an invoice

```
Hi {{first_name}},

Most studio software charges by student count. More students, higher tier, bigger bill.

Think about what that actually means. You run a brilliant enrolment term — forty new families, a Saturday that's finally full — and your software company sends you an invoice for it. You did the work. They took a share.

Every olune plan has unlimited students. All three of them.

The plans differ by what they open up, never by headcount:

  Solo    NZ$29/mo   Classes, rolls, billing, messaging
  Studio  NZ$59/mo   + staff, leads and enrolment forms, your website,
                       your shop, class passes
  Scale   NZ$120/mo  + production, costumes, private lessons, badges,
                       progress tracking

New Zealand dollars, GST included. No setup fee. No cut of your fees. Two months free on annual.

And free for everyone until general release in December — long enough to run a whole term through it.

If you want to see the reasoning in full, it's on the pricing page.

Tasman
```
**CTA:** See the pricing

---

### A4 · Day 8
**Subject:** The move is smaller than you think
**Preview:** On the reason most studios stay on software they resent

```
Hi {{first_name}},

I've now asked a lot of studio owners why they haven't switched from software they complain about every week.

Almost nobody says price. Almost nobody says features.

They say: I can't face the move.

The picture in their head is a lost weekend, broken records, confused parents, and a term's fees going missing. It's a reasonable fear and it's much bigger than the reality.

Here's the real shape of it:

  Week 1     Students and families in. Nothing else changes.
  Week 2     Classes and timetable. Start taking the roll here.
  Week 3-4   Billing — at a term boundary, never mid-term.
  Later      Website, forms, shop, events. Additions, not migrations.

You keep the old system open the whole time. Most studios run both for a fortnight, and nobody has ever regretted that.

For founding studios, we do the import ourselves. You send a spreadsheet; we send back a working studio.

If the move is the thing stopping you, reply to this email and tell me what you're on now. I'll tell you honestly how hard it would be.

Tasman
```
**CTA:** Reply

---

### A5 · Day 12
**Subject:** Fifty founding studios
**Preview:** What the offer is, and what we want back

```
Hi {{first_name}},

We're opening fifty founding places before general release in December. Here's exactly what that is.

What you get:
  · olune free through to March 2027 — the whole product, not a trial
  · Your migration done by hand, by us
  · My direct line, and a same-day answer
  · Your studio named on our site at launch

What we want back:
  · The honest version. What's missing, what's clumsy, what you'd never open.

Founding studios decide what gets built between now and December. That's not a courtesy — it's how the roadmap is actually being set right now.

There's no card, no contract, and no obligation to stay past March.

[Take a founding place]

If you'd rather just watch for a while, that's completely fine. I'll keep writing once a week.

Tasman
```
**CTA:** Take a founding place

---

# SEQUENCE B · Cold outreach to named studios
**Trigger:** manual, batches of 20 · **4 touches over 3 weeks** · **Goal:** a reply

The first line of B1 must be genuinely specific to that studio — something from their website, their timetable, their last concert. If you can't write that line, don't send the email. A personalised first line is the entire difference between this sequence working and it being spam.

---

### B1 · Day 0
**Subject:** {{studio_name}} — a question about your admin

```
Hi {{first_name}},

{{PERSONAL_FIRST_LINE — e.g. "I saw your Term 3 showcase photos — the junior contemporary piece was lovely." / "You've been running in {{suburb}} since 2009, which is longer than most."}}

I'm Tasman. I trained at the Vaganova Academy in St Petersburg, danced professionally for eleven years, and then came home and co-founded a ballet school in Christchurch — which is where I found out that the hardest part of running a studio happens after everyone's gone home.

So I've built software for it. It's called olune: classes, rolls, fees, families and messaging in one place, priced in New Zealand dollars.

We're choosing fifty founding studios before we launch in December. Free through to March, we do your migration by hand, and you get a direct line to me.

Would you be open to a twenty-minute call? I'd want to hear what your admin week actually looks like — and I'm equally happy to hear that you're perfectly served already.

Tasman Davids
Founder, olune · olune.co.nz
```
**CTA:** Reply

---

### B2 · Day 4
**Subject:** Re: {{studio_name}} — a question about your admin
*(threaded reply to B1)*

```
Hi {{first_name}},

Following up on this once, in case it landed in a bad week.

Rather than ask you for a call again, here's something useful with nothing attached to it — the pack we made for studio owners:

→ The Studio Term Reset [link]
   Term-fee calculator (handles siblings and late joiners properly),
   four enrolment emails, and a roll-reconciliation checklist.

Take it and ignore me. It works whether or not we ever speak.

Tasman
```
**CTA:** Download

---

### B3 · Day 11
**Subject:** The per-student thing

```
Hi {{first_name}},

One thing worth checking, whether or not you ever look at olune.

Jackrabbit's published pricing is tiered on your student count — US$49 up to 100 students, US$89 from 101, US$129 from 251. Cross a boundary and the bill steps up for exactly the same software.

So it's worth knowing which side of one you're sitting on, and what your next good enrolment term would cost you. In US dollars, on top of the exchange rate.

Every olune plan is unlimited students. That's the main reason I'm building it.

Still fifty founding places open, still free through to March. And still happy to hear it's not for you.

Tasman
```
**CTA:** Reply

> **Before sending:** re-verify those brackets against Jackrabbit's own published pricing page and date-stamp the check, the same way `lib/content/compare.ts` does. A competitor price claim in a cold email is the highest-risk line in the whole campaign.

---

### B4 · Day 21 — the close
**Subject:** Closing the loop

```
Hi {{first_name}},

Last one from me — I won't keep appearing in your inbox.

If the timing's wrong, that's genuinely the right answer. November and December are no time to change anything, and I'd say so to anyone who asked.

If Term 1 is when you'd think about it, tell me and I'll come back in late January with something useful rather than a pitch.

And if you'd just like to see it once out of curiosity, I'll show you in twenty minutes with no follow-up.

Either way — good luck with your concert.

Tasman
```
**CTA:** Reply

---

# SEQUENCE C · Founding studio onboarding
**Trigger:** accepts a founding place · **3 emails over 10 days** · **Goal:** live and actually using it

An account that gets created and never used is worse than no account — it's a studio who now believes they've tried olune. This sequence exists to prevent that.

---

### C1 · Immediate
**Subject:** Welcome — here's what happens next

```
Hi {{first_name}},

{{studio_name}} is a founding studio. Thank you — that means something at this stage.

Three things, in order:

1. Send me your student list.
   Any format. A CSV from your current system, a spreadsheet, even a
   messy one. I'll do the import myself and send it back to you live.
   Reply to this email and attach it.

2. Book twenty minutes with me. [link]
   We'll set your classes and your term structure up together. This is
   the part that's genuinely faster with two people.

3. Nothing else. Don't move your billing yet, don't tell your parents
   yet, don't close anything down.

That's it. You can be running by the end of the week.

Tasman
021 XXX XXXX — that's my actual number.
```
**CTA:** Reply with your student list

---

### C2 · Day 4
**Subject:** How's it going, honestly

```
Hi {{first_name}},

Four days in. Two questions, and I want the unflattering answers:

  1. What's the first thing that annoyed you?
  2. What did you expect to be there and couldn't find?

Founding studios are the reason the roadmap looks the way it does. Last month a studio told me the class list sorted in an order that made no sense to anyone who teaches, and she was right, and it's changed.

Reply with one line if that's all you've got time for.

Tasman
```
**CTA:** Reply

---

### C3 · Day 10
**Subject:** One thing to try this week

```
Hi {{first_name}},

If you've taken rolls in olune this week, you've done the hard part. Here's the one thing worth adding next:

Invite your parents in.

Pick one class — your most engaged group — and send them their portal invite. They'll see their child's timetable, their invoices, and they can report an absence themselves instead of texting you at 3:50pm.

That last one is the change studios notice first. The absences stop arriving in four different places.

[Show me how]

And if something isn't working, say so. That's what you're here for.

Tasman
```
**CTA:** Show me how

---

# SEQUENCE D · Launch week
**Trigger:** whole list · **4 emails, 30 Nov – 6 Dec** · **Goal:** convert the nurtured list

The list hears the launch date in Week 11, before Instagram does. By launch week they should be expecting this, not discovering it.

---

### D1 · Monday 30 November — the pre-launch note
**Subject:** Tomorrow
**Preview:** A short one

```
Hi {{first_name}},

olune is generally available tomorrow.

Since September, {{n}} studios have been running on it — through Term 4, through concert season, through the worst possible time to trial anything. They found a lot of things wrong and we fixed most of them.

Nothing changes for anyone already using it. It stays free for founding studios through to March.

For everyone else, tomorrow is when you can sign up properly. Fourteen days free, no card.

That's all. More tomorrow.

Tasman
```

---

### D2 · Tuesday 1 December — launch
**Subject:** olune is live
**Preview:** Studio software with unlimited students, priced in New Zealand dollars

```
Hi {{first_name}},

olune is live.

What it is: one place for the parts of a studio that happen off the floor. Classes, timetables and rolls. Fees, invoices, payment plans, and a Xero connection built in rather than bolted on. Families, students, messaging.

From the Studio plan: your studio's website on your own domain, your enrolment forms, your leads, your shop, and class passes.

From Scale: production and events with ticketing and a door scanner, costumes, private lessons, badges and progress tracking.

What it costs:

  Solo    NZ$29/mo   NZ$290/yr
  Studio  NZ$59/mo   NZ$590/yr
  Scale   NZ$120/mo  NZ$1,200/yr

New Zealand dollars. GST included. No setup fee. No cut of your fees — once you've connected your Stripe account, money settles straight into it. Unlimited students on every single plan, because charging you more for a good enrolment term is backwards.

Fourteen days free. No card to start.

[Start your studio]

If you'd rather see it before you touch anything, reply and I'll walk you through it in twenty minutes.

Tasman
```
**CTA:** Start your studio

---

### D3 · Thursday 3 December — the objection
**Subject:** "We'd move, but not in December"
**Preview:** Agreed. Here's what I'd actually do.

```
Hi {{first_name}},

A few of you have replied with a version of this, and you're right.

December is a terrible month to change your systems. You've got a concert, or you've just had one, and the last thing you need is a migration.

So here's the honest advice: don't switch in December.

What I would do instead:

  · Start an account now while it's fresh. Fourteen days free, no card.
    Put one class in. Take one roll. Ten minutes.
  · Decide in the quiet week between Christmas and New Year.
  · Move in January, before Term 1 enrolment. That's the natural
    boundary — you're touching every record anyway.

We'll do the import for you when you're ready, in January or whenever. That offer doesn't expire.

The reason to start an account today isn't urgency. It's that in six weeks you'll be deciding this in the middle of enrolment week, and it's easier to have already looked.

[Start an account]

Tasman
```
**CTA:** Start an account

---

### D4 · Sunday 6 December — the quiet close
**Subject:** Thank you, and what happens in January
**Preview:** The last one for a while

```
Hi {{first_name}},

Launch week is done. Some numbers, since you were part of it:

  {{n}} studios now running on olune
  {{n}} of them founding studios who joined before there was much to join

Thank you. Particularly to the studios who told me what was wrong with it while it was still wrong.

Two things before the year closes:

Term 1. January is when studios actually change systems, because enrolment makes you touch every record anyway. If that's you, reply and put your name down — I'll set aside a migration slot in the second week of January and do it myself.

And the letter. The Front Desk goes quiet until the 18th of January. It'll come back with the Term 1 planning issue, which is the useful one.

Enjoy the break. The studio will still be there in February.

Tasman
```
**CTA:** Reply

---

# THE FRONT DESK · weekly newsletter
**From Week 5 (29 September), weekly, Tuesday morning NZT.**

The list's reason to stay subscribed. It is not a product update. One idea per issue, useful on its own, and olune appears at the bottom or not at all.

### Template

```
Subject: [The specific idea, not "The Front Desk #7"]
Preview: [One line, the promise]

Hi {{first_name}},

[THE IDEA — 150-250 words. One practical thing about running a studio.
Specific enough to act on this week. No preamble.]

[THE DETAIL — the how, or the numbers, or the script. This is the part
people forward to another studio owner.]

—

[ONE SHORT THING: what changed in olune this week, two sentences, or
what a founding studio said. Skip it entirely if there's nothing real.]

Tasman

You're getting this because you joined the olune list. [Unsubscribe]
```

### First nine issues

| # | Week | Subject | The idea |
|---|---|---|---|
| 1 | 29 Sep | The third child | Sibling pricing and why it decides whether a family stays |
| 2 | 6 Oct | Term 4, week one | The checklist for the first week of a term |
| 3 | 13 Oct | Two absences in a row | Using attendance as a churn early-warning system |
| 4 | 20 Oct | Three places money goes missing | Between the roll and the bank account |
| 5 | 27 Oct | Six weeks to concert | The production timeline, week by week |
| 6 | 3 Nov | The run sheet | Concert week, and what to hand the person running the wings |
| 7 | 10 Nov | The email after the concert | Turning a good concert into next term's enrolments *(+ launch date announced)* |
| 8 | 17 Nov | What to do with a waitlist | Every full class is a list you're not collecting |
| 9 | 24 Nov | Planning Term 1 | The January checklist, written in November |

---

## Compliance notes

- **Cold outreach (Sequence B)** to business addresses is legitimate B2B contact under NZ's Unsolicited Electronic Messages Act, provided the message is clearly identified, includes a functional unsubscribe, and stops on request. Sequence B4 is the natural stop; honour any earlier request immediately and permanently.
- **Never** send Sequence A, C, D or The Front Desk to an address that hasn't opted in. Cold contacts join the marketing list only if they reply or subscribe themselves.
- Studio owners' addresses collected during outreach are personal information under the NZ Privacy Act 2020. Keep them in one system, don't share the list, and delete on request.
- Every marketing email needs a visible unsubscribe and a physical postal address in the footer.
- **Sequence D converts strangers to paid.** It must not send before a Terms of Service, a data processing agreement and a refund policy exist. See `05-claims-check.md`.
