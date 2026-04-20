# Acuity — SOC 2 Readiness Gap Analysis

**Date:** 2026-04-20
**Scope:** SOC 2 Trust Services Criteria (TSC) mapping against Acuity's current state. Not an attestation — a honest readiness assessment so Jim knows where he is pre-public-beta, pre-Series-A, pre-enterprise-sales, pre-formal-audit.
**Framing:** A 2-person team with a paid Vercel/Supabase stack and no formal compliance program. Most "controls" are informal today.

---

## TL;DR

**Where you stand today:** Not SOC 2 ready. Core security hygiene is actually reasonable for a pre-launch product (see the security-audit companion). What's missing is the *formalization* layer — written policies, audit trails, access reviews, DR runbooks. That's the SOC 2 tax.

**Time to readiness estimate:**
- **Pre-public-beta:** Close the `CRITICAL` gaps below (~1 week of work).
- **Pre-first-enterprise-pitch:** Close `CRITICAL` + `HIGH` (~1 month).
- **Pre-formal-SOC-2-audit:** ~3-6 months with a compliance automation tool (Vanta/Drata/Secureframe).

**What NOT to do yet:**
- Don't engage a SOC 2 auditor until post-enterprise-conversation. Type 1 audit is $15-30K; Type 2 another $15-30K and needs 6 months of evidence. Premature for v1 beta.
- Don't write policy documents that don't reflect reality. Auditors will spot the gap between stated policy and actual practice — worse than having no policy.

---

## Trust Services Criteria breakdown

Each criterion: **current state → gap → effort → priority.**
Priority bands: `week-1` (pre-public-beta), `month-1` (pre-enterprise), `quarter-1` (pre-audit).

---

### CC1 — Control environment

SOC 2 expects organizational structure, governance, ethics, accountability.

| # | Current state | Gap | Effort | Priority |
|---|---|---|---|---|
| CC1.1 | 2-person team (Jim + Keenan). No org chart, no explicit roles. | Write a 1-pager: "who owns what" — Jim = product/eng lead, Keenan = ?. Needed for auditor interviews. | 30 min | month-1 |
| CC1.4 | No written code of conduct or security policy. | A short Acceptable Use / Security Responsibility doc. Cargo-cult templates are available. | 2 hours | month-1 |
| CC1.5 | Hiring + onboarding: no checklist because no employees yet. | When you hire #3, start the checklist *on day one*. Template + access-grant list. | 1 hour when triggered | month-1 |

---

### CC2 — Communication & information

| # | Current state | Gap | Effort | Priority |
|---|---|---|---|---|
| CC2.1 | Codebase is the system. No architecture diagram. | One high-level diagram (client → Vercel → Supabase + Inngest + Anthropic/OpenAI + Stripe + Resend + PostHog). Useful for the auditor AND for you. | 2 hours (excalidraw or mermaid) | week-1 |
| CC2.2 | No SLA doc, no public status page. | Status page via Upptime/BetterStack at status.getacuity.io. | 2 hours | month-1 |
| CC2.3 | User data handling is documented in `/privacy` (real prose) and this audit. | Good. Keep privacy page current as data flows change. | ongoing | — |

---

### CC3 — Risk assessment

| # | Current state | Gap | Effort | Priority |
|---|---|---|---|---|
| CC3.1 | No formal risk register. SECURITY_AUDIT.md is the closest thing. | Promote SECURITY_AUDIT.md to a living risk register. Each finding is a risk with severity + status. Review quarterly. | ongoing | month-1 |
| CC3.2 | Third-party risk: processors are disclosed in /privacy. No DPAs signed with most of them. | Get DPAs from OpenAI, Anthropic, Stripe, Supabase (for EU compliance path). Standard forms; all four offer them. | 1-2 hours per vendor | month-1 |
| CC3.3 | Fraud risk: N/A at this stage — no payments direct to us beyond Stripe subscription. | — | — | — |

---

### CC4 — Monitoring

