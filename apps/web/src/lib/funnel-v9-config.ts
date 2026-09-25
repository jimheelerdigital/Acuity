import type { Mood } from "@/components/mood-avatar";
/**
 * /start-test — the v9 evidence-based funnel (2026-09-24, per Keenan).
 *
 * Built from reports/Web funnel conversion evidence.md:
 *   - one-tap recognition question on screen 1, progress bar (Calm)
 *   - a long quiz (~20 screens): light context → reassurance → sliders
 *     between opposing statements (Noom, Liven) → mid-quiz real review →
 *     a static "how Ripple works" sample → preference + commitment screens
 *   - a loader that names what it is doing (labor illusion, Buell & Norton)
 *   - EMAIL-ONLY gate, "See my results" (Noom) — the account is created
 *     behind it with no password; the password comes after payment
 *   - a result that mirrors her own answers + a first-week plan (Calm)
 *   - paywall: annual preselected as $/mo next to monthly, Blinkist
 *     reminder timeline, reviews + FAQ under the button, no timers or
 *     fake discounts; Stripe Embedded Checkout puts Apple Pay / Google Pay
 *     above the card form
 *
 * Copy rules (docs/acuity-positioning.md, _design/DESIGN_SYSTEM.md §7):
 * "debrief", never "journal"/"brain dump", no fixed time of day, no
 * recording-duration claims, mirror not coach, no rhetorical-question
 * hero, no invented numbers. Reviews are the REAL quotes already shipped
 * in PAYWALL_TESTIMONIALS_V2[0-2] and the BWK App Store review.
 */

export const V9_FLOW_VERSION = "v9-test";
export const V9_PATH = "/start-test";

export type V9Option = { id: string; label: string };
/** chip = what she taps; task = how Ripple would write it on the list. */
export type V9WeekItem = { id: string; chip: string; task: string };

export type V9Step =
  | { id: string; kind: "single"; title: string; sub?: string; options: V9Option[] }
  | { id: string; kind: "multi"; title: string; sub?: string; options: V9Option[] }
  | { id: string; kind: "slider"; title: string; left: string; right: string }
  /** One statement, two big buttons (2026-09-25, per Keenan: "one question at a time with less multiple choice"). */
  | { id: string; kind: "statement"; statement: string; title?: string; /** Feeling shown by the MoodAvatar on the card. */ mood: Mood }
  /** "What's on your list this week?" chips (2026-09-25, Keenan). Each chip
   *  has the task Ripple would catch from it; the loader and result reuse
   *  the picks. Stored in answers.multi[id]. */
  | { id: string; kind: "week"; title: string; sub?: string; items: V9WeekItem[] }
  | { id: string; kind: "info"; screen: "reassure" | "review" | "how" }
  | { id: string; kind: "name" }
  | { id: string; kind: "loader" }
  | { id: string; kind: "email" }
  | { id: string; kind: "result" }
  | { id: string; kind: "plan" }
  | { id: string; kind: "paywall" }
  | { id: string; kind: "checkout" }
  | { id: string; kind: "download" };

export const V9_HOOK_LINE = "Ripple keeps track of what you say, so your head doesn't have to.";

