import { SeoLanding } from "@/components/marketing/seo-landing/SeoLanding";
import { priceFaqAnswer, seoMetadata } from "@/components/marketing/seo-landing/meta";
import type { SeoLandingContent } from "@/components/marketing/seo-landing/types";
import { PRODUCT_CATEGORY } from "@/lib/positioning";

// Static marketing page; refreshed daily so pricing copy follows the live tier.
export const revalidate = 86400;

const DESCRIPTION =
  "Ripple is a habit tracker app you talk to. Say you trained, walked or read and it’s checked off. Skip it and Ripple notices. Free for 7 days, cancel anytime.";

export const metadata = seoMetadata({
  slug: "habit-tracker-app",
  title: "Habit Tracker App You Just Talk To",
  description: DESCRIPTION,
});

const content: SeoLandingContent = {
  slug: "habit-tracker-app",
  crumb: "Habit tracker app",
  pageName: "Ripple: the habit tracker app you just talk to",
  description: DESCRIPTION,
  hero: {
    eyebrow: "Habit tracker app",
    h1: "The habit tracker app",
    h1Accent: "you just talk to.",
    intro: [
      "Ripple is a habit tracker app with no boxes to tick. You say what you did (“got the walk in”, “read a few chapters”) and Ripple checks the habit off; skip it for a few days and Ripple notices and tells you.",
      `It’s part of Ripple, ${PRODUCT_CATEGORY}. The same things you say also fill your to-do list, track your mood and show what keeps getting in the way of the habits you care about.`,
    ],
    chips: ["Gym: 3 this week", "Mention it, it’s checked off", "Skip it, Ripple notices", "Habits next to your mood", "No boxes to tick"],
    card: {
      label: "Example: a habit week",
      said: "Got the walk in, finally. Didn’t read again, I keep scrolling instead. Gym twice so far, I want one more before Saturday.",
      items: [
        { label: "To-do", value: "Fit in one more gym session before Saturday", tone: "todo" },
        { label: "Habits", value: "Walk ✓ · Gym 2 of 3", tone: "habit" },
        { label: "Mood", value: "Better than last week", tone: "mood" },
        { label: "Keeps coming up", value: "Reading slips on the days you mention scrolling.", tone: "pattern" },
      ],
    },
  },
  how: {
    eyebrow: "How it works",
    title: "Say what you did. Ripple ticks the box.",
    steps: [
      {
        title: "Name the habits you care about",
        body: "Training, walking, reading, drinking less, calling your parents, an hour on the side project. Pick them in the app, or just talk about them and Ripple picks them up.",
      },
      {
        title: "Talk about your day, whenever",
        body: "Voice or typed, in any order. “Did the gym, skipped the walk, read on the train.” Ripple matches what you said to your habits and checks off the ones you did.",
      },
      {
        title: "See what’s holding and what’s slipping",
        body: "Habits that go quiet get flagged, and they sit next to your mood and what was going on that week. You see why a habit slipped, not only that it did.",
      },
    ],
  },
  benefits: {
    eyebrow: "Why it works differently",
    title: "A habit tracker that does the tracking.",
    intro:
      "Most habit apps ask you to report in. Ripple listens for the habit inside whatever you were already going to say, so keeping count stops being one more habit to keep.",
    cards: [
      {
        title: "Mention it, and it’s checked off",
        body: "Say “got my run in” or “read twenty pages” and the habit is marked done for that day. No app to open, no row of circles to tap.",
        tone: "white",
        wide: true,
        visual: {
          kind: "habits",
          rows: [
            { name: "Train", on: [1, 1, 0, 1, 1, 0, 1] },
            { name: "Walk", on: [1, 0, 0, 1, 1, 1, 1] },
            { name: "Read", on: [0, 1, 1, 0, 1, 0, 1] },
          ],
        },
      },
      {
        title: "Skip it, and Ripple notices",
        body: "There’s no red counter waiting for you. When a habit goes quiet, Ripple says so plainly, so you can decide whether to restart it or let it go.",
        tone: "mint",
        visual: {
          kind: "habits",
          rows: [
            { name: "Stretch", on: [1, 1, 0, 0, 0, 0, 0] },
            { name: "Water", on: [1, 1, 1, 0, 1, 1, 1] },
          ],
          note: "Stretch: not mentioned in 5 days",
        },
      },
      {
        title: "Habits next to your mood",
        body: "See the weeks you trained alongside the weeks you felt good, and the weeks both dropped off together. The connection tells you more than the count.",
        tone: "white",
        visual: { kind: "mood", points: [40, 52, 48, 66, 72, 61, 78], caption: "Example mood line rising across a good training month" },
      },
      {
        title: "What gets in the way",
        body: "When a habit slips, Ripple shows what you were talking about at the time: a big week at work, a sick kid, travel. Your own words, gathered in one place.",
        tone: "violet",
        visual: { kind: "chips", chips: ["Work deadlines · 9", "Short on sleep · 5", "Travel · 4", "Kids sick · 3"] },
      },
      {
        title: "Habits inside your whole week",
        body: "The weekly report every Sunday covers habits alongside everything else: what moved, what slipped, and one thing worth doing next.",
        tone: "peach",
        visual: {
          kind: "report",
          rows: [
            { tag: "MOVED", text: "Gym: three sessions, up from one." },
            { tag: "SLIPPED", text: "Reading: two days out of seven." },
            { tag: "NEXT", text: "Put the book where your phone usually sits." },
          ],
        },
      },
      {
        title: "Built for real habits, not perfect ones",
        body: "Drink less, call your mom more, take the stairs, no phone at dinner. If you can say it, Ripple can keep count of it.",
        tone: "sand",
        visual: { kind: "quote", text: "Called Dad on the way home, skipped the wine, and I actually stretched.", caption: "Three habits, one sentence" },
      },
    ],
  },
  example: {
    eyebrow: "What you said → what Ripple caught",
    title: "One ramble, three habits updated.",
    intro: "You never have to say “log my habit”. Ripple finds the habits in the middle of everything else, along with the to-dos, the mood and the thing that keeps repeating.",
    examples: [
      {
        label: "A crowded week",
        said: "Only made the gym once, the Henderson job ate everything. I did walk the dog every day though. Need to call the bank about the loan before Friday, and I haven’t touched the guitar in ages.",
        tasks: [{ text: "Call the bank about the loan", when: "Friday" }],
        habits: ["Walk: every day ✓", "Gym: 1 of 3", "Guitar: quiet for 2 weeks"],
        mood: "Stretched, still moving",
        pattern: "The gym is the first habit to go when a big job lands.",
      },
      {
        label: "A better one",
        said: "Three gym sessions, read most days, and I cooked instead of ordering in. Mom’s birthday is the 14th, I need to order flowers. Feeling more like myself.",
        tasks: [{ text: "Order flowers for Mom", when: "Before the 14th" }],
        habits: ["Gym: 3 of 3 ✓", "Read: 5 of 7", "Cook at home ✓"],
        mood: "More like yourself",
        pattern: "Weeks you cook at home are the weeks you train most.",
      },
    ],
  },
  explainer: {
    eyebrow: "The problem with checkboxes",
    title: "Tracking shouldn’t be the habit you fail at.",
    paragraphs: [
      "Most habit tracker apps work the same way: you set a habit, then open the app every day to tick it. On a good week that feels great. On a hard week, the app turns into one more thing you didn’t do, and a broken streak can make it easier to quit the whole thing than to start again.",
      "Ripple flips the order. You don’t report to the app; you talk about your life and the tracking happens on the side. Mention a run while you’re talking about work, the kids or a deadline, and the run is counted.",
      "Because Ripple hears the rest of your week too, it can show more than a tally. It puts the habit next to your mood and next to whatever you were dealing with when it slipped. That’s the part a checkbox never sees, and usually the part that explains what to change.",
    ],
    points: [
      { title: "No daily tapping", body: "The habit is logged from what you say. If you don’t mention it, it simply counts as not done that day." },
      { title: "No guilt counter", body: "Ripple points out a habit that’s gone quiet in plain words, with no flashing streak to protect." },
      { title: "Context, not only counts", body: "A slipped habit sits next to your mood and the themes you talked about that week." },
      { title: "One app instead of three", body: "Your habits, your to-do list and your notes on the week all come from the same debrief." },
    ],
  },
  compare: {
    eyebrow: "Why this instead of a checkbox app",
    title: "Same goal, less admin.",
    headers: ["A checkbox habit tracker", "Ripple"],
    rows: [
      { label: "Logging a habit", other: "Open the app and tap each habit you did.", ripple: "Mention it while you talk. Ripple checks it off." },
      { label: "A missed day", other: "Usually a broken streak to start over.", ripple: "Ripple notices the habit went quiet and says so plainly." },
      { label: "Why it slipped", other: "Not recorded unless you add a note.", ripple: "Shown next to your mood and what you were dealing with." },
      { label: "Everything else", other: "Your to-dos and notes live in other apps.", ripple: "To-dos, mood, patterns, Life Matrix and a weekly report in one place." },
    ],
    note: "If you love ticking boxes, a checkbox tracker is a good fit, and there are plenty of them. Ripple is for people who would rather talk and let the tracking look after itself.",
  },
  reviewsTitle: "Kept track of, without the tapping.",
  faqs: [
    {
      q: "How does a habit tracker app you talk to work?",
      a: "You talk or type whenever something is on your mind. Ripple turns what you said into text, matches anything you mention to your habits and checks off the ones you did. Habits you haven’t mentioned for a while get flagged, so you can see what’s slipping.",
    },
    {
      q: "Do I have to talk every day for my habits to count?",
      a: "No. Talk whenever suits you and Ripple works with what you give it. Days you don’t mention a habit count as not done, and Ripple points out the ones that go quiet rather than punishing you for a gap.",
    },
    {
      q: "What kinds of habits can Ripple track?",
      a: "Anything you can say out loud: training, walking, reading, drinking water, drinking less, stretching, calling family, time on a side project. If it’s something you do or skip, Ripple can keep count of it.",
    },
    {
      q: "Can I type instead of talking?",
      a: "Yes. Talking is what Ripple is built around, but you can type any debrief instead, and the habits, to-dos and mood are picked up the same way.",
    },
    {
      q: "Is Ripple only a habit tracker?",
      a: `No. Ripple is ${PRODUCT_CATEGORY}. The same debrief fills your to-do list with the dates you mentioned, tracks your mood, shows what keeps coming up, scores your life areas in the Life Matrix and sends a weekly report every Sunday.`,
    },
    { q: "How much does Ripple cost?", a: priceFaqAnswer() },
  ],
  finalCta: {
    title: "Say what you did. Ripple keeps count.",
    body: "Your habits, to-dos and mood, tracked from what you already say. Try it free for a week.",
  },
  order: ["how", "benefits", "example", "explainer", "compare", "reviews", "pricing", "faq", "related"],
};

export default function HabitTrackerAppPage() {
  return <SeoLanding content={content} />;
}
