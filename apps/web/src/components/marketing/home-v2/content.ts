/**
 * Copy for the 2026-10 homepage (home-v2). Plain data, no React, so the
 * server page can build its FAQPage JSON-LD from the same FAQ the visitor
 * sees (Google wants structured data to match visible content).
 *
 * Audience-neutral on purpose (Keenan, 2026-10-21): one homepage for the
 * Ripple and BWK audiences. The demo "plates" carry both sets of examples
 * (work / kids / parents from the women's funnel, training / side project
 * from the BWK funnel; lib/funnel-v9-config.ts V9_SAMPLES + BWK_V9.samples).
 *
 * Rules that apply to every line here (docs/acuity-positioning.md):
 * no recording-duration claims, no time-of-day framing, never claim Ripple
 * treats, diagnoses, cures or replaces therapy.
 */

export type DemoPlate = {
  id: string;
  label: string;
  said: string;
  tasks: string[];
  mood: string;
  habit: string;
  pattern: string;
};

export const DEMO_PLATES: DemoPlate[] = [
  {
    id: "work",
    label: "Work",
    said: "Three deadlines this week, I promised Dana feedback, and I still haven’t booked my own checkup. I keep saying I’ll do it.",
    tasks: ["Give Dana feedback", "Book your checkup"],
    mood: "Pulled in every direction",
    habit: "Walk: skipped 3 days",
    pattern: "Your own appointments are what you push back first.",
  },
  {
    id: "kids",
    label: "Kids and family",
    said: "Emma’s form is due Friday, I still haven’t called the plumber, and I snapped at Jake again. I think I’m just tired.",
    tasks: ["Sign Emma’s form before Friday", "Call the plumber"],
    mood: "Stretched thin",
    habit: "Sleep: short 4 nights",
    pattern: "Tired and short-tempered keep showing up on the same days.",
  },
  {
    id: "parents",
    label: "Aging parents",
    said: "Mom’s appointment moved to Thursday, I need to refill her prescription, and work wants the report early. I haven’t sat down all week.",
    tasks: ["Take Mom to her appointment Thursday", "Refill Mom’s prescription", "Send the report early"],
    mood: "Running on empty",
    habit: "Walk: missed all week",
    pattern: "Weeks with Mom’s appointments are the weeks you skip your own walks.",
  },
  {
    id: "training",
    label: "Training",
    said: "Skipped the gym again, the Henderson quote is due Thursday, and I still haven’t called about the truck. I keep saying tomorrow.",
    tasks: ["Send the Henderson quote by Thursday", "Call about the truck", "Book three gym sessions"],
    mood: "Frustrated",
    habit: "Gym: 1 of 4 this week",
    pattern: "The gym is the first thing to go when work gets loud.",
  },
  {
    id: "side",
    label: "A side project",
    said: "I said I’d look at the budget this week and didn’t. The side project’s been sitting for a month. I know what to do, I’m just not doing it.",
    tasks: ["Sit down with the budget", "One hour on the side project"],
    mood: "Stuck",
    habit: "Side project: 0 hours",
    pattern: "Money and the side project only come up at the end of the week.",
  },
];

/** Same answers the test funnels' paywall FAQ uses (V9_FAQ), plus two objections. */
export const HOME_FAQS: { q: string; a: string }[] = [
  {
    q: "When will I be charged?",
    a: "Not today. Your 7 days are free. We email you a reminder on day 4, and your plan starts on day 7 unless you cancel.",
  },
  { q: "Can I cancel?", a: "Yes, any time from your account settings. Cancel before day 7 and you pay nothing." },
  {
    q: "Do I have to talk every day?",
    a: "No. Talk whenever something is on your mind. Ripple works with whatever you give it, and you can type instead of talking.",
  },
  { q: "What if I ramble?", a: "Ramble away. Ripple pulls the to-dos, habits, mood and patterns out of however you say it." },
  {
    q: "Is this therapy?",
    a: "No. Ripple is an AI habit tracker and voice journal: it keeps track of what you say, turns it into your to-do list and shows you your own patterns so you can change what you want to change. It isn’t therapy and doesn’t give medical advice.",
  },
  {
    q: "Where do my debriefs go?",
    a: "Into your private account. You can delete any debrief, or your whole account, whenever you want.",
  },
];

/** Real reviews only (same set the funnels ship). */
export const HOME_REVIEWS: { quote: string; name: string }[] = [
  { quote: "The task manager is a lifesaver!! I never forget anything anymore.", name: "App Store review" },
  {
    quote: "I found out I mention quitting my job every Monday. I never noticed until the weekly report showed me.",
    name: "Sarah M.",
  },
  {
    quote: "Week 3, Ripple told me I bring up my mom every time I’m stressed about work. I’d never connected those.",
    name: "Priya R.",
  },
];

export const TICKER_ITEMS = [
  "Call the plumber",
  "Train Monday",
  "Mom’s refill",
  "Send the invoice",
  "Book the checkup",
  "Side project: 1 hour",
  "Reply to Dana",
  "Pay the card",
  "Emma’s form",
  "Renew insurance",
  "Walk after lunch",
  "Plan the weekend",
];
