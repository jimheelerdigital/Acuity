# Competitor Meta ads: what long-running wellness, journaling, habit and productivity subscription apps actually run

**Method and caveats (read first).**
- Primary data comes from the Motion Creative Analytics "Inspo" library, pulled on **2026-09-29**. Motion mirrors the Meta Ad Library. For each brand I pulled the oldest *still-active* ads (sort=OLDEST, status=ACTIVE), which are the longest survivors, and for some brands the newest ads as well. Each brand's Meta Ad Library page is cited using the `brandUrl` Motion returns (facebook.com/ads/library/?view_all_page_id=…).
- Motion fields: `launchDate`, `daysActive`, `landingPageUrl`, `primaryCopy`, `headline`, `CTA`, format (image/video/carousel), and active counts per brand. **Ad libraries have no spend or performance data.** Longevity is a proxy for profitability, not proof of it.
- `daysActive` does not always equal "today minus launchDate". For example, Calm ads launched 2025-01-15 show 303 days active when about 620 calendar days have passed. It probably counts days the ad was observed active, with gaps. For Voicenotes, the gap between launchDate and pauseDate exactly matched daysActive (for example 04-21 to 07-17 = 87 days). **I treat daysActive as a lower bound on how long the ad has run.**
- I could not view images or video frames, only copy, metadata and destination URLs. Anything I say about visual style for Motion-sourced ads comes from third-party teardowns or is inferred, and is labeled that way.
- Motion had no usable brand record for **Stoic, Structured, Day One (the journal), Habitica or Streaks**. "Day One" matched an apparel brand and "Stoic" matched Stoic Beauty and Daily Stoic. **Reflectly** exists with only 1 total ad and 0 active. **Voicenotes** has 525 total ads and 0 active. **Liven** has several pages; the main one is "Liven: Self-Discovery Community" (theliven.com). "Headway" by name returns a therapist SaaS (headway.co), so the correct page is "Headway App".

---

## Per-app profile: formats, hooks, visual style, destination, active ad volume, longest runners

### Takeaway
The biggest spenders (Headway, Calm, Rise, Liven, Speechify, BetterMe, Noom) each run thousands of ads at once. Their longest survivors are simple: one benefit line or one social-proof line ("iPhone App of the Year", "28 Days Challenge", "15 minutes a day", "This app just changed my life"), repeated across dozens of near-identical creative variants for 200 to 390+ days. The AI-journal players (Rosebud, Mindsera, Letterly) run far smaller accounts: 6 to 338 active ads, with their current longest runners at about 35 to 65 days.

### Cited Findings

**Active ad counts (Motion, snapshot 2026-09-28/29).** Format split is shown as image / video / carousel.
- Headway App: **5,951 active** (4,389 image / 1,561 video / 1) of 46,530 all-time — [Meta Ad Library: Headway App](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=250289965916061)
- Calm: **2,417 active** (1,042 / 1,368 / 6) of 17,432 — [Meta Ad Library: Calm](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=328627523855071)
- Rise Science: **2,213 active** (379 / 1,833 / 1) of 14,387 — [Meta Ad Library: Rise Science](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=1023599077769643)
- Liven (Self-Discovery Community page): **1,796 active** (267 / 1,524 / 0) of **91,203** all-time — [Meta Ad Library: Liven](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=103537499312980)
- Speechify: **1,510 active** (78 / 1,432 / 0) of 24,426 — [Meta Ad Library: Speechify](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=248986568895243)
- BetterMe (main page): **1,396 active** (488 / 907 / 2) of 14,240 — [Meta Ad Library: BetterMe](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=116700222203350). This main page understates BetterMe, which runs separate fan pages per funnel topic (see the web2app section).
- The Fabulous: **512 active** (149 / 362 / 0) of 6,559 — [Meta Ad Library: The Fabulous](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=290983137688447)
- Noom (US page): **508 active** (221 / 100 / 3, plus 184 unknown) of **29,178** — [Meta Ad Library: Noom](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=112936925459222)
- Letterly: **338 active** (288 / 50 / 0) of 2,251 — [Meta Ad Library: Letterly](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=108316755707654)
- Finch: **209 active** (66 / 142 / 1) of 5,803 — [Meta Ad Library: Finch](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=112516667335834)
- Opal: **60 active** (3 / 57 / 0) of 2,996 — [Meta Ad Library: Opal](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=111491020374567)
- Tiimo: **26 active** (19 / 7 / 0) of 281 — [Meta Ad Library: Tiimo](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=1466105987053177)
- Rosebud.app: **16 active** (11 / 5 / 0) of 201 — [Meta Ad Library: Rosebud](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=135252226332167)
- Mindsera: **6 active** (2 / 4 / 0) of 20 — [Meta Ad Library: Mindsera](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=109458634048633)
- Voicenotes: **0 active** of 525. The last ads paused 2026-07-16/17 — [Meta Ad Library: Voicenotes](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=261987383666277)
- Reflectly: 0 active, 1 ad all-time in Motion (Motion brand record, reflectly.app, page id 259447607785240)

