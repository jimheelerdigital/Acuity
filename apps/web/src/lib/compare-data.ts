/**
 * Verified competitor facts for the comparison pages (2026-10-21):
 * /best-ai-journaling-apps, /compare, /compare/[slug], /alternatives/[slug].
 *
 * RULE: only facts seen on the company's own website, pricing page or app
 * store listing go here, each app with its source URL and `checkedAt`.
 * Anything we could not see is "unknown" and renders as "Not stated", never
 * a guess. Re-check before editing a price; when a price changes, update
 * `checkedAt` and the "Updated" date on the pages.
 *
 * Ripple's own entry: only claims we can stand behind. No encryption, SOC2,
 * HIPAA or "never used for AI training" claims (unverified).
 */
import { displayAnnual, displayMonthly } from "@/lib/pricing";

export const CHECKED_AT = "2026-10-21";

/** yes / no / partly / not stated on their pages. */
export type Tri = "yes" | "no" | "partial" | "unknown";
export type Fact = Tri | { v: Tri; note: string };

export type AppKey =
  | "ripple"
  | "rosebud"
  | "mindsera"
  | "reflection"
  | "dayone"
  | "dayora"
  | "daylio"
  | "finch"
  | "stoic"
  | "applejournal"
  | "reflectly";

export type AppFacts = {
  key: AppKey;
  name: string;
  url: string;
  /** Their own tagline or app store subtitle, as seen. */
  tagline: string;
  bestFor: string;
  platforms: string[];
  pricing: {
    /** Free tier, in words. */
    free: string;
    monthly: string | null;
    yearly: string | null;
    notes?: string;
    sourceUrl: string;
    checkedAt: string;
  };
  input: { typing: Fact; voice: Fact; photos: Fact };
  ai: { companionChat: Fact; summaries: Fact; prompts: Fact; mood: Fact; patterns: Fact };
  taskExtraction: Fact;
  habitTracking: Fact;
  /** Privacy claims in their own words (or "None stated"). */
  privacy: string;
  strengths: string[];
  /** Fair drawbacks, from the facts above. */
  drawbacks: string[];
  /** App Store rating as shown on the listing, when visible. */
  rating?: string;
  sources: string[];
};

export const RIPPLE: AppFacts = {
  key: "ripple",
  name: "Ripple",
  url: "https://goripple.io",
  tagline: "An AI life optimizer: a habit tracker, voice journal and insight tool that helps people change their lives for the better.",
  bestFor: "Turning what you say into tasks and habits",
  platforms: ["iOS", "Android", "Web"],
  pricing: {
    free: "No (7-day free trial)",
    monthly: displayMonthly(),
    yearly: displayAnnual(),
    notes: "One plan. 7-day free trial; a card is collected at the start of the trial.",
    sourceUrl: "https://goripple.io/#pricing",
    checkedAt: CHECKED_AT,
  },
  input: { typing: "yes", voice: "yes", photos: "no" },
  ai: {
    companionChat: { v: "no", note: "No chat companion" },
    summaries: { v: "yes", note: "Weekly report every Sunday" },
    prompts: { v: "no", note: "No prompts; talk about anything" },
    mood: "yes",
    patterns: { v: "yes", note: "Patterns plus Life Matrix (life areas scored over time)" },
  },
  taskExtraction: { v: "yes", note: "To-dos with the dates you mentioned" },
  habitTracking: { v: "yes", note: "Checks off habits you mention, notices skipped ones" },
  privacy: "Entries are private to your account. We don't make encryption or AI-training claims we haven't verified.",
  strengths: [
    "Turns a spoken or typed entry into a to-do list with the dates you mentioned",
    "Checks off habits you mention and notices the ones you skip",
    "Mood over time, patterns, Life Matrix and a weekly report every Sunday",
    "iOS, Android and web",
  ],
  drawbacks: [
    "Newer and smaller than the big names",
    "No free tier, only a 7-day trial",
    "No AI chat companion that talks back",
    "No photo or multimedia journaling",
    "One plan, no cheaper tier",
  ],
  rating: "Newer app, fewer ratings so far",
  sources: ["https://goripple.io"],
};

