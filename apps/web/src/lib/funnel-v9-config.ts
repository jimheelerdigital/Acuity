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
  {
    id: "hook",
    kind: "single",
    title: "How often is your head still full when the day is done?",
    options: [
      { id: "daily", label: "Almost every day" },
      { id: "weekly", label: "A few times a week" },
      { id: "sometimes", label: "Now and then" },
      { id: "rarely", label: "Rarely" },
    ],
  },
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
  {
    id: "pileup",
    kind: "single",
    title: "When do the thoughts pile up most?",
    options: [
      { id: "morning", label: "First thing in the morning" },
      { id: "car", label: "In the car" },
      { id: "quiet", label: "Once the house goes quiet" },
      { id: "night", label: "In the middle of the night" },
      { id: "allday", label: "All day, honestly" },
    ],
  },
  { id: "reassure", kind: "info", screen: "reassure" },
  { id: "s-name", kind: "slider", title: "Where do you land?", left: "I know what's bothering me", right: "I can't quite name it" },
  { id: "s-slip", kind: "slider", title: "Where do you land?", left: "What I mean to do gets done", right: "Things slip through the cracks" },
  { id: "s-repeat", kind: "slider", title: "Where do you land?", left: "I can see my own patterns", right: "The same weeks keep repeating" },
  { id: "s-keeper", kind: "slider", title: "Where do you land?", left: "Someone helps keep track", right: "It's all on me" },
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
      { id: "drain", label: "Knowing why some days drain me" },
    ],
  },
  { id: "review", kind: "info", screen: "review" },
  { id: "how", kind: "info", screen: "how" },
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
      { id: "mood", label: "How my mood moves through the week" },
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
export const V9_STEP_LABELS: Record<string, string> = {
  hook: "1. Head still full? (screen 1)",
  age: "2. Age range",
  plate: "3. On your plate",
  pileup: "4. When thoughts pile up",
  reassure: "5. You're not the only one",
  "s-name": "6. Slider: can't name it",
  "s-slip": "7. Slider: things slip",
  "s-repeat": "8. Slider: weeks repeat",
  "s-keeper": "9. Slider: all on me",
  "s-lists": "10. Slider: lists don't stick",
  offload: "11. Off your mind",
  review: "12. Reviews",
  how: "13. How Ripple works (demo)",
  talktype: "14. Talk or type",
  notice: "15. What Ripple notices",
  when: "16. Where you'd talk",
  commit: "17. Ready?",
  name: "18. Name",
  loader: "19. Loader",
  email: "20. Email gate",
  result: "21. Result",
  plan: "22. First week plan",
  paywall: "23. Paywall",
  checkout: "24. Checkout",
  download: "25. Success / download",
};

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
}): { name: string; line: string } {
  const s = (id: string) => a.sliders[id] ?? 3;
  if (s("s-keeper") >= 4 && a.plate.length >= 2) {
    return { name: "The Keeper", line: "You hold the plan for everyone, and nobody holds it for you." };
  }
  if (s("s-slip") >= 4) {
    return { name: "The Juggler", line: "Plenty gets done. The things that fall are usually your own." };
  }
  if (a.pileup === "night" || s("s-name") >= 4) {
    return { name: "The Replayer", line: "Your mind keeps turning things over, looking for somewhere to set them down." };
  }
  if (s("s-repeat") >= 4) {
    return { name: "The Loop", line: "The weeks blur because the same things keep coming back around." };
  }
  return { name: "The Carrier", line: "You carry more than you say out loud." };
}