**Headway (book summaries): web quiz funnel, mostly statics**
- The oldest active ads launched **2025-02-15/16** and show **219–220 days active**. They come as an image plus two videos sharing the same copy: "Turn self-development into laid-back and easy leisure 🤝 with this book summary app!" with headline "Start now 👉" and CTA "Learn more". **Destination: makeheadway.com/onboarding/start**, a web onboarding quiz, not the App Store — [Meta Ad Library: Headway](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=250289965916061)
- Other long runners (90–136 days):
  - "🚀 15 Minutes a Day Can Change Everything! No time for books? No problem. ✅ Learn from bestselling books in just 15 minutes…", headline "📖 Learn Smarter, Not Harder—Start Now!", launched 2025-06-09, 103–104 days.
  - "🚀 Think Like a CEO—Start Learning Now!", launched 2025-06-21, 94 days.
  - Landing pages are persona- or angle-specific: `/onboarding/self-growth/landing`, `/onboarding/ceo/landing`, and headway-product.com/intelligence. URLs carry `quizId=quiz1&splitId=37`, which means the funnel itself is split-tested. Same source as above.
- The newest ads (2026-08-01) are a batch of at least 8 variants (7 image, 1 video) with one identical line of copy: "Some days you want to grow your career. Some days you want to fix your sleep… Headway has a book for all of it — 15 minutes, whatever you need today." Same source.

**Calm: App Store install, video-heavy, award as social proof**
- The oldest active ads launched **2025-01-15** and show **303 days active**. They are localized videos (JP, ES, DE) built on "iPhone App of the Year" / "Aplicación del año de Apple", plus "Prueba 7 días gratis". **Destination: App Store / Google Play direct**, CTA "Install Now" — [Meta Ad Library: Calm](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=328627523855071)
- English long runners launched 2025-02-10/12 with 275–276 days active:
  - "Stress less, live more."
  - "iPhone App of the Year", with a dynamic headline `{{product.name}}`, which suggests catalog or dynamic creative.
  - "🚨 STOP 🛑 Rewire your brain with mindfulness. Science shows that small, consistent habits can transform how you think and feel."
  - Same source.

**Rise Science (sleep): runs web quiz and App Store in parallel**
- The oldest active ads launched **2024-09-28** and show **339–348 days active**. They are French statics with the testimonial-style hook "Arrête tout de suite. Cette application vient de changer ma vie" ("Stop right now. This app just changed my life"), headline "Essayez l'appli GRATUITEMENT 😴", going to the App Store. Rise also runs a quiz-hook variant, "Celle ci sont les heures de sommeil dont vous avez vraiment besoin… Répondez au quiz de 3 minutes" (launched 2025-01-03, 251 days) — [Meta Ad Library: Rise](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=1023599077769643)
- The newest ads (2026-09-28) are mostly video. They split between **onboarding.risescience.com/start?utm_source=FB_w2w** (web-to-web / web2app funnel, CTA "Learn More") and rise.go.link (an Adjust deep link to the store, CTA "Download"). Hooks:
  - "How much sleep debt do you have? Take the free quiz to find out your number. Most people are shocked by theirs."
  - "What if you could see your energy forecast for the day?… Like weather, but for your brain."
  - "'I bet he wakes up at 8am'"
  - A skit-referencing hook: "That facial-spa convo hit a little too close to home…"
  - Same source.
- FunnelFox counted **784 active Rise ads in July 2026** and 1,455 over Jun+Jul. It described the creative as "Static infographics, UGC/meme style" with the hook "Chicago Bulls use this method…". The funnel shows a parent/caregiver discount mid-funnel and includes reaction-time and memory tests. Rise's "sleep debt" metric is cited as quiz-specific value that gets pitched in the ad itself — [FunnelFox: 8 High-Ad-Volume Health Funnels](https://blog.funnelfox.com/health-funnels-and-ads-breakdown/). Motion's count (2,213 active on 2026-09-29) is higher than FunnelFox's July figure. They were measured at different dates and may count differently.