export const APPS: Record<AppKey, AppFacts> = {
  ripple: RIPPLE,

  rosebud: {
    key: "rosebud",
    name: "Rosebud",
    url: "https://www.rosebud.app",
    tagline: "Accelerate your personal growth with the world's best AI journal",
    bestFor: "An AI journal that asks follow-up questions and remembers your past entries",
    platforms: ["iOS", "Android", "Web"],
    pricing: {
      free: "No (retired Sep 30, 2026)",
      monthly: "$12.99",
      yearly: "$107.99",
      notes:
        "Bloom plan. Rosebud's help center says the free plan was retired on September 30, 2026; its homepage still says “free to use”, so check before signing up. Higher “Thrive” tiers are listed on the App Store. Student and disability discounts offered.",
      sourceUrl: "https://www.rosebud.app/",
      checkedAt: CHECKED_AT,
    },
    input: { typing: "yes", voice: "yes", photos: "unknown" },
    ai: {
      companionChat: { v: "yes", note: "Follow-up questions on each entry" },
      summaries: { v: "yes", note: "Weekly reports" },
      prompts: { v: "yes", note: "Guided prompts" },
      mood: "unknown",
      patterns: { v: "yes", note: "Patterns plus long-term memory" },
    },
    taskExtraction: { v: "partial", note: "Says action items can be added to checklists" },
    habitTracking: { v: "yes", note: "Goal tracker and AI habit suggestions" },
    privacy: "“Encrypted in transit and at rest”, “never sold, never used to train AI”, “HIPAA-aligned by design” (Rosebud's wording).",
    strengths: [
      "AI that asks follow-up questions and remembers what you said weeks ago",
      "Voice journaling with transcription",
      "Clear privacy statements, including not training AI on entries",
      "Large, well-reviewed user base",
    ],
    drawbacks: [
      "Free plan retired on September 30, 2026, per its help center",
      "$12.99 a month is at the higher end",
      "Built around conversation and reflection more than tasks and dates",
    ],
    rating: "4.9 on the App Store",
    sources: ["https://www.rosebud.app/", "https://help.rosebud.app/account/changes-to-the-free-plan", "https://apps.apple.com/us/app/id6451135127", "https://www.rosebud.app/therapy-and-coaching"],
  },

  mindsera: {
    key: "mindsera",
    name: "Mindsera",
    url: "https://www.mindsera.com",
    tagline: "AI-powered journal copilot for thinking",
    bestFor: "Structured thinking with journaling frameworks and AI analysis",
    platforms: ["iOS", "Android", "Web"],
    pricing: {
      free: "Yes (Curious plan)",
      monthly: "$14.99",
      yearly: "$129",
      notes: "Free Curious plan includes the journal, habit tracker and 52+ framework templates. Genius plan is $14.99 a month or $129 a year.",
      sourceUrl: "https://www.mindsera.com/",
      checkedAt: CHECKED_AT,
    },
    input: { typing: "yes", voice: { v: "yes", note: "Voice mode and call mode" }, photos: { v: "yes", note: "Scan paper pages" } },
    ai: {
      companionChat: { v: "yes", note: "Chat with your journal" },
      summaries: { v: "yes", note: "Weekly review emails" },
      prompts: { v: "yes", note: "Smart prompts and 52+ frameworks" },
      mood: { v: "yes", note: "Emotion analysis" },
      patterns: { v: "yes", note: "Recurring topics, personality insights" },
    },
    taskExtraction: "unknown",
    habitTracking: { v: "yes", note: "Habit tracker with streaks" },
    privacy: "“Fully encrypted at rest and in transit”; data “not used to train or improve AI models” (Mindsera's wording).",
    strengths: [
      "Dozens of thinking frameworks and templates",
      "Emotion and personality analysis",
      "A real free plan with a habit tracker",
      "Voice call mode and paper-page scanning",
    ],
    drawbacks: ["$14.99 a month is the highest monthly price on this list", "Built for analysing your thinking more than running your week"],
    rating: "4.8 on the App Store",
    sources: ["https://www.mindsera.com/", "https://apps.apple.com/us/app/id6742319153"],
  },

  reflection: {
    key: "reflection",
    name: "Reflection",
    url: "https://www.reflection.app",
    tagline: "A journal that listens, and talks back.",
    bestFor: "Guided journaling programs with an AI coach, at a low price",
    platforms: ["iOS", "Android", "Mac", "Web"],
    pricing: {
      free: "Yes (Free Forever plan)",
      monthly: "$8",
      yearly: "$69",
      notes: "Premium is $8 a month or $5.75 a month billed annually ($69 a year), with a 7-day free trial. The free plan includes unlimited entries.",
      sourceUrl: "https://www.reflection.app/pricing",
      checkedAt: CHECKED_AT,
    },
    input: { typing: "yes", voice: { v: "yes", note: "Voice with transcription, voice calls" }, photos: { v: "yes", note: "Photos and handwriting scan" } },
    ai: {
      companionChat: { v: "yes", note: "AI coach, “Ask Your Journal”" },
      summaries: { v: "yes", note: "Weekly and monthly reviews" },
      prompts: { v: "yes", note: "100+ guided programs" },
      mood: { v: "yes", note: "Sentiment insights" },
      patterns: { v: "yes", note: "Analytics and reviews" },
    },
    taskExtraction: "unknown",
    habitTracking: "unknown",
    privacy: "“Encrypted with AES-256 at rest, and TLS in transit”; entries “never used to train AI models”, “not even on our free plan” (Reflection's wording).",
    strengths: ["Generous free plan", "100+ guided programs", "Lowest paid price among the AI chat journals here", "Mac and web apps as well as phones"],
    drawbacks: ["No to-do list or habit tracking stated on its pages", "Program-led, which suits some people more than others"],
    rating: "4.7 on the App Store",
    sources: ["https://www.reflection.app/", "https://www.reflection.app/pricing", "https://apps.apple.com/us/app/id1504547616"],
  },

  dayone: {
    key: "dayone",
    name: "Day One",
    url: "https://dayoneapp.com",
    tagline: "Your journal for life.",
    bestFor: "A lifelong, photo-rich journal you keep for decades",
    platforms: ["iPhone", "iPad", "Apple Watch", "Android", "Mac", "Windows", "Web"],
    pricing: {
      free: "Yes (Basic)",
      monthly: null,
      yearly: "$49.99 Silver / $74.99 Gold",
      notes: "Basic is free (1 photo per entry). Silver is $49.99 a year; Gold is $74.99 a year and adds the AI features. The App Store also lists a monthly Silver option.",
      sourceUrl: "https://dayoneapp.com/pricing/",
      checkedAt: CHECKED_AT,
    },
    input: { typing: "yes", voice: { v: "yes", note: "Audio recording with transcription" }, photos: { v: "yes", note: "Photos, video, drawings" } },
    ai: {
      companionChat: { v: "partial", note: "Daily Chat (Gold plan)" },
      summaries: { v: "partial", note: "AI summaries (Gold plan)" },
      prompts: { v: "yes", note: "Prompts and templates" },
      mood: "unknown",
      patterns: "unknown",
    },
    taskExtraction: "unknown",
    habitTracking: { v: "partial", note: "Journaling streaks only" },
    privacy: "“End-to-end encryption”; “your entries are 100% private” (Day One's wording).",
    strengths: [
      "End-to-end encryption, even on the free plan",
      "Photos, video, audio and drawings in entries",
      "Apps on nearly every device, including Windows and Apple Watch",
      "A long track record and a very large number of reviews",
    ],
    drawbacks: ["AI features sit on the $74.99 Gold plan", "A place to keep entries, not a system that acts on them"],
    rating: "4.8 on the App Store",
    sources: ["https://dayoneapp.com/", "https://dayoneapp.com/pricing/"],
  },

  dayora: {
    key: "dayora",
    name: "Dayora",
    url: "https://dayora.ai",
    tagline: "A free AI journal app that helps you notice your patterns.",
    bestFor: "A generous free AI journal, if you're fine with entries used for training",
    platforms: ["Web"],
    pricing: {
      free: "Yes (free core)",
      monthly: "$9",
      yearly: "$72",
      notes: "Free core includes unlimited entries, voice with transcription and mood tracking. Plus is $9 a month or $72 a year ($6 a month for people who join before November 1, 2026).",
      sourceUrl: "https://dayora.ai/",
      checkedAt: CHECKED_AT,
    },
    input: { typing: "yes", voice: { v: "yes", note: "Voice with transcription" }, photos: "unknown" },
    ai: {
      companionChat: { v: "yes", note: "A reply to every entry, Reflect conversations" },
      summaries: { v: "partial", note: "Daily letters and reports on Plus" },
      prompts: "unknown",
      mood: { v: "yes", note: "5-point mood" },
      patterns: { v: "yes", note: "Patterns, relationship insights" },
    },
    taskExtraction: "unknown",
    habitTracking: "unknown",
    privacy: "States it “may use your entries to train and improve the AI models”, and that it never sells entries (Dayora's wording).",
    strengths: ["A lot included free, including voice and mood", "Editable AI memory", "Relationship insights (“Your Circle”)", "Low Plus price"],
    drawbacks: ["Says it may use your entries to train AI models", "We found no native iPhone or Android app listing", "No task or habit features stated"],
    sources: ["https://dayora.ai/", "https://dayora.ai/privacy"],
  },

  daylio: {
    key: "daylio",
    name: "Daylio",
    url: "https://daylio.net",
    tagline: "Self-Care Bullet Journal with Goals Mood Diary & Happiness Tracker",
    bestFor: "Logging mood and activities in two taps, without writing",
    platforms: ["iOS", "Android"],
    pricing: {
      free: "Yes (Premium extra)",
      monthly: null,
      yearly: null,
      notes: "Free app with a Premium upgrade. The App Store lists in-app purchases from $4.99 to $59.99 without labelling monthly vs yearly.",
      sourceUrl: "https://apps.apple.com/us/app/id1194023242",
      checkedAt: CHECKED_AT,
    },
    input: { typing: { v: "yes", note: "Notes on each entry" }, voice: { v: "yes", note: "Voice memos" }, photos: "yes" },
    ai: {
      companionChat: "no",
      summaries: "no",
      prompts: "unknown",
      mood: { v: "yes", note: "Tap-based mood log" },
      patterns: { v: "yes", note: "Stats and charts" },
    },
    taskExtraction: "no",
    habitTracking: { v: "yes", note: "Daily, weekly or monthly goals" },
    privacy: "“We don't send your data to our servers”; data “stored locally on your phone” (Daylio's wording).",
    strengths: ["Fastest logging on this list: a couple of taps", "Data stays on your phone", "Useful mood and activity charts", "Free to start, very large user base"],
    drawbacks: ["No AI reading your words", "No to-do list", "Phone only"],
    rating: "4.8 on the App Store",
    sources: ["https://daylio.net/", "https://apps.apple.com/us/app/id1194023242"],
  },

  finch: {
    key: "finch",
    name: "Finch",
    url: "https://finchcare.com",
    tagline: "Your new self-care best friend.",
    bestFor: "Gentle, game-like self-care built around a virtual pet",
    platforms: ["iOS", "Android"],
    pricing: {
      free: "Yes (Finch Plus extra)",
      monthly: null,
      yearly: null,
      notes: "Free with an optional Finch Plus upgrade. The App Store lists in-app purchases from $5.99 to $69.99 without labelling monthly vs yearly.",
      sourceUrl: "https://apps.apple.com/us/app/id1528595748",
      checkedAt: CHECKED_AT,
    },
    input: { typing: "yes", voice: "unknown", photos: "unknown" },
    ai: { companionChat: "unknown", summaries: "unknown", prompts: { v: "yes", note: "Journaling prompts" }, mood: { v: "yes", note: "Mood check-ins" }, patterns: { v: "partial", note: "Wellness insights" } },
    taskExtraction: "unknown",
    habitTracking: { v: "yes", note: "Goals and habits for your pet's adventures" },
    privacy: "None stated beyond its privacy policy.",
    strengths: ["Warm, low-pressure design", "Free to use", "Turns small self-care goals into a game", "Huge, very positive review count"],
    drawbacks: ["Not built to catch to-dos from what you say", "The pet framing isn't for everyone"],
    rating: "4.9 on the App Store",
    sources: ["https://finchcare.com/", "https://apps.apple.com/us/app/id1528595748"],
  },

  stoic: {
    key: "stoic",
    name: "Stoic",
    url: "https://www.getstoic.com",
    tagline: "AI journaling, Gratitude diary",
    bestFor: "Morning and evening routines that mix journaling, mood, habits and meditation",
    platforms: ["iOS", "Android", "Mac", "Web"],
    pricing: {
      free: "Free download; paid tiers",
      monthly: null,
      yearly: null,
      notes: "The App Store lists Premium from $6.99 to $39.99, an AI tier from $12.99 to $99.99 and a $299 lifetime option, without labelling monthly vs yearly.",
      sourceUrl: "https://apps.apple.com/us/app/id1312926037",
      checkedAt: CHECKED_AT,
    },
    input: { typing: "yes", voice: { v: "yes", note: "Voice notes" }, photos: { v: "yes", note: "Photos and video" } },
    ai: { companionChat: "unknown", summaries: { v: "yes", note: "AI reflections" }, prompts: { v: "yes", note: "AI-personalised prompts" }, mood: { v: "yes", note: "Mood trends" }, patterns: { v: "partial", note: "Mood trends" } },
    taskExtraction: { v: "no", note: "Has a planner and to-do list you fill in yourself" },
    habitTracking: { v: "yes", note: "Habits, streaks and badges" },
    privacy: "Journals “securely stored on your devices… nobody can access them but you” (Stoic's wording).",
    strengths: ["Structured morning and evening routines", "Habits, meditation and breathing in one app", "Planner and to-do list built in", "Editors' Choice on the App Store"],
    drawbacks: ["Pricing is spread across several tiers", "You fill in the planner yourself; it isn't pulled from your entries"],
    rating: "4.8 on the App Store",
    sources: ["https://www.getstoic.com/", "https://apps.apple.com/us/app/id1312926037"],
  },

  applejournal: {
    key: "applejournal",
    name: "Apple Journal",
    url: "https://support.apple.com/guide/iphone/journal",
    tagline: "Apple's built-in app for reflecting on everyday moments",
    bestFor: "A free, private journal already on your iPhone",
    platforms: ["iPhone (iOS 17.2+)"],
    pricing: {
      free: "Built in",
      monthly: null,
      yearly: null,
      notes: "Comes with iOS; Apple lists no price.",
      sourceUrl: "https://www.apple.com/newsroom/2023/12/apple-launches-journal-app-a-new-app-for-reflecting-on-everyday-moments/",
      checkedAt: CHECKED_AT,
    },
    input: { typing: "yes", voice: { v: "yes", note: "Audio recordings" }, photos: { v: "yes", note: "Photos, videos, locations" } },
    ai: { companionChat: "no", summaries: "unknown", prompts: { v: "yes", note: "Reflection prompts" }, mood: "unknown", patterns: "unknown" },
    taskExtraction: "no",
    habitTracking: "unknown",
    privacy: "“All Journal entries are end-to-end encrypted when stored in iCloud”; suggestions “created on device” (Apple's wording).",
    strengths: ["Free and already installed", "Suggestions from your photos, places, music and workouts", "End-to-end encrypted in iCloud", "Face ID lock"],
    drawbacks: ["Apple devices only", "No to-dos, habits or weekly summary", "No Android or web"],
    sources: ["https://www.apple.com/newsroom/2023/12/apple-launches-journal-app-a-new-app-for-reflecting-on-everyday-moments/"],
  },

  reflectly: {
    key: "reflectly",
    name: "Reflectly",
    url: "https://reflectlyapp.com",
    tagline: "The World's First Intelligent Journal",
    bestFor: "Light, upbeat mood journaling for beginners",
    platforms: ["iOS", "Android"],
    pricing: {
      free: "Free download; Premium extra",
      monthly: null,
      yearly: null,
      notes: "Free with Premium. The App Store lists Premium in-app purchases from $4.99 to $59.99 without labelling monthly vs yearly.",
      sourceUrl: "https://apps.apple.com/us/app/id1241229134",
      checkedAt: CHECKED_AT,
    },
    input: { typing: "yes", voice: "unknown", photos: "unknown" },
    ai: { companionChat: "unknown", summaries: { v: "yes", note: "Daily, weekly and monthly overviews" }, prompts: { v: "yes", note: "AI-guided questions" }, mood: "yes", patterns: { v: "partial", note: "Overviews" } },
    taskExtraction: "unknown",
    habitTracking: "unknown",
    privacy: "None stated on its site beyond a link to its privacy policy.",
    strengths: ["Friendly, guided questions make starting easy", "Simple mood tracking", "Daily, weekly and monthly overviews"],
    drawbacks: ["Typing-first; no voice input stated", "No to-do or habit features stated"],
    rating: "4.6 on the App Store",
    sources: ["https://reflectlyapp.com/", "https://apps.apple.com/us/app/id1241229134"],
  },
};