export const V9_STEPS: V9Step[] = [
  // Screen 1: a yes/no recognition statement (the /start split-test opener).
  { id: "hook", kind: "statement", statement: "My head\u2019s too full and I keep forgetting things.", mood: "overloaded" },
  {
    id: "age",
    kind: "single",
    title: "Which age range are you in?",
    options: [
      { id: "u35", label: "Under 35" },
      { id: "35", label: "35 to 44" },
      { id: "45", label: "45 to 54" },
      { id: "55", label: "55 or older" },
    ],
  },
  {
    id: "plate",
    kind: "multi",
    title: "What's on your plate right now?",
    sub: "Pick all that apply.",
    options: [
      { id: "kids", label: "Kids" },
      { id: "parents", label: "Aging parents" },
      { id: "work", label: "A demanding job" },
      { id: "partner", label: "A partner" },
      { id: "house", label: "Running the house" },
      { id: "health", label: "My own health" },
    ],
  },
  { id: "st-remember", kind: "statement", statement: "I\u2019m the one who remembers everything for everyone.", mood: "stretched" },
  { id: "st-slip", kind: "statement", statement: "Things I mean to do slip through the cracks.", mood: "worried" },
  {
    id: "pileup",
    kind: "single",
    title: "When do the thoughts pile up most?",
    options: [
      { id: "morning", label: "First thing in the morning" },
      { id: "quiet", label: "Once the house goes quiet" },
      { id: "night", label: "In the middle of the night" },
      { id: "allday", label: "All day, honestly" },
    ],
  },
  { id: "reassure", kind: "info", screen: "reassure" },
  { id: "s-name", kind: "slider", title: "Where do you land?", left: "I know what's bothering me", right: "I can't quite name it" },
  { id: "st-myself", kind: "statement", statement: "I put my own stuff last.", mood: "drained" },
  { id: "s-repeat", kind: "slider", title: "Where do you land?", left: "I can see my own patterns", right: "The same weeks keep repeating" },
  { id: "st-blur", kind: "statement", statement: "Whole weeks blur together and I can\u2019t say where they went.", mood: "foggy" },
  { id: "s-lists", kind: "slider", title: "Where do you land?", left: "Lists and notebooks work for me", right: "I've tried them. They don't stick" },
  {
    id: "week",
    kind: "week",
    title: "What\u2019s on your list this week?",
    sub: "Tap everything that\u2019s in your head right now.",
    items: [
      { id: "school", chip: "A school form", task: "Sign the school form" },
      { id: "mom", chip: "Mom\u2019s appointment", task: "Book Mom\u2019s appointment" },
      { id: "deadline", chip: "A work deadline", task: "Get the work deadline done" },
      { id: "bills", chip: "Bills", task: "Pay the bills" },
      { id: "groceries", chip: "Groceries", task: "Order the groceries" },
      { id: "dentist", chip: "The dentist", task: "Book the dentist" },
      { id: "gift", chip: "A birthday gift", task: "Get the birthday gift" },
      { id: "pickups", chip: "Pickups and drop-offs", task: "Sort this week\u2019s pickups" },
      { id: "emails", chip: "Emails I owe", task: "Answer the emails you owe" },
      { id: "callback", chip: "Calling someone back", task: "Call them back" },
      { id: "workout", chip: "Fitting in a workout", task: "Fit in a workout" },
      { id: "me", chip: "Time for me", task: "Block an hour for yourself" },
    ],
  },
  { id: "review", kind: "info", screen: "review" },
  { id: "how", kind: "info", screen: "how" },
  { id: "st-talk", kind: "statement", statement: "Saying things out loud helps me sort them out.", mood: "talking" },
  {
    id: "talktype",
    kind: "single",
    title: "How would you rather get it out of your head?",
    options: [
      { id: "talk", label: "Talking it out" },
      { id: "type", label: "Typing it" },
      { id: "both", label: "Both, depending on the day" },
    ],
  },
  {
    id: "notice",
    kind: "multi",
    title: "What should Ripple notice for you?",
    sub: "Pick all that apply.",
    options: [
      { id: "drains", label: "What drains me" },
      { id: "lifts", label: "What lifts me" },
      { id: "habits", label: "Habits I'm building" },
      { id: "putoff", label: "What I keep putting off" },
    ],
  },
  {
    id: "when",
    kind: "single",
    title: "Where could you talk to Ripple?",
    sub: "Any time of day works. There's no minimum.",
    options: [
      { id: "car", label: "In the car" },
      { id: "walk", label: "On a walk" },
      { id: "quiet", label: "Once the house goes quiet" },
      { id: "whenever", label: "Whenever it hits me" },
    ],
  },
  { id: "st-lighter", kind: "statement", statement: "I want to feel lighter without adding another chore.", mood: "hopeful", title: "Last one. True for you?" },
  {
    id: "commit",
    kind: "single",
    title: "Ready to stop carrying all of it in your head?",
    options: [
      { id: "ready", label: "Yes, I'm ready" },
      { id: "try", label: "I want to try it" },
    ],
  },
  { id: "name", kind: "name" },
  { id: "loader", kind: "loader" },
  { id: "email", kind: "email" },
  { id: "result", kind: "result" },
  { id: "plan", kind: "plan" },
  { id: "paywall", kind: "paywall" },
  { id: "checkout", kind: "checkout" },
  { id: "download", kind: "download" },
];

