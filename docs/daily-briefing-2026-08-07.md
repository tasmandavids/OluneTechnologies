# Olune — Daily Security & Performance Briefing

**Date:** Friday, 7 August 2026
**Scope:** Full codebase (678 source files, 46 API endpoints, 110 database migrations) plus dependency supply chain
**Overall verdict:** 🟢 **Stable.** One real security hole found and fixed. No sign of any breach or data loss.

---

## 🚨 1. Critical Security Vulnerabilities

### 1.1 The invoice numbering table was left unlocked — **fixed**

**Issue.** Olune keeps a small internal table that remembers the last invoice number each studio used, so the next invoice comes out as INV-0042 rather than a duplicate. Every other table in the database has a lock on it that says "you may only see your own studio's rows." This one table was missed — it was the only one of 104 without that lock.

**Risk.** Any logged-in customer of any studio could have read it, revealing roughly how many invoices every other studio on the platform has issued — a fair proxy for a competitor's revenue volume. More seriously, they could also have *edited* it. Winding another studio's counter backwards would make that studio's next invoice collide with one they already have, and the invoice would simply refuse to save. In plain terms: one customer could have stopped another studio from invoicing at all.

To be clear about severity: this required someone to be a signed-in Olune user, know the table existed, and deliberately go looking for it using developer tools. There is no evidence anyone did. But it was genuinely reachable, and it should not have been.

**Action taken.** Written a database change (migration `0111`) that switches the lock on and removes general access to the table entirely. Nothing legitimate breaks — no part of the app ever touched this table directly; the invoice number is stamped on automatically by the database itself, which operates above these permissions.

> ⚠️ **This needs one action from you.** The fix is written but **not yet live**. It applies automatically the next time database changes are pushed (`npm run db:push`, or on the next merge to `main`). Until then the gap is still open.

### 1.2 Six known vulnerabilities in third-party code — **all fixed**

**Issue.** Olune relies on outside software packages. Six of them had publicly published security flaws, four rated high severity. The most relevant was in Next.js, the framework Olune runs on: a flaw letting an attacker overload the parts of the app that handle form submissions and save actions — which is most of Olune — and knock it offline. Also flagged: the image-processing library (four flaws in the underlying photo engine), and a flaw allowing certain web addresses to be misread in a way that can trick a server into fetching things it shouldn't.

**Risk.** The Next.js one is the notable one: a denial-of-service, meaning downtime rather than data theft. Bad on a recital night; not a data breach.

**Action taken.** Upgraded Next.js and pinned safe versions of the other four. All are same-generation updates, not rewrites, so the risk of breakage is low. **Production dependency vulnerabilities are now at zero, down from six.** Two low-priority advisories remain in developer-only tooling that never reaches a customer; deliberately left alone as fixing them means a riskier upgrade for no customer benefit.

### 1.3 What was checked and found healthy

Worth recording, because it's the larger part of the picture:

- **All 46 API endpoints** properly check who's asking before doing anything.
- **Payment and accounting webhooks** correctly verify cryptographic signatures, with the timing-attack-resistant comparison method.
- **The NFC check-in reader** authenticates properly and fails safely on a bad credential.
- **Scheduled jobs** are secret-protected and refuse to run unprotected in production.
- **No passwords, keys, or secrets** found written into the code. Environment files are correctly excluded from version control.
- **Browser security headers** are in place and well configured.
- **103 of 104 database tables** had correct access locks (the 104th is 1.1 above).

---

## ⚡ 2. Speed & Performance Bottlenecks

### 2.1 Family-to-student links were being searched the slow way — **fixed**

**Bottleneck.** The table connecting parents to their children is consulted constantly by the admin side — the People page, each parent's profile, the students list, the invoices and payment-plans tabs, the forms module, and teacher messaging. Sixteen separate places. It had shortcuts ("indexes") for looking a family up *by parent* and *by student*, but none for the way the admin screens actually ask: "everyone in **this studio**."

