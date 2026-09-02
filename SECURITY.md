# Security Policy

Olune is a hosted platform for dance and fitness studios. Studios trust us with
their members' details — including children's names, contact details, medical
notes and payment records — so we take security reports seriously and we would
rather hear about a problem from you than from a customer.

## Reporting a vulnerability

**Email: security@olune.co.nz**

Please report privately. Do not open a public GitHub issue, post to social
media, or share details in a studio's support channel.

Include as much of the following as you can:

- What the issue is and why it matters (what an attacker could actually do)
- Step-by-step reproduction, including the exact URL or endpoint
- The account, studio subdomain, or test data you used
- Proof of concept — a request/response pair, screenshot, or short video
- Any suggested fix, if you have one

Write in English. Encrypted mail is welcome; ask and we will send a key.

### What happens next

| Stage | Target |
| --- | --- |
| We acknowledge your report | 3 business days (NZ time) |
| We confirm the issue and give you a severity assessment | 10 business days |
| We send you a progress update | Every 10 business days until it is closed |
| Critical or high severity fixed in production | 30 days |
| Medium or low severity fixed in production | 90 days |

If we decline a report we will tell you why, and you are free to disagree — send
us more detail and we will look again.

We ask that you give us 90 days from your first report before publishing, and
that you coordinate the timing of any writeup with us. If a fix is taking longer
than 90 days we will tell you where it is up to rather than go quiet.

## Scope

**In scope**

- `olune.co.nz` and `www.olune.co.nz`
- Studio subdomains on `*.olune.co.nz`
- Custom domains served by Olune on behalf of a studio
- The Olune parent mobile app (iOS and Android)
- The Olune API, including webhook and cron endpoints
- Source code in this repository

The issues we care most about, in rough order:

1. **Cross-tenant data access** — any path by which one studio can read or
   modify another studio's data, or a parent can see another family's records
2. Authentication and session flaws — account takeover, privilege escalation to
   studio admin or platform operator, auth bypass
3. Exposure of student, member, or payment data
4. Payment and billing manipulation (Stripe flows, subscription state, invoices)
5. Remote code execution, SQL injection, SSRF
6. Stored XSS in studio-authored content, including websites built in Olune

**Out of scope**

- `olune.app` — an unrelated product that is not ours
- Third-party services we build on. Report those to the vendor: Supabase,
  Vercel, Stripe, Resend, Expo, Xero.
- Denial of service, volumetric or application-level load testing
- Social engineering, phishing, or physical attacks against Olune staff,
  studio staff, or their members
- Automated scanner output with no demonstrated impact
- Missing security headers, missing SPF/DMARC hardening, cookie flags, TLS
  configuration, or version disclosure, with no working exploit
- Self-XSS, clickjacking on pages with no state-changing action, and issues
  requiring a rooted or jailbroken device or a physically unlocked one
- Reports that depend on outdated browsers or already-compromised credentials

## Rules of engagement

Test against your own accounts and your own trial studio. If you follow the
rules below we will treat your research as authorised, will not pursue legal
action over it, and will not report you to your ISP or employer.

- **Do not access real member data.** Sign up for a trial studio and use your
  own seeded records.
- If you do encounter another party's personal data, stop immediately, do not
  save or share it, and tell us what you saw so we can assess the exposure.
- Do not modify or delete data you do not own, and do not degrade service for
  anyone else.
- Do not send email, SMS, or push notifications to real studios, staff, or
  parents as part of testing.
- Use only the minimum access needed to prove the issue. No pivoting, no
  persistence, no backdoors.
- Do not run automated scanners against production at volume.

If a test could plausibly break something for a real studio, email us first and
we will set you up rather than have you find out live.

## Supported versions

Olune is a hosted service. There is one production deployment and it is the only
web version that receives security fixes — we do not backport to earlier builds
or support self-hosted copies of this repository.

| Component | Supported |
| --- | --- |
| Web app in production at `olune.co.nz` | ✅ Current deployment |
| Earlier web builds and preview deployments | ❌ |
| Parent mobile app — latest store release | ✅ |
| Parent mobile app — older installed builds | ❌ Update to the latest release |
| Self-hosted or forked deployments | ❌ |

## Recognition

We do not run a paid bug bounty. We will credit you by name or handle in the
release notes and any advisory we publish, unless you would rather stay
anonymous. Ask and we will write you a reference for a report that stood up.

## Non-security support

For account problems, billing questions, or anything that is not a security
issue, contact **support@olune.co.nz**.