/** Dashboard label per screen (admin Funnel tab, "Test" view). */
const V9_SHORT: Record<string, string> = {
  hook: "Head too full? (screen 1, yes/no)",
  age: "Age range",
  plate: "On your plate",
  "st-remember": "Yes/no: remembers for everyone",
  "st-slip": "Yes/no: things slip",
  pileup: "When thoughts pile up",
  reassure: "You're not the only one",
  "s-name": "Slider: can't name it",
  "st-myself": "Yes/no: own stuff last",
  "s-repeat": "Slider: weeks repeat",
  "st-blur": "Yes/no: weeks blur",
  "s-lists": "Slider: lists don't stick",
  week: "This week\u2019s list (chips)",
  review: "Reviews",
  how: "How Ripple works (demo)",
  "st-talk": "Yes/no: talking helps",
  talktype: "Talk or type",
  notice: "What Ripple notices",
  when: "Where you'd talk",
  "st-lighter": "Yes/no: lighter, no chore",
  commit: "Ready?",
  name: "Name",
  loader: "Loader",
  email: "Email gate",
  result: "Result",
  plan: "First week plan",
  paywall: "Paywall",
  checkout: "Checkout",
  download: "Success / download",
};

/** Dashboard label per screen (admin Funnel tab, "Test" view), numbered in funnel order. */
export const V9_STEP_LABELS: Record<string, string> = Object.fromEntries(
  V9_STEPS.map((st, i) => [st.id, `${i + 1}. ${V9_SHORT[st.id] ?? st.id}`])
);

/** Steps that count toward the progress bar (the quiz up to the result). */
export const V9_PROGRESS_END = V9_STEPS.findIndex((s) => s.id === "result");

/** Real quotes only (PAYWALL_TESTIMONIALS_V2[0-2] + the App Store review). */
export const V9_REVIEWS = [
  { quote: "The task manager is a lifesaver!! I never forget anything anymore", name: "App Store review" },
  { quote: "I found out I mention quitting my job every Monday. I never noticed until the weekly report showed me. That one pattern changed everything.", name: "Sarah M." },
  { quote: "Week 3, Ripple told me I bring up my mom every time I’m stressed about work. I’ve been in therapy for a year and never connected those.", name: "Priya R." },
];

/** Static "how Ripple works" samples, picked by what's on her plate. */
export const V9_SAMPLES: Record<"kids" | "parents" | "work", { said: string; tasks: string[]; mood: string; pattern: string }> = {
  kids: {
    said: "Emma's form is due Friday, I still haven't called the plumber, and I snapped at Jake again. I think I'm just tired.",
    tasks: ["Sign Emma's form before Friday", "Call the plumber"],
    mood: "Stretched thin",
    pattern: "Tired and short-tempered keep showing up on the same days.",
  },
  parents: {
    said: "Mom's appointment moved to Thursday, I need to refill her prescription, and work wants the report early. I haven't sat down all week.",
    tasks: ["Take Mom to her appointment Thursday", "Refill Mom's prescription", "Send the report early"],
    mood: "Running on empty",
    pattern: "Weeks with Mom's appointments are the weeks you skip your own walks.",
  },
  work: {
    said: "Three deadlines this week, I promised Dana feedback, and I still haven't booked my own checkup. I keep saying I'll do it.",
    tasks: ["Give Dana feedback", "Book your checkup"],
    mood: "Pulled in every direction",
    pattern: "Your own appointments are what you push back first.",
  },
};

