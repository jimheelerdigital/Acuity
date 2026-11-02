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
  | { id: string; kind: "info"; screen: "reassure" | "review" | "how" | "preview" }
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
  // "review" screen removed 2026-10-28 (Keenan): reviews now sit under the slider questions.
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
    a: "No. Ripple is an AI habit tracker and voice journal: it keeps track of what you say, turns it into your to-do list and shows you your own patterns so you can change what you want to change. It isn't therapy and doesn't give medical advice.",
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
  /** Multi-pick answers by step id (used by /start-relief). */
  multi?: Record<string, string[]>;
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

export type V9Brand = "ripple" | "bwk" | "journal" | "pain" | "slip" | "loop" | "progress" | "adhd";

export type V9Sample = { match: string[]; said: string; tasks: string[]; mood: string; pattern: string };

export interface V9Config {
  brand: V9Brand;
  flowVersion: string;
  path: string;
  /** "sunrise" = the 2026-10-31 redesign look (peach glass, orange, Fraunces). */
  theme: "light" | "dusk" | "sunrise";
  /** Ad-matched screen 1 (2026-09-30): the tapped ad's say/catch example,
   *  shown under the hook buttons. Set per request by FunnelV9's adMatch. */
  adDemo?: { said: string; caught: { text: string; kind: "task" | "pattern" }[] };
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
  /** "trust3" = the 3-screen try-free / reminder / timeline paywall (2026-10-31). */
  paywall?: "classic" | "trust3";
  /** Heading copy for the "preview" info screen (new app design). */
  preview?: { eyebrow: string; title: string; caption: string };
  /** Pain-first funnels (2026-11-02): the copy their shared sunrise screens
   *  use in place of /start-journal's planner pictures. */
  painKit?: PainKit;
}