| # | Current state | Gap | Effort | Priority |
|---|---|---|---|---|
| CC4.1 | Vercel logs, Supabase dashboard, manual checks. No proactive alerting. | Set up: (a) Vercel function error alerts → Slack/email, (b) Supabase CPU/query alerts, (c) Stripe webhook failure alerts. | Half a day | week-1 |
| CC4.2 | No security scan schedule. | `npm audit` monthly. Dependabot or Renovate on GitHub. | 30 min to wire Renovate | month-1 |

---

### CC5 — Control activities

| # | Current state | Gap | Effort | Priority |
|---|---|---|---|---|
| CC5.1 | Change management: all changes via git + deploy scripts. No branch protection on `main`. No PR reviews (2-person shop, often push straight). | Enable GitHub branch protection: require at least 1 review, require CI pass, disallow force-push to main. **Critical for SOC 2 but also just good hygiene.** | 15 min config | **week-1** |
| CC5.2 | Policies enforced via code. No separate policy docs. | Write a 1-pager "Change Management Policy" when someone asks — covers: all changes via PR, no direct prod writes, deploy via Vercel, CI required. | 1 hour | month-1 |
| CC5.3 | Segregation of duties: impossible with 2 people — Jim reviews + deploys + approves. Document the compensating control (small team, all changes logged in git). | Note in the eventual policy doc. | 15 min when writing policies | quarter-1 |

---

### CC6 — Logical & physical access

This is the biggest gap for a small team.

| # | Current state | Gap | Effort | Priority |
|---|---|---|---|---|
| CC6.1 | Dev access to prod: Jim has full Vercel + Supabase + GitHub admin. Keenan — unclear from the audit. | **Confirm**: does Keenan have prod Supabase access? Prod Vercel deploy rights? If yes, and he doesn't need it: remove. Least-privilege. If yes and he needs it: document who-has-what. | Half a day audit + rework | **week-1** |
| CC6.2 | Auth into prod services: Vercel + Supabase + GitHub all via Google SSO (presumed). | Verify MFA is mandatory on all three. GitHub enforced-MFA for the org, Google Workspace for SSO-backed services, Supabase needs direct 2FA toggle. | 30 min to verify/enable | **week-1** |
| CC6.3 | User access (our users, into the app): Google OAuth + email magic-link + (being added) password. No MFA for end users yet. | MFA for end users is a nice-to-have for consumer; **mandatory** for enterprise users. Defer until enterprise demand. | 1-2 days when triggered | quarter-1+ |
| CC6.4 | No logical access reviews. Nobody has reviewed "who should have admin access" ever. | Quarterly review. First one: now. Output: a spreadsheet with name + access level + justification. | 1 hour | **week-1** |
| CC6.6 | Physical access to prod: N/A — cloud-only (Vercel + Supabase). | Standard cloud-vendor shared-responsibility model applies. Document it. | — | month-1 |
| CC6.7 | Transmission controls: TLS 1.2+ everywhere. Vercel + Supabase enforce TLS 1.3 by default. | Verify HSTS is serving from our origin (shipped this session). Verify Supabase connection strings use `sslmode=require`. | 15 min to verify | **week-1** |
| CC6.8 | Malware: not applicable to serverless surface but DevEx-side: are Jim's/Keenan's laptops on auto-update, endpoint protection? | 1Password for credentials, macOS built-in XProtect + Gatekeeper. Small-team standard. | Already in place (presumed) | — |

---

### CC7 — System operations

| # | Current state | Gap | Effort | Priority |
|---|---|---|---|---|
| CC7.1 | Backups: Supabase runs daily backups with 7-day retention on the Pro plan. No external backups. | Verify current Supabase plan has daily backups. If on Hobby, upgrade (backups are Pro-plan feature). Consider: weekly `pg_dump` to S3 as DR belt + suspenders. | 2 hours DR backup | month-1 |
| CC7.2 | RTO / RPO: no documented target. | Declare RTO (4 hours) + RPO (24 hours) based on Supabase backup cadence. Document. | 30 min | month-1 |
| CC7.3 | Incident response: no IR playbook. If compromised tonight, Jim figures it out reactively. | Write a 2-page IR runbook: (1) contact list, (2) severity levels, (3) rotation steps (DB password, OAuth secrets, Resend key, etc.), (4) comms templates for user notifications. Reference: Stripe's public IR doc or Supabase's. | Half a day | **week-1** |
| CC7.4 | Availability monitoring: Vercel analytics + Supabase dashboard. No synthetic uptime check. | Add Upptime or BetterStack for public status + synthetic monitoring of `/`, `/api/user/me`, `/api/record` (HEAD requests). | 2 hours | month-1 |
| CC7.5 | Patch management: manual `npm update`. Just ran `npm audit` this session. | Renovate or Dependabot PRs. Auto-merge patch-level. | 30 min | month-1 |

