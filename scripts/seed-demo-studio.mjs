#!/usr/bin/env node
/**
 * Seeds a complete, realistic, fake "promotional demo studio" — Aurora Dance
 * Collective (Wellington, NZ) — so the product can be demoed with a studio
 * that actually looks lived-in instead of an empty shell.
 *
 * See scripts/seed-demo-studio.md for the full write-up of what this creates
 * and why. Short version:
 *   - 1 owner/admin, 3 teachers, 9 parents, 13 kid students + 2 adult
 *     self-managed students — all @auroradance.demo, all obviously fake.
 *   - Classes, enrollments (incl. waitlists), guardianships, waivers +
 *     signatures, invoices (paid/sent/overdue) + line items + payments, a
 *     term payment plan, class passes, badge awards, NFC cards + building
 *     taps, leads, parent<->admin message threads, and a published
 *     website_configs row.
 *
 * Usage:
 *   node --env-file=.env.local scripts/seed-demo-studio.mjs
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (already in
 * .env.local per repo convention — see scripts/seed-platform-admin.mjs).
 *
 * Idempotency: people (auth users + profiles) are found-or-created by email,
 * never duplicated. Everything else this script creates is scoped to this
 * one studio_id, so each run first deletes that studio's existing rows for
 * each table (children before parents) and reinserts fresh — safe to rerun
 * as many times as you like without the data growing or drifting.
 */

import crypto from "node:crypto";
import { createServiceClient } from "./lib/supabase-admin.mjs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Copy .env.local.example → .env.local and fill in Supabase API keys.",
  );
  process.exit(1);
}

const admin = createServiceClient(url, serviceKey);

// ============================================================================
//  Constants
// ============================================================================

const STUDIO_NAME = "Aurora Dance Collective";
const STUDIO_SLUG = "aurora-dance";
const EMAIL_DOMAIN = "auroradance.demo";
const OWNER_EMAIL = `owner@${EMAIL_DOMAIN}`;
const DEMO_PASSWORD = "AuroraDemo!2026"; // shared by every non-owner demo account
const BRAND_COLOR = "#8B7CF0"; // the Aurora Glass iris/periwinkle used across the marketing site

function randomPassword() {
  return crypto.randomBytes(9).toString("base64url").replace(/[-_]/g, "x") + "!7";
}
const OWNER_PASSWORD = randomPassword();

const now = new Date();
function daysAgo(n, hour = 12, minute = 0) {
  const d = new Date(now);
  d.setDate(d.getDate() - n);
  d.setHours(hour, minute, 0, 0);
  return d;
}
function daysFromNow(n) {
  return daysAgo(-n);
}
function dateOnly(d) {
  return d.toISOString().slice(0, 10);
}
function ts(d) {
  return d.toISOString();
}

const GST_RATE = 0.15;
function gstComponentCents(grossCents) {
  return Math.round(grossCents - grossCents / (1 + GST_RATE));
}

// ============================================================================
//  People catalogue
// ============================================================================

const TEACHERS = [
  { key: "elena", full_name: "Elena Petrova", email: `t.elena@${EMAIL_DOMAIN}`, phone: "+64 21 555 0101", disciplines: ["Ballet"] },
  { key: "jayden", full_name: "Jayden Ropata", email: `t.jayden@${EMAIL_DOMAIN}`, phone: "+64 21 555 0102", disciplines: ["Hip-Hop"] },
  { key: "grace", full_name: "Grace Whitmore", email: `t.grace@${EMAIL_DOMAIN}`, phone: "+64 21 555 0103", disciplines: ["Contemporary", "Jazz"] },
];

const PARENTS = [
  { key: "sarah", full_name: "Sarah Thompson", email: `p.sarah@${EMAIL_DOMAIN}`, phone: "+64 21 555 0201" },
  { key: "hemi", full_name: "Hemi Ngata", email: `p.hemi@${EMAIL_DOMAIN}`, phone: "+64 21 555 0202" },
  { key: "aroha", full_name: "Aroha Wilson", email: `p.aroha@${EMAIL_DOMAIN}`, phone: "+64 21 555 0203" },
  { key: "michael", full_name: "Michael O'Brien", email: `p.michael@${EMAIL_DOMAIN}`, phone: "+64 21 555 0204" },
  { key: "priya", full_name: "Priya Patel", email: `p.priya@${EMAIL_DOMAIN}`, phone: "+64 21 555 0205" },
  { key: "david", full_name: "David Chen", email: `p.david@${EMAIL_DOMAIN}`, phone: "+64 21 555 0206" },
  { key: "rebecca", full_name: "Rebecca Harris", email: `p.rebecca@${EMAIL_DOMAIN}`, phone: "+64 21 555 0207" },
  { key: "tane", full_name: "Tane Walker", email: `p.tane@${EMAIL_DOMAIN}`, phone: "+64 21 555 0208" },
  { key: "lucy", full_name: "Lucy Anderson", email: `p.lucy@${EMAIL_DOMAIN}`, phone: "+64 21 555 0209" },
];