**Liven (self-discovery / anti-procrastination): all web quiz, huge angle iteration**
- Every observed ad routes to a quiz domain: quiz.theliven.com/en, inner-theliven.com, wellbeing-theliven.com/ja, quiz.theliven.com/pl. CTA is always "Learn more".
- Its oldest active ad launched 2025-01-15: "Self-care isn't selfish… Tailor-made by Cognitive Behavior Specialists ✅ Thriving with ADHD program ✅ Anti-Burnout program ✅ Stress Reduction program… ⭐ Rated 4.8", headline "Easy to Follow Anti-Burnout Plan".
- "Dopamine management plan" videos, localized into JP and PL, launched 2025-08-07 and show 43–45 days active. There are also Arabic "inner child / childhood trauma test" videos (launched 2025-07-30, 53 days).
- Source: [Meta Ad Library: Liven](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=103537499312980)
- Teardown (Funnel of the Week): **1,000+ unique creatives per month**, 1.6M+ clicks to the quiz in July 2024, and 91% of paid social volume from Facebook. Formats: "Apple Notes-style static images, charts and graphs, UGC videos, text-heavy static images, video backgrounds with overlay angles, gender-specific variations". The angle sequence ran: Procrastinators (Aug 2023) → Childhood Trauma (Sep 2023) → Dopamine Detox (Oct 2023+) → Cortisol Detox (Q2 2024) → gender-specific (Aug 2024). New angles are **tested as text-heavy images inside existing control copy, then scaled** into many creatives. All angles route to one "Anti Procrastination Plan" quiz — [Funnel of the Week: Liven angle iteration](https://blog.funneloftheweek.com/p/fb-ad-creative-fatigue-angle-iteration-strategy-liven-app-uses-completely-defeat)
- Aftermath (July 2025, about YouTube Shorts, not Meta) describes AI-generated pop songs about mental-health patterns over AI characters, segmented by gender and condition — [Aftermath](https://aftermath.site/liven-app-youtube-ai/). Liven has drawn public criticism for manipulative mental-health targeting — [Daily Campus](https://dailycampus.com/2026/04/07/when-targeted-ai-ads-manipulate-the-mentally-ill-for-money-the-liven-app-scam/)

**BetterMe (fitness plus mental health): both install and web quiz**
- The oldest active ads launched **2024-08-23 to 08-28** and show **385–392 days active**. They are at least 8 video variants with identical copy: "28 Days Challenge To Lose Weight At Home." and headline "24/7 Personal Trainer in App.", with CTA "Install now" (no URL captured, which suggests app install). Quiz ads go to betterme-fasting.com: "What type of intermittent fasting to choose? Take short test to find out." — [Meta Ad Library: BetterMe](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=116700222203350)
- FunnelFox (Apr 2025) analyzed **75,000+ ads over 90 days**:
  - **500–1,000 creatives per funnel per month**.
  - **1–2% win rate**, meaning only 10–15 of 1,000 creatives reach 100k+ impressions.
  - Separate fan pages per funnel topic ("Wall Pilates", "Chair Yoga") with one pixel per topic.
  - Mental Health was the fastest-growing topic at +207% MoM.
  - Hooks: time-based ("Starting Monday"), challenge ("10 minutes a day"), progress promises ("In 1 week you'll feel it, in 2 weeks you'll see it").
  - Visuals: "studio shots, UGC, and animations". English is 58% of volume.
  - Source: [FunnelFox: BetterMe web2app 75,000 ads](https://blog.funnelfox.com/betterme-web2app-ads-analysis/)

**Noom: web quiz only**
- The oldest active ad launched **2025-03-20** and shows **293 days active**: "Keep the weight off with Noom: 💃 No food is forbidden 🏋️ No impossible workout plans 👩‍🔬 Results backed by science 🙌 Only 10 minutes a day", headline "What's stopping you?". "Take this FREE 5min quiz" variants run 226–289 days. An "Aging & Metabolism" course-pack ad launched 2025-11-24 and shows 152–154 days, with copy about "Muscle Loss, Hormone Changes, Metabolism", aimed at older users. Every destination is noom.com/programs/health-weight/exsf01, a web quiz — [Meta Ad Library: Noom](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=112936925459222)
- Noom's web onboarding runs up to 113 screens and takes 10–15 minutes, with the paywall placed after heavy investment — [RevenueCat: Noom web-to-app teardown](https://www.revenuecat.com/blog/growth/web-to-app-onboarding-funnel)

**The Fabulous (habits / routines): web onboarding**
- The oldest active ads launched **2025-04-23** and show **202 days active**, with many more variants from May–July 2025 at 141–175 days. Nearly all share one copy block: "🤩 Morning can be your favorite part of the day! ❌ No matter if you wake up at 5am or 10am, you can make your morning productive and pleasant. 🏆 Give Fabulous a try! More than 40,000,000+ members", headline "Customize Your Daily Routine". **Destination: start.thefabulous.co/onboarding/fab-initial-fb** (web onboarding), CTA "Learn more". Mostly video — [Meta Ad Library: The Fabulous](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=290983137688447)
- Marcus Burke names The Fabulous as an example of **infographic** ads working for habit apps — [RevenueCat: Meta Ads in 2025, Marcus Burke](https://www.revenuecat.com/blog/growth/meta-ads-in-2025-tips-for-apps)

**Finch (self-care pet): UGC video, App Store plus a web page**
- The oldest active ads launched 2025-09-11. The longest runner launched **2025-12-26** and shows **125 days**. Across ≥12 video and image variants the copy is always the same: "OF COURSE I needed to take care of a pet to take care of myself 😂 #finchapp", headline "Self Care Pet Game". Destinations: App Store (CTA "Install now") and **finchcare.com/index-meta** (CTA "Learn more", 97 days) — [Meta Ad Library: Finch](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=112516667335834)
- Sparrow Apps (from its own Ad Library analysis) found:
  - 610 active / 2,100 total creatives.
  - **Active creatives rose from 58 (Jan 2025) to 660 (Jan 2026)**.
  - Formats: UGC talking-head testimonials plus animated content.
  - Hooks: "I thought I was too broken for self-care apps, but then I found Finch", "Your therapist can't text you at 3am. Finch can", "My anxiety dropped from 10 to 3 in two weeks".
  - Finch is positioned "in ads as a game, not a wellness app".
  - Source: [Sparrow Apps: Finch $30M ARR](https://blog.sparrowapps.io/p/finch-how-a-self-care-app-hit-30m-arr-without-vc-money)
- Motion shows 209 active today versus Sparrow's 610. The counts come from different dates and possibly different methods.

**Opal (screen time): mostly video, App Store plus web**
- The oldest active ads launched **2025-11-24** and show **154–155 days**. One is an ADHD angle: "✨ Manage ADHD effortlessly ✨ 🎯 Focus Mode… 📅 Create Routines…", headline "Unlock Your ADHD Potential".
- The current main runner launched 2026-06-17 and shows **104 days**: "You keep telling yourself 'just five more minutes.' It's never five. 📵 Opal blocks the apps… People spend ~5 hours a day on their phone", headline "Get your hours back 👉🏼". It was re-launched as fresh ads in July, August and September and localized to JP.
- A web variant goes to **start.opalapp.com/focus** with a long-copy social-proof stack (press quotes from The Next Web and Bustle, "94% of Opal customers save 2 hours a day").
- Source: [Meta Ad Library: Opal](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=111491020374567)

**Tiimo (visual planner): mostly statics, App Store**
- The oldest active ad is a video launched 2026-05-29 with **120 days**: "Struggling with executive function?", headline "Visual planning app for people with Autism & ADHD".
- The main static set launched 2026-06-23 and runs **85–96 days**, including the impressionRank-1 ad: "Are you tired of planning your day and still not getting anything done? It is frustrating to know what matters and still feel stuck when it is time to act…", headline "Start making progress".
- Also: "Struggling to stay organized and feeling overwhelmed?… by neurodivergent for neurodivergent."
- All go to the App Store — [Meta Ad Library: Tiimo](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=1466105987053177)

**Speechify (voice-app benchmark): about 95% video, App Store / Play**
- The oldest active ad launched 2024-10-18 and shows 340 days. The longest runner launched **2025-01-08** and shows **395 days**: "Need to hear it to believe it? 📢 Convert any text or photo to audio for FREE and join a community of millions!", headline "Try for FREE!".
- Celebrity-voice angle: "Why waste time reading when you can have your own personal celebrity narrator?", headline "Listen, Don't Read!" (258–267 days) and "The AI voices are incredible" (245 days). Heavily localized (IT, PT).
- Source: [Meta Ad Library: Speechify](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=248986568895243)

**Rosebud, Mindsera, Letterly, Voicenotes**: covered in the AI journaling / voice section below.

### Inferences
- The same copy block is almost always reused across 5–15+ creative variants (different video or image assets) while the long survivors change little. This pattern shows up in Headway, BetterMe, Fabulous, Finch, Letterly and Rise. **The winning unit is the angle and copy line. The visual assets rotate underneath it.**
- The longest survivors are rarely clever. They are one-line benefit or proof claims such as "App of the Year", "28 Days Challenge", "15 minutes a day", "This app changed my life", "Morning can be your favorite part of the day".
- Heavy localization (Calm, Rise, Speechify, Liven) stretches the life of a proven concept: an old winner gets translated rather than replaced.
- Several big advertisers now point at older or midlife pain points: Noom's "Aging & Metabolism / Hormone Changes", Headway's "fix your sleep", Rise's energy and parent discount. That is relevant to a women-40–50 audience.

### Gaps
- No spend, CTR or CPA for any competitor ad. Longevity is the only profitability proxy.
- I could not see thumbnails or video frames, so visual style for Calm, Headway, Noom, Speechify and Tiimo statics is unverified.
- No Motion or Ad Library data found for Stoic, Structured, Day One (journal), Habitica or Streaks. Web search returned only product reviews for these ([Stoic App Store listing](https://apps.apple.com/us/app/stoic-journal-mental-health/id1312926037)). Their Meta ad volume is likely low or runs under a different page name. Not verified.
- Motion's `daysActive` semantics are not documented. It may undercount true run length (see caveat at top).

---

## Web-to-app quiz funnels versus install ads: who uses what, and how the ads differ

### Takeaway
Web quiz funnels are the norm among the biggest spenders. Noom, Liven and Headway send all or nearly all traffic to web onboarding. Fabulous is mostly web. Rise, BetterMe, Finch and Opal run both. Calm, Speechify, Tiimo, Rosebud and Mindsera are App Store install only. Web-funnel ads usually say "take the quiz / find your number / your plan" with a "Learn more" CTA and promise a personalized result. Install ads lean on awards, star ratings, testimonials and "Try it free" with an "Install now" CTA.

### Cited Findings
- **All web quiz**:
  - Noom: noom.com/programs/…, "Take this FREE 5min quiz" — [Meta Ad Library: Noom](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=112936925459222)
  - Liven: quiz.theliven.com and localized quiz domains, "Try the 1-minute quiz" in JP copy — [Meta Ad Library: Liven](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=103537499312980)
  - Headway: makeheadway.com/onboarding/… with quizId/splitId params — [Meta Ad Library: Headway](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=250289965916061)
  - Letterly: quiz.letterly.app/promo — [Meta Ad Library: Letterly](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=108316755707654)
  - Fabulous: start.thefabulous.co/onboarding — [Meta Ad Library: Fabulous](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=290983137688447)
- **Mixed**:
  - Rise runs onboarding.risescience.com with `utm_source=FB_w2w` alongside rise.go.link (store) — [Meta Ad Library: Rise](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=1023599077769643)
  - BetterMe runs app install ("Install now") alongside betterme-fasting.com quiz — [Meta Ad Library: BetterMe](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=116700222203350)
  - Finch runs App Store alongside finchcare.com/index-meta — [Meta Ad Library: Finch](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=112516667335834)
  - Opal runs App Store alongside start.opalapp.com/focus — [Meta Ad Library: Opal](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=111491020374567)
- **Install only** (in the sampled ads): Calm, Speechify, Tiimo, Rosebud, Mindsera, and Voicenotes (inactive). See each brand's Ad Library link above.
- BetterMe runs "multiple web quiz funnels tailored to different audience segments (fitness, pilates, mental health, relationships)". Noom pioneered the model. Liven is named as a live quiz funnel — [FunnelFox via search summary; RevenueCat Noom teardown](https://www.revenuecat.com/blog/growth/web-to-app-onboarding-funnel)
- BetterMe web2app: separate fan page and pixel per topic, 500–1,000 creatives per funnel per month, bidding mostly Cost Cap / Bid Cap (~60%) — [FunnelFox BetterMe](https://blog.funnelfox.com/betterme-web2app-ads-analysis/)
- Marcus Burke recommends **separate ad accounts** for web versus app objectives. In his Blinkist example, web campaigns delivered "80% of their impressions on Facebook Feed" to **older audiences with higher conversion intent** — [RevenueCat: Marcus Burke](https://www.revenuecat.com/blog/growth/meta-ads-in-2025-tips-for-apps)
- Web2app funnels "meet users at an earlier stage of intent — before they're looking for an app, while they're still trying to understand their problem". Value delivered in the quiz (Rise's sleep-debt number) can be pitched in the ad — [FunnelFox health funnels](https://blog.funnelfox.com/health-funnels-and-ads-breakdown/)
- **Copy differences observed.** Web ads use "Take the free quiz", "find out your number", "Most people are shocked by theirs" (Rise), "What's stopping you?" (Noom), "Easy to Follow Anti-Burnout Plan" (Liven) and "Start now 👉" (Headway), all with CTA "Learn more". Install ads use "iPhone App of the Year" (Calm), "Trusted by 100k+ people" (Rosebud), "Try for FREE!" (Speechify) and "Self Care Pet Game" (Finch), with CTA "Install now/Download" — Ad Library pages above.

### Inferences
- The quiz is itself an ad hook. Ads sell a personal diagnosis (sleep debt, burnout type, "what's stopping you") rather than the app. Voice-journaling apps could do the same with an equivalent "result", for example a mental-load or overwhelm score.
- Web funnels tolerate high variant volume across many topics and pages (BetterMe, Liven). Install-only small apps (Rosebud, Tiimo, Mindsera) run a few dozen ads. That fits the finding that web2app economics fund much larger creative testing.
- Given Burke's note that web campaigns skew toward older Facebook Feed users, web funnels may suit a 40–50 female audience. This is an inference; there is no direct data for that segment.

### Gaps
- Could not confirm the paywall price or trial structure of each web funnel from the ad data.
- No public data compares conversion or LTV between the same app's web and install ads.

---

## How AI journaling and voice-note apps advertise

### Takeaway
AI journaling apps (Rosebud, Mindsera) sell emotional relief and insight: getting out of your head, anxious spirals turning into clarity, patterns you'd miss. They lean on testimonials and credibility ("Built with therapists", press mentions, user counts). Voice-to-text apps (Letterly, Voicenotes) sell productivity: typing less, turning thoughts into polished text or meeting summaries. They show the output (transcription or summary) and list use cases, with journaling as one bullet. Rosebud is the only one clearly naming the *weekly summary / patterns* payoff, and it does so through a therapy-adjacent testimonial.

### Cited Findings
- **Rosebud** (16 active, all App Store id6451135127). Source for all points: [Meta Ad Library: Rosebud](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=135252226332167)
  - Its longest active runners (launched 2025-08-24/25, 34–36 days) use four angles:
    1. **Authority / press**: "The KTLA-featured AI journaling app that's like having a personal mentor dedicated to your wellbeing", headlines "Your Personal Wellbeing Mentor" and "Trusted By 100k+ people" / "Trusted by 250K+ people". A static in this set holds **impressionRank 1**.
    2. **Therapy complement**: "💸 Therapy is the most expensive hour of your week. Make it count. 💬 'I also see a therapist once a week, so I started using the weekly summary to bring up what's been going on…' 🔍 Rosebud lets you offload your thoughts by voice or text anytime, then does the hard part for you, surfacing patterns and insights you'd miss on your own", headline "Trusted by Thousands in Therapy".
    3. **Press quote**: "Fast Company called Rosebud a surprisingly thoughtful writing partner."
    4. **Newest, 2026-09-26/27**: "ChatGPT wasn't built for your mental health. Rosebud was." with the testimonial "Literally feels like having a conversation with someone…" plus "Stuck in your own head? Rosebud's interactive journal turns anxious spirals into clarity… Built with therapists… 75% of users feel better within 7 days".
  - Split is about 11 image / 5 video.
  - The same creative assets are re-launched as new ad IDs. Several 2026 ads share duplication IDs with earlier assets.
- **Mindsera** (6 active, App Store; launched 2026-09-22/28). Source: [Meta Ad Library: Mindsera](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=109458634048633)
  - "🚀 10 Minutes a Day Can Change Everything! No time for spiraling or endless overthinking? We got you. ✅ Write freely, and AI helps you make sense of it ✅ Discover emotions behind your thoughts ✅ Track personal growth week by week. Your mental gym — open 24/7." This structure copies Headway's "15 Minutes a Day Can Change Everything!" template almost word for word.
  - A **voice-journaling** ad explains the mechanics: "Want to journal, but your mind is too fast for a pen or keyboard? 🌪️… Put on your headphones and brain dump your thoughts by talking while you go for a walk → Get the recording automatically transcribed → analysis… insights about your emotions, a quick summary… unique artwork… Repeat tomorrow."
  - "Journaling is the GYM for the mind 💪🧠".
- **Letterly** (338 active; web quiz quiz.letterly.app/promo). Source: [Meta Ad Library: Letterly](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=108316755707654)
  - Longest active runners launched **2026-04-14** and show **63–65 days**. Mostly statics (288 image / 50 video). Headline across ≥10 variants: "Turn your thoughts into well-written text."
  - Copy: "Record VOICE and turn it into perfectly written TEXT… Perfect for: 🗒️ note-taking, 💼 meeting summaries, 💌 emails and messages, 📱 social media posts, 🖊️ journaling"; "Say goodbye to tedious typing"; "⭐⭐⭐⭐⭐ The #1 app for turning your voice into clear, well-written text in seconds."
  - Impression ranks 1–5 in this group all belong to these text-to-voice benefit statics.
- **Voicenotes** (0 active now). Its last flight ran 2026-04-21 to 2026-07-17, with the longest ad at **88 days**. Source: [Meta Ad Library: Voicenotes](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=261987383666277)
  - "AI note-taking that actually gets it… 🎙️ Record, transcribe & summarize any meeting 📝 Polished, shareable notes in seconds… Voicenotes — Your second brain for meetings."
  - Also "an AI note-taker for meetings and journaling! ✅ Get a quick summary… ✅ Create summary, to-do list, emails using AI".
  - The meetings positioning dominated. The journaling-framed static ran only 2–4 days before pausing.
- **Speechify** (voice benchmark) never demos a workflow in copy. It sells the voice itself ("celebrity narrator", "The AI voices are incredible") and a free-trial proof line ("Need to hear it to believe it?") — [Meta Ad Library: Speechify](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=248986568895243)
- Rosebud had 7,500+ paying customers and raised $6M in 2025, with plans to "invest more into marketing" — [Rosebud blog](https://www.rosebud.app/blog/rosebud-raises-6m-to-expand-the-worlds-leading-ai-journal); [Latka](https://getlatka.com/companies/rosebud.ai)
- Adjacent wellness hooks tied to "thoughts/overwhelm":
  - Finch: "I thought I was too broken for self-care apps…", "Your therapist can't text you at 3am" — [Sparrow Apps](https://blog.sparrowapps.io/p/finch-how-a-self-care-app-hit-30m-arr-without-vc-money)
  - Tiimo: "It is frustrating to know what matters and still feel stuck…" — [Meta Ad Library: Tiimo](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=1466105987053177)
  - Liven: burnout, childhood stress and dopamine — [Funnel of the Week](https://blog.funneloftheweek.com/p/fb-ad-creative-fatigue-angle-iteration-strategy-liven-app-uses-completely-defeat)

### Inferences
- There is an open lane. No one in the set clearly runs "talk it out → see your patterns / weekly report / what's really going on" aimed at overloaded midlife women. Rosebud's therapy-summary testimonial comes closest, and it is one of their longest active concepts.
- The voice-to-text players frame voice as a productivity input for meetings and emails, not emotional relief. Voicenotes' journaling-framed static died in days while its meetings videos ran 85–88 days. That suggests journaling alone as a voice-app pitch did not win *for that audience*. The sample is small, so this is inference only.
- Mindsera copying Headway's template word for word suggests small apps borrow long-running big-app formats.
- Note for Acuity copy: competitors use "brain dump" (Mindsera) and fixed-time or duration claims ("10 Minutes a Day", "15 minutes"). Acuity's positioning rules forbid both, so these hooks would need translating into "debrief"-style language.

### Gaps
- I could not see whether Rosebud, Mindsera or Letterly videos show on-screen transcription or summary UI. Only the copy was available.
- No data on Rosebud's win rate or spend. Its small active count (16) says nothing about scale by itself.
- No confirmed Meta ads from Day One, Stoic or Reflectly in 2024–2026.

---

## Refresh cadence and variant counts

### Takeaway
Scaled web2app advertisers ship hundreds to 1,000+ new creatives a month (Liven 1,000+/mo; BetterMe 500–1,000 per funnel/mo; Finch grew from ~58 to ~660 active in a year). Win rates are about 1–2%. The survivors then run for months: 90–390+ days at Headway, Calm, BetterMe, Rise, Speechify, Noom and Fabulous. Small AI-journal apps run a handful of concepts in about 5–15 variants each and re-launch the same assets as fresh ads every few weeks.

### Cited Findings
- Liven: **1,000+ unique creatives per month**. New angles are tested as text-heavy images inside existing control copy, then scaled — [Funnel of the Week](https://blog.funneloftheweek.com/p/fb-ad-creative-fatigue-angle-iteration-strategy-liven-app-uses-completely-defeat)
- BetterMe: 500–1,000 creatives per funnel per month; **1–2% win rate** (10–15 of 1,000 reach 100k+ impressions); localization adds "3–5% per locale" — [FunnelFox BetterMe](https://blog.funnelfox.com/betterme-web2app-ads-analysis/)
- Finch: 50–60 creatives per month in early 2025 rising to 400–700. Active creatives went from 58 (Jan 2025) to 660 (Jan 2026) — [Sparrow Apps](https://blog.sparrowapps.io/p/finch-how-a-self-care-app-hit-30m-arr-without-vc-money)
- Rise: 1,455 ads over Jun+Jul 2026 and 784 active in July 2026 — [FunnelFox health funnels](https://blog.funnelfox.com/health-funnels-and-ads-breakdown/). A batch of at least 8 new videos launched the same day (2026-09-28) across web and store destinations — [Meta Ad Library: Rise](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=1023599077769643)
- Headway: a same-day batch of at least 8 variants (2026-08-01) sharing one copy block, while 2025 ads are still live at 219–220 days — [Meta Ad Library: Headway](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=250289965916061)
- Longest observed active runs (Motion daysActive):
  - BetterMe "28 Days Challenge": **385–392 days**
  - Speechify "Need to hear it to believe it?": **395**
  - Rise "Cette application vient de changer ma vie": **339–348**
  - Calm "App of the Year": **303**
  - Noom "Keep the weight off… What's stopping you?": **293**
  - Headway "self-development into laid-back leisure": **220**
  - Fabulous "Morning can be your favorite part of the day": **202**
  - Finch "OF COURSE I needed to take care of a pet": **125**
  - Opal "just five more minutes": **104**
  - Tiimo "Start making progress": **96**
  - Letterly "Turn your thoughts into well-written text": **65**
  - Rosebud "Trusted by Thousands in Therapy": **36**
  - Sources: the brand Ad Library links above.
- Industry guidance: most teams push 15–30 new concepts or iterations per month, and about 5–8 concepts per week at $50K–$200K monthly spend — [Segwise](https://segwise.ai/blog/facebook-ad-creative-testing-best-practices). Contrasting view: Marcus Burke says creative lifespan "isn't dramatically shortening" if quality is high. He recommends "wildly different content types" rather than headline tweaks once past $100K/month. He flags text-wall ads, infographics and faceless AI content as rising, and talking-head UGC as "oversaturated" — [RevenueCat: Marcus Burke](https://www.revenuecat.com/blog/growth/meta-ads-in-2025-tips-for-apps)
- FunnelFox observed identical testimonial scripts recast across different faces, AI-generated and real content mixed in the same ad set, and cartoon mascots delivering clinical data — [FunnelFox health funnels](https://blog.funnelfox.com/health-funnels-and-ads-breakdown/)

### Inferences
- The operating model visible across the set is **high-volume testing plus long-lived winners**. Many variants get launched and most die, but a winning angle and copy line keeps running for 3–12+ months, refreshed by swapping visuals, localizing and re-launching as new ad IDs rather than being rewritten.
- For a small account like Acuity (which currently caps at 2 ads per lane per week), the realistic benchmark is the small AI-journal apps: Rosebud at about 16 active, Tiimo at 26, Mindsera at 6. Each runs 3–5 concepts with multiple asset variants per concept, not the 1,000/month of Liven or BetterMe.
- Recurring cross-app hook families:
  1. **Time-boxed promise**: "10/15 minutes a day", "28 days"
  2. **Award / press / user count**: App of the Year, KTLA, Fast Company, 40M members, 100k+/250k+
  3. **First-person testimonial or confession**: "this app changed my life", "OF COURSE I needed a pet…", "I thought I was too broken…"
  4. **Diagnostic quiz or number**: sleep debt, "what's stopping you?", burnout or dopamine type
  5. **Named frustration**: "just five more minutes", "plan but still stuck", "stuck in your own head"
  6. **Competitor or alternative contrast**: "ChatGPT wasn't built for your mental health", "Therapy is the most expensive hour of your week"

### Gaps
- No competitor's actual weekly launch cadence is published, beyond the per-month totals above.
- Motion daysActive may undercount run length. Exact first-run dates for reused assets could not be verified.
