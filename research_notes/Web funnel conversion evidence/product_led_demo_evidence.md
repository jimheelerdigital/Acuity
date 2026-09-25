# Product-led "aha before signup/payment" evidence for a voice self-reflection web funnel (women ~40–50 via FB/IG ads)

Scope note: 15 tool calls, 2026-09-24. Several items were confirmed only through search snippets or secondary blogs; each one is labeled. Anything marked **[Inference]** was not measured.

## 1. Product-led growth / delayed-registration evidence in consumer apps

### Takeaway
The best-documented consumer result is Duolingo's. Moving signup behind a first lesson raised DAUs by about 20%, and later "soft wall" tweaks added another +8.2%. Nearly every other "value before signup" claim I found is a practitioner opinion or a subscription-app benchmark that doesn't isolate the effect of a real demo. I found no published A/B test showing that a real AI output before the paywall beats simulated personalization.

### Cited Findings
- Duolingo: "Simply moving the sign-up screen back a few steps led to about a 20% increase in DAUs." — [First Round Review, Duolingo's growth lead (Gina Gotthilf)](https://review.firstround.com/the-tenets-of-a-b-testing-from-duolingos-master-growth-hacker/)
- Duolingo follow-up: they swapped a prominent "Discard my progress" button for a subtle "Later" option (soft walls), then added hard walls after several lessons. That produced a further "8.2% increase in DAUs." Soft walls primed users to convert at the hard walls. — [First Round Review](https://review.firstround.com/the-tenets-of-a-b-testing-from-duolingos-master-growth-hacker/)
- Secondary write-up of the same Duolingo test, which attributes the effect to endowed progress: once someone has done a lesson, abandoning that progress feels like a loss. — [Taplytics](https://taplytics.com/blog/duolingo-ab-test-onboarding/). Note: this causal explanation is the blog's interpretation. Duolingo did not measure it.
- Caveat: the Duolingo metric is DAU (engagement), not paid conversion. Duolingo is freemium, not a trial-to-paywall funnel. — [First Round Review](https://review.firstround.com/the-tenets-of-a-b-testing-from-duolingos-master-growth-hacker/)
- ChatGPT removed the login requirement on 2024-04-01. Logged-out use is limited to one session with no saved history. OpenAI has published no conversion effect. — [TechCrunch](https://techcrunch.com/2024/04/01/chatgpt-no-longer-requires-an-account-but-theres-a-catch/)
- Reverse trials: Elena Verna reports 10–40% lifts in free-to-premium conversion compared with pure freemium. This is a practitioner claim from SaaS work, with no public dataset. — [Amplitude blog, Elena Verna](https://amplitude.com/blog/reverse-trial); [CXL](https://cxl.com/blog/reverse-trial-strategy/)
- Subscription-app benchmark: "82% of subscription app trial starts still happen on day zero," so the decision is made during onboarding. — [RevenueCat blog, citing State of Subscription Apps](https://www.revenuecat.com/blog/growth/fix-onboarding-funnels); also cited by [Airbridge](https://www.airbridge.io/en/blog/paywall-conversion-structural-decisions)
- Hard paywalls convert better than freemium by Day 35: 12.1% vs 2.2% median (RevenueCat SOSA 2025). Onboarding placement with a trial gets 1.78% install-to-paid, vs 0.89% for an in-app gate with a trial (Adapty, 16k+ apps). — [Airbridge summary](https://www.airbridge.io/en/blog/paywall-conversion-structural-decisions); [RevenueCat SOSA 2025](https://www.revenuecat.com/state-of-subscription-apps-2025)
- Airbridge warns: "Hard paywalls only work if onboarding earns the ask. Users who hit the gate before understanding the product's value will not convert." This is an opinion, not measured. — [Airbridge](https://www.airbridge.io/en/blog/paywall-conversion-structural-decisions)
- A search-engine summary claimed "apps offering value before gating see trial-to-paid conversion rates 1.5 to 2x higher than hard paywalls." I could not trace this to a primary source, and it contradicts the RevenueCat hard-paywall numbers above. **Treat it as unverified.** — surfaced via search of [RevenueCat blog](https://www.revenuecat.com/blog/growth/fix-onboarding-funnels)
- Photoroom: one account says adding a name field to onboarding produced a 13% activation uplift, attributed to "perceived personalization." This is secondhand and the original source wasn't located. — [search result referencing Adapty/Page Flows onboarding guides](https://adapty.io/blog/how-to-build-app-onboarding-flows-that-convert/)

### Inferences
- **[Inference]** Duolingo shows that delaying the account wall can help when the pre-signup experience is the real product and is quick to finish. It does not directly show that a pre-paywall demo raises paid conversion in a hard-paywall web funnel.
- **[Inference]** The benchmarks (day-0 trial starts, onboarding placement beating in-app gates) back making the pitch at peak intent during onboarding. That is compatible with both a real demo and a simulated one.

### Gaps
- I found no public A/B test of a real AI output vs. a simulated or personalized quiz result before a paywall, for any consumer app.
- I found no Canva, Grammarly, Lensa, Remini or Photoroom published numbers on delayed registration.

## 2. AI apps that produce a real personalized output before the paywall

### Takeaway
Cal AI, the most-cited AI-app funnel, gets most of its conversion from a long quiz and personalization flow, not from a real scan. Its big revenue gains came from paywall experiments. I found no quantified evidence for "real AI result before the paywall" in Cal AI, Speak, Praktika, Otter or the photo apps.

### Cited Findings
- Cal AI's onboarding has about 32 screens of quiz-style commitment building, with a "$0.00" trial CTA. It asks for an App Store rating mid-onboarding, before the paywall. — [tasu.ai teardown](https://tasu.ai/library/cal-ai); [Matteo Spada on X](https://x.com/matteo_spada/status/2080851673392763174)
- Cal AI ran 61 paywall experiments and roughly tripled monthly revenue in 10 months. The gains are credited to paywall and offer framing, not a pre-paywall demo. — [Superwall case study](https://superwall.com/case-studies/cal-ai)
- Cal AI's paywalls sit around the scan features (camera, barcode, label), so scanning is gated rather than given away before paying. — [tasu.ai teardown](https://tasu.ai/library/cal-ai)

### Inferences
- **[Inference]** The best-known AI subscription funnel shows its "aha" as simulated personalization (a projected plan or goal) rather than real product output. That is weak evidence that simulated personalization is enough to convert. It is not evidence that a real demo would do worse.

### Gaps
- I found no data for Speak, Praktika, Otter, Lensa or Remini on real output before the paywall.

## 3. Friction of optional effortful steps: voice or free-text input, microphone permission, in-app browsers

### Takeaway
This is the biggest risk found. Microphone capture in FB/IG in-app browsers is poorly supported. There are long-standing reports that getUserMedia audio fails inside iOS in-app webviews, and that Facebook's in-app browser on Android doesn't get microphone permission. Web permission prompts are accepted at low rates unless the user has just interacted with the page. A typed-text fallback is probably required.

### Cited Findings
- iOS in-app browsers (the reported example is LinkedIn): getUserMedia with `audio:true` fails from iOS 15.1 on with "The request is not allowed by the user agent or the platform in the current context." Video-only works. The thread is unresolved and has no Apple fix. — [Apple Developer Forums thread 699479](https://developer.apple.com/forums/thread/699479)
- Other Apple forum reports: no prompt appears for WKWebView `getUserMedia({audio:true})`, and the WKWebView microphone mutes when backgrounded. — [Apple thread 734363](https://developer.apple.com/forums/thread/734363); [Apple thread 689182](https://developer.apple.com/forums/thread/689182)
- Developers report that microphone access is blocked when pages open in the FB Messenger or Instagram in-app browser. — [Bubble forum](https://forum.bubble.io/t/defeated-w-microphone-access-inappbrowser-fb-messenger-instagram-limits-access/104984)
- Android: a WebView can only grant the microphone if the host app handles `WebChromeClient.onPermissionRequest` and holds the RECORD_AUDIO runtime permission. Facebook on Android uses its own Chromium-based WebView. — [The Register (Meta's Chromium WebView)](https://www.theregister.com/2022/10/04/metas_facebook_webview_chromium/); [googlesamples android-permissionrequest](https://github.com/googlesamples/android-permissionrequest)
- Web permission prompt acceptance, desktop Chrome, all permission types: 29.8% allow when the prompt follows a user interaction vs 11.7% without one. This is from the snippet only because the full text returned 403. — [CHI 2024, "Websites Need Your Permission Too"](https://dl.acm.org/doi/fullHtml/10.1145/3613904.3642252)
- Chrome's `<permission>` element: Zoom reported a 46.9% drop in camera and microphone capture failures when using it. — [Chrome for Developers](https://developer.chrome.com/blog/rethinking-web-permissions)

### Inferences
- **[Inference]** Most FB/IG ad traffic lands in the in-app browser, so a voice-first demo will fail or prompt poorly for a meaningful share of visitors. A typed input, or an "open in browser" path, is needed. A test should log the getUserMedia success rate by user agent before judging the demo.
- **[Inference]** The Chrome allow rates are desktop figures across all permission types, so they may not carry over to mobile microphone prompts.

### Gaps
- I found no current (2025–2026) authoritative test matrix of getUserMedia audio in the FB and IG in-app browsers on iOS 17/18/26 and Android. The forum reports are 2020–2023. **A hands-on device test is recommended.**
- I found no public completion-rate data for optional free-text or voice steps in quiz funnels.
- I found no mobile microphone permission grant-rate data.

## 4. Endowment / IKEA effect evidence applied to onboarding

### Takeaway
The IKEA effect is well established in the lab: people value what they built themselves more. It only holds when the task is completed successfully. That makes a failed or glitchy recording (see section 3) worse than no demo at all.

### Cited Findings
- Across four studies (IKEA boxes, origami, Legos), labor increased people's valuation of their own creations. — [Norton, Mochon & Ariely 2012, J. Consumer Psychology](https://www.sciencedirect.com/science/article/abs/pii/S1057740811000829)
- Boundary condition: "labor leads to love only when labor results in successful completion of tasks." The effect dissipated when creations were destroyed or left incomplete. — [Harvard DASH](https://dash.harvard.edu/entities/publication/73120378-ce76-6bd4-e053-0100007fdf3b); [Wikipedia summary](https://en.wikipedia.org/wiki/IKEA_effect)
- Endowed progress in an applied setting: Duolingo's gain from delayed signup is interpreted as users not wanting to lose progress (see section 1). — [Taplytics](https://taplytics.com/blog/duolingo-ab-test-onboarding/)

### Inferences
- **[Inference]** A user's own spoken words turned into their own to-do list plausibly triggers ownership. The IKEA effect is lab evidence on physical objects, though, and I found no onboarding A/B test that measures it directly for AI-generated output.

### Gaps
- I found no field experiment measuring the IKEA or endowment effect on subscription conversion.

## 5. Audience: women ~40–50 on Facebook/Instagram

### Takeaway
US survey data shows women are more wary of AI than men, which supports trust and privacy framing around voice data. I found no reliable data on subscription purchase behavior or in-app browser share for this exact segment. The device-mix data found is low-quality.

### Cited Findings
- Pew (2026): women use chatbots about as much as men (47% vs 50%). Only 17% of women expect AI to affect them personally in a positive way, vs 29% of men. 68% of women think AI is advancing too quickly, vs 58% of men. Women are slightly more likely to use chatbots for emotional support or advice (11% vs 8%). There is no age-by-gender breakdown. — [Pew, The gender gap in AI](https://www.pewresearch.org/internet/2026/06/17/the-gender-gap-in-ai/)
- Pew (global, 2025): women are more likely than men to be mainly concerned about AI, e.g. in the UK 47% of women vs 32% of men. — [Pew](https://www.pewresearch.org/global/2025/10/15/concern-and-excitement-about-ai/)
- Voice privacy: about a quarter of voice-assistant non-users cite privacy as the reason (Pew, 2017, dated). Older-adult studies raise worries about "listening-in," tracking and unwanted sharing. — [Pew 2017](https://www.pewresearch.org/short-reads/2017/12/12/nearly-half-of-americans-use-digital-voice-assistants-mostly-on-their-smartphones/); [PMC study](https://pmc.ncbi.nlm.nih.gov/articles/PMC8679326/)
- Device mix, from an aggregator with unclear methods: US adults 35–54 are about 47% iPhone and 53% Android, and about 53% of US iPhone users are women. **Low reliability.** — [DemandSage](https://www.demandsage.com/iphone-vs-android-users/) / [Exploding Topics](https://explodingtopics.com/blog/iphone-android-users)

### Inferences
- **[Inference]** Higher AI skepticism among women suggests two things: a voice demo should say plainly what happens to the audio (whether it is stored or deleted), and a typed alternative lowers the trust barrier.
- **[Inference]** If Android is really about half of this age band, and FB's Android in-app browser blocks the microphone, a voice-only demo could fail for a large share of traffic.

### Gaps
- I found no trustworthy source on the FB in-app browser's share of ad clicks, or on subscription purchase propensity, for women 40–50.
- I found no data on which social proof this segment prefers.

## 6. Voice / AI journaling app onboarding and conversion data

### Takeaway
There's almost no public conversion data. Rosebud discloses scale metrics only.

### Cited Findings
- Rosebud had 7,500+ paying customers, "500 million words journaled," a $12.99/mo "Bloom" upgrade, and a $6M seed led by Bessemer. It launched on the web in July 2023. — [Rosebud blog](https://www.rosebud.app/blog/rosebud-raises-6m-to-expand-the-worlds-leading-ai-journal); [Fast Company](https://www.fastcompany.com/91167593/rosebud-ai-journaling-app-writing-partner)

### Inferences
- **[Inference]** No comparable app publishes funnel benchmarks, so Acuity's own experiment is the only reliable evidence source.

### Gaps
- I found no onboarding or conversion data for Reflection, AudioPen, Voicenotes, Day One or Otter within the search budget.