// Kid students (minors — guardianship required). level/discipline drive class enrollment below.
const KID_STUDENTS = [
  { key: "ruby", full_name: "Ruby Thompson", email: `s.ruby@${EMAIL_DOMAIN}`, birthday: "2018-03-14", guardian: "sarah", relationship: "mother" },
  { key: "jack", full_name: "Jack Thompson", email: `s.jack@${EMAIL_DOMAIN}`, birthday: "2016-01-22", guardian: "sarah", relationship: "mother" },
  { key: "nikau", full_name: "Nikau Ngata", email: `s.nikau@${EMAIL_DOMAIN}`, birthday: "2020-05-10", guardian: "hemi", relationship: "father" },
  { key: "manaia", full_name: "Manaia Ngata", email: `s.manaia@${EMAIL_DOMAIN}`, birthday: "2017-07-02", guardian: "hemi", relationship: "father" },
  { key: "aria", full_name: "Aria Wilson", email: `s.aria@${EMAIL_DOMAIN}`, birthday: "2014-02-18", guardian: "aroha", relationship: "mother" },
  { key: "sophie", full_name: "Sophie O'Brien", email: `s.sophie@${EMAIL_DOMAIN}`, birthday: "2012-04-09", guardian: "michael", relationship: "father" },
  { key: "charlotte", full_name: "Charlotte O'Brien", email: `s.charlotte@${EMAIL_DOMAIN}`, birthday: "2015-09-30", guardian: "michael", relationship: "father" },
  { key: "zara", full_name: "Zara Patel", email: `s.zara@${EMAIL_DOMAIN}`, birthday: "2019-06-25", guardian: "priya", relationship: "mother" },
  { key: "leo", full_name: "Leo Chen", email: `s.leo@${EMAIL_DOMAIN}`, birthday: "2013-11-11", guardian: "david", relationship: "father" },
  { key: "isla", full_name: "Isla Harris", email: `s.isla@${EMAIL_DOMAIN}`, birthday: "2017-03-03", guardian: "rebecca", relationship: "mother" },
  { key: "poppy", full_name: "Poppy Harris", email: `s.poppy@${EMAIL_DOMAIN}`, birthday: "2021-08-20", guardian: "rebecca", relationship: "mother" },
  { key: "kauri", full_name: "Kauri Walker", email: `s.kauri@${EMAIL_DOMAIN}`, birthday: "2011-01-15", guardian: "tane", relationship: "father" },
  { key: "willow", full_name: "Willow Anderson", email: `s.willow@${EMAIL_DOMAIN}`, birthday: "2016-10-05", guardian: "lucy", relationship: "guardian" },
];

// Adult self-managed students (18+, no guardian — per 0056_adult_student_self_service.sql)
const ADULT_STUDENTS = [
  { key: "emma", full_name: "Emma Fraser", email: `s.emma@${EMAIL_DOMAIN}`, phone: "+64 21 555 0301", birthday: "2004-05-12" },
  { key: "jordan", full_name: "Jordan Lee", email: `s.jordan@${EMAIL_DOMAIN}`, phone: "+64 21 555 0302", birthday: "1999-02-08" },
];

// ============================================================================
//  Classes
// ============================================================================

const CLASSES = [
  { key: "pre_ballet", name: "Pre-Ballet", discipline: "Ballet", level: "Pre-Ballet", teacher: "elena", day_of_week: 1, start_time: "16:00", end_time: "16:45", capacity: 12, price_cents: 1800, room: "Studio 1" },
  { key: "ballet_primary", name: "Ballet Primary", discipline: "Ballet", level: "Primary", teacher: "elena", day_of_week: 1, start_time: "17:00", end_time: "17:45", capacity: 14, price_cents: 2000, room: "Studio 1" },
  { key: "ballet_intermediate", name: "Ballet Intermediate", discipline: "Ballet", level: "Intermediate", teacher: "elena", day_of_week: 2, start_time: "17:30", end_time: "18:30", capacity: 12, price_cents: 2400, room: "Studio 1" },
  { key: "ballet_advanced", name: "Ballet Advanced", discipline: "Ballet", level: "Advanced", teacher: "elena", day_of_week: 3, start_time: "18:00", end_time: "19:15", capacity: 10, price_cents: 2800, room: "Studio 1" },
  { key: "hiphop_juniors", name: "Hip-Hop Juniors", discipline: "Hip-Hop", level: "Junior", teacher: "jayden", day_of_week: 2, start_time: "16:30", end_time: "17:15", capacity: 16, price_cents: 2000, room: "Studio 2" },
  { key: "hiphop_teens", name: "Hip-Hop Teens", discipline: "Hip-Hop", level: "Teens", teacher: "jayden", day_of_week: 4, start_time: "17:30", end_time: "18:30", capacity: 18, price_cents: 2200, room: "Studio 2" },
  { key: "contemporary_jazz", name: "Contemporary & Jazz", discipline: "Contemporary", level: "Open", teacher: "grace", day_of_week: 3, start_time: "17:00", end_time: "17:45", capacity: 14, price_cents: 2200, room: "Studio 1" },
];

// student key -> [{ classKey, status }]
const ENROLLMENTS = {
  ruby: [{ classKey: "ballet_primary", status: "active" }],
  jack: [{ classKey: "ballet_primary", status: "active" }],
  nikau: [{ classKey: "pre_ballet", status: "active" }],
  manaia: [{ classKey: "ballet_primary", status: "active" }],
  aria: [{ classKey: "ballet_intermediate", status: "active" }],
  sophie: [
    { classKey: "ballet_advanced", status: "active" },
    { classKey: "contemporary_jazz", status: "active" },
  ],
  charlotte: [{ classKey: "ballet_primary", status: "waitlisted" }],
  zara: [{ classKey: "pre_ballet", status: "active" }],
  leo: [{ classKey: "hiphop_teens", status: "active" }],
  isla: [{ classKey: "hiphop_juniors", status: "active" }],
  poppy: [{ classKey: "pre_ballet", status: "active" }],
  kauri: [
    { classKey: "ballet_advanced", status: "active" },
    { classKey: "hiphop_teens", status: "active" },
  ],
  willow: [{ classKey: "hiphop_juniors", status: "waitlisted" }],
  emma: [{ classKey: "contemporary_jazz", status: "active" }],
  jordan: [{ classKey: "ballet_advanced", status: "active" }],
};

// ============================================================================
//  Helpers
// ============================================================================

async function findUserByEmail(email) {
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (match) return match;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

/** Find-or-create an auth user by email. Never duplicates on rerun. */
async function ensureAuthUser(email, password, fullName) {
  let user = await findUserByEmail(email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error) throw error;
    user = data.user;
  } else {
    const { error } = await admin.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
    });
    if (error) throw error;
  }
  return user;
}

