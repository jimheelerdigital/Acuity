# Subscription paywall and trial benchmarks (web-to-app, Health & Fitness, Productivity, Lifestyle)

Context: Acuity sells $9.99/mo or $89.99/yr with a card-required 7-day free trial through a web funnel fed by Meta ads. All figures below were pulled in Sept 2026. Several vendor pages were read through a summarizing fetch tool, so where a number matters for a decision, check the primary PDF/report page before quoting it externally. Vendor-blog "client test" numbers (Botsi, Superwall anecdotes) are weaker evidence than the large-sample reports (RevenueCat, Adapty, FunnelFox).

## 1. Card-required (opt-out) vs cardless (opt-in) trials

### Takeaway
Most published opt-in vs opt-out numbers come from B2B/B2C SaaS, not mobile apps. There, card-required trials convert about 45-50% of trialists to paid, against roughly 15-25% for cardless trials. Cardless trials pull in around 3-4x more signups. Mobile store trials are all card-on-file by design (App Store/Play account), and their trial-to-paid medians of 35-42% sit close to the SaaS opt-out range, which is the best comparison for Acuity.

### Cited Findings
- Across 86 SaaS companies (Q1 2022 to Q3 2025): opt-in (no card) trials convert at 18.2%, opt-out (card required) at 48.8%, freemium at 2.6%. — [Adapty, trial conversion rates (citing First Page Sage data)](https://adapty.io/blog/trial-conversion-rates-for-in-app-subscriptions/)
- Other aggregators give opt-in 8-22% (median 14%) vs opt-out 35-55% (median 44%), and say opt-in trials attract 3-4x more signups. — [Shno.co free trial statistics 2026](https://www.shno.co/marketing-statistics/free-trial-conversion-statistics); [Pulseahead SaaS benchmarks](https://www.pulseahead.com/blog/trial-to-paid-conversion-benchmarks-in-saas)
- Mobile apps overall: 3-10% (median range) to up to 46% for top performers. Adapty does not define this denominator clearly; it may be install-to-paid. — [Adapty](https://adapty.io/blog/trial-conversion-rates-for-in-app-subscriptions/)
- Payments vendor Redux Payments says that across 200+ B2C Stripe Billing accounts, 86.6% of first-charge-after-trial attempts failed, against 21.7% of ordinary renewals. It blames burner and prepaid cards. This is a vendor's own internal data with no public method, and the 86.6% figure is implausibly high as a general rate. Treat it as a directional warning that the first post-trial charge is the weakest point of a web card trial, not as a benchmark. — [Redux Payments](https://www.reduxpayments.com/blog/trial-to-paid-conversion-rate)

### Inferences
- For a card-required web trial, a trial-to-paid rate in the 35-50% range is "normal." Below about 30% suggests a problem with first-charge payment failures, trial abuse, or low intent from the ad traffic.
- Web card trials have no App Store account behind them, so failed first charges (expired, prepaid, or burner cards) can pull down measured trial-to-paid in a way store trials don't show. Track "trial ended → charge attempted → charge succeeded" separately from "trial canceled."

### Gaps
- I found no public benchmark that compares opt-in and opt-out trials specifically for consumer mobile or web2app apps. All the head-to-head data is SaaS.
- I found no reliable published trial-start rate (paywall view → card-trial start) for web card-required trials.

## 2. Trial-to-paid by category, trial length, and web vs in-app

### Takeaway
In-app Health & Fitness trials convert at about 38% (median) to 51% or more (top quartile) in RevenueCat 2026. Adapty 2026 gives 35-42%. Trials of 5-9 days, which includes a 7-day trial, convert at about 37% median. Trials of 4 days or less convert at about 25.5%. Longer trials (17-32 days) convert at about 42-46%. No large dataset reports web-trial-to-paid separately from in-app.

### Cited Findings
- **RevenueCat State of Subscription Apps 2026** (115,000+ apps, $16B+ revenue):
  - Health & Fitness: download-to-trial median 6.9% (top quartile above 23%). Trial-to-paid median 37.7% (top quartile above 51.4%). D35 download-to-paid median 2.9% (top quartile above 6.2%). 82.1% of trial starts happen on Day 0. — [RevenueCat SOSA 2026](https://www.revenuecat.com/state-of-subscription-apps)
  - Trial-to-paid by length, all categories: 4 days or less = 25.5% median, 5-9 days = 37.4%, 17-32 days = 42.5%. 46.5% of apps now use trials under 4 days (up from 42.1% in 2025). — [RevenueCat SOSA 2026](https://www.revenuecat.com/state-of-subscription-apps); [RevenueCat 2026 summary blog](https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026)
  - Category trial-to-paid spread: Travel 43.5%, Health & Fitness 37.7%, down to Gaming 25.0% and Photo & Video 22.2%. — [RevenueCat SOSA 2026 (via search summary)](https://www.revenuecat.com/state-of-subscription-apps)
  - D35 download-to-paid by paywall type: hard paywall 10.7% median vs freemium 2.1%. D60 revenue per install: $3.09 vs $0.38. Year-1 retention was about the same (27% vs 28%). — [RevenueCat 2026 blog](https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026)
  - Price tier: download-to-paid median is 2.8% for high-priced apps, 2.0% for mid-priced, and 1.4% for low-priced. — [RevenueCat SOSA 2026](https://www.revenuecat.com/state-of-subscription-apps)
  - North America D35 download-to-paid median is 2.56%. — [RevenueCat SOSA 2026](https://www.revenuecat.com/state-of-subscription-apps)
  - Productivity: 77% of revenue comes from monthly plans. 71.9% of conversions happen on Day 0. — [RevenueCat SOSA 2026](https://www.revenuecat.com/state-of-subscription-apps)
  - Social & Lifestyle: download-to-trial median 5.4%. 43.6% of apps run no trial. — [RevenueCat SOSA 2026](https://www.revenuecat.com/state-of-subscription-apps)
- **RevenueCat SOSA 2025** (75,000+ apps, $10B+): Health & Fitness trial-to-paid median 39.9%. Trials of 17-32 days convert at 45.7%. P90 trial-start rate was 20.3% vs a median of 6.2%. — [RevenueCat SOSA 2025](https://www.revenuecat.com/state-of-subscription-apps-2025/)
- **Adapty State of In-App Subscriptions 2026** (16,000+ apps, $3B revenue):
  - Health & Fitness weekly plans with trial: install-to-trial 9.5%, trial-to-paid 42.2%, first renewal 67.7%. North America install-to-trial is 14.5%, against 7.6-10.2% in other regions. — [Adapty H&F benchmarks](https://adapty.io/blog/health-fitness-app-subscription-benchmarks/)
  - Health & Fitness leads all categories on trial-to-paid, at 35.0% globally. — [Adapty SOIS 2026 (via search summary)](https://adapty.io/state-of-in-app-subscriptions/)
  - Onboarding paywalls with trials: 1.78% install-to-paid. — [Adapty H&F benchmarks](https://adapty.io/blog/health-fitness-app-subscription-benchmarks/)
- Adapty's trial-length medians (source year unclear): 1-4 days = 30%, 5-9 days = 45%, 10-16 days = 44%, 17-32 days = 45.7%. — [Adapty](https://adapty.io/blog/trial-conversion-rates-for-in-app-subscriptions/)

### Inferences
- For Acuity's 7-day trial, the most comparable figure is RevenueCat's 5-9 day median of about 37% and Health & Fitness median of about 38%. Top quartile is about 51% or more. Acuity's closest category (mental health/self-care) usually sits under Health & Fitness.
- Three-day trials convert much worse (about 25%). Keeping 7 days is supported by the data.

### Gaps
- None of the large reports I accessed publishes trial-to-paid separately for web-checkout trials. RevenueCat reports only that web is 3.2% of revenue.
- I found no separate mental-health or journaling sub-category benchmark.
- 14-day-specific medians appear only in Adapty's 10-16 day bucket.

## 3. Paywall conversion: web funnels vs in-app

### Takeaway
In FunnelFox's 2026 data, a typical web2app funnel converts about 3% of sessions to a purchase. About 13% of sessions reach the paywall, which implies roughly 20-25% of paywall viewers buy. FunnelFox says web funnels convert about 2x in-app funnels. In-app onboarding paywalls convert about 9-12% of opens (Superwall 2026).

### Cited Findings
- **FunnelFox State of Web2App 2026** (Edition 01, Jan 2026, mainly 2025 data; sources are Meta Ad Library parsing, FunnelFox platform data, and third-party ad intelligence):
  - About 13% of sessions reach the paywall. Final session-to-purchase conversion is about 3.0% on web vs about 1.5% for app funnels.
  - More than 50% of users drop off after the first screen. The biggest loss is before the paywall (quiz/onboarding), not at checkout.
  - 82% of top-grossing apps used web2app funnels in 2025, up from about 46% in 2024.
  - [FunnelFox State of Web2App 2026](https://funnelfox.com/state-of-web2app-2026)
- **Superwall** (just over 40M onboarding paywall opens, Feb-May 2026, at least 50 opens per paywall): single-page paywalls convert 9.07% of opens and multi-page paywalls 12.41%, a 37% relative lift. Single-page is 76% of opens. — [Superwall blog](https://superwall.com/blog/new-postmulti-page-onboarding-paywalls-convert-37-better-than-single-page-heres-why)
- RevenueCat 2026: only 3.2% of subscription revenue comes from web globally (4.9% in North America). But 41% of top-tier (Tier 5) apps have web revenue, against 1.3% of hobby-tier apps. — [RevenueCat SOSA 2026](https://www.revenuecat.com/state-of-subscription-apps)

### Inferences
- A reasonable benchmark for Acuity's web funnel is: landing session → paywall about 13%, paywall → trial start about 20-25%, session → trial about 3%. These are my derivations from FunnelFox's two figures. FunnelFox's 3% mixes trial and no-trial purchases.
- FunnelFox's data says optimizing the quiz/onboarding usually pays off more than optimizing the paywall.

### Gaps
- FunnelFox does not publish paywall → purchase as its own metric. The 20-25% is derived.
- I found no top-quartile figures for web paywall conversion.

## 4. Paywall design: plans, defaults, discounts, timers

### Takeaway
The evidence on paywall design is mostly vendor case studies, not controlled research. The better-supported findings are: showing an annual plan next to monthly, adding a trial-reminder timeline (Blinkist +23%), showing price per day, and multi-page layouts. Timers and discounts show about 15-20% conversion lifts but can reduce ARPU and retention.

### Cited Findings
- Adding a 60%-discounted annual plan next to monthly raised proceeds per user by 80% and trial conversion by 22% (Superwall case example, single app). — [Superwall blog: 3 proven paywall experiments](https://superwall.com/blog/3-proven-paywall-and-pricing-experiments-to-boost-indie-app-revenue)
- Superwall also reports a case where a single-page paywall beat a multi-page one on yearly trial starts, and advises that multi-step paywalls often beat single-screen for cold traffic but can hurt warm traffic. — [Superwall A/B testing blog](https://superwall.com/blog/how-to-ab-test-a-paywall)
- Showing price per day as the main price lifted web2app paywall conversion by 25% on average in client tests (Botsi/web2wave, apps not named). — [Botsi](https://www.botsi.com/blog/web2app-paywall-conversion)
- Personalized coupons with timers lifted paywall conversion by 15% vs standard paywalls (Botsi client tests). — [Botsi](https://www.botsi.com/blog/web2app-paywall-conversion)
- Changing the CTA from "Subscribe" to "Continue" or "Get my plan" lifted conversion by up to 5% (Botsi client tests). — [Botsi](https://www.botsi.com/blog/web2app-paywall-conversion)
- A fitness app client replaced its free trial with a $6.99 intro week, and LTV rose 30% (single unnamed client). — [Botsi](https://www.botsi.com/blog/web2app-paywall-conversion)
- Running an offer vs no offer typically lifts subscriptions by about 20%, but discounted users churn faster, so ARPU falls (practitioner claim). — [RocketShip HQ](https://www.rocketshiphq.com/optimize-app-paywall-higher-conversion/)
- In Adapty's LTV experiment data, trial-structure changes won 59.6% of the time and localization 62.3%, against 34.6% for visual/copy-only changes. — [Adapty H&F benchmarks](https://adapty.io/blog/health-fitness-app-subscription-benchmarks/)

### Inferences
- An annual-plus-monthly paywall with the per-month equivalent of the annual shown is the best-supported default. At $89.99/yr, the annual works out to $7.50/mo, 25% off $9.99. Superwall's 80% case used a much deeper 60% discount.
- Timers and discounts can raise conversion. For an audience of women 40-50 and Acuity's "mirror, not coach" brand, the Blinkist-style transparency result (next section) fits better than urgency tactics.

### Gaps
- I found no large-sample, cross-app study of annual-preselected vs monthly-preselected defaults, or of decoy/three-tier anchoring.
- I found no rigorous countdown-timer study with a published sample size.

## 5. Price points: $9.99/mo, ~$90/yr, weekly plans

### Takeaway
$9.99/mo is exactly the median Health & Fitness monthly price. $89.99/yr is well above the category median annual price ($39.94 in RevenueCat, about $69 median annual on web in FunnelFox). Higher-priced apps convert downloads to paid at about 2x the rate of low-priced apps, and higher-priced annual plans in Health & Fitness produce about 4x the LTV.

### Cited Findings
- Health & Fitness medians, 2026: weekly $4.99, monthly $9.99, annual $39.94. Plan mix is 68% annual, 24% monthly, 4% weekly. — [RevenueCat SOSA 2026](https://www.revenuecat.com/state-of-subscription-apps)
- Web2app price medians: weekly about $7-9, monthly about $10-15, quarterly about $30-35, annual about $69. — [FunnelFox State of Web2App 2026](https://funnelfox.com/state-of-web2app-2026)
- Web2app revenue mix: monthly 48.8%, weekly 30.5%, annual 12.2%, quarterly 8.4%. By offer type: no-trial 56.8% of revenue, paid trial 28.9%, free trial 14.3%. FunnelFox says no-trial offers consistently outperform trial flows. — [FunnelFox State of Web2App 2026](https://funnelfox.com/state-of-web2app-2026)
- Web retention at month 12: weekly 3%, monthly 10%. Monthly-plan LTV overtakes annual by month 12. Blended web LTV median is about $67 at month 12. — [FunnelFox State of Web2App 2026](https://funnelfox.com/state-of-web2app-2026)
- In-app annual retention at year 1 was 44.1% median (2025), monthly 17.0%, weekly 3.4%. — [RevenueCat SOSA 2025](https://www.revenuecat.com/state-of-subscription-apps-2025/)
- By RevenueCat 2026's measure, about 72% of annual subscribers churn in year 1, and 35% of all annual cancellations happen in month 1. — [RevenueCat 2026 blog](https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026)
- Download-to-paid by price tier: high-priced 2.8%, mid-priced 2.0%, low-priced 1.4%. — [RevenueCat SOSA 2026](https://www.revenuecat.com/state-of-subscription-apps)
- Health & Fitness annual plans with trial: high-priced tier LTV $70, low-priced tier $17. Annual plans were 61% of H&F revenue in 2025, up from 51% in 2023. — [Adapty H&F benchmarks](https://adapty.io/blog/health-fitness-app-subscription-benchmarks/)
- **Conflict:** the fetch summary of RevenueCat's 2025 report gave a Health & Fitness annual median of about $67. That doesn't match the 2026 figure of $39.94 and may be a summarizer error. — [RevenueCat SOSA 2025](https://www.revenuecat.com/state-of-subscription-apps-2025/)

### Inferences
- Acuity's $89.99 annual price sits in the top pricing band for the category. The data doesn't show high prices hurting conversion (high-priced apps actually convert better), but annual take-rate and refunds on $89.99 annual plans are worth watching.
- Weekly plans are common in web2app but retain very poorly (3% at 12 months). They don't fit a reflective, habit-based product.

### Gaps
- I found no published price-elasticity test at exactly $9.99 vs $7.99 or $12.99, or $89.99 vs $59.99, for this category.

## 6. Web checkout: Apple Pay/Google Pay, payment-step drop-off, trial reminders

### Takeaway
Offering Apple Pay lifts eligible checkout conversion by about 22% (Stripe, 2025), and showing it early (Express Checkout) about doubles conversion compared with showing it only at the end. In web2app, Apple Pay is about 60% of transactions. Blinkist's trial-reminder timeline raised trial signups by 23% and cut complaints by 55%.

### Cited Findings
- Stripe (Apr 2025 holdback experiment; number of businesses not disclosed): offering Apple Pay raised conversion by 22.3% on average and revenue by 22.5% on eligible checkouts. Surfacing at least one relevant payment method beyond cards raised revenue by 12% and conversion by 7.4%. Showing Apple Pay via the Express Checkout Element (early in the flow) gave about 2x conversion vs showing it at the end. — [Stripe blog](https://stripe.com/blog/testing-the-conversion-impact-of-50-plus-global-payment-methods)
- Web2app payment mix: Apple Pay about 60%, cards about 20%, PayPal about 18%, Google Pay about 2%. FunnelFox also says 30-50% of initiated payments fail (authentication friction, declines, issuer restrictions), and retry logic recovers up to 17.5% of failed subscriptions. — [FunnelFox State of Web2App 2026](https://funnelfox.com/state-of-web2app-2026)
- **Blinkist (2021):** the redesigned 7-day trial paywall showed a timeline (today → reminder 2 days before the trial ends → charge date), a visible exit, and no asterisk fine print. Results: trial signups +23%, customer complaints -55%, push-notification opt-in from 6% to 74%, and fewer cancellations during the trial. — [Growth.Design case study](https://growth.design/case-studies/trial-paywall-challenge); [Steve P. Young on X](https://x.com/stevepyoung/status/1912657315116863708)

### Inferences
- For Acuity's audience, an Apple Pay/Google Pay express button placed above the card form, plus a Blinkist-style "we'll remind you 2 days before" timeline, is the design choice with the best evidence behind it.
- Promising a reminder means the reminder must actually be sent. The repo's recent commit about the Stripe trial-reminder webhook suggests this is in place; verify it.

### Gaps
- I found no benchmark for the share of users who reach the payment step and then abandon on a web2app trial checkout.
- The Blinkist test is from 2021, one app, in-app. I found no web-specific replication.

## 7. Refunds, chargebacks, and cancellations for card trials

### Takeaway
In-app Health & Fitness refund rates run about 4.7%, and hard paywalls about 5.8% (RevenueCat 2025). On web, most refunds come within about 1.6 days (median), 92% within the first month, and annual plans refund about 18x more than weekly. Trial cancellations are front-loaded: 55% of 3-day-trial cancellations happen on Day 0. Card networks start penalizing chargeback rates at roughly 0.75-2.2%.

### Cited Findings
- Refund rate (share of paid subscriptions refunded in the first period): Health & Fitness 4.71%, Education 4.86%, Travel 1.51%. Hard paywall 5.8% vs freemium 3.4% (RevenueCat 2025, App Store/Play). — [RevenueCat SOSA 2025](https://www.revenuecat.com/state-of-subscription-apps-2025/)
- Web2app refunds: median timing about 1.6 days, most within 7 days, 92% within the first month. Annual plans refund 18x more than weekly. APAC refunds 3x more than LATAM. — [FunnelFox State of Web2App 2026](https://funnelfox.com/state-of-web2app-2026)
- Trial cancellations: 55.4% of 3-day-trial cancellations happen on Day 0 (up from 51% in 2025), and 84% by Day 1. — [RevenueCat 2026 blog](https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026)
- Billing errors cause 31% of Google Play cancellations and 14% of App Store cancellations. — [RevenueCat 2026 blog](https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026)
- Stripe has no chargeback limit of its own. It follows the Visa/Mastercard monitoring thresholds (roughly 0.75% to 2.2%) and charges $15 per US dispute. — [Chargeback.io](https://www.chargeback.io/blog/stripe-chargeback-rate)
- The Blinkist transparent-trial redesign cut complaints by 55%. — [Growth.Design](https://growth.design/case-studies/trial-paywall-challenge)

### Inferences
- Expect about 5% refunds on the first charge, and more on $89.99 annual first charges. Keep disputes under about 0.75% by sending a clear reminder email before the charge and using a recognizable card-statement descriptor.
- Most cancellations will come on Day 0-1 of the trial. That points to trial-start intent and first-session activation as the levers, rather than the end of the trial.

### Gaps
- I found no published chargeback rate specifically for web2app card-required free trials.
- I found no 7-day-trial-specific cancellation-timing distribution; RevenueCat published the 3-day figure.