export const V9_FAQ = [
  {
    q: "When will I be charged?",
    a: "Not today. Your 7 days are free. We email you a reminder on day 4, and your plan starts on day 7 unless you cancel.",
  },
  {
    q: "Can I cancel?",
    a: "Yes, any time from your account settings. Cancel before day 7 and you pay nothing.",
  },
  {
    q: "Is this therapy?",
    a: "No. Ripple is a mirror, not a coach. It keeps track of what you say and shows you your own patterns. It doesn't give medical advice.",
  },
  {
    q: "Where do my debriefs go?",
    a: "Into your private account. You can delete any debrief, or your whole account, whenever you want.",
  },
];

/** Names her state from her own answers (a mirror, not a diagnosis). */
export function v9StateName(a: {
  plate: string[];
  sliders: Record<string, number>;
  pileup?: string;
  /** Yes/no statement answers ("yes" | "no"), keyed by step id. */
  said?: Record<string, string>;
}): { name: string; line: string } {
  const s = (id: string) => a.sliders[id] ?? 3;
  const yes = (id: string) => a.said?.[id] === "yes";
  if (yes("st-remember") && a.plate.length >= 2) {
    return { name: "The Keeper", line: "You hold the plan for everyone, and nobody holds it for you." };
  }
  if (yes("st-slip")) {
    return { name: "The Juggler", line: "Plenty gets done. The things that fall are usually your own." };
  }
  if (a.pileup === "night" || s("s-name") >= 4) {
    return { name: "The Replayer", line: "Your mind keeps turning things over, looking for somewhere to set them down." };
  }
  if (s("s-repeat") >= 4 || yes("st-blur")) {
    return { name: "The Loop", line: "The weeks blur because the same things keep coming back around." };
  }
  return { name: "The Carrier", line: "You carry more than you say out loud." };
}

// ─── Per-brand configs (2026-09-25: /start-test-bwk, per Keenan) ───────────
// One engine (components/funnel-v9.tsx), two brands. Ripple = the constants
// above; BWK = a men's rewrite in the Build With Key voice (direct, no
// therapy talk) on the dusk theme. Same positioning rules: "debrief", no
// fixed time of day, no duration claims, mirror not coach, real reviews only.

export type V9Brand = "ripple" | "bwk";

export type V9Sample = { match: string[]; said: string; tasks: string[]; mood: string; pattern: string };

export interface V9Config {
  brand: V9Brand;
  flowVersion: string;
  path: string;
  theme: "light" | "dusk";
  hookLine: string;
  steps: V9Step[];
  stepLabels: Record<string, string>;
  progressEnd: number;
  reviews: { quote: string; name: string }[];
  /** "How Ripple works" demo: first sample whose match hits a plate answer, else the last. */
  samples: V9Sample[];
  faq: { q: string; a: string }[];
  stateName: typeof v9StateName;
  reassure: { title: string; body: string; body2: string; things: string[]; cta: string };
  plateLabels: Record<string, string>;
  milestones: Record<string, string>;
  resultOutro: string;
}

function numberedLabels(steps: V9Step[], short: Record<string, string>): Record<string, string> {
  return Object.fromEntries(steps.map((st, i) => [st.id, `${i + 1}. ${short[st.id] ?? st.id}`]));
}