async function upsertProfile(id, fields) {
  const { error } = await admin.from("profiles").update(fields).eq("id", id);
  if (error) throw error;
}

/** Delete every row in `table` matching studio_id — used to make the
 *  per-studio dataset idempotent (wipe-and-reseed rather than per-row
 *  upserts, since most of these tables have no natural unique key to key
 *  an upsert off). Safe: every row touched is scoped to this one demo studio. */
async function wipeByStudio(table, studioId, column = "studio_id") {
  const { error } = await admin.from(table).delete().eq(column, studioId);
  if (error) throw error;
}

// ============================================================================
//  Main
// ============================================================================

async function main() {
  console.log(`Seeding demo studio "${STUDIO_NAME}"…\n`);

  // ── Studio + branding ─────────────────────────────────────────────────────
  // setup_completed_at must be set (per 0031_studio_setup.sql) or every login
  // gets bounced to the /setup wizard instead of the actual dashboard.
  const studioFields = {
    name: STUDIO_NAME,
    status: "active",
    setup_completed_at: ts(now),
    setup_path: "scratch",
    location_city: "Wellington",
    location_region: "Wellington",
    location_country: "New Zealand",
    about: "Wellington's home for ballet, hip-hop and contemporary dance since 2016 — small classes, real teachers, real growth.",
    dance_styles: ["Ballet", "Hip-Hop", "Contemporary", "Jazz"],
  };

  let { data: studio } = await admin.from("studios").select("id").eq("slug", STUDIO_SLUG).maybeSingle();
  if (!studio) {
    const { data: created, error } = await admin
      .from("studios")
      .insert({ ...studioFields, slug: STUDIO_SLUG, timezone: "Pacific/Auckland" })
      .select("id")
      .single();
    if (error) throw error;
    studio = created;
    console.log("Created studio:", studio.id);
  } else {
    await admin.from("studios").update(studioFields).eq("id", studio.id);
    console.log("Reusing existing studio:", studio.id);
  }
  const studioId = studio.id;

  await admin.from("studio_branding").upsert(
    {
      studio_id: studioId,
      tagline: "Wellington's home for ballet, hip-hop & contemporary dance",
      brand_color: BRAND_COLOR,
      base: "dark",
      font_display: "Fraunces",
      font_body: "Hanken Grotesk",
    },
    { onConflict: "studio_id" },
  );

  // ── People ─────────────────────────────────────────────────────────────────
  console.log("\nCreating people…");

  const ownerUser = await ensureAuthUser(OWNER_EMAIL, OWNER_PASSWORD, "Mia Sinclair");
  await upsertProfile(ownerUser.id, {
    studio_id: studioId,
    role: "admin",
    full_name: "Mia Sinclair",
    email: OWNER_EMAIL,
    phone: "+64 21 555 0100",
  });
  const ownerId = ownerUser.id;

  const teacherIds = {};
  for (const t of TEACHERS) {
    const u = await ensureAuthUser(t.email, DEMO_PASSWORD, t.full_name);
    await upsertProfile(u.id, {
      studio_id: studioId,
      role: "teacher",
      full_name: t.full_name,
      email: t.email,
      phone: t.phone,
    });
    teacherIds[t.key] = u.id;
  }

  const parentIds = {};
  for (const p of PARENTS) {
    const u = await ensureAuthUser(p.email, DEMO_PASSWORD, p.full_name);
    await upsertProfile(u.id, {
      studio_id: studioId,
      role: "parent",
      full_name: p.full_name,
      email: p.email,
      phone: p.phone,
    });
    parentIds[p.key] = u.id;
  }

  const studentIds = {};
  for (const s of KID_STUDENTS) {
    const u = await ensureAuthUser(s.email, DEMO_PASSWORD, s.full_name);
    await upsertProfile(u.id, {
      studio_id: studioId,
      role: "student",
      full_name: s.full_name,
      email: s.email,
      birthday: s.birthday,
      self_managed: false,
    });
    studentIds[s.key] = u.id;
  }

  for (const s of ADULT_STUDENTS) {
    const u = await ensureAuthUser(s.email, DEMO_PASSWORD, s.full_name);
    await upsertProfile(u.id, {
      studio_id: studioId,
      role: "student",
      full_name: s.full_name,
      email: s.email,
      phone: s.phone,
      birthday: s.birthday,
      self_managed: true,
    });
    studentIds[s.key] = u.id;
  }

  console.log(
    `  ${1 + TEACHERS.length + PARENTS.length + KID_STUDENTS.length + ADULT_STUDENTS.length} people ready ` +
      `(1 owner, ${TEACHERS.length} teachers, ${PARENTS.length} parents, ${KID_STUDENTS.length} kid students, ${ADULT_STUDENTS.length} adult students).`,
  );

  // ── Reset studio-scoped data (children first) ───────────────────────────────
  console.log("\nClearing previous demo data for this studio…");
  await wipeByStudio("building_taps", studioId);
  await wipeByStudio("nfc_cards", studioId);
  await wipeByStudio("profile_badges", studioId);
  await wipeByStudio("class_passes", studioId);
  await wipeByStudio("payments", studioId);
  {
    const { data: plans } = await admin.from("term_payment_plans").select("id").eq("studio_id", studioId);
    const planIds = (plans ?? []).map((p) => p.id);
    if (planIds.length) {
      await admin.from("term_payment_plan_invoices").delete().in("plan_id", planIds);
    }
  }
  await wipeByStudio("term_payment_plans", studioId);
  {
    const { data: invoices } = await admin.from("invoices").select("id").eq("studio_id", studioId);
    const invoiceIds = (invoices ?? []).map((i) => i.id);
    if (invoiceIds.length) {
      await admin.from("invoice_line_items").delete().in("invoice_id", invoiceIds);
    }
  }
  await wipeByStudio("invoices", studioId);
  {
    const { data: waivers } = await admin.from("waivers").select("id").eq("studio_id", studioId);
    const waiverIds = (waivers ?? []).map((w) => w.id);
    if (waiverIds.length) {
      await admin.from("waiver_signatures").delete().in("waiver_id", waiverIds);
    }
  }
  await wipeByStudio("waivers", studioId);
  await wipeByStudio("parent_email_messages", studioId);
  await wipeByStudio("parent_email_threads", studioId);
  await wipeByStudio("leads", studioId);
  await wipeByStudio("enrollments", studioId);
  await wipeByStudio("guardianships", studioId);
  await wipeByStudio("classes", studioId);

  // ── Classes ──────────────────────────────────────────────────────────────
  console.log("\nCreating classes…");
  const classIds = {};
  for (const c of CLASSES) {
    const { data, error } = await admin
      .from("classes")
      .insert({
        studio_id: studioId,
        teacher_id: teacherIds[c.teacher],
        name: c.name,
        discipline: c.discipline,
        level: c.level,
        day_of_week: c.day_of_week,
        start_time: c.start_time,
        end_time: c.end_time,
        capacity: c.capacity,
        price_cents: c.price_cents,
        room: c.room,
      })
      .select("id")
      .single();
    if (error) throw error;
    classIds[c.key] = data.id;
  }
  console.log(`  ${CLASSES.length} classes created.`);

  // ── Enrollments ──────────────────────────────────────────────────────────
  console.log("Creating enrollments…");
  let enrollmentCount = 0;
  for (const [studentKey, list] of Object.entries(ENROLLMENTS)) {
    for (const e of list) {
      const { error } = await admin.from("enrollments").insert({
        studio_id: studioId,
        student_id: studentIds[studentKey],
        class_id: classIds[e.classKey],
        status: e.status,
      });
      if (error) throw error;
      enrollmentCount += 1;
    }
  }
  console.log(`  ${enrollmentCount} enrollments created.`);

  // ── Guardianships ────────────────────────────────────────────────────────
  console.log("Creating guardianships…");
  for (const s of KID_STUDENTS) {
    const { error } = await admin.from("guardianships").insert({
      studio_id: studioId,
      guardian_id: parentIds[s.guardian],
      student_id: studentIds[s.key],
      is_primary: true,
      relationship: s.relationship,
    });
    if (error) throw error;
  }
  console.log(`  ${KID_STUDENTS.length} guardianships created.`);

  // ── Waivers + signatures ─────────────────────────────────────────────────
  console.log("Creating waivers + signatures…");
  const { data: waiverRows, error: waiverErr } = await admin
    .from("waivers")
    .insert([
      {
        studio_id: studioId,
        title: "Liability & Participation Waiver",
        content:
          "I understand that dance involves physical activity and inherent risk of injury, and I consent to my child's / my own participation in classes at Aurora Dance Collective.",
        version: 1,
        required: true,
        active: true,
      },
      {
        studio_id: studioId,
        title: "Photo & Video Consent",
        content:
          "I consent to Aurora Dance Collective photographing or filming classes and performances for use in studio marketing, the studio website, and social media.",
        version: 1,
        required: true,
        active: true,
      },
    ])
    .select("id, title");
  if (waiverErr) throw waiverErr;

  let signatureCount = 0;
  for (const s of KID_STUDENTS) {
    for (const w of waiverRows) {
      const { error } = await admin.from("waiver_signatures").insert({
        waiver_id: w.id,
        student_id: studentIds[s.key],
        signed_by: parentIds[s.guardian],
        waiver_version: 1,
        signed_at: ts(daysAgo(30 + Math.floor(Math.random() * 20))),
      });
      if (error) throw error;
      signatureCount += 1;
    }
  }
  for (const s of ADULT_STUDENTS) {
    for (const w of waiverRows) {
      const { error } = await admin.from("waiver_signatures").insert({
        waiver_id: w.id,
        student_id: studentIds[s.key],
        signed_by: studentIds[s.key],
        waiver_version: 1,
        signed_at: ts(daysAgo(20)),
      });
      if (error) throw error;
      signatureCount += 1;
    }
  }
  console.log(`  ${waiverRows.length} waivers, ${signatureCount} signatures created.`);

  // ── Invoices, line items, payments, term payment plan ───────────────────
  console.log("Creating invoices, line items, payments…");

  async function createInvoice({ payerId, studentId, amountCents, status, dueDate, issuedAt, paidAt, description, lineItems, termPlanId = null }) {
    const { data: inv, error } = await admin
      .from("invoices")
      .insert({
        studio_id: studioId,
        payer_id: payerId,
        student_id: studentId,
        amount_cents: amountCents,
        gst_cents: gstComponentCents(amountCents),
        status,
        due_date: dueDate,
        issued_at: issuedAt,
        paid_at: paidAt ?? null,
        description,
        term_payment_plan_id: termPlanId,
      })
      .select("id")
      .single();
    if (error) throw error;

    const rows = lineItems.map((li, idx) => ({
      invoice_id: inv.id,
      item_type: "tuition",
      description: li.description,
      quantity: 1,
      unit_cents: li.amountCents,
      line_total_cents: li.amountCents,
      sort_order: idx,
    }));
    const { error: liErr } = await admin.from("invoice_line_items").insert(rows);
    if (liErr) throw liErr;

    if (status === "paid") {
      const { error: payErr } = await admin.from("payments").insert({
        studio_id: studioId,
        payer_id: payerId,
        invoice_id: inv.id,
        amount_cents: amountCents,
        currency: "nzd",
        status: "succeeded",
        description,
        term_payment_plan_id: termPlanId,
      });
      if (payErr) throw payErr;
    }

    return inv.id;
  }

  let invoiceCount = 0;

  // Paid this month — one family per invoice.
  invoiceCount += 1;
  await createInvoice({
    payerId: parentIds.sarah,
    studentId: studentIds.ruby,
    amountCents: 44000,
    status: "paid",
    dueDate: dateOnly(daysAgo(5)),
    issuedAt: ts(daysAgo(6)),
    paidAt: ts(daysAgo(4)),
    description: "Term Fees – Ruby & Jack Thompson",
    lineItems: [
      { description: "Ruby Thompson – Ballet Primary, term fee", amountCents: 22000 },
      { description: "Jack Thompson – Ballet Primary, term fee", amountCents: 22000 },
    ],
  });

  invoiceCount += 1;
  await createInvoice({
    payerId: parentIds.hemi,
    studentId: studentIds.nikau,
    amountCents: 40000,
    status: "paid",
    dueDate: dateOnly(daysAgo(8)),
    issuedAt: ts(daysAgo(9)),
    paidAt: ts(daysAgo(7)),
    description: "Term Fees – Nikau & Manaia Ngata",
    lineItems: [
      { description: "Nikau Ngata – Pre-Ballet, term fee", amountCents: 18000 },
      { description: "Manaia Ngata – Ballet Primary, term fee", amountCents: 22000 },
    ],
  });

  invoiceCount += 1;
  await createInvoice({
    payerId: parentIds.aroha,
    studentId: studentIds.aria,
    amountCents: 24000,
    status: "paid",
    dueDate: dateOnly(daysAgo(10)),
    issuedAt: ts(daysAgo(11)),
    paidAt: ts(daysAgo(9)),
    description: "Term Fees – Aria Wilson (Ballet Intermediate)",
    lineItems: [{ description: "Aria Wilson – Ballet Intermediate, term fee", amountCents: 24000 }],
  });

  invoiceCount += 1;
  await createInvoice({
    payerId: parentIds.priya,
    studentId: studentIds.zara,
    amountCents: 18000,
    status: "paid",
    dueDate: dateOnly(daysAgo(12)),
    issuedAt: ts(daysAgo(13)),
    paidAt: ts(daysAgo(11)),
    description: "Term Fees – Zara Patel (Pre-Ballet)",
    lineItems: [{ description: "Zara Patel – Pre-Ballet, term fee", amountCents: 18000 }],
  });

  invoiceCount += 1;
  await createInvoice({
    payerId: parentIds.rebecca,
    studentId: studentIds.isla,
    amountCents: 38500,
    status: "paid",
    dueDate: dateOnly(daysAgo(6)),
    issuedAt: ts(daysAgo(7)),
    paidAt: ts(daysAgo(5)),
    description: "Term Fees – Isla & Poppy Harris",
    lineItems: [
      { description: "Isla Harris – Hip-Hop Juniors, term fee", amountCents: 20000 },
      { description: "Poppy Harris – Pre-Ballet, term fee", amountCents: 18500 },
    ],
  });

  invoiceCount += 1;
  await createInvoice({
    payerId: parentIds.david,
    studentId: studentIds.leo,
    amountCents: 22000,
    status: "paid",
    dueDate: dateOnly(daysAgo(4)),
    issuedAt: ts(daysAgo(5)),
    paidAt: ts(daysAgo(3)),
    description: "Term Fees – Leo Chen (Hip-Hop Teens)",
    lineItems: [{ description: "Leo Chen – Hip-Hop Teens, term fee", amountCents: 22000 }],
  });

  invoiceCount += 1;
  await createInvoice({
    payerId: studentIds.emma,
    studentId: studentIds.emma,
    amountCents: 18000,
    status: "paid",
    dueDate: dateOnly(daysAgo(9)),
    issuedAt: ts(daysAgo(10)),
    paidAt: ts(daysAgo(8)),
    description: "Contemporary & Jazz – Term Fee (Emma Fraser)",
    lineItems: [{ description: "Emma Fraser – Contemporary & Jazz, term fee", amountCents: 18000 }],
  });

  // Sent / upcoming due.
  invoiceCount += 1;
  await createInvoice({
    payerId: parentIds.tane,
    studentId: studentIds.kauri,
    amountCents: 24500,
    status: "sent",
    dueDate: dateOnly(daysFromNow(14)),
    issuedAt: ts(daysAgo(2)),
    description: "Term Fees – Kauri Walker (Ballet Advanced + Hip-Hop Teens)",
    lineItems: [{ description: "Kauri Walker – Ballet Advanced + Hip-Hop Teens, term fee", amountCents: 24500 }],
  });

  invoiceCount += 1;
  await createInvoice({
    payerId: studentIds.jordan,
    studentId: studentIds.jordan,
    amountCents: 28000,
    status: "sent",
    dueDate: dateOnly(daysFromNow(10)),
    issuedAt: ts(daysAgo(3)),
    description: "Ballet Advanced – Term Fee (Jordan Lee)",
    lineItems: [{ description: "Jordan Lee – Ballet Advanced, term fee", amountCents: 28000 }],
  });

  // Overdue.
  invoiceCount += 1;
  await createInvoice({
    payerId: parentIds.lucy,
    studentId: studentIds.willow,
    amountCents: 19800,
    status: "overdue",
    dueDate: dateOnly(daysAgo(18)),
    issuedAt: ts(daysAgo(32)),
    description: "Term Fees – Willow Anderson (Hip-Hop Juniors, waitlisted)",
    lineItems: [{ description: "Willow Anderson – Hip-Hop Juniors, term fee", amountCents: 19800 }],
  });

  invoiceCount += 1;
  await createInvoice({
    payerId: parentIds.david,
    studentId: studentIds.leo,
    amountCents: 6500,
    status: "overdue",
    dueDate: dateOnly(daysAgo(25)),
    issuedAt: ts(daysAgo(40)),
    description: "Costume Fee – Leo Chen (Spring Showcase)",
    lineItems: [{ description: "Costume – Leo Chen, Spring Showcase", amountCents: 6500 }],
  });

  // Term payment plan — Michael O'Brien splits Sophie & Charlotte's term fees
  // into 3 installments; installment 1 is paid, 2 and 3 are upcoming.
  const INSTALLMENT_CENTS = 15000;
  const { data: plan, error: planErr } = await admin
    .from("term_payment_plans")
    .insert({
      studio_id: studioId,
      payer_id: parentIds.michael,
      total_cents: INSTALLMENT_CENTS * 3,
      installment_count: 3,
      installment_amounts: [INSTALLMENT_CENTS, INSTALLMENT_CENTS, INSTALLMENT_CENTS],
      installments_paid: 1,
      amount_paid_cents: INSTALLMENT_CENTS,
      next_due_date: dateOnly(daysFromNow(20)),
      status: "active",
    })
    .select("id")
    .single();
  if (planErr) throw planErr;

  const planInvoiceIds = [];
  planInvoiceIds.push(
    await createInvoice({
      payerId: parentIds.michael,
      studentId: studentIds.sophie,
      amountCents: INSTALLMENT_CENTS,
      status: "paid",
      dueDate: dateOnly(daysAgo(10)),
      issuedAt: ts(daysAgo(11)),
      paidAt: ts(daysAgo(9)),
      description: "Term Fees – Installment 1 of 3 (Sophie & Charlotte O'Brien)",
      lineItems: [{ description: "Sophie & Charlotte O'Brien – term fee, installment 1/3", amountCents: INSTALLMENT_CENTS }],
      termPlanId: plan.id,
    }),
  );
  planInvoiceIds.push(
    await createInvoice({
      payerId: parentIds.michael,
      studentId: studentIds.sophie,
      amountCents: INSTALLMENT_CENTS,
      status: "sent",
      dueDate: dateOnly(daysFromNow(20)),
      issuedAt: ts(daysAgo(1)),
      description: "Term Fees – Installment 2 of 3 (Sophie & Charlotte O'Brien)",
      lineItems: [{ description: "Sophie & Charlotte O'Brien – term fee, installment 2/3", amountCents: INSTALLMENT_CENTS }],
      termPlanId: plan.id,
    }),
  );
  planInvoiceIds.push(
    await createInvoice({
      payerId: parentIds.michael,
      studentId: studentIds.sophie,
      amountCents: INSTALLMENT_CENTS,
      status: "sent",
      dueDate: dateOnly(daysFromNow(50)),
      issuedAt: ts(daysAgo(1)),
      description: "Term Fees – Installment 3 of 3 (Sophie & Charlotte O'Brien)",
      lineItems: [{ description: "Sophie & Charlotte O'Brien – term fee, installment 3/3", amountCents: INSTALLMENT_CENTS }],
      termPlanId: plan.id,
    }),
  );
  invoiceCount += 3;

  const { error: planLinkErr } = await admin
    .from("term_payment_plan_invoices")
    .insert(planInvoiceIds.map((invoice_id) => ({ plan_id: plan.id, invoice_id })));
  if (planLinkErr) throw planLinkErr;

  console.log(`  ${invoiceCount} invoices, 1 term payment plan created.`);

  // ── Class passes ─────────────────────────────────────────────────────────
  console.log("Creating class passes…");
  // A single-use $25 drop-in pass: Emma's is purchased and not yet redeemed;
  // Jordan's has been redeemed. (class_passes is single-use per 0091 — there's
  // no multi-credit "pack" concept in this schema, so "partially used" is
  // represented as one unredeemed + one redeemed pass rather than a pack with
  // remaining credits.)
  const { error: passErr1 } = await admin.from("class_passes").insert({
    studio_id: studioId,
    student_id: studentIds.emma,
    price_cents: 2500,
    status: "paid",
    purchased_at: ts(daysAgo(4)),
  });
  if (passErr1) throw passErr1;

  const { error: passErr2 } = await admin.from("class_passes").insert({
    studio_id: studioId,
    student_id: studentIds.jordan,
    price_cents: 2500,
    status: "redeemed",
    purchased_at: ts(daysAgo(6)),
    redeemed_at: ts(daysAgo(3)),
    redeemed_class_id: classIds.ballet_advanced,
    redeemed_date: dateOnly(daysAgo(3)),
    redeemed_by: ownerId,
  });
  if (passErr2) throw passErr2;
  console.log("  2 class passes created (1 unredeemed, 1 redeemed).");

  // ── Badges ───────────────────────────────────────────────────────────────
  console.log("Awarding badges…");
  const badgeKeys = [
    "first_position",
    "tiny_tendus",
    "pirouette_pioneer",
    "dedicated_dancer",
    "club_100",
    "principal_dancer",
    "turning_titan",
    "allegro_ace",
    "supportive_family",
  ];
  const { data: badgeDefs, error: badgeDefErr } = await admin
    .from("badge_definitions")
    .select("id, key")
    .in("key", badgeKeys)
    .is("studio_id", null);
  if (badgeDefErr) throw badgeDefErr;
  const badgeIdByKey = Object.fromEntries(badgeDefs.map((b) => [b.key, b.id]));

  const AWARDS = [
    { recipientId: studentIds.ruby, badgeKey: "first_position", awardedBy: teacherIds.elena },
    { recipientId: studentIds.nikau, badgeKey: "tiny_tendus", awardedBy: teacherIds.elena },
    { recipientId: studentIds.aria, badgeKey: "pirouette_pioneer", awardedBy: teacherIds.elena },
    { recipientId: studentIds.aria, badgeKey: "dedicated_dancer", awardedBy: teacherIds.elena },
    { recipientId: studentIds.sophie, badgeKey: "club_100", awardedBy: teacherIds.elena },
    { recipientId: studentIds.sophie, badgeKey: "principal_dancer", awardedBy: teacherIds.elena },
    { recipientId: studentIds.kauri, badgeKey: "turning_titan", awardedBy: teacherIds.elena },
    { recipientId: studentIds.leo, badgeKey: "allegro_ace", awardedBy: teacherIds.jayden },
    { recipientId: parentIds.sarah, badgeKey: "supportive_family", awardedBy: ownerId },
  ];
  let badgeAwardCount = 0;
  for (const a of AWARDS) {
    const badgeId = badgeIdByKey[a.badgeKey];
    if (!badgeId) {
      console.warn(`  Skipping badge "${a.badgeKey}" — not found in catalogue.`);
      continue;
    }
    const { error } = await admin.from("profile_badges").insert({
      studio_id: studioId,
      recipient_id: a.recipientId,
      badge_id: badgeId,
      awarded_by: a.awardedBy,
      awarded_at: ts(daysAgo(Math.floor(Math.random() * 25) + 3)),
    });
    if (error) throw error;
    badgeAwardCount += 1;
  }
  console.log(`  ${badgeAwardCount} badges awarded.`);

  // ── NFC cards + building taps ────────────────────────────────────────────
  console.log("Issuing NFC cards + building taps…");
  const CARD_STUDENT_KEYS = ["ruby", "aria", "sophie", "kauri", "leo", "emma", "jordan"];
  const cardIdByStudent = {};
  for (const key of CARD_STUDENT_KEYS) {
    const { data: card, error } = await admin
      .from("nfc_cards")
      .insert({
        studio_id: studioId,
        student_id: studentIds[key],
        status: "active",
        issued_by: ownerId,
        issued_at: ts(daysAgo(45)),
      })
      .select("id")
      .single();
    if (error) throw error;
    cardIdByStudent[key] = card.id;
  }

  const tapRows = [];
  function addTapPair(key, dayOffset, inHour, outHour) {
    tapRows.push({
      studio_id: studioId,
      card_id: cardIdByStudent[key],
      student_id: studentIds[key],
      direction: "in",
      reader_key: "front-door",
      tapped_at: ts(daysAgo(dayOffset, inHour, 0)),
    });
    tapRows.push({
      studio_id: studioId,
      card_id: cardIdByStudent[key],
      student_id: studentIds[key],
      direction: "out",
      reader_key: "front-door",
      tapped_at: ts(daysAgo(dayOffset, outHour, 0)),
    });
  }
  addTapPair("ruby", 3, 16, 18);
  addTapPair("aria", 2, 17, 19);
  addTapPair("sophie", 2, 17, 19);
  addTapPair("leo", 1, 17, 18);
  // Kauri tapped in this morning and hasn't tapped out yet — currently "in".
  tapRows.push({
    studio_id: studioId,
    card_id: cardIdByStudent.kauri,
    student_id: studentIds.kauri,
    direction: "in",
    reader_key: "front-door",
    tapped_at: ts(daysAgo(0, 9, 15)),
  });

  const { error: tapErr } = await admin.from("building_taps").insert(tapRows);
  if (tapErr) throw tapErr;
  console.log(`  ${CARD_STUDENT_KEYS.length} NFC cards issued, ${tapRows.length} building taps logged.`);

  // ── Leads ────────────────────────────────────────────────────────────────
  console.log("Creating leads…");
  const { error: leadsErr } = await admin.from("leads").insert([
    {
      studio_id: studioId,
      first_name: "Chloe",
      last_name: "Baker",
      email: `lead.chloe@${EMAIL_DOMAIN}`,
      phone: "+64 21 555 0401",
      source: "website",
      status: "new",
      notes: "Enquired via the contact form about a Saturday Pre-Ballet trial for her 4-year-old.",
    },
    {
      studio_id: studioId,
      first_name: "Mark",
      last_name: "Stevens",
      email: `lead.mark@${EMAIL_DOMAIN}`,
      phone: "+64 21 555 0402",
      source: "referral",
      status: "contacted",
      notes: "Referred by the Ngata family. Phone call booked to discuss Hip-Hop Juniors for his son.",
    },
    {
      studio_id: studioId,
      first_name: "Amelia",
      last_name: "Foster",
      email: `lead.amelia@${EMAIL_DOMAIN}`,
      phone: "+64 21 555 0403",
      source: "social",
      status: "trial",
      notes: "Attended a trial Ballet Intermediate class on Tuesday. Deciding on enrolment.",
    },
  ]);
  if (leadsErr) throw leadsErr;
  console.log("  3 leads created.");

  // ── Parent <-> admin message threads ────────────────────────────────────
  console.log("Creating message threads…");

  async function createThread({ parentId, subject, isRead, messages }) {
    const { data: thread, error } = await admin
      .from("parent_email_threads")
      .insert({
        studio_id: studioId,
        parent_id: parentId,
        subject,
        snippet: messages[messages.length - 1].bodyText.slice(0, 140),
        participant_addresses: [OWNER_EMAIL, ...messages.map((m) => m.fromAddress)],
        message_count: messages.length,
        last_message_at: messages[messages.length - 1].sentAt,
        is_read: isRead,
      })
      .select("id")
      .single();
    if (error) throw error;

    const rows = messages.map((m) => ({
      studio_id: studioId,
      parent_id: parentId,
      parent_email_thread_id: thread.id,
      from_address: m.fromAddress,
      from_name: m.fromName,
      to_addresses: [m.toAddress],
      subject,
      body_text: m.bodyText,
      sent_at: m.sentAt,
      is_outbound: m.isOutbound,
    }));
    const { error: msgErr } = await admin.from("parent_email_messages").insert(rows);
    if (msgErr) throw msgErr;
    return messages.length;
  }

  let threadCount = 0;
  let messageCount = 0;

  messageCount += await createThread({
    parentId: parentIds.sarah,
    subject: "Uniform sizing for Ruby",
    isRead: true,
    messages: [
      {
        fromAddress: PARENTS.find((p) => p.key === "sarah").email,
        fromName: "Sarah Thompson",
        toAddress: OWNER_EMAIL,
        bodyText: "Hi team, what uniform size should I order for Ruby ahead of term 3? She's just turned 8.",
        sentAt: ts(daysAgo(3)),
        isOutbound: false,
      },
      {
        fromAddress: OWNER_EMAIL,
        fromName: "Mia Sinclair",
        toAddress: PARENTS.find((p) => p.key === "sarah").email,
        bodyText: "Hi Sarah, a size 6 should fit well at that age — happy to swap it free of charge if it's snug.",
        sentAt: ts(daysAgo(2)),
        isOutbound: true,
      },
    ],
  });
  threadCount += 1;

  messageCount += await createThread({
    parentId: parentIds.michael,
    subject: "Payment plan question",
    isRead: false,
    messages: [
      {
        fromAddress: PARENTS.find((p) => p.key === "michael").email,
        fromName: "Michael O'Brien",
        toAddress: OWNER_EMAIL,
        bodyText: "Hi, could we split Sophie and Charlotte's term fees into installments this term?",
        sentAt: ts(daysAgo(5)),
        isOutbound: false,
      },
      {
        fromAddress: OWNER_EMAIL,
        fromName: "Mia Sinclair",
        toAddress: PARENTS.find((p) => p.key === "michael").email,
        bodyText: "Of course — I've set up a 3-installment plan for you, first payment processed today.",
        sentAt: ts(daysAgo(4)),
        isOutbound: true,
      },
      {
        fromAddress: PARENTS.find((p) => p.key === "michael").email,
        fromName: "Michael O'Brien",
        toAddress: OWNER_EMAIL,
        bodyText: "Perfect, thank you! When's the next installment due?",
        sentAt: ts(daysAgo(1)),
        isOutbound: false,
      },
    ],
  });
  threadCount += 1;

  messageCount += await createThread({
    parentId: parentIds.tane,
    subject: "Kauri's costume fitting",
    isRead: false,
    messages: [
      {
        fromAddress: PARENTS.find((p) => p.key === "tane").email,
        fromName: "Tane Walker",
        toAddress: OWNER_EMAIL,
        bodyText: "Hi, what time is the costume fitting for the Ballet Advanced group this weekend?",
        sentAt: ts(daysAgo(0)),
        isOutbound: false,
      },
    ],
  });
  threadCount += 1;

  messageCount += await createThread({
    parentId: parentIds.rebecca,
    subject: "Isla's absence next week",
    isRead: true,
    messages: [
      {
        fromAddress: PARENTS.find((p) => p.key === "rebecca").email,
        fromName: "Rebecca Harris",
        toAddress: OWNER_EMAIL,
        bodyText: "Just letting you know Isla will miss Hip-Hop Juniors next Tuesday — we're away for a wedding.",
        sentAt: ts(daysAgo(2)),
        isOutbound: false,
      },
      {
        fromAddress: OWNER_EMAIL,
        fromName: "Mia Sinclair",
        toAddress: PARENTS.find((p) => p.key === "rebecca").email,
        bodyText: "Thanks for letting us know, enjoy the wedding!",
        sentAt: ts(daysAgo(2)),
        isOutbound: true,
      },
    ],
  });
  threadCount += 1;

  console.log(`  ${threadCount} threads, ${messageCount} messages created.`);

  // ── Website config ───────────────────────────────────────────────────────
  console.log("Publishing website config…");
  const { error: siteErr } = await admin.from("website_configs").upsert(
    {
      studio_id: studioId,
      template_id: "aria",
      kind: "split",
      accent_color: BRAND_COLOR,
      paper_color: "#faf8f3",
      ink_color: "#141414",
      font_display: "Fraunces",
      font_body: "Hanken Grotesk",
      density: 56,
      headline: "Where Wellington falls in love with dance.",
      tagline: "Ballet, hip-hop and contemporary classes for ages 3 through adult — small classes, real teachers, real growth.",
      eyebrow: "Est. 2016 · Wellington",
      sections: [
        { key: "about", visible: true },
        { key: "classes", visible: true },
        { key: "timetable", visible: true },
        { key: "gallery", visible: true },
        { key: "fees", visible: false },
        { key: "contact", visible: true },
      ],
      status: "published",
      published_at: ts(now),
      updated_at: ts(now),
    },
    { onConflict: "studio_id" },
  );
  if (siteErr) throw siteErr;
  console.log("  website_configs published.");

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log("\n============================================================");
  console.log(" Aurora Dance Collective — demo studio seeded");
  console.log("============================================================");
  console.log(`Studio id:        ${studioId}`);
  console.log(`Studio slug:      ${STUDIO_SLUG}`);
  console.log("");
  console.log("OWNER LOGIN (demo this one):");
  console.log(`  Email:    ${OWNER_EMAIL}`);
  console.log(`  Password: ${OWNER_PASSWORD}`);
  console.log("");
  console.log(`All other @${EMAIL_DOMAIN} accounts (teachers, parents, students)`);
  console.log(`share the password: ${DEMO_PASSWORD}`);
  console.log("");
  console.log("Counts:");
  console.log(`  Teachers:            ${TEACHERS.length}`);
  console.log(`  Parents:             ${PARENTS.length}`);
  console.log(`  Kid students:        ${KID_STUDENTS.length}`);
  console.log(`  Adult students:      ${ADULT_STUDENTS.length}`);
  console.log(`  Classes:             ${CLASSES.length}`);
  console.log(`  Enrollments:         ${enrollmentCount}`);
  console.log(`  Guardianships:       ${KID_STUDENTS.length}`);
  console.log(`  Waivers:             ${waiverRows.length}`);
  console.log(`  Waiver signatures:   ${signatureCount}`);
  console.log(`  Invoices:            ${invoiceCount}`);
  console.log(`  Term payment plans:  1`);
  console.log(`  Class passes:        2`);
  console.log(`  Badges awarded:      ${badgeAwardCount}`);
  console.log(`  NFC cards:           ${CARD_STUDENT_KEYS.length}`);
  console.log(`  Building taps:       ${tapRows.length}`);
  console.log(`  Leads:               3`);
  console.log(`  Message threads:     ${threadCount} (${messageCount} messages)`);
  console.log(`  Website config:      1 (published)`);
  console.log("\nSign in at /login with the owner credentials above.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
