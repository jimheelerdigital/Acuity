# Pricing display refactor — tier-derived prices

Closes the blocking prerequisite in `docs/REVENUECAT_STAGE2_RUNBOOK.md` §3.3:
every user-facing price now resolves from the pricing tier system, so no
surface can advertise a number that differs from what checkout charges once
`newPricingEnabled` flips.

**This changes no behaviour today.** The flag is off, so every display
resolves `LEGACY_TIER` — $4.99 / $39.99 — exactly as before.

---

## How it works

Two new display layers, one per app, both reading the same
`packages/shared/src/pricing-plans.ts` catalog that checkout uses:

| Helper | Returns | Use for |
|---|---|---|
| `displayMonthly()` | `"$4.99"` → `"$9.99"` when flipped | any prospect-facing monthly price |
| `displayAnnual()` | `"$39.99"` → `"$89.99"` | any prospect-facing annual price |
| `displayAnnualAsMonthly()` | `"$3.33"` → `"$7.50"` | "just $X/month, billed annually" |
| `legacyPriceDisplay()` | `"$4.99"`, always | copy *about* grandfathered subscribers |
| `displaySavingsPct()` *(mobile)* | `33` → `25` | annual savings badge |
| `monthlyPriceDollars()` / `annualPriceDollars()` | `4.99` → `9.99` | Meta Pixel `value` / `predicted_ltv` |

`displayTier()` calls `pricingTierFor({ paidSince: null })` — "a new customer
signing up right now". That is the correct question for a marketing surface:
an anonymous visitor has no grandfathering to inherit.

Flag parsing is **fail-closed** (`"1" | "true" | "on" | "yes"` only). A typo
must never advertise a price checkout is not charging.

### ⚠️ The flag must be set in two places on web

`displayMonthly()` reads `NEW_PRICING_ENABLED`, falling back to
`NEXT_PUBLIC_NEW_PRICING_ENABLED`. Server components can see the first;
**client components can only see the `NEXT_PUBLIC_` one**, because Next
inlines those at build time and nothing else.

`components/landing.tsx` is a client component and renders a price. If only
the server variable is set, the server pages would show the new price and the
landing page would still show the old one — a mismatch that looks exactly
like the bug this refactor exists to prevent. **Set both, and redeploy**
(inlining happens at build, so an env change alone does nothing).

Mobile uses `EXPO_PUBLIC_NEW_PRICING`, inlined by Metro at build time, so a
price change there needs a new build — it cannot ship OTA.

---

## Files changed (24 in #41, +7 in the pre-flip cleanup)

**Display layer**
- `apps/web/src/lib/pricing.ts` — `displayTier`, `displayMonthly`,
  `displayAnnual`, `displayAnnualAsMonthly`, `legacyPriceDisplay`
- `apps/mobile/lib/pricing.ts` — same, reading `EXPO_PUBLIC_NEW_PRICING`

**Category (a) — live paywall / checkout / upgrade**
- `apps/web/src/app/upgrade/upgrade-plan-picker.tsx`
- `apps/web/src/components/onboarding-funnel.tsx`
- `apps/mobile/app/subscribe.tsx` (StoreKit fallback prices)
- `apps/mobile/app/paywall.tsx`
- `apps/mobile/app/onboarding-new/paywall.tsx`
- `apps/web/src/components/marketing/Pricing.tsx`

**Category (b) — marketing / SEO / email / generated copy**
- `apps/web/src/app/page.tsx` (incl. the schema.org `offers.price`)
- `apps/web/src/app/voice-journaling/page.tsx`
- `apps/web/src/app/for/{sleep,founders,therapy,weekly-report}/page.tsx`
- `apps/web/src/app/terms/page.tsx`
- `apps/web/src/components/landing.tsx`, `landing-shared.tsx`
- `apps/web/src/lib/drip-emails.ts` (3 sites)
- `apps/web/src/emails/trial/{trial-ending,trial-ending-day13,value-recap,recovery-signup-no-checkout}.ts`
- `apps/web/src/inngest/functions/auto-blog.ts`
- `apps/web/src/lib/content-factory/generate.ts`

**Proof**
- `apps/web/src/lib/evidence/price-display-tier.test.ts` — 11 tests

---

## Category (c) — intentional literals, deliberately NOT changed

Every remaining `4.99` / `39.99` in non-test source falls into one of these.
None is a live price display.

### 1. ~~The therapy testimonial~~ — RESOLVED
Owner confirmed the Jamie L. quote is placeholder copy, so the price clause
was **dropped** rather than rewritten:

> "It's the most affordable mental health tool I've ever used. And the most
> consistent."

No dollar figure, so it can never go stale. (Had it been a real quote, the
right move would still have been to retire or re-source it — editing a
person's words to cite a price they never said is fabricating a
testimonial.)

### 2. Historical / explanatory comments (not rendered)
- `lib/pricing.ts` — rollback reference (`$12.99 / $99 → $4.99 / $39.99`),
  worked example of the savings math, JSDoc samples
- `apps/mobile/lib/pricing.ts` — same
- `apps/mobile/lib/iap.ts:278` — JSDoc `e.g. "$4.99"`
- `apps/web/src/app/upgrade/upgrade-plan-picker.tsx:31` — records a past
  incident where the page advertised $99 while Stripe charged $39.99, which
  is the same class of bug this refactor prevents. Worth keeping.
- `apps/web/src/components/marketing/Pricing.tsx:3` — header comment
- `apps/mobile/app/onboarding-new/paywall.tsx:41` — spec reference
- `apps/mobile/lib/pricing.ts` / `apps/web/src/lib/pricing.ts` — the
  doc comments on the display helpers, which name the legacy values to
  explain what "behaviour-neutral today" means

### 3. SVG path coordinate data — false positives
- `components/landing.tsx:865`
- `components/landing-shared.tsx:1290`

Both are `<path d="…">` strings that happen to contain the digit sequence.
Not prices.

---

## Open questions — not guessed, flagged for a decision

### ~~`subscribe.tsx` "save 33%"~~ — RESOLVED
Both figures are now tier-derived via `displayAnnualAsMonthly()` and a new
`displaySavingsPct()`. Flag off → "≈ $3.33/mo — save 33%"; flag on →
"≈ $7.50/mo — save 25%".

### ~~Analytics values on LEGACY~~ — RESOLVED
`planValueDollars()`, `monthlyPriceDollars()` and `annualPriceDollars()` now
resolve the active tier. Converted from consts to FUNCTIONS: a module-level
const is evaluated once at import and would capture the flag at whatever
moment the module first loaded.

### ~~`terms/page.tsx` grandfathering~~ — RESOLVED
Decision: grandfathering is PERMANENT. Terms now reads "Existing subscribers
keep their current rate." — plain, no date.
