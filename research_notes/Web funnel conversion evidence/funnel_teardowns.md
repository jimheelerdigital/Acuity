# Screen-by-screen teardowns of top web-to-app subscription funnels (paid social → web quiz → paywall → app)

Research date: 2026-09-24. About 23 search and fetch calls. Every claim has a URL. "Observed" means a teardown author walked the live funnel and reported it. "Commentary" means the author's opinion or a generalisation. A lot of the material comes from vendor blogs (FunnelFox, RevenueCat, Superwall, Paddle), which sell web-funnel or paywall tooling. Their case studies describe customers they chose to feature, so read the performance numbers with that in mind.

Coverage by app, in short:
- **Well documented:** Noom (web), Cal AI (in-app plus paywall metrics), Calm (web, with conflicting variants), Flo (web), Liven (web), Finch (in-app).
- **Partly documented:** Headway, BetterMe, SIMPLE, Mimo, Mojo (the Mojo found is the video/social-content app, not a wellness app; see Gaps).
- **Not found / no reliable teardown:** Rise Science, YAZIO, Stoic, Reflectly, Rosebud, Day One, Mindsera, Lasting. No voice-journaling or self-reflection app with a documented web quiz funnel turned up.

Extra reference funnels that came up in the same sources: Babbel, Flirtist, Nebula, Lasta Fit, Fastic, Homemade Method, Runna, Blinkist, PlantIn, YNAB, Photoroom.

---

## Q1. How many steps or screens are there from landing to paywall, and what question types are used?

### Takeaway
In health and wellness web funnels, the paywall usually comes after 20 to 60 screens. Noom is the outlier at 80 to 113 screens. Calm and Flo each run about 40, and Liven runs 42 steps (26 questions). Authors describe single-select answers as the backbone of these quizzes, with multi-select, sliders, numeric entry and "I don't know / prefer not to say" options mixed in to prevent fatigue. Free-text questions almost never appear, apart from name entry.