export interface PainKit {
  /** Short name for admin and the split ("Mental load", "Things slip"...). */
  label: string;
  /** Three small cards fanned above the hook statement. */
  hookCards: string[];
  /** Single-choice step drawn as growing stacks (like /start-journal's "tried"). */
  stackStep: string;
  /** Red stamps that land on picked tiles, by step id then option id. */
  stamps: Record<string, Record<string, string>>;
  /** A real review under these steps (index into reviews). */
  reviewAt: Record<string, number>;
  /** Small stamp on the closing yes/no statement picture. */
  closeStamp: string;
  /** Result: "<left> vs Ripple" rows: what she lives with, Ripple title, Ripple line. */
  vs: { left: string; sub: string; rows: [string, string, string][] };
  /** Paywall page 3 receipt: her picks from the first question are the lines. */
  receipt: { title: string; stamp: string; stampSub: string; extra: { label: string; value: string } };
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
  // "review" screen removed 2026-10-28 (Keenan): reviews now sit under the slider questions.
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
    { q: "Is this therapy?", a: "No. Ripple is an AI habit tracker and voice journal: it keeps track of what you say and shows you your own patterns so you can act on them. No lectures, no medical advice." },
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


// ─── /start-journal (2026-10-31, per Keenan) ──────────────────────────────
// The "journals and planners have failed you" funnel for the Planners ads.
// Every screen continues the ad's story ("Fourth planner. Still stuck."):
// it's not you, planners need upkeep, Ripple needs none. Uses the new app
// design in its preview screen and the 3-screen trust paywall. Split 50/50
// against /start-test via lib/journal-split.ts (flag funnel_journal_split).
export const JOURNAL_V9_STEPS: V9Step[] = [
  { id: "hook", kind: "statement", statement: "I\u2019ve tried planners, apps and journals. None of them stuck.", mood: "overloaded" },
  // Pain first (2026-10-31, Keenan): why she buys planners, the pain behind
  // that, where they keep failing her, and what would make it easier. Only
  // then "It's not you" and Ripple. Aiming at the growth videos' ~20 questions.
  {
    id: "why",
    kind: "multi",
    title: "Why do you keep getting planners and journals?",
    sub: "Pick all that apply.",
    options: [
      { id: "forget", label: "To stop forgetting things" },
      { id: "control", label: "To feel on top of things" },
      { id: "head", label: "To get it out of my head" },
      { id: "family", label: "To keep the family on track" },
      { id: "me", label: "To make time for me" },
      { id: "fresh", label: "To start fresh, again" },
    ],
  },
  {
    id: "pain",
    kind: "multi",
    title: "When it\u2019s all in your head, what happens?",
    sub: "Pick all that apply.",
    options: [
      { id: "slip", label: "Things slip through the cracks" },
      { id: "switch", label: "My mind won\u2019t switch off" },
      { id: "snap", label: "I snap at people I love" },
      { id: "behind", label: "I always feel behind" },
      { id: "last", label: "My own stuff comes last" },
      { id: "drained", label: "I\u2019m drained before the day starts" },
    ],
  },
  {
    id: "often",
    kind: "single",
    title: "How often does something slip through?",
    options: [
      { id: "daily", label: "Most days" },
      { id: "weekly", label: "A few times a week" },
      { id: "sometimes", label: "Once a week or so" },
      { id: "rarely", label: "Rarely, but it costs me" },
    ],
  },
  {
    id: "tried",
    kind: "single",
    title: "How many times have you started over?",
    options: [
      { id: "one", label: "Once or twice" },
      { id: "few", label: "3 or 4 times" },
      { id: "many", label: "5 to 10 times" },
      { id: "lost", label: "I\u2019ve lost count" },
    ],
  },
  {
    id: "tried-what",
    kind: "multi",
    title: "What have you tried?",
    sub: "Pick all that apply.",
    options: [
      { id: "paper", label: "A paper planner" },
      { id: "bullet", label: "A bullet journal" },
      { id: "journal-app", label: "A journaling app" },
      { id: "todo-app", label: "A to-do app" },
      { id: "reminders", label: "Phone reminders" },
      { id: "notes", label: "Sticky notes" },
      { id: "habit-app", label: "A habit tracker" },
    ],
  },
  {
    id: "happens",
    kind: "single",
    title: "Where do they keep failing you?",
    options: [
      { id: "miss", label: "I start strong, then miss a few days" },
      { id: "chore", label: "Filling it in becomes another chore" },
      { id: "forget", label: "I forget to open it" },
      { id: "blank", label: "I stare at the blank page" },
    ],
  },
  { id: "st-upkeep", kind: "statement", statement: "Keeping the planner going became one more thing to remember.", mood: "drained" },
  {
    id: "easier",
    kind: "multi",
    title: "What would make it easier?",
    sub: "Pick all that apply.",
    options: [
      { id: "say", label: "If I could just say it" },
      { id: "sorts", label: "If it sorted itself" },
      { id: "setup", label: "If there was nothing to set up" },
      { id: "matters", label: "If it showed me what matters" },
      { id: "restart", label: "If I never had to start over" },
      { id: "blank", label: "If there was no blank page" },
    ],
  },
  { id: "reassure", kind: "info", screen: "reassure" },
  ...V9_STEPS.filter((st) => st.id === "age" || st.id === "plate" || st.id === "week"),
  { id: "preview", kind: "info", screen: "preview" },
  { id: "s-say", kind: "slider", title: "Where do you land?", left: "I\u2019d rather write it down", right: "I\u2019d rather just say it" },
  { id: "st-zero", kind: "statement", statement: "If it took zero upkeep, I\u2019d actually use it.", mood: "hopeful", title: "Last one. True for you?" },
  {
    id: "commit",
    kind: "single",
    title: "Ready for a planner you don\u2019t have to keep up?",
    options: [
      { id: "ready", label: "Yes, I\u2019m ready" },
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

const JOURNAL_SHORT: Record<string, string> = {
  hook: "None of them stuck? (screen 1, yes/no)",
  why: "Why she gets planners",
  pain: "What happens when it's all in her head",
  often: "How often things slip",
  tried: "How many times started over",
  "tried-what": "What she tried",
  happens: "Where they keep failing her",
  easier: "What would make it easier",
  "st-upkeep": "Yes/no: upkeep became a chore",
  reassure: "It's not you",
  age: "Age range",
  plate: "On your plate",
  week: "This week\u2019s list (chips)",
  preview: "App preview (new design)",
  "s-say": "Slider: write vs say",
  "st-zero": "Yes/no: zero upkeep",
  commit: "Ready?",
  name: "Name",
  loader: "Loader",
  email: "Email gate",
  result: "Result",
  plan: "First week plan",
  paywall: "Paywall (3 screens)",
  checkout: "Checkout",
  download: "Success / download",
};

export function journalStateName(a: { plate: string[]; sliders: Record<string, number>; said?: Record<string, string> }): { name: string; line: string } {
  const yes = (id: string) => a.said?.[id] === "yes";
  const tried = a.said?.tried;
  const happens = a.said?.happens;
  if (tried === "many" || tried === "lost") {
    return { name: "The Restarter", line: "You keep starting fresh systems because none of them fit a life this full. That\u2019s a sign the system is wrong, not you." };
  }
  if (happens === "chore" || yes("st-upkeep")) {
    return { name: "The Keeper", line: "You already keep everything going for everyone. A planner that needs keeping too was never going to last." };
  }
  if (happens === "forget" || happens === "miss") {
    return { name: "The Juggler", line: "Plenty gets done. The planner is just the first thing to drop when the week gets full." };
  }
  return { name: "The Carrier", line: "You carry more than any page can hold, so most of it stays in your head." };
}

/**
 * Real App Store reviews (2026-10-31, from Keenan's App Store Connect
 * screenshots), credited to the reviewer's App Store name. Trimmed quotes keep
 * the reviewer's words; "…" marks a cut. Order matters: [0] reassure + paywall,
 * [1] "easier", [2] the write-vs-say slider, [3] "Ready?", [4] paywall page 2
 * (NoahAssaraf, added at Keenan's request; if the reviewer is family, FTC
 * rules need the connection disclosed).
 * Not used yet: SAMullenFO (confirm she isn't a paid creator), Erguudvnkhf
 * (anxiety and reminders claims).
 */
export const JOURNAL_REVIEWS = [
  { quote: "Tried journaling forever and it never stuck. This makes it easy and gives me way better insights into my actual life. The task manager is a lifesaver!! I never forget anything anymore", name: "KeysCoins \u00B7 App Store" },
  { quote: "Ripple is my daily go to for organization and productivity. It helps me get my thoughts down, review my day, and ensure I don\u2019t miss any habits or to-dos.", name: "JCirishlax55 \u00B7 App Store" },
  { quote: "As an avid written journaling user to start with the transition was tricky for me\u2026 Once I got over that it became entirely natural, and the app picked up on some interesting background themes for me, as well as catching tasks and goals. I honestly wouldn\u2019t be without this now.", name: "vjhaines \u00B7 App Store" },
  { quote: "This app is amazing and been a game changer for me!", name: "JPB619 \u00B7 App Store" },
  { quote: "It is fantastic to have a place I can journal without having to stop for an hour to write everything. The organization of the stream of consciousness is fantastic and it really helps me get from a brain dump to something cohesive.", name: "NoahAssaraf \u00B7 App Store" },
];

export const JOURNAL_V9: V9Config = {
  ...RIPPLE_V9,
  brand: "journal",
  theme: "sunrise",
  flowVersion: "v9-journal",
  path: "/start-journal",
  hookLine: "Ripple keeps track of what you say. No planner to keep up.",
  reviews: JOURNAL_REVIEWS,
  steps: JOURNAL_V9_STEPS,
  stepLabels: numberedLabels(JOURNAL_V9_STEPS, JOURNAL_SHORT),
  progressEnd: JOURNAL_V9_STEPS.findIndex((st) => st.id === "result"),
  stateName: journalStateName as unknown as typeof v9StateName,
  reassure: {
    title: "It\u2019s not you.",
    body: "Every planner needs you to keep it up, and you\u2019re already keeping everything else up.",
    body2: "Ripple works the other way round. You talk, and it does the keeping track.",
    things: ["Rewrite the list", "Color-code it", "Catch up on last week", "Start a new journal", "Download another app", "Fill in Monday", "Buy a nicer planner", "Set up the tracker"],
    cta: "That\u2019s me",
  },
  milestones: { week: "Halfway there.", "s-say": "You're doing great. A few more.", name: "Almost done." },
  resultOutro: "None of this means you\u2019re bad at planning. It means planning shouldn\u2019t need upkeep. That\u2019s the part Ripple does.",
  paywall: "trust3",
  preview: {
    eyebrow: "How Ripple works",
    title: "No filling in. You talk, Ripple writes it down.",
    caption: "This is what you see after every debrief. It\u2019s already on your list; you just remove anything that\u2019s wrong.",
  },
};

// ─── /start-relief: the pain-first funnel (2026-11-02) ──────────────────────
// Keenan: "an entirely new PAIN BASED funnel using our same steps,
// infrastructure, and layout ... built around the actual pains that we solve
// versus the journaling angle." Same slot order and screen types as
// /start-journal (yes/no hook → picks → tiles → statement → picks → reassure →
// age/plate/week → preview → slider → yes/no → ready → name/loader/email →
// result → plan → 3-page paywall), but every question is about the load in
// her head, not the planners that failed her. /start-journal is untouched.
export const PAIN_V9_STEPS: V9Step[] = [
  // Identity first (2026-11-02): a proud yes for her, and it leads straight
  // into the pain. "Not really" still flows into the same questions.
  { id: "hook", kind: "statement", statement: "I’m the one who keeps everything running.", mood: "overloaded" },
  {
    id: "pain",
    kind: "multi",
    title: "When it’s all in your head, what happens?",
    sub: "Pick all that apply.",
    options: [
      { id: "slip", label: "Things slip through the cracks" },
      { id: "switch", label: "My mind won’t switch off" },
      { id: "snap", label: "I snap at people I love" },
      { id: "behind", label: "I always feel behind" },
      { id: "last", label: "My own stuff comes last" },
      { id: "drained", label: "I’m drained before the day starts" },
    ],
  },
  {
    id: "often",
    kind: "single",
    title: "How often does something slip through?",
    options: [
      { id: "daily", label: "Most days" },
      { id: "weekly", label: "A few times a week" },
      { id: "sometimes", label: "Once a week or so" },
      { id: "rarely", label: "Rarely, but it costs me" },
    ],
  },
  {
    id: "tabs",
    kind: "single",
    title: "How many things are you holding in your head right now?",
    sub: "Appointments, forms, replies, birthdays. Every little thing counts.",
    options: [
      { id: "one", label: "A handful" },
      { id: "few", label: "About 10" },
      { id: "many", label: "20 or more" },
      { id: "lost", label: "I’ve lost count" },
    ],
  },
  {
    id: "first",
    kind: "multi",
    title: "What’s the first thing to go when the week gets full?",
    sub: "Pick all that apply.",
    options: [
      { id: "move", label: "My workouts" },
      { id: "friends", label: "Seeing friends" },
      { id: "appts", label: "My own appointments" },
      { id: "sleep", label: "Sleep" },
      { id: "me", label: "Time just for me" },
      { id: "food", label: "Eating properly" },
    ],
  },
  {
    id: "seen",
    kind: "single",
    title: "Who notices how much you carry?",
    options: [
      { id: "none", label: "Nobody, really" },
      { id: "slip", label: "Only when something slips" },
      { id: "partner", label: "My partner, sometimes" },
      { id: "me", label: "I’m not sure I do" },
    ],
  },
  { id: "st-drop", kind: "statement", statement: "If I put it down for a second, something gets dropped.", mood: "drained" },
  {
    id: "help",
    kind: "multi",
    title: "What would help most?",
    sub: "Pick all that apply.",
    options: [
      { id: "out", label: "Getting it all out of my head" },
      { id: "nothing", label: "Knowing nothing’s slipping" },
      { id: "once", label: "Saying it once and letting it go" },
      { id: "why", label: "Seeing what’s wearing me down" },
      { id: "habits", label: "Keeping up the things I drop" },
      { id: "week", label: "Seeing my week laid out" },
    ],
  },
  { id: "reassure", kind: "info", screen: "reassure" },
  ...painShared({ title: "Who and what are you keeping track of?" }),
  { id: "preview", kind: "info", screen: "preview" },
  { id: "s-load", kind: "slider", title: "How heavy does it feel lately?", left: "I’m managing fine", right: "It’s too much to carry" },
  { id: "st-share", kind: "statement", statement: "I’d feel lighter if something else remembered for me.", mood: "hopeful", title: "Last one. True for you?" },
  {
    id: "commit",
    kind: "single",
    title: "Ready to put some of it down?",
    options: [
      { id: "ready", label: "Yes, I’m ready" },
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

const PAIN_SHORT: Record<string, string> = {
  hook: "Keeps everything running? (screen 1, yes/no)",
  pain: "What happens when it's all in her head",
  often: "How often things slip",
  tabs: "How much she's holding",
  first: "First thing to go",
  seen: "Who notices",
  "st-drop": "Yes/no: put it down, it drops",
  help: "What would help most",
  reassure: "It's not you, it's the load",
  age: "Age range",
  plate: "On your plate",
  week: "This week’s list (chips)",
  preview: "App preview (new design)",
  "s-load": "Slider: how heavy",
  "st-share": "Yes/no: something else remembers",
  commit: "Ready?",
  name: "Name",
  loader: "Loader",
  email: "Email gate",
  result: "Result",
  plan: "First week plan",
  paywall: "Paywall (3 screens)",
  checkout: "Checkout",
  download: "Success / download",
};

export function painStateName(a: { plate: string[]; sliders: Record<string, number>; said?: Record<string, string>; multi?: Record<string, string[]> }): { name: string; line: string } {
  const said = a.said ?? {};
  const pain = a.multi?.pain ?? [];
  const first = a.multi?.first ?? [];
  if (said.tabs === "many" || said.tabs === "lost") {
    return { name: "The Keeper of Everything", line: "You hold the dates, the forms and everyone’s plans. No one head was built to carry that much." };
  }
  if (said.seen === "none" || said.seen === "slip" || said["st-drop"] === "yes") {
    return { name: "The Invisible Engine", line: "Everything runs because of you, and most of it goes unseen. Even by you." };
  }
  if (pain.includes("last") || first.includes("me")) {
    return { name: "The Last on the List", line: "You make room for everyone. Your own things wait for someday." };
  }
  if (pain.includes("switch")) {
    return { name: "The Always-On Mind", line: "Your head keeps going long after the day is done, because it’s holding all of it." };
  }
  return { name: "The Carrier", line: "You carry more than anyone sees, so most of it stays in your head." };
}

export const PAIN_V9: V9Config = {
  ...JOURNAL_V9,
  brand: "pain",
  flowVersion: "v9-pain",
  path: "/start-relief",
  hookLine: "Ripple keeps track of what you say, so your head doesn’t have to.",
  steps: PAIN_V9_STEPS,
  stepLabels: numberedLabels(PAIN_V9_STEPS, PAIN_SHORT),
  progressEnd: PAIN_V9_STEPS.findIndex((st) => st.id === "result"),
  stateName: painStateName as unknown as typeof v9StateName,
  reassure: {
    title: "It’s not you. It’s the load.",
    body: "You’re holding the dates, the plans and everyone’s needs in one head. Anyone would drop something.",
    body2: "Ripple takes the keeping-track off you. You talk for a few minutes, and it catches the tasks and shows you what’s wearing you down.",
    things: ["Dentist Thursday", "Permission slip", "Call Mom back", "Car insurance", "Book the vet", "Reply to Sarah", "Birthday gift", "Water bill"],
    cta: "That’s me",
  },
  milestones: { week: "Halfway there.", "s-load": "You’re doing great. A few more.", name: "Almost done." },
  resultOutro: "None of this means you’re failing. It means one head is holding too much. Ripple takes the keeping-track part.",
  painKit: {
    label: "Mental load",
    hookCards: ["Work", "Kids", "Home"],
    stackStep: "tabs",
    stamps: {
      first: { move: "Skipped again", friends: "Rain check #4", appts: "Still not booked", sleep: "6 hours, maybe", me: "Someday", food: "Ate standing up" },
      help: { out: "Ripple does this", nothing: "Ripple does this", once: "Ripple does this", why: "Ripple does this", habits: "Ripple does this", week: "Ripple does this" },
    },
    reviewAt: { help: 0, commit: 3 },
    closeStamp: "held for you",
    vs: {
      left: "In your head",
      sub: "Where it all lives now",
      rows: [
        ["Dentist is Thursday… or Friday?", "On your list", "With the date"],
        ["Did I sign the permission slip?", "Nothing slips", "Every task caught"],
        ["I’ll start walking again next week", "Your habits", "From what you say"],
        ["Why am I this tired every week?", "Your patterns", "Week to week"],
        ["Going over everything, again", "A quiet head", "Said once, held for you"],
      ],
    },
    receipt: { title: "Carrying it all · this week", stamp: "Too much for one head", stampSub: "and nobody sees it", extra: { label: "Time just for you", value: "someday" } },
  },
  preview: {
    eyebrow: "How Ripple works",
    title: "You talk. Ripple keeps track.",
    caption: "This is what you see after every debrief. It’s already on your list, so it’s out of your head.",
  },
};

// Age / plate / week from the main funnel, with the plate (and optionally the
// week) question reworded to the funnel's pain (2026-11-02 review: "On your
// plate" read as generic profiling).
function painShared(plate: { title: string; sub?: string }, week?: { title: string; sub?: string }): V9Step[] {
  return V9_STEPS.filter((st) => st.id === "age" || st.id === "plate" || st.id === "week").map((st) =>
    st.id === "plate" ? ({ ...st, ...plate } as V9Step) : st.id === "week" && week ? ({ ...st, ...week } as V9Step) : st
  );
}

// ─── Shared tail for the pain-first funnels: age/plate/week, preview, then
// slider → closing yes/no → ready → account → result → plan → paywall.
function painTail(slider: V9Step, close: V9Step, commitTitle: string, plate: { title: string; sub?: string }, week?: { title: string; sub?: string }): V9Step[] {
  return [
    { id: "reassure", kind: "info", screen: "reassure" },
    ...painShared(plate, week),
    { id: "preview", kind: "info", screen: "preview" },
    slider,
    close,
    { id: "commit", kind: "single", title: commitTitle, options: [{ id: "ready", label: "Yes, I’m ready" }, { id: "try", label: "I want to try it" }] },
    { id: "name", kind: "name" },
    { id: "loader", kind: "loader" },
    { id: "email", kind: "email" },
    { id: "result", kind: "result" },
    { id: "plan", kind: "plan" },
    { id: "paywall", kind: "paywall" },
    { id: "checkout", kind: "checkout" },
    { id: "download", kind: "download" },
  ];
}

const TAIL_SHORT: Record<string, string> = {
  reassure: "It's not you", age: "Age range", plate: "On your plate", week: "This week’s list (chips)", preview: "App preview (new design)",
  commit: "Ready?", name: "Name", loader: "Loader", email: "Email gate", result: "Result", plan: "First week plan",
  paywall: "Paywall (3 screens)", checkout: "Checkout", download: "Success / download",
};

const ripple = (ids: string[]) => Object.fromEntries(ids.map((id) => [id, "Ripple does this"]));

// ─── /start-catch: pain #2, things slip through (2026-11-02) ────────────────
export const SLIP_V9_STEPS: V9Step[] = [
  { id: "hook", kind: "statement", statement: "Things keep slipping through the cracks.", mood: "overloaded" },
  {
    id: "pain", kind: "multi", title: "What’s slipped lately?", sub: "Pick all that apply.",
    options: [
      { id: "form", label: "A school form" },
      { id: "appt", label: "An appointment" },
      { id: "bday", label: "A birthday" },
      { id: "bill", label: "A bill or renewal" },
      { id: "reply", label: "A message I meant to answer" },
      { id: "promise", label: "Something I promised someone" },
    ],
  },
  {
    id: "often", kind: "single", title: "How often does something slip through?", sub: "Each dot is a day something slipped.",
    options: [
      { id: "daily", label: "Most days" },
      { id: "weekly", label: "A few times a week" },
      { id: "sometimes", label: "Once a week or so" },
      { id: "rarely", label: "Rarely, but it costs me" },
    ],
  },
  {
    id: "pile", kind: "single", title: "How many “I’ll remember that” moments in a day?", sub: "The ones you never write down.",
    options: [
      { id: "one", label: "A few" },
      { id: "few", label: "About 10" },
      { id: "many", label: "20 or more" },
      { id: "lost", label: "I’ve lost count" },
    ],
  },
  {
    id: "after", kind: "multi", title: "What happens after something slips?", sub: "Pick all that apply.",
    options: [
      { id: "guilt", label: "I feel guilty for days" },
      { id: "scramble", label: "I scramble to fix it" },
      { id: "sorry", label: "I apologize. A lot." },
      { id: "replay", label: "I replay it in my head" },
      { id: "blame", label: "I blame myself" },
      { id: "fee", label: "It costs money, like a late fee" },
    ],
  },
  {
    id: "remember", kind: "single", title: "How do you try to remember things now?",
    options: [
      { id: "head", label: "I just keep it in my head" },
      { id: "shots", label: "Notes and screenshots" },
      { id: "texts", label: "Texting myself" },
      { id: "alarms", label: "Phone alarms" },
    ],
  },
  { id: "st-mid", kind: "statement", statement: "I’m doing my best, and things still fall through.", mood: "drained" },
  {
    id: "help", kind: "multi", title: "What would help most?", sub: "Pick all that apply.",
    options: [
      { id: "catch", label: "Catching things the moment I think of them" },
      { id: "dates", label: "Every date in one place" },
      { id: "coming", label: "Seeing what’s coming up this week" },
      { id: "nothing", label: "Knowing nothing’s slipping" },
      { id: "head", label: "Not holding it all in my head" },
      { id: "top", label: "Feeling on top of things" },
    ],
  },
  ...painTail(
    { id: "s-sure", kind: "slider", title: "How sure are you nothing will slip this week?", left: "Nothing gets past me", right: "Things slip all the time" },
    { id: "st-close", kind: "statement", statement: "I’d relax if I knew nothing was slipping.", mood: "hopeful", title: "Last one. True for you?" },
    "Ready for nothing to slip?",
    { title: "Where do things slip most?" },
    { title: "What could slip this week?", sub: "Tap everything you’re trying to remember." }
  ),
];

export function slipStateName(a: { plate: string[]; sliders: Record<string, number>; said?: Record<string, string>; multi?: Record<string, string[]> }): { name: string; line: string } {
  const said = a.said ?? {};
  const after = a.multi?.after ?? [];
  if (said.pile === "many" || said.pile === "lost") return { name: "The Overflow", line: "It isn’t a memory problem. One head is holding more than any head can." };
  if (after.includes("guilt") || after.includes("blame") || after.includes("replay")) return { name: "The Self-Blamer", line: "When something slips, you carry the guilt for days. You’re that hard on yourself because you care that much." };
  if (said.remember === "head") return { name: "The Human Calendar", line: "Everyone’s dates live in your head, and there’s no backup when one falls out." };
  return { name: "The Juggler", line: "You keep a lot in the air. Now and then one drops, and it’s always on you." };
}

export const SLIP_V9: V9Config = {
  ...PAIN_V9,
  brand: "slip",
  flowVersion: "v9-slip",
  path: "/start-catch",
  steps: SLIP_V9_STEPS,
  stepLabels: numberedLabels(SLIP_V9_STEPS, {
    ...TAIL_SHORT, hook: "Things keep slipping? (screen 1, yes/no)", pain: "What slipped lately", often: "How often things slip", pile: "“I’ll remember” moments",
    after: "After something slips", remember: "How she remembers now", "st-mid": "Yes/no: doing my best", help: "What would help most",
    "s-sure": "Slider: sure nothing slips", "st-close": "Yes/no: I’d relax",
  }),
  progressEnd: SLIP_V9_STEPS.findIndex((st) => st.id === "result"),
  stateName: slipStateName as unknown as typeof v9StateName,
  reassure: {
    title: "It’s not a memory problem. It’s a storage problem.",
    body: "No one can hold this many dates, forms and promises in one head. The forgetting isn’t a flaw. It’s overflow.",
    body2: "Ripple is the place it goes. You say it once, and it lands on your list with the date.",
    things: ["Permission slip", "Dentist Thursday", "Mia’s birthday", "Car insurance", "Reply to Sarah", "Return the dress", "Water bill", "Book the vet"],
    cta: "That’s me",
  },
  milestones: { week: "Halfway there.", "s-sure": "You’re doing great. A few more.", name: "Almost done." },
  resultOutro: "None of this means you’re careless. It means there’s too much to hold in one head. Ripple holds it for you.",
  preview: { eyebrow: "How Ripple works", title: "Say it once. It’s on your list.", caption: "This is what you see after every debrief: every task caught, with its date. Nothing left to remember." },
  painKit: {
    label: "Things slip",
    hookCards: ["Forms", "Dates", "Replies"],
    stackStep: "pile",
    stamps: {
      after: { guilt: "For days", scramble: "Last minute", sorry: "Sorry #3", replay: "On repeat", blame: "Every time", fee: "$35 late fee" },
      help: ripple(["catch", "dates", "coming", "nothing", "head", "top"]),
    },
    reviewAt: { help: 0, commit: 3 },
    closeStamp: "on your list",
    vs: {
      left: "In your head",
      sub: "Where it lands with Ripple",
      rows: [
        ["Form due… Friday? Monday?", "On your list", "With the date"],
        ["Mia’s birthday is when again?", "Every date", "In one place"],
        ["Screenshot of a screenshot", "Said once", "Caught for you"],
        ["Meant to reply. Forgot.", "Nothing slips", "Every task caught"],
        ["What did I forget this week?", "Your week", "Laid out for you"],
      ],
    },
    receipt: { title: "What slipping costs you", stamp: "Too much to remember", stampSub: "and it’s always on you", extra: { label: "Guilt afterwards", value: "for days" } },
  },
};

// ─── /start-clarity: pain #5, the same draining week and no idea why ────────
export const LOOP_V9_STEPS: V9Step[] = [
  { id: "hook", kind: "statement", statement: "I’m running on empty, and I can’t tell why.", mood: "drained" },
  {
    id: "pain", kind: "multi", title: "What does a hard week look like for you?", sub: "Pick all that apply.",
    options: [
      { id: "tired", label: "I’m worn out by midweek" },
      { id: "short", label: "Small things set me off" },
      { id: "nextweek", label: "I keep saying “next week”" },
      { id: "skip", label: "I skip the things that help me" },
      { id: "blur", label: "I can’t say where the week went" },
      { id: "dread", label: "I dread the week ahead" },
    ],
  },
  {
    id: "often", kind: "single", title: "How many days a week do you feel drained?", sub: "Each dot is a drained day.",
    options: [
      { id: "daily", label: "Most days" },
      { id: "weekly", label: "A few days" },
      { id: "sometimes", label: "One or two" },
      { id: "rarely", label: "Rarely, but it hits hard" },
    ],
  },
  {
    id: "repeat", kind: "single", title: "How long has it felt like this?", sub: "However long it’s been, it counts.",
    options: [
      { id: "one", label: "A few weeks" },
      { id: "few", label: "A few months" },
      { id: "many", label: "Over a year" },
      { id: "lost", label: "Longer than I remember" },
    ],
  },
  {
    id: "helps", kind: "multi", title: "What actually helps you feel better?", sub: "Pick all that apply.",
    options: [
      { id: "walk", label: "A walk outside" },
      { id: "friends", label: "Time with a friend" },
      { id: "sleep", label: "A proper night’s sleep" },
      { id: "move", label: "Exercise" },
      { id: "quiet", label: "Quiet time alone" },
      { id: "fun", label: "Something just for fun" },
    ],
  },
  {
    id: "why", kind: "single", title: "Do you know what’s draining you most?",
    options: [
      { id: "no", label: "Honestly, no" },
      { id: "guess", label: "I have a guess" },
      { id: "mix", label: "It’s a mix of things" },
      { id: "know", label: "I know, but can’t change it" },
    ],
  },
  { id: "st-mid", kind: "statement", statement: "I keep meaning to change things, then another week goes by.", mood: "drained" },
  {
    id: "want", kind: "multi", title: "What would you love to see?", sub: "Pick all that apply.",
    options: [
      { id: "drains", label: "What drains me" },
      { id: "lifts", label: "What lifts me" },
      { id: "habits", label: "Which habits actually stick" },
      { id: "week", label: "My week, summed up" },
      { id: "coming", label: "What keeps coming up" },
      { id: "pattern", label: "Patterns I can’t see myself" },
    ],
  },
  ...painTail(
    { id: "s-know", kind: "slider", title: "How well do you know what lifts you?", left: "I know what lifts me", right: "I have no idea what lifts me" },
    { id: "st-close", kind: "statement", statement: "If I could see what’s really going on, I’d change it.", mood: "hopeful", title: "Last one. True for you?" },
    "Ready to see what’s really going on?",
    { title: "What takes the most out of you?" },
    { title: "What’s filling your week?", sub: "Tap everything that’s on your mind right now." }
  ),
];

export function loopStateName(a: { plate: string[]; sliders: Record<string, number>; said?: Record<string, string>; multi?: Record<string, string[]> }): { name: string; line: string } {
  const said = a.said ?? {};
  const pain = a.multi?.pain ?? [];
  if (said.repeat === "many" || said.repeat === "lost") return { name: "The Long Haul", line: "You’ve been running on empty for a long time and kept going anyway. That takes more than anyone sees." };
  if (pain.includes("skip") || pain.includes("nextweek")) return { name: "The Someday Self", line: "You know what helps you. It just keeps landing on next week’s list." };
  if (said.why === "no" || said.why === "mix" || pain.includes("blur")) return { name: "The Blurred Week", line: "Every week runs into the next, so the pattern behind it stays hidden." };
  return { name: "The Quiet Fader", line: "You keep everything going, and a little of you slips away each week." };
}

export const LOOP_V9: V9Config = {
  ...PAIN_V9,
  brand: "loop",
  flowVersion: "v9-loop",
  path: "/start-clarity",
  hookLine: "Ripple shows you what’s really going on in your week.",
  steps: LOOP_V9_STEPS,
  stepLabels: numberedLabels(LOOP_V9_STEPS, {
    ...TAIL_SHORT, hook: "Running on empty? (screen 1, yes/no)", pain: "What a hard week looks like", often: "Drained days a week", repeat: "How long it's felt like this",
    helps: "What helps her", why: "Knows what drains her?", "st-mid": "Yes/no: another week goes by", want: "What she'd love to see",
    "s-know": "Slider: knows what lifts her", "st-close": "Yes/no: if I could see it",
  }),
  progressEnd: LOOP_V9_STEPS.findIndex((st) => st.id === "result"),
  stateName: loopStateName as unknown as typeof v9StateName,
  reassure: {
    title: "It’s not you. You just can’t see the pattern.",
    body: "From inside it, every week blurs into the next. Nobody can spot a pattern while they’re living it.",
    body2: "Ripple can. You talk for a few minutes, and it shows you what drains you, what lifts you and what keeps coming back.",
    things: ["Tired again", "Skipped the walk", "Next week", "Short with the kids", "Up late again", "No time for me", "Same argument", "Monday again"],
    cta: "That’s me",
  },
  milestones: { week: "Halfway there.", "s-know": "You’re doing great. A few more.", name: "Almost done." },
  resultOutro: "None of this means you’re doing it wrong. It means you can’t see the pattern from inside it. Ripple shows it to you.",
  preview: { eyebrow: "How Ripple works", title: "You talk. Ripple shows you the pattern.", caption: "This is what you see after every debrief: your tasks caught, and over the weeks, what keeps coming up." },
  painKit: {
    label: "Hidden pattern",
    hookCards: ["Mon", "Wed", "Fri"],
    stackStep: "repeat",
    stamps: {
      helps: { walk: "Skipped this week", friends: "Not since summer", sleep: "Rarely", move: "Next week", quiet: "Someday", fun: "Can’t remember" },
      want: ripple(["drains", "lifts", "habits", "week", "coming", "pattern"]),
    },
    reviewAt: { want: 0, commit: 3 },
    closeStamp: "pattern found",
    vs: {
      left: "Your week now",
      sub: "What changes when you can see it",
      rows: [
        ["Tired again, no idea why", "What drains you", "Shown week to week"],
        ["Can’t say where the week went", "Your week, told back", "A weekly report"],
        ["The walk got skipped. Again.", "Your habits", "From what you say"],
        ["Same argument, every month", "What keeps coming up", "Your patterns"],
        ["Not sure what lifts me", "What lifts you", "From your own words"],
      ],
    },
    receipt: { title: "Your week · on repeat", stamp: "Same week, again", stampSub: "and you can’t see why", extra: { label: "The things that help you", value: "skipped" } },
  },
};

// ─── /start-progress: pain #6, the weeks blur and nothing seems to change ───
export const PROGRESS_V9_STEPS: V9Step[] = [
  { id: "hook", kind: "statement", statement: "The weeks fly by, and I can’t see that anything’s changing.", mood: "drained" },
  {
    id: "pain", kind: "multi", title: "What does that feel like?", sub: "Pick all that apply.",
    options: [
      { id: "blur", label: "The weeks blur together" },
      { id: "stuck", label: "I feel stuck" },
      { id: "goals", label: "My goals keep sliding" },
      { id: "restart", label: "I keep starting over" },
      { id: "proud", label: "I can’t say what I’m proud of" },
      { id: "year", label: "Another year went by" },
    ],
  },
  {
    id: "look", kind: "single", title: "When do you look back on how things are going?",
    options: [
      { id: "never", label: "Never, really" },
      { id: "wrong", label: "When something goes wrong" },
      { id: "newyear", label: "At New Year’s" },
      { id: "sometimes", label: "Once in a while" },
    ],
  },
  {
    id: "goal", kind: "single", title: "How many times have you set the same goal?", sub: "Every fresh start counts.",
    options: [
      { id: "one", label: "Once" },
      { id: "few", label: "2 or 3 times" },
      { id: "many", label: "Every year" },
      { id: "lost", label: "I’ve lost count" },
    ],
  },
  {
    id: "slid", kind: "multi", title: "What keeps sliding?", sub: "Pick all that apply.",
    options: [
      { id: "health", label: "My health" },
      { id: "move", label: "Moving my body" },
      { id: "money", label: "Money goals" },
      { id: "friends", label: "Friendships" },
      { id: "hobby", label: "Something I used to love" },
      { id: "calm", label: "Feeling calmer" },
    ],
  },
  {
    id: "proof", kind: "single", title: "If someone asked what changed this year, could you say?",
    options: [
      { id: "no", label: "Not really" },
      { id: "little", label: "A little" },
      { id: "hard", label: "It’s hard to put into words" },
      { id: "yes", label: "Yes, but it doesn’t feel like it" },
    ],
  },
  { id: "st-mid", kind: "statement", statement: "I’m busy all the time, but I don’t feel like I’m getting anywhere.", mood: "drained" },
  {
    id: "want", kind: "multi", title: "What would you love to see?", sub: "Pick all that apply.",
    options: [
      { id: "week", label: "My week, summed up" },
      { id: "progress", label: "Proof I’m getting somewhere" },
      { id: "habits", label: "Which habits stick" },
      { id: "life", label: "Where my life is heading" },
      { id: "wins", label: "Wins I’d otherwise forget" },
      { id: "coming", label: "What keeps coming up" },
    ],
  },
  ...painTail(
    { id: "s-see", kind: "slider", title: "How well can you see your own progress?", left: "I can see I’m getting somewhere", right: "Every week feels the same" },
    { id: "st-close", kind: "statement", statement: "If I could see I’m getting somewhere, I’d keep going.", mood: "hopeful", title: "Last one. True for you?" },
    "Ready to see your progress?",
    { title: "Where do you want to see progress?" }
  ),
];

export function progressStateName(a: { plate: string[]; sliders: Record<string, number>; said?: Record<string, string>; multi?: Record<string, string[]> }): { name: string; line: string } {
  const said = a.said ?? {};
  const pain = a.multi?.pain ?? [];
  if (said.goal === "many" || said.goal === "lost" || pain.includes("restart")) return { name: "The Fresh Starter", line: "You keep setting the goal again because you never got to see how far you came last time." };
  if (pain.includes("stuck") || pain.includes("blur")) return { name: "The Treadmill", line: "You’re moving all the time. Without a record, it feels like standing still." };
  if (said.proof === "no" || said.proof === "hard" || pain.includes("proud")) return { name: "The Unseen Progress", line: "More is changing than you can see. It just isn’t written down anywhere." };
  return { name: "The Quiet Climber", line: "You’re getting somewhere, a little at a time, and little steps are easy to miss." };
}

export const PROGRESS_V9: V9Config = {
  ...PAIN_V9,
  brand: "progress",
  flowVersion: "v9-progress",
  path: "/start-progress",
  hookLine: "Ripple shows you how far you’ve come, week by week.",
  steps: PROGRESS_V9_STEPS,
  stepLabels: numberedLabels(PROGRESS_V9_STEPS, {
    ...TAIL_SHORT, hook: "Weeks fly by, nothing changes? (screen 1, yes/no)", pain: "What it feels like", look: "When she looks back", goal: "Same goal how many times",
    slid: "What keeps sliding", proof: "Could she say what changed", "st-mid": "Yes/no: busy, not getting anywhere", want: "What she'd love to see",
    "s-see": "Slider: sees her progress", "st-close": "Yes/no: I'd keep going",
  }),
  progressEnd: PROGRESS_V9_STEPS.findIndex((st) => st.id === "result"),
  stateName: progressStateName as unknown as typeof v9StateName,
  reassure: {
    title: "It’s not you. You just can’t see it from here.",
    body: "Change happens a little at a time, and little changes are easy to miss. Without a record, every week looks like the last one.",
    body2: "Ripple keeps the record for you. You talk for a few minutes, and week by week it shows you what’s changing.",
    things: ["New Year goal", "Back to the gym", "Read more", "Call friends", "Drink water", "Save money", "Bed earlier", "Be calmer"],
    cta: "That’s me",
  },
  milestones: { week: "Halfway there.", "s-see": "You’re doing great. A few more.", name: "Almost done." },
  resultOutro: "None of this means you’re not trying. It means nobody’s keeping the record. Ripple keeps it, so you can see how far you’ve come.",
  preview: { eyebrow: "How Ripple works", title: "You talk. Ripple keeps the record.", caption: "This is what you see after every debrief. Week by week, it adds up to a picture of your progress." },
  painKit: {
    label: "No progress",
    hookCards: ["Jan", "Jun", "Dec"],
    stackStep: "goal",
    stamps: {
      slid: { health: "Next month", move: "Starting Monday", money: "Next year", friends: "Overdue", hobby: "Packed away", calm: "Someday" },
      want: ripple(["week", "progress", "habits", "life", "wins", "coming"]),
    },
    reviewAt: { want: 0, commit: 3 },
    closeStamp: "week 4: up",
    vs: {
      left: "Your year now",
      sub: "What changes when it’s written down",
      rows: [
        ["Same goal as last January", "Your progress", "Week by week"],
        ["Can’t say what changed", "Your week, told back", "A weekly report"],
        ["Wins forgotten by Friday", "Every win kept", "In your own words"],
        ["Habits started, then dropped", "Your habits", "From what you say"],
        ["Where is my life going?", "Your Life Matrix", "The big picture"],
      ],
    },
    receipt: { title: "Your year · so far", stamp: "Busy, not moving", stampSub: "or so it feels", extra: { label: "Proof you’ve grown", value: "nowhere" } },
  },
};

// ─── /start-focus: scattered brain / ADHD (2026-11-02) ──────────────────────
// Keenan: "a funnel that targets ... people with scattered brains"; "not a
// cure, but a helpful tool ... use ADHD as a buzzword." Ripple never claims
// to treat or diagnose ADHD (docs/acuity-positioning.md); it is a tool that
// works the way a fast, scattered brain does.
export const ADHD_V9_STEPS: V9Step[] = [
  { id: "hook", kind: "statement", statement: "My brain has 47 tabs open, and I can’t find the one I need.", mood: "overloaded" },
  {
    id: "pain", kind: "multi", title: "What does a scattered day look like?", sub: "Pick all that apply.",
    options: [
      { id: "start", label: "I start five things and finish none" },
      { id: "lose", label: "I lose my train of thought mid-sentence" },
      { id: "forget", label: "I forget things the second I walk away" },
      { id: "time", label: "Time just disappears" },
      { id: "overwhelm", label: "Too many thoughts, no idea where to start" },
      { id: "freeze", label: "I freeze when I sit down to plan" },
    ],
  },
  {
    id: "often", kind: "single", title: "How often does your brain feel like this?", sub: "Each dot is a scattered day.",
    options: [
      { id: "daily", label: "Most days" },
      { id: "weekly", label: "A few days a week" },
      { id: "sometimes", label: "Once a week or so" },
      { id: "rarely", label: "Rarely, but it derails me" },
    ],
  },
  {
    id: "apps", kind: "single", title: "How many apps and systems have you tried?", sub: "Planners, apps, sticky notes. They all count.",
    options: [
      { id: "one", label: "One or two" },
      { id: "few", label: "3 or 4" },
      { id: "many", label: "5 or more" },
      { id: "lost", label: "I’ve lost count" },
    ],
  },
  {
    id: "fail", kind: "multi", title: "Why do they stop working for you?", sub: "Pick all that apply.",
    options: [
      { id: "setup", label: "Setting them up takes forever" },
      { id: "open", label: "I forget to open them" },
      { id: "bored", label: "They get boring" },
      { id: "typing", label: "Typing it all out is too slow" },
      { id: "streak", label: "Missing a day makes me quit" },
      { id: "much", label: "Too many buttons and settings" },
    ],
  },
  {
    id: "brain", kind: "single", title: "Do you have ADHD, or wonder if you do?",
    options: [
      { id: "yes", label: "Yes, I’ve been diagnosed" },
      { id: "wonder", label: "I’ve wondered" },
      { id: "scattered", label: "No, I’m just scattered" },
      { id: "skip", label: "I’d rather not say" },
    ],
  },
  { id: "st-mid", kind: "statement", statement: "If I don’t do it right now, it’s gone.", mood: "overloaded" },
  {
    id: "want", kind: "multi", title: "What would actually work for your brain?", sub: "Pick all that apply.",
    options: [
      { id: "dump", label: "Dumping every thought out, fast" },
      { id: "talk", label: "Talking instead of typing" },
      { id: "sort", label: "Having it sorted for me" },
      { id: "one", label: "One list, not five apps" },
      { id: "setup", label: "Nothing to set up" },
      { id: "nostreak", label: "No streak to break" },
    ],
  },
  ...painTail(
    { id: "s-thoughts", kind: "slider", title: "Where are your thoughts right now?", left: "My thoughts are in order", right: "My thoughts are everywhere" },
    { id: "st-close", kind: "statement", statement: "If I could just say it and let it go, I’d actually keep up.", mood: "hopeful", title: "Last one. True for you?" },
    "Ready to get it out of your head?",
    { title: "What’s pulling at your attention?" },
    { title: "What’s bouncing around your head this week?", sub: "Tap everything, in any order." }
  ),
];

export function adhdStateName(a: { plate: string[]; sliders: Record<string, number>; said?: Record<string, string>; multi?: Record<string, string[]> }): { name: string; line: string } {
  const said = a.said ?? {};
  const pain = a.multi?.pain ?? [];
  if (said.apps === "many" || said.apps === "lost") return { name: "The System Collector", line: "You’ve tried system after system. None of them were built for a brain that moves this fast." };
  if (pain.includes("start") || pain.includes("time")) return { name: "The Tab Opener", line: "Ideas arrive faster than you can finish them, so a lot gets left open." };
  if (pain.includes("forget") || pain.includes("lose")) return { name: "The Vanishing Thought", line: "Good thoughts show up at the worst moments and are gone a minute later." };
  return { name: "The Fast Thinker", line: "Your brain moves quickly. It just needs somewhere to put things down." };
}

export const ADHD_V9: V9Config = {
  ...PAIN_V9,
  brand: "adhd",
  flowVersion: "v9-adhd",
  path: "/start-focus",
  hookLine: "For scattered, busy and ADHD brains. Say it the second you think it, and Ripple sorts it.",
  steps: ADHD_V9_STEPS,
  stepLabels: numberedLabels(ADHD_V9_STEPS, {
    ...TAIL_SHORT, hook: "47 tabs open? (screen 1, yes/no)", pain: "What a scattered day looks like", often: "Scattered days a week", apps: "How many systems tried",
    fail: "Why they stop working", brain: "ADHD, or wondered?", "st-mid": "Yes/no: do it now or it's gone", want: "What would work for her brain",
    "s-thoughts": "Slider: thoughts in order vs everywhere", "st-close": "Yes/no: say it and let it go",
  }),
  progressEnd: ADHD_V9_STEPS.findIndex((st) => st.id === "result"),
  stateName: adhdStateName as unknown as typeof v9StateName,
  reassure: {
    title: "It’s not a willpower problem.",
    body: "A brain that moves this fast can’t also be the filing cabinet. Most systems were built for brains that sit still.",
    body2: "Ripple works the way your brain does. Say it the second you think it, in any order, and it lands on your list, sorted.",
    things: ["Reply to Jen", "Laundry!!", "Dentist?", "Renew passport", "That idea", "Call back", "Return package", "Pay parking"],
    cta: "That’s me",
  },
  milestones: { week: "Halfway there.", "s-thoughts": "You’re doing great. A few more.", name: "Almost done." },
  resultOutro: "None of this means you’re lazy or careless. Your brain needs a place to put things down. Ripple is that place.",
  preview: { eyebrow: "How Ripple works", title: "Say it messy. Ripple sorts it.", caption: "Talk in any order. Every task lands on your list, already sorted, with nothing to set up." },
  painKit: {
    label: "Scattered / ADHD",
    hookCards: ["Tab 1", "Tab 2", "Tab 47"],
    stackStep: "apps",
    stamps: {
      fail: { setup: "Quit on day 2", open: "Last opened: March", bored: "Novelty gone", typing: "3 notes, 0 done", streak: "Streak: 0", much: "Too many menus" },
      want: ripple(["dump", "talk", "sort", "one", "setup", "nostreak"]),
    },
    reviewAt: { want: 0, commit: 3 },
    closeStamp: "sorted",
    vs: {
      left: "In your head",
      sub: "Where it goes with Ripple",
      rows: [
        ["Wait, what was I saying?", "Said once", "Kept for you"],
        ["Five apps, none up to date", "One list", "From your own voice"],
        ["Great idea in the shower, gone", "Every idea", "Caught as you say it"],
        ["Started five things, finished none", "Your tasks", "Sorted, with dates"],
        ["Missed a day, quit the app", "Nothing resets", "Pick up anytime"],
      ],
    },
    receipt: { title: "Your brain · this week", stamp: "Too many tabs open", stampSub: "and they’re all yours", extra: { label: "Apps you tried", value: "abandoned" } },
  },
};

export const V9_CONFIGS: Record<V9Brand, V9Config> = { ripple: RIPPLE_V9, bwk: BWK_V9, journal: JOURNAL_V9, pain: PAIN_V9, slip: SLIP_V9, loop: LOOP_V9, progress: PROGRESS_V9, adhd: ADHD_V9 };

/** The pain-first funnels in the 2026-11-02 split, in order. */
export const PAIN_FUNNELS = [PAIN_V9, SLIP_V9, LOOP_V9, PROGRESS_V9, ADHD_V9];