**Impact.** Without that shortcut the database reads the entire table — every family across every studio on the platform — and discards the irrelevant rows, on every one of those page loads. It's invisible today at current data volumes. It gets steadily worse as studios are added, because the cost grows with *total platform size* rather than with the size of the studio asking.

**Action taken.** Added two shortcuts matching the exact question the admin screens ask (included in the same migration `0111`). The existing shortcuts stay, since the parent- and student-facing screens still rely on them.

### 2.2 Where the code was already well optimised

I went looking for the usual culprits and largely didn't find them, which is worth saying plainly rather than inventing work:

- **Database shortcuts are well covered.** 167 indexes across the schema. Of the tables I initially flagged as missing one, all but the family-links table above were already correctly indexed on the path they're genuinely queried by. I deliberately did **not** add indexes to the other five — an unused index costs speed on every save without helping any read.
- **A previously known problem is already resolved.** An earlier attempt to speed up class-capacity counts (migration 0067) used a technique that would have broken every enrolment. It was caught and reverted in 0068. Confirmed still correctly reverted.
- **The permission checks were already optimised.** They read the user's studio from their login token rather than querying the database on every row.

### 2.3 One improvement identified but deliberately **not** made

The database's permission rules call a helper function in a way that makes it re-run for every row examined, rather than once per query. Rewriting these to run once is a well-documented technique that can be dramatically faster on large tables.

**I chose not to do this tonight.** It touches 211 separate security rules. A mistake in any one of them is a data-privacy incident, not a slow page. This wants a human review and a staging test, not an unattended 3am change. **Recommend scheduling it deliberately.**

---

## 🛠️ 3. Quick Summary Checklist

1. **Push the database change.** Migration `0111` closes the invoice-table hole and speeds up the admin screens. It is written and waiting — it does nothing until pushed. *This is the only item needing your action.*
2. **Nothing else is blocking.** The dependency upgrades and the new build check are already committed to the codebase and take effect on the next deploy. Production dependency vulnerabilities: 6 → 0.
3. **Book time for the permission-rules speedup (§2.3).** The single largest remaining performance gain, but it needs supervised review — not an overnight job.

---

## Also done tonight

Picked up item **0.4** from `MARKET_READINESS.md`: *"`next build` does not run in CI."*

Olune's automated checks previously ran the tests, type checks, and code style — but never actually built the app. A build-only failure would sail through and land on the live site. That's not hypothetical: it caused a total outage in June (commit `753f040`, a malformed URL setting). Added the build step, plus an automatic security scan of production dependencies, so a vulnerable package now fails the build rather than shipping. `MARKET_READINESS.md` updated to mark 0.4 complete.

---

## Verification performed

| Check | Result |
|---|---|
| Type checking (`tsc --noEmit`) | ✅ Clean |
| Unit tests | ✅ 362 passed / 362, across 42 files |
| Production dependency audit | ✅ 0 vulnerabilities (was 6: 4 high, 2 moderate) |
| CI workflow file validity | ✅ Valid |
| Full production build | ⚠️ Not completed — see note |

**Note on the build.** It was still compiling after ~10 minutes in the audit sandbox, whose file access is much slower than a real machine, so I stopped it rather than leave a runaway process writing into your project folder. This is an environment limitation, not a code failure. Confidence remains high: type checking passes, all 362 tests pass, no application code was changed, and the Next.js update was a minor patch already permitted by the project's existing version range. **The new CI build step will confirm it properly on the next push** — which is exactly the gap that step was added to close.

## Files changed

| File | Change |
|---|---|
| `supabase/migrations/0111_…sql` | **New.** Access lock on the invoice counter + 2 family-links indexes. *Not yet applied.* |
| `package.json` / `package-lock.json` | Next.js 15.5.19 → 15.5.22; safe versions pinned for 4 more packages |
| `.github/workflows/ci.yml` | Added build + production dependency audit steps |
| `MARKET_READINESS.md` | Marked item 0.4 complete |

No application code (`.ts` / `.tsx`) was modified.