---

### CC8 — Change management

Covered by CC5 above. Git + Vercel + PR-required branch protection = the whole answer for a team this size.

---

### CC9 — Risk mitigation

| # | Current state | Gap | Effort | Priority |
|---|---|---|---|---|
| CC9.1 | Vendor risk: documented in /privacy (processor list). No SOC 2 reports from vendors collected. | Request SOC 2 reports from: Stripe (has one), Supabase (has one), OpenAI (SOC 2 Type 2 public), Anthropic, Vercel (Type 2). File in Google Drive. | 1-2 hours to request + file | month-1 |
| CC9.2 | Insurance: probably none yet. | Cyber insurance becomes interesting pre-Series-A (~$2K/year, $1-5M coverage). Not urgent for a beta. | — | quarter-1 |

---

### A1 — Availability (Trust Services Criterion)

| # | Current state | Gap | Effort | Priority |
|---|---|---|---|---|
| A1.1 | Vercel + Supabase handle availability. SLA inherited from vendors (Vercel 99.99%, Supabase 99.9% on Pro). | Document the downstream SLA implication: our app is constrained by the weakest link in that chain. | 30 min | month-1 |
| A1.2 | Capacity planning: informal. Current load is 2 users. | N/A at this stage. Revisit at 1000+ users. | — | quarter-1+ |
| A1.3 | BCP/DR: see CC7.1. | Same gaps. | — | month-1 |

---

### C1 — Confidentiality

| # | Current state | Gap | Effort | Priority |
|---|---|---|---|---|
| C1.1 | Data classification: implicit (public = marketing site, confidential = everything else). Not written down. | 1-pager: public / internal / confidential / restricted. Voice recordings + transcripts = restricted. Mood/themes/goals = confidential. Email/name = confidential. | 1 hour | month-1 |
| C1.2 | Encryption at rest: Supabase default (AES-256 on disk). | Verify + document. For the paranoid: field-level encryption of transcript bodies — not standard at this scale, deferred. | 30 min verify | month-1 |

---

### PI1 — Processing Integrity

N/A at our scale. Relevant when we're offering an API with a contracted processing SLA. Skip for now.

---

### P1–P8 — Privacy

| # | Current state | Gap | Effort | Priority |
|---|---|---|---|---|
| P1 Notice | /privacy page is real prose, covers collection + purposes + subprocessors. | Good. Keep current. | ongoing | — |
| P2 Choice + consent | Cookie consent: **missing**. Meta Pixel + PostHog + GA fire on first load without a consent banner. GDPR-exposed. | Install a consent banner. Cookiebot / Osano / a custom one. **Required before any EU user signup.** | 1 day | **week-1** |
| P3 Collection | Collection minimized — we collect what's needed. | Periodic review (quarterly). | ongoing | month-1 |
| P4 Use, retention, disposal | Retention: "indefinitely while active" per /privacy. Deletion: account-delete cascade implemented (S3). | Add an auto-deletion policy: e.g. users inactive 2+ years get deletion notice. Not needed for beta. | 1 day when triggered | quarter-1 |
| P5 Access | Users can see their own data (dashboard). No self-service data export (GDPR Art. 20). | Add `/api/user/export` returning a JSON bundle of all the user's data. Useful for users + required for GDPR. | 1-2 days | month-1 |
| P6 Disclosure | Only to disclosed subprocessors. No resale, no sharing. | Good. | — | — |
| P7 Quality | Data accuracy: user-controlled. | — | — | — |
| P8 Monitoring + enforcement | Privacy breach response is part of IR playbook (CC7.3). | Same gap. | — | week-1 |

---

## Roadmap — prioritized

### Week 1 (close before public beta)