export const COMPETITOR_KEYS = Object.keys(APPS).filter((k) => k !== "ripple") as Exclude<AppKey, "ripple">[];

export const COMPARE_SLUGS = [
  "ripple-vs-rosebud",
  "ripple-vs-mindsera",
  "ripple-vs-reflection",
  "ripple-vs-day-one",
  "ripple-vs-dayora",
  "ripple-vs-daylio",
  "ripple-vs-finch",
  "ripple-vs-stoic",
  "ripple-vs-apple-journal",
  "ripple-vs-reflectly",
] as const;
export type CompareSlug = (typeof COMPARE_SLUGS)[number];

export const ALTERNATIVE_SLUGS = ["rosebud", "day-one", "mindsera", "reflection", "daylio"] as const;
export type AlternativeSlug = (typeof ALTERNATIVE_SLUGS)[number];

/** Compare page for an app, if there is one. */
export const COMPARE_SLUG_FOR: Partial<Record<AppKey, CompareSlug>> = {
  rosebud: "ripple-vs-rosebud",
  mindsera: "ripple-vs-mindsera",
  reflection: "ripple-vs-reflection",
  dayone: "ripple-vs-day-one",
  dayora: "ripple-vs-dayora",
  daylio: "ripple-vs-daylio",
  finch: "ripple-vs-finch",
  stoic: "ripple-vs-stoic",
  applejournal: "ripple-vs-apple-journal",
  reflectly: "ripple-vs-reflectly",
};

