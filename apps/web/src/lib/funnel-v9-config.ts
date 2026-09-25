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

export type V9Step =
  | { id: string; kind: "single"; title: string; sub?: string; options: V9Option[] }
  | { id: string; kind: "multi"; title: string; sub?: string; options: V9Option[] }
  | { id: string; kind: "slider"; title: string; left: string; right: string }
  /** One statement, two big buttons (2026-09-25, per Keenan: "one question at a time with less multiple choice"). */
  | { id: string; kind: "statement"; statement: string; title?: string }
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
  { id: "hook", kind: "statement", statement: "My head\u2019s too full and I keep forgetting things." },
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
  { id: "st-remember", kind: "statement", statement: "I\u2019m the one who remembers everything for everyone." },
  { id: "st-slip", kind: "statement", statement: "Things I mean to do slip through the cracks." },
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
  { id: "st-myself", kind: "statement", statement: "I put my own stuff last." },
  { id: "s-repeat", kind: "slider", title: "Where do you land?", left: "I can see my own patterns", right: "The same weeks keep repeating" },
  { id: "st-blur", kind: "statement", statement: "Whole weeks blur together and I can\u2019t say where they went." },
  { id: "s-lists", kind: "slider", title: "Where do you land?", left: "Lists and notebooks work for me", right: "I've tried them. They don't stick" },
  {
    id: "offload",
    kind: "multi",
    title: "What would you most like off your mind?",
    sub: "Pick all that apply.",
    options: [
      { id: "everyone", label: "Remembering everything for everyone" },
      { id: "tasks", label: "Tasks I keep forgetting" },
      { id: "worry", label: "Worry I can't put down" },
      { id: "behind", label: "Feeling behind on my own life" },
    ],
  },
  { id: "review", kind: "info", screen: "review" },
  { id: "how", kind: "info", screen: "how" },
  { id: "st-talk", kind: "statement", statement: "Saying things out loud helps me sort them out." },
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
  { id: "st-lighter", kind: "statement", statement: "I want to feel lighter without adding another chore.", title: "Last one. True for you?" },
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
  offload: "Off your mind",
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