export const RIPPLE_V9: V9Config = {
  brand: "ripple",
  flowVersion: V9_FLOW_VERSION,
  path: V9_PATH,
  theme: "light",
  hookLine: V9_HOOK_LINE,
  steps: V9_STEPS,
  stepLabels: V9_STEP_LABELS,
  progressEnd: V9_PROGRESS_END,
  reviews: V9_REVIEWS,
  samples: [
    { match: ["kids"], ...V9_SAMPLES.kids },
    { match: ["parents"], ...V9_SAMPLES.parents },
    { match: [], ...V9_SAMPLES.work },
  ],
  faq: V9_FAQ,
  stateName: v9StateName,
  reassure: {
    title: "You’re not the only one holding all of it.",
    body: "Most of what fills a busy head isn’t one big problem. It’s fifty small things for other people, with nowhere to set them down.",
    body2: "Ripple is the place to put them. You talk or type, and it keeps track.",
    things: ["Emma's form", "Refill Mom's meds", "Call the plumber", "Dentist Thursday", "Reply to Dana", "Birthday gift", "Book my checkup", "Groceries"],
    cta: "That’s me",
  },
  plateLabels: { kids: "your kids", parents: "your parents", work: "work", partner: "your partner", house: "the house", health: "your health" },
  milestones: { week: "Halfway there.", talktype: "You're doing great. A few more.", name: "Almost done." },
  resultOutro: "None of this means something is wrong with you. It means there’s nowhere to set it down. That’s the part Ripple does.",
};

export const BWK_V9_STEPS: V9Step[] = [
  { id: "hook", kind: "statement", statement: "I know what I should be doing. I’m just not doing it.", mood: "stuck" },
  {
    id: "age",
    kind: "single",
    title: "Which age range are you in?",
    options: [
      { id: "u25", label: "Under 25" },
      { id: "25", label: "25 to 34" },
      { id: "35", label: "35 to 44" },
      { id: "45", label: "45 or older" },
    ],
  },
  {
    id: "plate",
    kind: "multi",
    title: "What are you carrying right now?",
    sub: "Pick all that apply.",
    options: [
      { id: "work", label: "A demanding job" },
      { id: "side", label: "Building something on the side" },
      { id: "training", label: "Training" },
      { id: "money", label: "Money pressure" },
      { id: "family", label: "Family" },
      { id: "partner", label: "A relationship" },
    ],
  },
  { id: "st-plan", kind: "statement", statement: "I make the plan. Then I don’t follow it.", mood: "frustrated" },
  { id: "st-slip", kind: "statement", statement: "Things I say I’ll do slip for weeks.", mood: "worried" },
  {
    id: "pileup",
    kind: "single",
    title: "When does your head get loudest?",
    options: [
      { id: "morning", label: "First thing in the morning" },
      { id: "drive", label: "On the drive" },
      { id: "night", label: "Late at night" },
      { id: "allday", label: "All day, honestly" },
    ],
  },
  { id: "reassure", kind: "info", screen: "reassure" },
  { id: "s-name", kind: "slider", title: "Where do you land?", left: "I know what's holding me back", right: "I can't pin it down" },
  { id: "st-myself", kind: "statement", statement: "My own goals always come last.", mood: "drained" },
  { id: "s-repeat", kind: "slider", title: "Where do you land?", left: "I can see my own patterns", right: "Same weeks, same excuses" },
  { id: "st-blur", kind: "statement", statement: "Months go by and I can’t say what I actually built.", mood: "foggy" },
  { id: "s-lists", kind: "slider", title: "Where do you land?", left: "Apps and lists work for me", right: "I've tried them. They don't stick" },
  {
    id: "week",
    kind: "week",
    title: "What\u2019s on your list this week?",
    sub: "Tap everything that\u2019s in your head right now.",
    items: [
      { id: "invoices", chip: "Invoices", task: "Send the invoices" },
      { id: "deadline", chip: "A work deadline", task: "Hit the deadline" },
      { id: "gym", chip: "Gym sessions", task: "Get your sessions in" },
      { id: "bills", chip: "Bills", task: "Pay the bills" },
      { id: "car", chip: "Car stuff", task: "Deal with the car" },
      { id: "side", chip: "The side project", task: "Move the side project forward" },
      { id: "calls", chip: "Calls to return", task: "Return the calls" },
      { id: "kids", chip: "Kids\u2019 stuff", task: "Handle the kids\u2019 stuff" },
      { id: "plans", chip: "Plans with my partner", task: "Lock in plans with your partner" },
      { id: "paperwork", chip: "Paperwork", task: "Get the paperwork done" },
      { id: "house", chip: "Fixes around the house", task: "Fix the thing at home" },
      { id: "followup", chip: "People to follow up with", task: "Follow up with people" },
    ],
  },
  { id: "review", kind: "info", screen: "review" },
  { id: "how", kind: "info", screen: "how" },
  { id: "st-talk", kind: "statement", statement: "Saying it out loud helps me think straight.", mood: "talking" },
  {
    id: "talktype",
    kind: "single",
    title: "How would you rather get it out of your head?",
    options: [
      { id: "talk", label: "Talking it out" },
      { id: "type", label: "Typing it" },
      { id: "both", label: "Both, depending on the day" },
    ],
  },
  {
    id: "notice",
    kind: "multi",
    title: "What should Ripple track for you?",
    sub: "Pick all that apply.",
    options: [
      { id: "drains", label: "What drains me" },
      { id: "fires", label: "What fires me up" },
      { id: "habits", label: "Habits I'm building" },
      { id: "putoff", label: "What I keep putting off" },
    ],
  },
  {
    id: "when",
    kind: "single",
    title: "Where could you talk to Ripple?",
    sub: "Any time of day works. There's no minimum.",
    options: [
      { id: "truck", label: "In the truck or car" },
      { id: "walk", label: "On a walk" },
      { id: "gym", label: "After training" },
      { id: "whenever", label: "Whenever it hits me" },
    ],
  },
  { id: "st-lighter", kind: "statement", statement: "I want a system, not another app to babysit.", mood: "hopeful", title: "Last one. True for you?" },
  {
    id: "commit",
    kind: "single",
    title: "Ready to stop running it all from memory?",
    options: [
      { id: "ready", label: "Yes, let's go" },
      { id: "try", label: "I want to try it" },
    ],
  },
  { id: "name", kind: "name" },
  { id: "loader", kind: "loader" },
  { id: "email", kind: "email" },
  { id: "result", kind: "result" },
  { id: "plan", kind: "plan" },
  { id: "paywall", kind: "paywall" },
  { id: "checkout", kind: "checkout" },
  { id: "download", kind: "download" },
];