export function factValue(f: Fact): Tri {
  return typeof f === "string" ? f : f.v;
}

/** One-word label for dense tables. */
export function triShort(f: Fact): string {
  const v = factValue(f);
  return v === "yes" ? "Yes" : v === "no" ? "No" : v === "partial" ? "Partly" : "Not stated";
}

/** Short label for a table cell. */
export function triLabel(f: Fact): string {
  const v = factValue(f);
  const base = v === "yes" ? "Yes" : v === "no" ? "No" : v === "partial" ? "Partly" : "Not stated";
  return typeof f === "string" ? base : `${base}: ${f.note}`;
}

export function priceSummary(a: AppFacts): string {
  const p = a.pricing;
  if (p.monthly && p.yearly) return `${p.monthly}/month or ${p.yearly}/year`;
  if (p.yearly) return `${p.yearly} per year`;
  if (p.monthly) return `${p.monthly}/month`;
  if (a.key === "applejournal") return "Free with iOS";
  return "See app store (tiers not labelled)";
}

/** Rows for a two-app side-by-side table. */
export function comparisonRows(them: AppFacts, ripple: AppFacts = RIPPLE): { label: string; them: string; ripple: string }[] {
  return [
    { label: "Best for", them: them.bestFor, ripple: ripple.bestFor },
    { label: "Price", them: priceSummary(them), ripple: priceSummary(ripple) },
    { label: "Free tier", them: them.pricing.free, ripple: ripple.pricing.free },
    { label: "Platforms", them: them.platforms.join(", "), ripple: ripple.platforms.join(", ") },
    { label: "Voice input", them: triLabel(them.input.voice), ripple: triLabel(ripple.input.voice) },
    { label: "Photos in entries", them: triLabel(them.input.photos), ripple: triLabel(ripple.input.photos) },
    { label: "AI chat that talks back", them: triLabel(them.ai.companionChat), ripple: triLabel(ripple.ai.companionChat) },
    { label: "Summaries", them: triLabel(them.ai.summaries), ripple: triLabel(ripple.ai.summaries) },
    { label: "Mood tracking", them: triLabel(them.ai.mood), ripple: triLabel(ripple.ai.mood) },
    { label: "Patterns", them: triLabel(them.ai.patterns), ripple: triLabel(ripple.ai.patterns) },
    { label: "To-dos from what you say", them: triLabel(them.taskExtraction), ripple: triLabel(ripple.taskExtraction) },
    { label: "Habit tracking", them: triLabel(them.habitTracking), ripple: triLabel(ripple.habitTracking) },
    { label: "Privacy, as each app states it", them: them.privacy, ripple: ripple.privacy },
  ];
}