### Cited Findings
**Noom (web, observed)**
- Up to 113 screens and 10–15 minutes. Screens 1–5 cover the goal (lose weight / maintain and get fit / haven't decided), units, sex assigned at birth (with a reason given: "hormones can affect how our bodies metabolize food"), gender identity and pregnancy. Then come age (banded: twenties, thirties, forties), height and weight, and health conditions (multi-select with conditional follow-ups). A progress indicator appears early. — [RevenueCat, Apr 2026](https://www.revenuecat.com/blog/growth/web-to-app-onboarding-funnel)
- Behavioral-profile block: "10 questions using slider format between opposing statements", "Question X of 10" progress, and background colour shifts as feedback. — [RevenueCat](https://www.revenuecat.com/blog/growth/web-to-app-onboarding-funnel)
- A long teaching section (screens ~46–75) covers the green/yellow/red food system, calorie density and a nutrition mini-quiz with non-judgmental feedback. — [RevenueCat](https://www.revenuecat.com/blog/growth/web-to-app-onboarding-funnel)
- Screen counts over time, as reported: 37 (2021) → 46 (2022) → 55 (2023) → 80+ (2024). This is an aggregated claim surfaced by search. Related sources: [Growthwaves "113-screen onboarding"](https://www.growthwaves.io/p/the-113-screen-onboarding-that-doesnt) and [StartupTalky "In 2020 Noom had 26 onboarding screens"](https://community.startuptalky.com/discussions/post/in-2020-noom-1b-arr-had-2-NcwCQAnECYMy2Az)
- "96+ screens", Aug 2024. — [Retention.blog, Jacob Rushfinn](https://www.retention.blog/p/the-longest-onboarding-ever)

**Calm (web)**
- About 40 screens. It opens with "gentle self-recognition and safety" and immediate social proof. Questions move from light to personal depth, with supportive statements in between. — [FunnelFox, Feb 2026](https://blog.funnelfox.com/web2app-funnel-patterns-2026-part-2/)
- First screen is a sleep-frequency question followed by reassurance. Later questions cover problem frequency, sleep issue type (falling asleep vs staying asleep), causes, content preferences, experience level and meditation timing. Sleep gets deep branching, and other goals get a standard flow ("personalize where intent is highest"). — [RevenueCat, Jan 2026](https://www.revenuecat.com/blog/growth/web-to-app-funnel-examples)

**Flo (web)**
- "Close to 40 screens": cycle basics → symptoms → sex/mood/sleep/weight/mental state, with "I don't know" and "Prefer not to answer" options throughout. — [FunnelFox, Feb 2026](https://blog.funnelfox.com/web2app-funnel-patterns-2026-part-2/)
- Commentary: dense screens and a long quiz are deliberate "because the category carries anxiety". — [FunnelFox part 2](https://blog.funnelfox.com/web2app-funnel-patterns-2026-part-2/). Older and flagged: [Medium/Bootcamp on Flo & Zoe quiz funnels](https://medium.com/design-bootcamp/how-flo-and-zoe-use-a-web-to-app-to-boost-their-conversion-6f424171b1b7)

**Liven (web, wellbeing and self-discovery; the closest category match to Acuity)**
- 42 steps, 26 questions. Called "the OG of the app-style onboarding funnel". Uses interactive animated sliders so users can express their feelings visually. — surfaced via search from [ScreensDesign Liven breakdown](https://screensdesign.com/showcase/liven-discover-yourself) and [Medium review "When well-being becomes a stressful funnel"](https://medium.com/@tsholok/liven-review-when-well-being-becomes-a-stressful-funnel-230eae1b0fb1). The Medium page returned 403 on fetch, so these details come from search snippets and were not verified in full.

**Headway (web)**
- About a three-minute quiz that "alternates between quick questions and motivational content". — search-surfaced from [Nibble blog, Headway cost 2026](https://nibble-app.com/blog/headway-cost) and [FunnelFox quizzes article](https://blog.funnelfox.com/web2app-quizzes-as-profit-engine/). Screen count not found.

**BetterMe (web)**
- BetterMe runs "dozens of onboarding funnels for the same product", each for a segment (men, women, older, beginners, weight loss, muscle gain), and extends quiz funnels into mental health, ADHD and relationships. — [FunnelFox, 311 funnels analysed, Jan 2025](https://blog.funnelfox.com/web-funnels-insights-and-trends/); [FunnelFox BetterMe 75k ads breakdown](https://funnelfox.com/top-web-funnels-breakdown)

**Cal AI (in-app, not web-first)**
- 32 screens. Opens with a product demo video. Includes deep personalisation, animated plan generation, a mid-flow rating ask, referral-code entry and a notification ask. — search snippet from [tasu.ai Cal AI teardown](https://tasu.ai/library/cal-ai) (the page returned 404 on fetch, so this is unverified)
- The onboarding was "initially simple and utility-focused" and was lengthened through A/B tests "by adding questions that increased user engagement without impacting functionality". — search snippet, [Sebastian Stef case study](https://sebastianstef.com/resources/cal-ai-case-study)

**Finch (in-app)**
- Flow: welcome → egg picker → phone verify → pronouns + name + trait → self-care primer + quiz → ABOUT YOU / ENERGY / HOW'S LIFE / SUPPORT AREAS survey → paywall → attribution → buddies/contacts → streak commitment → widget → Home. — [Revyl Atlas Finch flow](https://revyl.com/atlas/finch/flows/complete-onboarding/)
- By July 2025 Finch had added "a whole new series of questions asking information on you" before the paywall. — [Retention.blog "Life of a birb", Jan 2026](https://www.retention.blog/p/life-of-a-birb)

**Reference funnels in other categories (observed)**
- Babbel 20+ screens; Flirtist 15–20 (rotates "scales, yes/no, sliders" to prevent fatigue); Nebula ~30 (birth date, palm-scan photo); Lasta Fit 30+; Fastic ~60. — [FunnelFox, Jan 2026](https://blog.funnelfox.com/web2app-funnel-patterns-2026/)
- Runna 19 screens (asks about run days, long run, start date, terrain and pace, a "routine rehearsal"). — [FunnelFox part 2](https://blog.funnelfox.com/web2app-funnel-patterns-2026-part-2/)
- FunnelFox's cross-app view (commentary): "30-60 screens acceptable for health". — [FunnelFox part 2](https://blog.funnelfox.com/web2app-funnel-patterns-2026-part-2/)

### Inferences
- Funnels in categories people feel anxious about (health, periods, mental wellbeing) are the longest. For these, the funnel's job is to make the problem feel understood before the price appears. Acuity's audience and category (women ~40–50, mental load) fits the Calm, Flo and Liven pattern (~40 screens) better than the Cal AI utility pattern.
- Question formats rotate on purpose. The most "emotional" input is sliders between opposing statements (Noom's behavioural block, Liven's feelings sliders).

### Gaps
- No verified screen count for Headway, BetterMe (varies per funnel), SIMPLE, Rise Science or YAZIO.
- No funnel-length A/B result from any named app. Noom's growth from 26 to 113 screens suggests longer converted better for Noom, but no source publishes a controlled test.

---

## Q2. Where is email captured, and where is the account created (before or after payment)?

### Takeaway
On the web, email is almost always captured **before the paywall**, usually just before the "results" reveal and framed as "see my results". That way, people who leave at the paywall can still be retargeted. Account creation varies: some funnels require it before the trial (Calm), some put it after the quiz (Flo), and Noom's comes after payment. In-app funnels (Cal AI) ask users to sign in right before the paywall with a "Save your progress" framing.

### Cited Findings
- **Noom:** email is captured about one-third of the way through, right before the results display. The CTA is "See my results", not "Submit". The marketing opt-in is a separate step ("occasional research, advice, and special offers"). Payment, then account confirmation, then app download or login come in the final screens (106–113). — [RevenueCat](https://www.revenuecat.com/blog/growth/web-to-app-onboarding-funnel)
- **Calm:** "Account Creation: Required before trial." — [RevenueCat, Jan 2026](https://www.revenuecat.com/blog/growth/web-to-app-funnel-examples)
- **Flo:** "Account creation: Positioned after quiz completion." — [FunnelFox part 2](https://blog.funnelfox.com/web2app-funnel-patterns-2026-part-2/)
- **Homemade Method:** "email capture positioned after value clarity" (after the micro-result, before the paywall). — [FunnelFox part 2](https://blog.funnelfox.com/web2app-funnel-patterns-2026-part-2/)
- **Babbel:** email captured before the paywall, with email confirmation required. **Lasta Fit:** email captured before the paywall, with social proof on the same screen ("12 million users"). — [FunnelFox, Jan 2026](https://blog.funnelfox.com/web2app-funnel-patterns-2026/)
- **Runna:** account step offers a Strava connect ("borrowed trust"). — [FunnelFox part 2](https://blog.funnelfox.com/web2app-funnel-patterns-2026-part-2/)
- **Cal AI (in-app):** sequence is "Save your progress" sign-in (Apple / Google / email) → "Try Cal AI for free" → "We'll send a reminder before your trial ends". — [Lazyweb Cal AI onboarding-paywall](https://www.lazyweb.com/flow/cal-ai/onboarding-paywall)
- **Finch (in-app):** phone verification comes early (step 3), before any questions. — [Revyl Atlas](https://revyl.com/atlas/finch/flows/complete-onboarding/)
- Why email capture matters: email retargeting adds "5-10% to revenue (up to 20% for market leaders)". After a web purchase, "around 90-95%" of buyers make it into the app. — [FunnelFox, Jan 2025](https://blog.funnelfox.com/web-funnels-insights-and-trends/) (vendor figures, not audited)
- FunnelFox cross-app observation: "Email capture strategic placement: Positioned before paywall to enable re-engagement if conversion fails." — [FunnelFox, Jan 2026](https://blog.funnelfox.com/web2app-funnel-patterns-2026/)

### Inferences
- The common design is: email as the price of seeing results, then payment, then the account is created or linked in the app. That keeps the password or account step out of the path to payment, while still capturing the lead in time for abandonment emails.

### Gaps
- No controlled test found comparing email before vs after the paywall for any named app.
- Headway's and BetterMe's exact email positions were not verified in a fetched source.

---

## Q3. How are plan-generation or loading screens, personalised charts, name capture, and mirrored answers used?

### Takeaway
Every documented funnel has a "building your plan" loader, and many have several. Noom's loaders pause for extra questions mid-load. Projected-outcome charts (goal weight by a date, "before/after") are standard in weight and fitness funnels. Wellbeing funnels (Calm, Liven) replace the chart with a label for the user's "state". Name capture shows up in the in-app flows (Finch). Mirroring answers back as a profile summary or result preview right before the paywall is close to universal.

### Cited Findings
- **Noom loaders:** "Building your plan" loaders combine all collected data. Some are interrupted by extra context questions. Short loaders follow effortful sections, and longer loaders have questions embedded. The author's phrase: a "fake loader that actually does real work". "Millions of successful users" appears during plan building. — [RevenueCat](https://www.revenuecat.com/blog/growth/web-to-app-onboarding-funnel)
- **Noom charts:** a results graph shows the projected trajectory against yo-yo dieting. It also has an event-deadline question, a pace choice (fast / steady / balanced), a goal date with an event marker, and the repeated line "typically lose 0.5-1 kg per week". — [RevenueCat](https://www.revenuecat.com/blog/growth/web-to-app-onboarding-funnel)
- **Noom mirroring:** after the 10-slider behavioural quiz, the user sees a "personalized profile analysis with constructive framing". — [RevenueCat](https://www.revenuecat.com/blog/growth/web-to-app-onboarding-funnel)
- **Calm:** the intermediate result names the user's state (e.g. "freeze mode") and ties it to the nervous system. An authority cue asks whether a licensed healthcare professional recommended Calm. — [FunnelFox part 2](https://blog.funnelfox.com/web2app-funnel-patterns-2026-part-2/). Before the paywall, Calm "presents a concrete plan, so the subscription feels like finishing something already in progress". — search snippet from [FunnelFox onboarding optimisation](https://blog.funnelfox.com/onboarding-funnel-optimization/)
- **Liven:** a "commitment contract" where users sign with their finger to pledge to their wellbeing. — search snippet via [ScreensDesign](https://screensdesign.com/showcase/liven-discover-yourself) / [Medium review](https://medium.com/@tsholok/liven-review-when-well-being-becomes-a-stressful-funnel-230eae1b0fb1) (not fully verified)
- **Finch:** name capture is built into the pet. Users pick the bird's colour, watch a hatching animation, then choose its gender, name and personality trait, and the user's own name is asked after that. A loading screen and an auto-generated "Starter plan" come before payment. — [Retention.blog, Jan 2026](https://www.retention.blog/p/life-of-a-birb)
- **Cal AI:** animated plan generation plus a mid-flow App Store rating ask. — search snippet, [tasu.ai](https://tasu.ai/library/cal-ai) (unverified, 404 on fetch)
- **BetterMe paywall:** a custom avatar with body stats and fitness level, plus a personalised workout plan. — search snippet from [FunnelFox paywall examples](https://blog.funnelfox.com/effective-paywall-screen-designs-mobile-apps/)
- **Lasta Fit:** a profile summary (BMI, lifestyle, eating type, motivation). **Fastic:** a personalised nutrition report (BMR kcal/day, macro split) and a self-identification sequence ("My current weight often makes me feel less confident…"). **Nebula:** a result preview before the paywall. — [FunnelFox, Jan 2026](https://blog.funnelfox.com/web2app-funnel-patterns-2026/)
- **Homemade Method:** a specific micro-result (e.g. "jeans size down") comes before the full plan. — [FunnelFox part 2](https://blog.funnelfox.com/web2app-funnel-patterns-2026-part-2/)
- Commentary critiquing Noom: "after all of this, I still don't know what the app experience actually looks like". No product UI is shown before purchase. — [RevenueCat](https://www.revenuecat.com/blog/growth/web-to-app-onboarding-funnel)

### Inferences
- For a reflection or mirror product, the Calm and Liven approach (name the user's state, reflect their words back, show a small "result" before the price) is the closest analogue to a weight-projection chart. It also avoids outcome promises, which fits the "mirror, not a coach" positioning.
- RevenueCat's critique of Noom suggests one thing is often missing from these funnels: a real preview of the product. For a voice product, that could be a sample reflection.

### Gaps
- No published A/B result isolating the lift from loaders, charts or name capture for any named app.

---

## Q4. What type of social proof is used, and where is it placed?

### Takeaway
Social proof is spread through the quiz: user counts mid-flow, reviews between questions, and media or authority logos. It builds up again right before the paywall. On the paywall, trust blocks (reviews, FAQ, money-back guarantee) usually sit **below** the plans and CTA.

### Cited Findings
- **Noom:** "we've helped 3,627,436 people lose weight" (a counter dated Oct 2021 that was still live in 2026), testimonials paired with weight-loss pace stats, and "millions of successful users" during plan building. — [RevenueCat](https://www.revenuecat.com/blog/growth/web-to-app-onboarding-funnel)
- **Calm:** social proof right at the entry. — [FunnelFox part 2](https://blog.funnelfox.com/web2app-funnel-patterns-2026-part-2/). Also "generic user reviews; relies on brand trust". — [RevenueCat](https://www.revenuecat.com/blog/growth/web-to-app-funnel-examples)
- **Flo:** trust block placed after the plans and primary CTA. **Runna:** a short "trust corridor" of reviews and FAQs before payment. — [FunnelFox part 2](https://blog.funnelfox.com/web2app-funnel-patterns-2026-part-2/)
- **Babbel:** "25M subscriptions sold" mid-onboarding. **Flirtist:** "150,000 men…" mid-flow, with reviews between questions. **Nebula:** media logos, ratings, and a rarity claim ("Only 3% of users…"). **Lasta Fit:** 12M+ users, 4.8 rating. **Fastic:** "20M+ users, 4.8 rating" plus reviews before the paywall. — [FunnelFox, Jan 2026](https://blog.funnelfox.com/web2app-funnel-patterns-2026/)
- **Homemade Method:** Forbes and Stanford mentions and named experts. — [FunnelFox part 2](https://blog.funnelfox.com/web2app-funnel-patterns-2026-part-2/)
- **BetterMe paywall:** user photos, reviews and media logos. — search snippet from [FunnelFox paywall examples](https://blog.funnelfox.com/effective-paywall-screen-designs-mobile-apps/)
- **PlantIn:** "six key stats designed to build credibility" on the landing page. — [RevenueCat](https://www.revenuecat.com/blog/growth/web-to-app-funnel-examples)

### Inferences
- The usual placement: one proof point near the start (user count or brand), reviews in between questions during the middle of the quiz, and ratings plus a guarantee plus an FAQ under the paywall CTA.

### Gaps
- No test data found on where social proof should go, for any named app.

---

## Q5. How are paywalls designed (number of plans, trials, discounts, timers, default plan, anchoring)?

### Takeaway
There are two camps. (1) **Aggressive web-funnel paywalls** (Noom, Headway, Liven, BetterMe, Lasta, Fastic, Nebula): three plans with the middle or annual plan as default, per-day price anchoring, countdown timers with a "reserved discount", a steeper discount if the user dismisses, money-back guarantees and post-purchase upsells. (2) **Simple paywalls** (Calm in one variant, Cal AI, Runna): one plan or annual as default, a free trial with a reminder promise, and little urgency. Flo and Nebula use low-price, user-chosen or €1 trials.

### Cited Findings
**Noom**
- "Pay what you want" 14-day trial with three price options, framed as "it costs us X to offer this trial" and nudging users to "help others access Noom". The post-trial price stays the same. A stress-management course is offered as a bonus if the user signs up within 15 minutes. — [RevenueCat, Apr 2026](https://www.revenuecat.com/blog/growth/web-to-app-onboarding-funnel)
- "$100 per 2 months", a countdown timer and a free trial, as of Aug 2024. — [Retention.blog](https://www.retention.blog/p/the-longest-onboarding-ever)
- After purchase: "six different upsells and two upgrade options, which totals 25 screens after the initial purchase". — [FunnelFox, Jan 2025](https://blog.funnelfox.com/web-funnels-insights-and-trends/)

**Calm (conflicting observations, probably different funnel variants)**
- "Single 7-day trial → annual subscription, 'deliberately simple' with no multiple options." — [RevenueCat, Jan 2026](https://www.revenuecat.com/blog/growth/web-to-app-funnel-examples)
- A different teardown: plans lead the paywall, a **quarterly** plan is positioned as the reasonable middle option, Apple Pay is prioritised, and there is "restrained urgency with discount/timer". — [FunnelFox, Feb 2026](https://blog.funnelfox.com/web2app-funnel-patterns-2026-part-2/)

**Flo**
- Gift-box reveal: "14 days, instantly extended to 30". A price choice of €1 or €34.99. Plans come first, with a "remind me before trial ends" toggle. — [FunnelFox part 2](https://blog.funnelfox.com/web2app-funnel-patterns-2026-part-2/)

**Headway**
- A discounted rate with a countdown timer appears after the quiz. Decoy pricing is used. Dismissing the paywall triggers a steep discount offer aimed at price-sensitive users. — search snippets from [FunnelFox quizzes](https://blog.funnelfox.com/web2app-quizzes-as-profit-engine/) / [Nibble](https://nibble-app.com/blog/headway-cost). A full walkthrough exists in the [Paddle "Fix That Funnel" Headway episode with Jacob Rushfinn](https://www.paddle.com/studios/shows/fix-that-funnel/jacob-returns), but the fetch returned no transcript.
- List prices: $12.99/mo, $29.99/3 months, $89.99/yr. A 7-day free trial is advertised, but 2026 user reports say it is "no longer consistently available across all markets". — [Nibble blog 2026](https://nibble-app.com/blog/headway-cost); [Headway pricing page](https://makeheadway.com/blog/how-much-does-the-headway-app-cost/)

**Liven**
- Three plans: Weekly, Yearly, Lifetime. A discount timer at the end of the quiz. A post-purchase upsell of psychology workbooks, and a better discount pop-up if the user dismisses it. — search snippets via [Medium review](https://medium.com/@tsholok/liven-review-when-well-being-becomes-a-stressful-funnel-230eae1b0fb1) / [ScreensDesign](https://screensdesign.com/showcase/liven-discover-yourself). The review's title frames the funnel as stressful, which points to a possible brand cost.

**BetterMe**
- The paywall includes a countdown timer, alongside the avatar, plan, photos, reviews and media logos. — [FunnelFox paywall examples](https://blog.funnelfox.com/effective-paywall-screen-designs-mobile-apps/) (search snippet)

**Cal AI (in-app)**
- CTA reads "Try for $0.00". Annual price $29/yr, shown as $2.49/mo. — search snippets, [tasu.ai](https://tasu.ai/library/cal-ai) / [Superwall](https://superwall.com/case-studies/cal-ai)
- Tested spin-wheel discount unlocks, video paywalls, and weekly, monthly, quarterly, annual and lifetime cadences. Also runs web checkout through Stripe alongside the App Store. — [Superwall case study](https://superwall.com/case-studies/cal-ai)
- Flow ends with "We'll send a reminder before your trial ends". — [Lazyweb](https://www.lazyweb.com/flow/cal-ai/onboarding-paywall)

**Finch (in-app)**
- Multi-screen paywall: "You take the same message you had on the paywall and break it up into bite-sized digestible chunks". In 2024 it was $39.99/yr with a "43% discount" for trial subscribers. — [Retention.blog, Jan 2026](https://www.retention.blog/p/life-of-a-birb)

**Reference funnels**
- Lasta Fit: three options with 28 days marked "most popular", a countdown timer with a reserved discount, and a money-back guarantee. Fastic: "$0.22–$0.86 per day" anchoring, a countdown timer, Apple Pay / PayPal / card, and a money-back guarantee. Nebula: user-selected trial price (€1 / €5 / €9 / €13.67), a hidden €1 exit offer, and an FAQ on the paywall. Babbel: Annual (discount highlighted) plus Lifetime, and a 20-day money-back guarantee. — [FunnelFox, Jan 2026](https://blog.funnelfox.com/web2app-funnel-patterns-2026/)
- Homemade Method: three tiers with the mid tier as default. Runna: annual as default with savings shown, monthly understated, free trial as a toggle. — [FunnelFox part 2](https://blog.funnelfox.com/web2app-funnel-patterns-2026-part-2/)
- FunnelFox generalisation (commentary): three plans "converts best across most funnels"; "Timer + discount standard: Nearly universal urgency layer". — [FunnelFox paywall article](https://blog.funnelfox.com/effective-paywall-screen-designs-mobile-apps/); [FunnelFox Jan 2026](https://blog.funnelfox.com/web2app-funnel-patterns-2026/)

### Inferences
- A card-required trial (or a paid €1 / pay-what-you-want trial) is the norm on web funnels. None of the documented web funnels offered a no-card trial.
- Timers and "reserved discounts" are common among the aggressive players (Liven, Headway, BetterMe, Fastic). The Liven review suggests they cost trust with wellbeing audiences. Calm's and Flo's softer versions ("restrained urgency", reminder toggles) are the closer reference points for a 40–50-year-old female audience.

### Gaps
- Could not verify whether Headway's timers reset (a common dark pattern) or the exact size of the dismissal discount.
- No verified paywall details for Rise, YAZIO, SIMPLE, Stoic, Reflectly, Rosebud, Day One, Mindsera or Lasting.

---

## Q6. How is the first screen designed?

### Takeaway
The first screen is almost always a one-tap, single-select question about the user's goal or problem, often with a short emotional reframe. Health and weight funnels open with goal or sex/age selectors. Wellbeing funnels open with a soft recognition question (Calm's sleep frequency). Cal AI's in-app flow opens with a demo video instead.

### Cited Findings
- Noom: weight-goal single-select (lose / maintain & get fit / haven't decided). — [RevenueCat](https://www.revenuecat.com/blog/growth/web-to-app-onboarding-funnel)
- Calm: sleep-frequency question with reassurance feedback. — [RevenueCat](https://www.revenuecat.com/blog/growth/web-to-app-funnel-examples). "Gentle self-recognition and safety", immediate social proof. — [FunnelFox part 2](https://blog.funnelfox.com/web2app-funnel-patterns-2026-part-2/)
- Babbel: goal ("Why are you learning German?"). Flirtist: scenario choice. Nebula: soft "Embrace your potential" positioning. Lasta Fit: safety angle ("low-impact, joint-friendly"). Fastic: "real-life plan, not a restrictive diet". — [FunnelFox, Jan 2026](https://blog.funnelfox.com/web2app-funnel-patterns-2026/)
- Homemade Method: pain positioning plus authority (Stanford, GLP-1 framing). — [FunnelFox part 2](https://blog.funnelfox.com/web2app-funnel-patterns-2026-part-2/)
- Cal AI: product demo video. — [tasu.ai snippet](https://tasu.ai/library/cal-ai) (unverified)
- Finch: bird-colour / egg picker (interaction before data). — [Retention.blog](https://www.retention.blog/p/life-of-a-birb)
- BetterMe: many separate funnels by segment (men, women, older users, and so on), so the first screen varies by segment. — [FunnelFox Jan 2025](https://blog.funnelfox.com/web-funnels-insights-and-trends/)

### Inferences
- For a reflection app, the closest analogue is Calm's "how often does X happen to you" recognition question. It is one tap, non-clinical and sets up the mirror framing.

### Gaps
- No first-screen A/B results published for any named app.

---

## Q7. What conversion numbers, revenue results, or A/B test outcomes have been published?

### Takeaway
The hard numbers are mostly about paywalls and trials, not quiz structure. Cal AI (Superwall) published the most. Mimo, Mojo and Flo have single data points. No named app has published a quiz-length or email-placement A/B result.

### Cited Findings
- **Cal AI:** $28K in month 1 → $115K in month 2 → $1M MRR at 6 months → ~$40M annual revenue at 18 months. Monthly revenue grew more than 3x in a 10-month window. It ran 123 iOS A/B experiments, 160 paywall designs and 424 variants across 46 trigger points (~5 experiments/month), 61 of them on the onboarding paywall. Trial-to-paid improved 31% over 12 months. 87% of new users see the paywall, 57% of paywall viewers start a transaction, and 63% of those complete. Joined Superwall in March 2024. Acquired by MyFitnessPal in March 2026. — [Superwall case study](https://superwall.com/case-studies/cal-ai) (vendor source)
- "Approximately 20 to 25 percent of users who complete the onboarding flow convert either to a paying plan immediately or into the free trial" (Cal AI). — search snippet, [Sebastian Stef](https://sebastianstef.com/resources/cal-ai-case-study) / [Latka](https://getlatka.com/blog/how-cal-ai-achieved-35-million-revenue-in-just-one-year) (secondary sources, unverified)
- Revenue reports conflict: $35M ARR in 18 months, $50M+ ARR before acquisition, or $40M revenue. — [Latka](https://getlatka.com/companies/calai.app) vs [Superwall](https://superwall.com/case-studies/cal-ai)
- **Mimo:** switching to an "honest trial" paywall (Blinkist-style timeline) more than doubled trial opt-in and improved trial-to-purchase by 50%. Cutting the trial from 30 to 14 days helped because longer trials had higher day-30 cancellations. A 20% annual price rise. Results: cLTV +65% over ~3 quarters, paid CAC −20%, monthly proceeds +35%. Most trials and purchases came during onboarding. — [RevenueCat, May 2026](https://www.revenuecat.com/blog/growth/optimize-funnel-metrics-mimo) (app funnel, not web)
- **Mojo** (video/social content app): removing credit packs from the paywall raised new subscription revenue 14% (tested Jan 2026). Onboarding drives about 50% of trial starts. — [Superwall case study](https://superwall.com/case-studies/mojo)
- **Flo:** monetises about 25% of its US audience and runs "more than 15,000 tests a year". — [RevenueCat "fix onboarding funnels"](https://www.revenuecat.com/blog/growth/fix-onboarding-funnels)
- **Unnamed sustainability app:** adding one commitment screen doubled day-30 retention. — [RevenueCat](https://www.revenuecat.com/blog/growth/fix-onboarding-funnels)
- **Blinkist:** about 70% of acquisitions came through web-to-app flows at peak. — [RevenueCat, Jan 2026](https://www.revenuecat.com/blog/growth/web-to-app-funnel-examples)
- **Noom:** "nearly $1B in revenue a year" (as of the Aug 2024 post). — [Retention.blog](https://www.retention.blog/p/the-longest-onboarding-ever). "55% of trial cancellations happen on Day 0" is cited as the reason Noom builds commitment before the paywall (an industry stat, not Noom's own). — [RevenueCat](https://www.revenuecat.com/blog/growth/web-to-app-onboarding-funnel)
- **Market context:** 63% more web funnels launched in 2024 than 2023. About 2% of ad creatives scale. — [FunnelFox Jan 2025](https://blog.funnelfox.com/web-funnels-insights-and-trends/). Meta campaigns sending users into web funnels grew 77% YoY vs 2024 (search snippet). — [FunnelFox 2026 patterns](https://blog.funnelfox.com/web2app-funnel-patterns-2026/)
- **Unverified claim, not repeated:** a search snippet said "revenue increased by 5x from moving the paywall to the beginning of onboarding". The RevenueCat article it seemed to come from does not contain it (checked by fetch). Treat it as unsourced.

### Inferences
- The best-documented gains come from paywall and trial mechanics: an honest trial timeline, fewer choices (Mojo), trial length (Mimo), and running tests continuously (Cal AI). For a small team, the published evidence points to paywall and trial clarity before quiz length.

### Gaps
- No published conversion rates for the Noom, Headway, BetterMe, Liven, Calm or Flo web funnels.
- A full Headway interview exists ([Subscription League, Yeva Koldovska](https://subscriptionleague.com/episode/headway-unlocking-growth-and-diversification-the-power-of-web-and-in-app-subscriptions-with-yeva-koldovska); [Paddle Fix That Funnel](https://www.paddle.com/studios/shows/fix-that-funnel/jacob-returns)), and so does a Noom one ([Paddle, Andrey Shakhtin](https://www.paddle.com/studios/shows/fix-that-funnel/noom-full-interview)). These are audio or video, and their transcripts could not be pulled.

---

## Apps not covered or found to be app-only (gaps)
- **Rise Science, YAZIO, Lasting, Day One:** no teardown found in this pass.
- **Stoic, Reflectly, Mindsera, Rosebud (the closest AI or journaling competitors):** only pricing found. Mindsera $69.99/yr, Stoic $59.99/yr ($6.99/mo), Reflectly $9.99/mo or $59.99/yr (from search snippets of competitor comparison blogs, e.g. [Mindsera best AI journaling apps](https://mindsera.com/articles/the-7-best-ai-journaling-apps-in-2026-tested)). The most common Rosebud complaint is hitting paywalls or usage limits "within the first day or two" ([Rosebud alternatives, mylifenote](https://blog.mylifenote.ai/rosebud-journal-alternative/)). These are competitor-written sources, so possibly biased. No web quiz funnel was found for any of them; they appear to rely on in-app onboarding.
- **Voice journaling or self-reflection apps with web funnels:** none found. **Liven** (self-discovery / wellbeing, web quiz, 42 steps) is the closest documented analogue.
- **"Mojo":** the case study found is for Mojo the video/content-creation app. No teardown was found for a wellness app called Mojo. Confirm which Mojo was meant.
- **SIMPLE:** only commentary ("calm, educational tone… reduces friction"), surfaced via search from [FunnelFox part 2](https://blog.funnelfox.com/web2app-funnel-patterns-2026-part-2/). The fetched version of that article did not include a SIMPLE section, so it may be in another part of the series.