const BWK_SHORT: Record<string, string> = {
  hook: "Know it, not doing it? (screen 1, yes/no)",
  age: "Age range",
  plate: "What you're carrying",
  "st-plan": "Yes/no: plan, no follow-through",
  "st-slip": "Yes/no: things slip for weeks",
  pileup: "When head gets loudest",
  reassure: "You're not lazy",
  "s-name": "Slider: can't pin it down",
  "st-myself": "Yes/no: own goals last",
  "s-repeat": "Slider: same weeks",
  "st-blur": "Yes/no: months go by",
  "s-lists": "Slider: lists don't stick",
  week: "This week\u2019s list (chips)",
  review: "Reviews",
  how: "How Ripple works (demo)",
  "st-talk": "Yes/no: out loud helps",
  talktype: "Talk or type",
  notice: "What Ripple tracks",
  when: "Where you'd talk",
  "st-lighter": "Yes/no: system, not an app",
  commit: "Ready?",
  name: "Name",
  loader: "Loader",
  email: "Email gate",
  result: "Result",
  plan: "First week plan",
  paywall: "Paywall",
  checkout: "Checkout",
  download: "Success / download",
};

/** Men's pattern names, from the BWK statements and sliders. */
export function bwkStateName(a: {
  plate: string[];
  sliders: Record<string, number>;
  pileup?: string;
  said?: Record<string, string>;
}): { name: string; line: string } {
  const s = (id: string) => a.sliders[id] ?? 3;
  const yes = (id: string) => a.said?.[id] === "yes";
  if (yes("st-plan")) return { name: "The Planner", line: "You can map the whole thing out. The follow-through is where it leaks." };
  if (yes("st-slip")) return { name: "The Operator", line: "You keep a lot running. The things that slip are usually yours." };
  if (a.pileup === "night" || s("s-name") >= 4) return { name: "The Night Shift", line: "Your head does its heaviest work when you should be off the clock." };
  if (s("s-repeat") >= 4 || yes("st-blur")) return { name: "The Loop", line: "The weeks blur because the same things keep coming back around." };
  return { name: "The Grinder", line: "You carry more than you let on." };
}