| # | Item | Effort |
|---|---|---|
| 1 | Enable GitHub branch protection on `main` — require PR review, require CI pass | 15 min |
| 2 | Confirm MFA on Vercel, Supabase, GitHub, Google Workspace for Jim + Keenan | 30 min |
| 3 | Audit Keenan's prod access — remove anything he doesn't need | half day |
| 4 | First quarterly access review (document who has what) | 1 hour |
| 5 | Write IR runbook (contacts + severity + rotation steps) | half day |
| 6 | Set up Vercel error alerts → email | 1 hour |
| 7 | Cookie consent banner (required for EU users) | 1 day |
| 8 | Verify HSTS is live + Supabase sslmode=require | 15 min |
| 9 | Verify Supabase is on Pro plan (daily backups) | 10 min |
| 10 | Second-rotation of the leaked Supabase password (F-14) | 30 min |

### Month 1 (close before first enterprise conversation)

| # | Item | Effort |
|---|---|---|
| 1 | Architecture diagram | 2 hours |
| 2 | 1-pager policies: org chart, code of conduct, change management | half day |
| 3 | Collect SOC 2 reports from Stripe, Supabase, OpenAI, Anthropic, Vercel | 2 hours |
| 4 | Request DPAs (same vendors) | 2 hours |
| 5 | Status page (Upptime / BetterStack) | 2 hours |
| 6 | Renovate / Dependabot enabled on GitHub | 30 min |
| 7 | Weekly `pg_dump` to S3 (DR backup) | half day |
| 8 | Declare RTO + RPO targets | 30 min |
| 9 | `/api/user/export` self-service data export | 1-2 days |
| 10 | Admin audit log (F-18 from security audit) | half day |
| 11 | Data classification 1-pager | 1 hour |

### Quarter 1 (start aligning toward a Type 1 audit)

| # | Item | Effort |
|---|---|---|
| 1 | Engage a compliance automation vendor (Vanta / Drata / Secureframe, $500-1500/mo) | 1-2 week onboarding |
| 2 | Written policies library (employee handbook, access control, change management, IR, BCP, SDLC, data retention) | 2-3 weeks |
| 3 | 6 months of evidence collection in the vendor tool (logs, screenshots, approval trails) | 6 months minimum |
| 4 | MFA enforcement for end users (if enterprise customers need it) | 1-2 days |
| 5 | Cyber insurance quote + policy | 1 week |
| 6 | Formal Type 1 audit kickoff (only after the above) | 2-3 months |

---

## What makes this a "startup-stage" SOC 2 view vs. "enterprise-stage"

This document treats SOC 2 as a destination, not a religion. The reality for a 2-person company:

- **A small team is NOT a disqualifier.** Startups pass SOC 2 every day with 2-5 people. The key is honest documentation.
- **Vanta/Drata/Secureframe collapse 80% of the work.** The right SaaS tool writes your policy library from templates, monitors your cloud accounts, and generates audit evidence automatically. Without one, SOC 2 is a nightmare.
- **Don't over-engineer controls for a stage you're not at.** If the auditor expects "monthly access reviews," you can say "quarterly" with a documented justification. The rubric is "appropriate for the size + complexity of the operation," not "matches a Fortune 500."
- **Vendor SOC 2 reports do a LOT of heavy lifting.** Inheriting controls from Vercel/Supabase/Stripe covers most of the infrastructure-security criteria. You're on the hook for your own logic, code, and access.

---

## Top-3 things Jim should do THIS WEEK

If all I could tell you to do this week, these three:

1. **Turn on GitHub branch protection + MFA on all infra accounts.** Takes 30 minutes. Closes 3 SOC 2 gaps at once. Costs nothing.

2. **Write the incident response runbook + set up Vercel error alerts.** Half a day. Without these, a breach gets discovered by a user emailing you — worst possible detection path. The IR doc also becomes the first ~2-page policy the eventual SOC 2 auditor sees.

3. **Ship a cookie consent banner.** One day. You can't accept EU users legally without it (GDPR + ePrivacy Directive). Every day you're live without one you're accumulating latent exposure.

Do those three, and you'll be in a materially better place heading into the beta.

---

*End of readiness doc. Companion: SECURITY_AUDIT.md for the underlying security findings + fix trail.*
