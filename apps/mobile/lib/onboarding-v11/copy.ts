/**
 * Onboarding v11 copy — ONE funnel for everyone (2026-10-15, Jimmy: "One
 * consistent funnel that can resonate with everyone").
 *
 * Screen order and design follow Keenan's Miro board ("BRAND NEW USER
 * (ORGANIC/UGC)") and his screen designs. The words are a neutral blend of
 * the two web funnels already live (apps/web/src/lib/funnel-v9-config.ts:
 * RIPPLE_V9 and BWK_V9) so nothing here is untested positioning:
 *   - Keenan's designs show the BWK lines; where a line was men-only it is
 *     widened (e.g. "Most men don't lack discipline" → "Most people …").
 *   - The "carrying" tiles mix both lists so a parent, a founder and someone
 *     training all find themselves on screen 4.
 *
 * Positioning rules (docs/acuity-positioning.md): "debrief", never
 * "journal"; no fixed time of day; no duration claims; mirror, not coach;
 * real reviews only (the quotes below are the ones the web funnels ship).
 */

export type MoodKey = "overloaded" | "worried" | "hopeful";

export const HOOK = {
  // Miro #2: "yes/no buy in question - does your head feel too full right now?"
  title: "Does your head feel too full right now?",
  promise: "Ripple keeps track of what you say, so your head doesn't have to.",
  mood: "overloaded" as MoodKey,
};

export const AGE = {
  title: "Which age range are you in?",
  options: [
    { id: "u25", label: "Under 25" },
    { id: "25", label: "25 to 34" },
    { id: "35", label: "35 to 44" },
    { id: "45", label: "45 or older" },
  ],
};

export type CarryIcon = "briefcase" | "users" | "rocket" | "wallet" | "dumbbell" | "heart";

export const CARRYING = {
  title: "What are you carrying right now?",
  sub: "Pick all that apply.",
  options: [
    { id: "work", label: "A demanding job", icon: "briefcase" as CarryIcon },
    { id: "family", label: "Kids or family", icon: "users" as CarryIcon },
    { id: "side", label: "Building something on the side", icon: "rocket" as CarryIcon },
    { id: "money", label: "Money pressure", icon: "wallet" as CarryIcon },
    { id: "health", label: "Training or my health", icon: "dumbbell" as CarryIcon },
    { id: "partner", label: "A relationship", icon: "heart" as CarryIcon },
  ],
};

export const SOUND = {
  eyebrow: "Tap what's true",
  title: "Does this sound like you?",
  statement: "Things I say I'll do slip for weeks.",
  mood: "worried" as MoodKey,
};

export const NOT_LAZY = {
  title: "You're not lazy. You're running without a system.",
  body:
    "Most people don't lack discipline. They're carrying fifty loose ends with nowhere to put them down, so the important stuff gets dropped.",
  things: [
    "Book the dentist",
    "Renew insurance",
    "Reply to Dave",
    "Side project",
    "Pay the card",
    "Sign the school form",
    "Train Monday",
    "Call the plumber",
  ],
  cta: "That's me",
};

export const YEAR = {
  eyebrow: "Built from your answers",
  cta: "Start my first week",
  rows: [
    { day: "Day 1", icon: "list", title: "Your to-do list writes itself", text: "Talk or type whatever's on your mind. Ripple pulls out the tasks." },
    { day: "Day 3", icon: "target", title: "Habits track themselves", text: "The habits you mention start tracking on their own. Your mood gets a read after every debrief." },
    { day: "Day 7", icon: "eye", title: "You see your own pattern", text: "Your first pattern: what you keep putting off. Plus your first weekly report." },
    { day: "Day 30", icon: "waves", title: "The ripple effect starts", text: "A month of your own words adds up. Fewer things slip, the habits that stuck are clear, and you can see which weeks wear you down." },
    { day: "Day 365", icon: "sprout", title: "It spreads through your whole life", text: "A year of debriefs across work, family, health and money, all in your Life Matrix. You can see how far you've come, in your own words." },
  ] as const,
};

export const READY = {
  // Miro #8: "are you ready to add the system that will help you get further faster?"
  title: "Ready to add the system that helps you get further, faster?",
  sub: "Next up: your first debrief. Say whatever's on your mind and Ripple sorts it out.",
  yes: "Yes, I'm ready",
  mood: "hopeful" as MoodKey,
};

/** Real quotes only — the set both web funnels already ship. */
export const REVIEWS = [
  { quote: "The task manager is a lifesaver!! I never forget anything anymore", name: "App Store review" },
  { quote: "My therapist asked what changed. I showed her my Ripple report. She said ‘this is what I try to do in sessions.’", name: "James K." },
  { quote: "I found out I mention quitting my job every Monday. I never noticed until the weekly report showed me. That one pattern changed everything.", name: "Sarah M." },
];

export const FAQ = [
  { q: "When will I be charged?", a: "Not today. Your 7 days are free, and your plan starts on day 7 unless you cancel before then." },
  { q: "Can I cancel?", a: "Yes, any time in your iPhone's Settings → Apple ID → Subscriptions. Cancel before day 7 and you pay nothing." },
  { q: "Is this therapy?", a: "No. Ripple keeps track of what you say, turns it into your to-do list and shows you your own patterns. It isn't therapy and doesn't give medical advice." },
  { q: "Where do my debriefs go?", a: "Into your private account. You can delete any debrief, or your whole account, whenever you want." },
];

export const PRO_FEATURES = [
  { icon: "list", title: "A to-do list that writes itself", text: "Every task you mention, pulled out and kept." },
  { icon: "target", title: "Habit tracking", text: "The habits you talk about track themselves." },
  { icon: "eye", title: "Patterns you can't see from inside", text: "What drains you, what lifts you, week over week." },
  { icon: "bell", title: "Your weekly report", text: "The story of your week, written from your own words." },
] as const;

/** A mirror of her own answers, not a diagnosis (paywall "Made for …"). */
export function stateName(a: { sound?: "yes" | "no"; carrying: string[] }): string {
  if (a.sound === "yes" && a.carrying.length >= 2) return "The Juggler";
  if (a.sound === "yes") return "The Operator";
  if (a.carrying.length >= 3) return "The Carrier";
  return "The Planner";
}

/** First-habit suggestions (Miro #13), picked from what she's carrying. */
const HABITS_BY_CARRY: Record<string, string[]> = {
  health: ["Work out", "Drink more water"],
  work: ["Plan tomorrow before I log off"],
  side: ["One hour on the side project"],
  money: ["Check my spending"],
  family: ["Phone-free time with family"],
  partner: ["Quality time with my partner"],
};
const HABIT_FALLBACK = ["Walk outside", "Read before bed", "Drink more water"];

export function habitSuggestions(carrying: string[]): string[] {
  const out: string[] = [];
  for (const c of carrying) for (const h of HABITS_BY_CARRY[c] ?? []) if (!out.includes(h)) out.push(h);
  for (const h of HABIT_FALLBACK) if (!out.includes(h)) out.push(h);
  return out.slice(0, 3);
}