export const BWK_V9: V9Config = {
  brand: "bwk",
  flowVersion: "v9-test-bwk",
  path: "/start-test-bwk",
  // Same light/coral look as /start-test (2026-09-25, Keenan: "same color
  // scheme as normal ripple test funnel", men's copy). The steel "dusk"
  // styling in funnel-v9.tsx is kept but unused.
  theme: "light",
  hookLine: "Ripple keeps track of what you say, so you can get on with doing it.",
  steps: BWK_V9_STEPS,
  stepLabels: numberedLabels(BWK_V9_STEPS, BWK_SHORT),
  progressEnd: BWK_V9_STEPS.findIndex((s) => s.id === "result"),
  // Real quotes only, the same set the BWK funnel already ships
  // (BWK_PAYWALL_QUOTE + gender-neutral PAYWALL_TESTIMONIALS_V2 picks).
  reviews: [
    { quote: "The task manager is a lifesaver!! I never forget anything anymore", name: "App Store review" },
    { quote: "My therapist asked what changed. I showed her my Ripple report. She said ‘this is what I try to do in sessions.’", name: "James K." },
    { quote: "I found out I mention quitting my job every Monday. I never noticed until the weekly report showed me. That one pattern changed everything.", name: "Sarah M." },
  ],
  samples: [
    {
      match: ["training"],
      said: "Skipped the gym again, the Henderson quote is due Thursday, and I still haven't called about the truck. I keep saying tomorrow.",
      tasks: ["Send the Henderson quote by Thursday", "Call about the truck", "Book three gym sessions"],
      mood: "Frustrated",
      pattern: "The gym is the first thing to go when work gets loud.",
    },
    {
      match: ["money", "side"],
      said: "I said I'd look at the budget this week and didn't. The side project's been sitting for a month. I know what to do, I'm just not doing it.",
      tasks: ["Sit down with the budget", "One hour on the side project"],
      mood: "Stuck",
      pattern: "Money and the side project only come up at the end of the week.",
    },
    {
      match: [],
      said: "Dave's invoice goes out Friday, I still haven't called about the truck, and I told myself I'd start training again Monday.",
      tasks: ["Send Dave's invoice Friday", "Call about the truck", "Train Monday"],
      mood: "Stretched",
      pattern: "Your own plans get pushed every time work gets busy.",
    },
  ],
  faq: [
    { q: "When will I be charged?", a: "Not today. Your 7 days are free. We email you a reminder on day 4, and your plan starts on day 7 unless you cancel." },
    { q: "Can I cancel?", a: "Yes, any time from your account settings. Cancel before day 7 and you pay nothing." },
    { q: "Is this therapy?", a: "No. Ripple is a mirror, not a coach. It keeps track of what you say and shows you your own patterns. No lectures, no advice." },
    { q: "Where do my debriefs go?", a: "Into your private account. You can delete any debrief, or your whole account, whenever you want." },
  ],
  stateName: bwkStateName,
  reassure: {
    title: "You’re not lazy. You’re running without a system.",
    body: "Most men don’t lack discipline. They’re carrying fifty loose ends with nowhere to put them down, so the important stuff gets dropped.",
    body2: "Ripple is where they go. You talk or type, and it keeps track.",
    things: ["Henderson quote", "Call about the truck", "Train Monday", "Pay the card", "Reply to Dave", "Side project", "Book the dentist", "Renew insurance"],
    cta: "Fair",
  },
  plateLabels: { work: "work", side: "your side project", training: "training", money: "money", family: "family", partner: "your relationship" },
  milestones: { week: "Halfway there.", talktype: "Keep going. A few more.", name: "Almost done." },
  resultOutro: "None of this means you’re soft or lazy. It means there’s nowhere to put it down. That’s the part Ripple does.",
};

export const V9_CONFIGS: Record<V9Brand, V9Config> = { ripple: RIPPLE_V9, bwk: BWK_V9 };
