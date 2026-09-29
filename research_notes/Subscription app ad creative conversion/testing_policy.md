# Meta Creative Testing, Account Structure, Optimization Events and Ad Policy for a ~$100/day Subscription App (2025-2026)

Context: Ripple/Acuity, a voice journal / habit tracker / "AI life optimizer" app, web2app funnel, ~$100/day (~$3K/month, "Micro" tier in every benchmark below). Research done 2026-09-29. Evidence quality varies widely. Most "rules" in this space come from practitioners and vendor blogs, not controlled data. Each item is labelled **[DATA]** (benchmark or first-party numbers), **[META]** (Meta's own docs/engineering), or **[OPINION]** (practitioner or vendor heuristic).

---

## 1. At ~$100/day, how many creatives per week and per ad set, what budget per test, and how much spend before judging?

### Takeaway
Benchmarks put accounts under $10K/month at about 3 new creatives a week (median), and the top quartile at about 5. At $100/day the binding constraint is conversion volume, not how many creatives can be made: Meta needs about 50 optimization events per ad set per week to exit learning, and a $100/day account can't give many ads a fair read. So the realistic plan is roughly 3-6 genuinely new ads a week, each needing about 2-3x target CPA in spend before a CPA judgment, with leading indicators used for early kills.

### Cited Findings
- **[DATA]** Motion Creative Benchmarks 2026, new creatives launched per week per account: Micro (<$10K/mo) 2.80 avg / 4.83 top 25%; Small ($10-50K) 4.10 / 8.09; Medium ($50-200K) 6.67 / 15.95; Large 11.24 / 31.11; Enterprise 18.85 / 54.64. In every tier the top quartile ships about 2-3x more than same-budget peers. — [Motion talk: How many creatives do you need](https://motionapp.com/library/talk/meta-ads-in-2026-how-many-creatives-do-you-actually-need-to-launch/)
- **[DATA]** Health & Wellness vertical medians (creatives/week): Micro 3, Small 4, Medium 11, Large 19, Enterprise 46. Values are medians per account per vertical-tier cell; cells with <50 accounts are suppressed. — [Motion benchmarks by vertical](https://motionapp.com/library/research/creative-benchmarks-2026/testing-by-vertical)
- **[DATA]** Motion: about 5-8% of ads become winners, so 20 ads gives about 1-1.6 winners and 50 ads about 2.5-4. Brands launching more creatives on the same budget got "twice the number of winners". — [Motion](https://motionapp.com/library/talk/meta-ads-in-2026-how-many-creatives-do-you-actually-need-to-launch/)
- **[META, via secondary]** The learning phase needs about 50 optimization events within 7 days per ad set. "Learning Limited" is usually caused by a budget too low for the target CPA, too many ad sets splitting conversions, or an event that is too rare. — [adlibrary explainer citing Meta Help Center](https://adlibrary.com/posts/meta-ads-learning-phase-50-events-guide); [Cometly](https://www.cometly.com/post/facebook-ads-learning-phase-stuck)
- **[OPINION]** Marcus Burke (Meta app-growth consultant) suggests spending 20-30% of budget on creative testing. — [FunnelFox / Burke](https://blog.funnelfox.com/creative-testing-for-web2app/) (summary via search)
- **[OPINION]** Other frameworks put 10-20% of budget into controlled tests, run for 7-14 days to cover the learning phase and day-of-week swings. — [admanage.ai](https://admanage.ai/blog/facebook-ad-creative-testing-framework)
- **[OPINION]** Spend 2-3x target CPA per creative before a kill/keep call on CPA. At $20-100K/month, test 4-6 new concepts weekly. — [admanage.ai creative testing budget](https://admanage.ai/blog/creative-testing-budget-guide)
- **[OPINION]** Burke's staging for apps: at $0-20K/month, focus on tracking accuracy first (check Meta attribution against in-app "how did you hear about us" surveys). At $20-100K/month, do "big swing testing" with wildly different formats and avoid small A/B tests. — [RevenueCat: Meta Ads in 2025, Marcus Burke](https://www.revenuecat.com/blog/growth/meta-ads-in-2025-tips-for-apps)
- **[OPINION]** Jon Loomer: pumping out 20, 30 or 50 ads at once is wasteful because Meta concentrates budget on a small handful. The goal is diversity, not volume. — [Jon Loomer on creative diversification](https://www.jonloomer.com/andromeda-3/) (page returned 403; claim taken from the search summary)

### Inferences
- At $100/day with a plausible trial/purchase CPA of $20-60, the account produces about 12-35 bottom-funnel events a week in total, below the 50/week threshold for even one ad set. So one consolidated campaign with one (maybe two) ad sets makes sense, not a separate testing campaign that splits conversions.
- 2-3x CPA per creative (about $40-180) means 3-6 creatives a week can get a CPA read. That matches the Micro/Health & Wellness benchmark medians (about 3/week) and the top quartile (about 5/week). Launching 20+ a week at this budget means most ads never get spend (Loomer's point).
- With a 5-8% hit rate, 3-5 new ads a week gives about 1 winner a month. That is a realistic expectation.

### Gaps
- No source gave a published minimum-impressions threshold specific to subscription apps at Micro budgets. The 1-2K impression attention checks below come from generic DTC frameworks.
- Motion's benchmarks are for all Meta advertisers in its customer base, not app/web2app specifically. Health & Wellness is mostly DTC ecommerce.

---

## 2. Concept testing vs iterations: recommended ratios

### Takeaway
The consensus since Andromeda is to lead with genuinely different concepts (angle x format x persona), then iterate only on proven winners. No rigorous source gives a fixed ratio. Practitioner rules of thumb put most new-ad slots into new concepts plus 2-3 variants per concept, and Burke says small iterations are premature until you have scale.

### Cited Findings
- **[OPINION]** "Build 8-12 conceptually distinct ad concepts per campaign (different hooks, formats, emotional triggers, visual treatments)", then 2-3 variations per concept. — [Pipeboard / segwise search summary](https://pipeboard.co/guides/creative-volume-andromeda) (vendor rule of thumb; aimed at larger budgets)
- **[OPINION]** Burke: once scaling is dialed in, "it's a matter of creative": do big-swing tests on formats, styles and messaging types and avoid "getting stuck with small iterations". Recommended app formats: text-wall ads, infographics ("especially for habit-tracking apps"), AI-generated faceless content, native article-style ads for Facebook Feed. Also a move away from talking-head UGC. — [RevenueCat / Burke](https://www.revenuecat.com/blog/growth/meta-ads-in-2025-tips-for-apps)
- **[OPINION]** Burke (web2app): test ad narrative x funnel narrative x offer. Even 2 angles x 2 funnels x 2 paywalls is a meaningful surface, because the funnel extends the ad. — [FunnelFox](https://blog.funnelfox.com/creative-testing-for-web2app/)
- **[DATA]** Motion hit rate by format: text-only 11.60%, product image + text 8.75%, UGC 7.56%, high production 6.87%, animation 4.57%. Cheaper formats hit more often. — [Motion](https://motionapp.com/library/talk/meta-ads-in-2026-how-many-creatives-do-you-actually-need-to-launch/)
- **[OPINION]** Loomer builds diversity in phases (a "creative diversity stack"). Each phase has a theme, the combined phases create diversity, and results steer the next phase. — [Jon Loomer](https://www.jonloomer.com/andromeda-3/) (search summary)

### Inferences
- At $100/day a sensible split is about 70-80% new concepts / 20-30% iterations of proven winners (for example new hooks on a winning body). This is an inference from the sources above, not a sourced ratio.
- Text-heavy statics and infographics have the best benchmark hit rates, are cheap to generate, and are what Burke recommends for habit apps. They fit Ripple's automated pipeline well.

### Gaps
- No controlled study found that gives an optimal concept:iteration ratio. Figures like 70/30 or 80/20 circulate but I could not source them to data.

---

## 3. Andromeda and "creative diversity as targeting": are minor variants grouped?

### Takeaway
Andromeda is real and Meta-documented: it is the retrieval stage that narrows tens of millions of ads to a few thousand candidates. The claim that near-duplicate ads get grouped under one "Entity ID" and compete with each other is widely repeated by practitioners but comes from Meta partner commentary, not published Meta docs. The practical advice is consistent across sources: variants that look alike add little reach, and different angles, formats and personas do.

### Cited Findings
- **[META]** Andromeda is Meta's personalized ads retrieval engine. It narrows "tens of millions of ads to the few thousand" considered per impression, allowed a 10,000x increase in retrieval model complexity, and reports +6% recall and +8% ad quality (on selected segments). Built on NVIDIA Grace Hopper and MTIA. — [Meta Engineering, Dec 2024](https://engineering.fb.com/2024/12/02/production-engineering/meta-andromeda-advantage-automation-next-gen-personalized-ads-retrieval-engine/)
- **[META]** GEM (Generative Ads Model) is the ranking-side "central brain". Meta reported a 3.5% lift in Facebook ad clicks and >1% gain in Instagram conversions in Q4 2025. Incremental attribution showed "24% increase in incremental conversions" vs standard attribution. — [Meta Newsroom, Jan 2026](https://about.fb.com/news/2026/01/2026-ai-drives-performance/); [Meta Engineering GEM](https://engineering.fb.com/2025/11/10/ml-applications/metas-generative-ads-model-gem-the-central-brain-accelerating-ads-recommendation-ai-innovation/)
- **[OPINION]** "Similar ads and similar creatives get clustered together and assigned a single Entity ID … ten variations of the same product shot with minor tweaks … Andromeda treats them as a single creative entity." — [adsuploader](https://adsuploader.com/blog/meta-andromeda); [Confect](https://confect.io/tactics/meta-andromeda-2026)
- **[UNVERIFIED]** One vendor says Meta shows a "Creative Similarity Score" in Ads Manager, with scores above 60% causing retrieval suppression. I found no Meta primary source for this number. Treat it as unconfirmed. — [search summary of Andromeda guides](https://www.tryatria.com/blog/andromeda-meta-ads)
- **[OPINION]** Loomer: "Andromeda is just retrieval". More ads won't work, genuinely diverse ones will: formats, concepts, personas, pain points. — [Jon Loomer](https://www.jonloomer.com/meta-andromeda/)

### Inferences
- For a pipeline that generates weekly ads (Ripple's AdLab), the unit that matters is distinct concepts. Five reskins of one idea are close to a single ad, both for delivery and for learning. This supports the "each weekly ad gets its own visual style" direction in recent commits, as long as the angle/persona also differs, not only the look.

### Gaps
- Meta has not published how Entity ID grouping works or what counts as "similar". Everything past the engineering blog is inference by practitioners.

---

## 4. Flexible ads / Advantage+ creative / dynamic creative: good or bad for apps?

### Takeaway
Flexible ads (the successor to Dynamic Creative) let Meta mix up to about 10 assets into formats per placement, and are available for Sales and App Promotion objectives. Individual Advantage+ creative enhancements are on by default and can be switched off one by one. The evidence is mostly opinion. The main risks for a sensitive-category app are loss of control over text and imagery (auto-generated copy could create a personal-attributes violation) and muddier creative-level reads.

### Cited Findings
- **[OPINION/vendor]** The flexible ad format is only available for App Promotion and Sales objectives. It creates single image/video and carousel versions automatically. — [search summary; Madgicx](https://madgicx.com/blog/flexible-ads-are-replacing-dynamic-creatives); [Metricool](https://metricool.com/flexible-ads-meta/)
- **[OPINION/vendor]** Many Advantage+ creative enhancements are on by default. You have to turn them off actively, and should review previews. — [AdNabu](https://blog.adnabu.com/facebook-ads/advantage-plus-creative/)
- **[META, marketing claim]** Businesses using Meta's image generation tools see "+7% increase in conversions". — reported via [search summary of Meta Advantage+ creative page](https://www.facebook.com/business/ads/meta-advantage-plus/creative) (Meta marketing; methodology not public)
- **[OPINION]** Burke: separate ad sets by creative type (statics vs video) to control delivery, because statics lean to Facebook Feed and video to Reels. Placement matters a lot for app quality: Facebook Feed gives "higher-quality trials", while Instagram Reels is "younger, lower-intent, lower trial-to-paid". — [RevenueCat / Burke](https://www.revenuecat.com/blog/growth/meta-ads-in-2025-tips-for-apps)

### Inferences
- For Ripple, turn off text-generation and "enhance CTA" style enhancements. AI rewrites of copy could produce "Struggling with anxiety?"-type lines that break personal-attributes rules, and they break the brand voice rules. Visual touch-ups (brightness, aspect ratio) are lower risk.
- Flexible ads suit grouping 3-5 assets of the same concept. They are a poor tool for learning which concept wins, because reporting sits at the ad level.

### Gaps
- No controlled, app-specific comparison of flexible vs single-asset ads after Andromeda was found. Jon Loomer's flexible-format article returned 403.

---

## 5. Kill/scale rules practitioners use

### Takeaway
The common heuristic is "kill early on attention, late on CPA". Cut ads with weak hook rate or CTR after about 1-2K impressions. Make a CPA call only after about 2-3x target CPA in spend. Scale gradually once CPA is stable. All of these are practitioner heuristics, not validated thresholds.

### Cited Findings
- **[OPINION]** Kill on attention after about 1,000-2,000 impressions if CTR is under 0.5% or hook rate is under 20%. Kill/keep on CPA after 2-3x target CPA spent. Automated rule: pause after 2x target CPA with zero conversions. Set the rules before launch. — [admanage.ai](https://admanage.ai/blog/creative-testing-budget-guide); [search summary incl. succession.media](https://succession.media/guides/meta-creative-fatigue-how-many-creatives-to-test/)
- **[OPINION]** Hybrid structure: test ad sets at 5-10% of budget optimizing for trial starts, core ad sets at 80-90%. Promote a creative when CPA is within 20% of target (their threshold of "after 500+ impressions" is very thin). — [RocketShip HQ](https://www.rocketshiphq.com/meta-optimize-trial-starts-vs-paid-conversions-ios/)
- **[OPINION]** Burke: judge by trial-to-paid by placement and demographic, not only cost per trial. Compare Meta-attributed trials against in-app survey attribution. — [RevenueCat / Burke](https://www.revenuecat.com/blog/growth/meta-ads-in-2025-tips-for-apps)
- **[DATA, statistical]** FunnelFox: detecting a 20% effect at a 1% conversion rate needs about 40,000 users per variant. So low-traffic funnels can't run meaningful A/B splits. — [FunnelFox](https://blog.funnelfox.com/creative-testing-for-web2app/)

### Inferences
- At $100/day, CPA-based kills per ad are statistically weak (a handful of conversions each). Use leading indicators (hook rate, CTR, cost per landing-page view, cost per quiz start) to cut early, and keep CPA calls for the few ads that earn spend.
- Meta's own spend allocation is a signal too: in a consolidated ad set, ads that Meta starves after a week are usually treated as losers by practitioners (consistent with Loomer's "Meta concentrates budget on a handful").

### Gaps
- No source validated the 20% hook-rate or 0.5% CTR cutoffs for app or wellness verticals. They are generic heuristics.

---

## 6. Optimization event at low volume for web2app: CompleteRegistration vs StartTrial vs Purchase

### Takeaway
Practitioners broadly say to optimize for the deepest event that still gets close to 50/week per ad set. At under $1K/day that usually means trial start (or a mid-funnel event like registration or checkout) rather than paid conversion. There is a critical extra risk for Ripple: since January 2025 Meta's Health & Wellness data restrictions can block optimizing for lower-funnel events (Purchase, etc.) for advertisers it classifies as health-related. Ripple needs to confirm how its domain/pixel is classified.

### Cited Findings
- **[OPINION]** Burke: primary event should be Start Trial, not Purchase. You want the conversion within about 24h so the algorithm gets fast signal (note: that point is in the SKAN/AEM app-campaign context). — [RevenueCat / Burke](https://www.revenuecat.com/blog/growth/meta-ads-in-2025-tips-for-apps)
- **[OPINION]** Burke suggests web2app mainly around $100K+/month, for reaching older, higher-value users through Sales campaigns. Blinkist: web campaigns served 80% of impressions on Facebook Feed to older audiences with better conversion. Burke recommends separate ad accounts for App Promotion and Web campaigns. — [RevenueCat / Burke](https://www.revenuecat.com/blog/growth/meta-ads-in-2025-tips-for-apps)
- **[OPINION]** Spend-based rule: under $1,000/day, optimize for trial starts. $1-5K/day, test both. Above $5K/day, use paid conversion if trial-to-paid is over 40%. Apps under 30% trial-to-paid "almost always" do better optimizing for trials. — [RocketShip HQ](https://www.rocketshiphq.com/meta-optimize-trial-starts-vs-paid-conversions-ios/)
- **[DATA, but secondary and unverified]** The same article attributes trial-to-paid by category to RevenueCat's 2025 report (Health & Fitness 60-70%, Productivity 45-55%; median about 52%) and says paid social trials convert 15-25% worse than organic (citing AppsFlyer 2024). I did not verify these against the primary reports. Treat with caution. — [RocketShip HQ](https://www.rocketshiphq.com/meta-optimize-trial-starts-vs-paid-conversions-ios/)
- **[DATA]** FunnelFox State of Web2App: no-trial (direct-charge) offers made 56.8% of web subscription revenue vs 14.3% from free trials. Many funnels now open with 50-70% first-period discounts instead of trials. 82% of top-grossing apps used web2app in 2025. — [FunnelFox State of Web2App 2026 (search summary)](https://funnelfox.com/state-of-web2app/)
- **[OPINION]** FunnelFox: use ARPU as the primary funnel metric. A conversion lift that lowers plan value "may not be a genuine gain". — [FunnelFox](https://blog.funnelfox.com/creative-testing-for-web2app/)
- **[META policy, via multiple secondaries]** From January 2025 (all advertisers by 14 Feb 2025), Meta restricts advertisers it classifies as Health & Wellness. Mid tier: cannot optimize for Purchase/AddToCart and other mid/lower-funnel standard events (PageView, ViewContent, landing page view still allowed). Full tier: no conversion tracking/optimization. Custom events are blocked until the advertiser reviews them. Meta proactively scans for custom conversions/audiences that reference health attributes. — [Jon Loomer (403; search summary)](https://www.jonloomer.com/qvt/health-and-wellness-restrictions/); [Triple Whale](https://www.triplewhale.com/blog/meta-health-and-wellness-brands); [Polar Analytics](https://www.polaranalytics.com/post/2025-metas-tracking-restrictions-for-health-wellness-are-here----heres-how-to-fix-it)

### Inferences
- At $100/day, even StartTrial (if trial CPA is about $20-40) gives about 17-35/week in one ad set, which is Learning Limited. The deepest event that gets near 50/week is probably registration/quiz completion or checkout initiation. Optimizing for that trades lead quality for learning. Common practice is to accept Learning Limited on StartTrial/Purchase rather than optimize a shallow event that attracts non-payers. The choice should be checked against Ripple's actual event counts and trial-to-paid by event.
- Because Ripple's funnel copy mentions mood, stress and mental load, Meta could classify the domain as health/wellness-adjacent. Check Events Manager for any "restricted" flags on the pixel/domain before choosing an event. If restricted, optimize on an unrestricted custom event named neutrally (for example `start_trial`, not `anxiety_plan_selected`).

### Gaps
- I could not confirm from a Meta primary page exactly which app categories (journaling, mental wellness, habit tracking) Meta counts as "Health & Wellness" for data restrictions. Loomer's page was blocked (403).
- No first-party data found on registration-optimized vs trial-optimized CPA/LTV for web2app at Micro budgets.

---

## 7. How AI-generated creative volume affects results

### Takeaway
Meta's own claims are positive but modest and not independently checked (for example +7% conversions with image generation). Motion's data says volume raises the number of winners, and Loomer warns that undifferentiated volume at small budgets is wasted. Net: AI helps most by making concept diversity cheap, not by flooding ad sets.

### Cited Findings
- **[META, marketing]** Over 4M advertisers use at least one AI creative tool monthly, producing 15M+ AI-enhanced ads/month. Image-generation users see +7% conversions. Video generation tools reached a $10B revenue run-rate in Q4 2025. — [Meta Newsroom Jan 2026](https://about.fb.com/news/2026/01/2026-ai-drives-performance/); search summary of [House of Marketers](https://houseofmarketers.com/meta-shares-tips-on-best-performing-ad-approaches-ai/)
- **[DATA, low confidence]** Claims that AI creatives beat human-made ones on CTR by 11-12% come from vendor/aggregator blogs with unclear methods. — [digitalapplied](https://www.digitalapplied.com/blog/ai-ad-creative-benchmark-2026-ctr-roas-data)
- **[DATA]** Web2app ad volume rose +254% on average in 2025, with creatives per brand in the thousands among top performers. — [FunnelFox](https://blog.funnelfox.com/creative-testing-for-web2app/)
- **[OPINION]** Burke lists AI-generated faceless content (Midjourney/Flux statics, Runway/Kling animation, Veo) as a growing app format. — [RevenueCat / Burke](https://www.revenuecat.com/blog/growth/meta-ads-in-2025-tips-for-apps)
- **[OPINION]** Loomer: 20-50 ads at once is wasteful, and Meta concentrates spend. — [Jon Loomer](https://www.jonloomer.com/andromeda-3/)

### Inferences
- The +254% and "thousands" figures come from accounts with much larger budgets. At $3K/month, generation capacity outstrips what the budget can test, so the constraint is choosing which concepts to test, not making them.

### Gaps
- No independent, controlled study comparing AI-generated vs human-made creative for subscription apps was found.

---

## 8. Meta ad policies relevant to a voice journal / habit tracker / AI life-optimizer app

### Takeaway
The biggest policy risk is **Personal Attributes**: copy can't assert or imply the viewer has a mental or physical health condition, and that includes questions like "Struggling with anxiety?". Next come the Health & Wellness standards (no negative self-perception, no sensational or guaranteed outcomes, special rules for weight/cosmetic) and the data restrictions that may limit optimization. Safe copy describes the product and what it helps with, in the third person or first person.

### Cited Findings
- **[META]** Personal Attributes policy: ads must not assert or imply "race, ethnicity, religion, beliefs, age, sexual orientation or practices, gender identity, disability, physical or mental health (including medical conditions), vulnerable financial status, voting status, membership in a trade union, criminal record, or name". They must not imply knowledge of medical information or request it. — [Meta Transparency Center: Privacy Violations & Personal Attributes](https://transparency.meta.com/policies/ad-standards/objectionable-content/privacy-violations-personal-attributes/)
- **[META]** Meta's own examples. Allowed: "Bulimia counseling available", "Depression counseling", "New diabetes treatment available". Prohibited: "Do you have diabetes?", "Depression getting you down? Get help now." — [Meta Transparency Center](https://transparency.meta.com/policies/ad-standards/objectionable-content/privacy-violations-personal-attributes/)
- **[OPINION, consistent with Meta text]** "You/your" is fine when it isn't tied to an attribute ("Get your free guide", "Find a therapist near you"). Questions still violate ("Struggling with depression?", "Is your vision getting worse?"). — [Stackmatix](https://www.stackmatix.com/blog/meta-ads-personal-attributes-policy); [Zappush](https://www.zappush.com/blog/meta-personal-attributes-policy-health-wellness-ads)
- **[META]** Health & Wellness standard (updated 26 Dec 2024, latest change 22 Jul 2026): weight loss/gain products, cosmetic procedures and supplements must target 18+. Bans "statements of inferiority about physical appearance", pinched-fat close-ups, and "clickbait tactics in a health, weight loss, or weight gain context, such as sensational language with exaggerated or extreme claims". No claims to "cure, heal or eliminate" incurable conditions. General fitness services are exempt from age restriction. — [Meta Transparency Center: Health and Wellness](https://transparency.meta.com/policies/ad-standards/restricted-goods-services/health-wellness/)
- **[OPINION, secondary]** 22 Jul 2026 update: moved from product-category rejection to claim-by-claim review. Before/after imagery is no longer auto-rejected when copy is compliant. Negative self-perception, sensational/guaranteed claims and pinched-fat imagery are still banned. — [Adligator](https://adligator.com/blog/meta-health-wellness-ad-policy-update-2026); [accelerateddigitalmedia](https://www.accelerateddigitalmedia.com/insights/guide-to-social-media-health-ad-restrictions-2026/)
- **[OPINION]** Promising specific outcomes within a set timeframe without qualifiers is treated as sensational. — [search summary incl. Meta sensational content page](https://transparency.meta.com/policies/ad-standards/objectionable-content/sensational-content)
- **[META via secondaries]** Health & Wellness data restrictions (Section 6) can limit optimization events, and Meta may disable custom conversions/audiences that reference health attributes. — [Triple Whale](https://www.triplewhale.com/blog/meta-health-and-wellness-brands)

### Safe vs risky phrasing for Ripple (inference, based on the Meta examples above)
| Risky (implies the viewer's condition) | Safer (describes product or a third-person/first-person story) |
|---|---|
| "Struggling with anxiety?" / "Are you burned out?" | "A voice journal that helps you notice patterns in your week." |
| "Your depression doesn't define you." | "Ripple turns a quick spoken debrief into tasks, mood trends and a weekly report." |
| "Tired of feeling overwhelmed, mom?" (implies mental state + attribute) | First-person testimonial style: "I didn't realize how much I was carrying until I saw it written down." |
| "Fix your mental health in 7 days." (outcome + timeframe + health claim) | "Built for people carrying a lot. Record any time, see what's really going on." |
| "Lose the weight you've been hiding" / before-after body shots | Avoid weight framing entirely. It triggers 18+ and self-perception review. |
| "Clinically proven to reduce stress" (unsubstantiated) | No clinical claims unless substantiated. Ripple positioning also says "never medical". |

- Age targeting: Personal Attributes forbids implying age ("women over 40 like you"). Target the age range in ad settings and keep age out of second-person copy.
- AI copy variants (Advantage+ text generation) can reintroduce second-person attribute questions. This is a reason to turn them off (Section 4).

### Gaps
- I couldn't confirm whether Meta treats mental-wellness/journaling apps under Health & Wellness data restrictions, or how strictly first-person testimonials that mention anxiety are reviewed in practice. Enforcement is known to be inconsistent, and no primary source covers it.
- Meta's sensational-content page URL now resolves to "Violent and Graphic Content". The exact current text on health clickbait comes from the Health & Wellness page quoted above.
