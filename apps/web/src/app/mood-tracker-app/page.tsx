import { SeoLanding } from "@/components/marketing/seo-landing/SeoLanding";
import { priceFaqAnswer, seoMetadata } from "@/components/marketing/seo-landing/meta";
import type { SeoLandingContent } from "@/components/marketing/seo-landing/types";
import { PRODUCT_CATEGORY } from "@/lib/positioning";

// Static marketing page; refreshed daily so pricing copy follows the live tier.
export const revalidate = 86400;

const DESCRIPTION =
  "Ripple is a mood tracker app with nothing to fill in. It reads your mood from your own words and shows it next to your habits and your week. 7-day free trial.";

export const metadata = seoMetadata({
  slug: "mood-tracker-app",
  title: "Mood Tracker App You Don’t Have to Fill In",
  description: DESCRIPTION,
});

const content: SeoLandingContent = {
  slug: "mood-tracker-app",
  crumb: "Mood tracker app",
  pageName: "Ripple: a mood tracker app you don’t have to fill in",
  description: DESCRIPTION,
  hero: {
    eyebrow: "Mood tracker app",
    h1: "A mood tracker app you",
    h1Accent: "don’t have to fill in.",
    intro: [
      "Ripple is a mood tracker app that reads your mood from what you say, so there are no scales, faces or forms to fill in. Talk or type about your day, and Ripple notes how you sounded and shows it over time, next to your habits and what you were dealing with.",
      `It isn’t a diagnosis and it isn’t therapy. It’s a clear record of your good weeks and your heavy ones, in your own words, inside Ripple: ${PRODUCT_CATEGORY}.`,
    ],
    chips: ["Mood: lighter this week", "Nothing to fill in", "In your own words", "Next to your habits", "Not a diagnosis"],
    card: {
      label: "Example: how a mood gets read",
      said: "Honestly a good day. Got the proposal out, went for a run, had dinner with Leah. Still a bit anxious about Friday’s review, but less than yesterday.",
      items: [
        { label: "Mood", value: "Good, a little uneasy about Friday", tone: "mood" },
        { label: "Habit", value: "Run ✓", tone: "habit" },
        { label: "To-do", value: "Prepare for Friday’s review · Friday", tone: "todo" },
        { label: "Keeps coming up", value: "Your best days this month include a run or time with friends.", tone: "pattern" },
      ],
    },
  },
  how: {
    eyebrow: "How it works",
    title: "You talk. Your mood gets tracked.",
    steps: [
      {
        title: "Talk about whatever happened",
        body: "No 1-to-10 scale and no picking a face. Say what happened and how it went, by voice or typed, whenever it suits you.",
      },
      {
        title: "Ripple reads the tone",
        body: "Ripple notes your mood from your own words and keeps the reason with it: the deadline, the good conversation, the bad sleep.",
      },
      {
        title: "See it over weeks",
        body: "Your mood line builds up over time next to your habits and the themes you talk about, and the Sunday weekly report sums the week up in plain words.",
      },
    ],
  },
  explainer: {
    eyebrow: "Why mood logs go quiet",
    title: "A number on its own doesn’t say much.",
    paragraphs: [
      "Most mood tracker apps ask you to rate your day: a number, a face or a word from a list. It’s quick, but a rating on its own doesn’t tell you much later. A “3” from three weeks ago doesn’t remind you it was the week of the move, or the week you barely slept.",
      "And the days you’d most want on record are often the days you least feel like filling in a form. So the log gets patchy right when it would be most useful.",
      "Ripple works from what you’d say anyway. You talk about your day; Ripple reads the mood and keeps the reasons attached. Over a few weeks you get a mood line you didn’t have to build, with the context that explains the dips and the good stretches.",
    ],
    points: [
      { title: "It is a record", body: "Your mood over days and weeks, read from your own words, so you can look back honestly." },
      { title: "It is connected", body: "Mood sits next to your habits, your to-dos and the themes you keep talking about." },
      { title: "It isn’t a diagnosis", body: "Ripple doesn’t assess, label or treat anything. It reflects what you said, nothing more." },
      { title: "It isn’t a replacement for care", body: "If you’re struggling, talk to a doctor or a qualified professional. Ripple can sit alongside that, not instead of it." },
    ],
  },
  benefits: {
    eyebrow: "What you can see",
    title: "Your mood, with the reasons attached.",
    intro: "Because Ripple hears the whole story, your mood isn’t a lonely number. It comes with what was going on, what you did and what you skipped.",
    cards: [
      {
        title: "Good weeks and heavy ones",
        body: "A mood line that builds itself from your debriefs, so the shape of the last month or two is easy to see at a glance.",
        tone: "white",
        wide: true,
        visual: {
          kind: "mood",
          points: [62, 48, 35, 41, 58, 66, 60, 74],
          labels: ["Wk 1", "Wk 2", "Wk 3", "Wk 4", "Wk 5", "Wk 6", "Wk 7", "Wk 8"],
          caption: "Example mood line over eight weeks: a dip in weeks 3 and 4, then a rise",
        },
      },
      {
        title: "Mood next to habits",
        body: "See how your weeks look when you’re training, walking or reading, and when you’re not. Your own data, side by side.",
        tone: "mint",
        visual: {
          kind: "habits",
          rows: [
            { name: "Walk", on: [1, 1, 0, 1, 1, 1, 0] },
            { name: "Gym", on: [1, 0, 0, 1, 0, 1, 0] },
          ],
          note: "Lighter days followed time outside",
        },
      },
      {
        title: "A week at a glance",
        body: "Each debrief gets a mood read, so a week shows up as a shape you can actually see, from 1 (heavy) to 5 (good).",
        tone: "white",
        visual: {
          kind: "week",
          days: [
            { day: "Mon", word: "tense", level: 2 },
            { day: "Tue", word: "heavy", level: 1 },
            { day: "Wed", word: "okay", level: 3 },
            { day: "Thu", word: "okay", level: 3 },
            { day: "Fri", word: "lighter", level: 4 },
            { day: "Sat", word: "good", level: 5 },
            { day: "Sun", word: "good", level: 4 },
          ],
        },
      },
      {
        title: "What was going on",
        body: "The themes behind the mood, counted from what you talked about: the deadline, family, sleep, time outside.",
        tone: "violet",
        visual: { kind: "chips", chips: ["Deadline · 6", "Mom · 4", "Good sleep · 4", "Time outside · 3"] },
      },
      {
        title: "In your words, not a number",
        body: "Ripple keeps the reason with the read, so looking back tells you what happened, not just how it scored.",
        tone: "peach",
        visual: { kind: "quote", text: "Flat. Not sad, just flat. Too many meetings and no time outside.", caption: "Mood: flat · reason kept" },
      },
      {
        title: "The week, summed up",
        body: "Every Sunday the weekly report covers your mood with everything else, and suggests one thing worth doing next.",
        tone: "ink",
        visual: {
          kind: "report",
          rows: [
            { tag: "MOVED", text: "Mood lifted once the deadline passed." },
            { tag: "PATTERN", text: "Your lighter days follow time outside." },
            { tag: "NEXT", text: "Plan one walk on Tuesday, your heaviest day lately." },
          ],
        },
      },
    ],
  },
  example: {
    eyebrow: "What you said → what Ripple caught",
    title: "Same app, two very different weeks.",
    intro: "Nothing to rate. Ripple reads the mood from how you describe the week and keeps the to-dos and habits that came with it.",
    examples: [
      {
        label: "A heavy week",
        said: "Couldn’t focus at all. The layoff rumors are all anyone talks about. Skipped the gym three times. I should update my CV, honestly. The kids were great though.",
        tasks: [{ text: "Update your CV" }],
        habits: ["Gym: skipped 3 times"],
        mood: "Uneasy, with a bright spot at home",
        pattern: "Work worry and skipped workouts show up in the same weeks.",
      },
      {
        label: "A lighter one",
        said: "Long walk with Mom, finished the book, and finally booked the trip for August. I need to send Mom the photos. Feel like I can breathe again.",
        tasks: [{ text: "Send Mom the photos" }, { text: "Pay the trip deposit", when: "August" }],
        habits: ["Walk ✓", "Read: finished the book ✓"],
        mood: "Light, able to breathe",
        pattern: "Your lightest weeks include time with family and time outside.",
      },
    ],
  },
  compare: {
    eyebrow: "Why this instead of a fill-in mood log",
    title: "Less logging, more context.",
    headers: ["A fill-in mood tracker", "Ripple"],
    rows: [
      { label: "Logging", other: "Pick a number, face or word each day.", ripple: "Talk about your day. Ripple reads the mood." },
      { label: "The why", other: "Optional notes, easy to skip.", ripple: "The reason is kept, straight from what you said." },
      { label: "Connections", other: "Mood on its own unless you add tags.", ripple: "Mood next to habits, themes and your to-dos." },
      { label: "Looking back", other: "A chart of ratings.", ripple: "A mood line plus a weekly report in plain words." },
    ],
    note: "Quick-tap mood logs suit people who like a daily rating. Ripple is for people who would rather talk, and want the context kept.",
  },
  reviewsTitle: "“I never noticed until the weekly report showed me.”",
  faqs: [
    {
      q: "How does a mood tracker app work without filling anything in?",
      a: "You talk or type about your day the way you normally would. Ripple reads the mood from your own words, keeps the reason with it, and plots it over time next to your habits and the themes you talk about.",
    },
    {
      q: "Can Ripple diagnose anxiety or depression?",
      a: "No. Ripple doesn’t diagnose, assess or treat any condition, and it isn’t therapy. It keeps a record of how you sounded, in your own words. If you’re worried about your mental health, please talk to a doctor or a qualified professional.",
    },
    {
      q: "What will I actually see?",
      a: "A mood line over days and weeks, the habits you kept or skipped alongside it, the themes that keep coming up, a Life Matrix of the main areas of your life, and a weekly report every Sunday.",
    },
    {
      q: "Do I have to talk every day?",
      a: "No. Talk whenever something is on your mind. Ripple works with whatever you give it, and you can type instead of talking.",
    },
    {
      q: "Is my mood data private?",
      a: "Your debriefs live in your own private account. You can delete any debrief, or your whole account, whenever you want.",
    },
    { q: "How much does Ripple cost?", a: priceFaqAnswer() },
  ],
  finalCta: {
    title: "Talk about your week. Ripple keeps the record.",
    body: "Your mood, your habits and the reasons behind both, without a form in sight. Try it free for a week.",
  },
  order: ["how", "explainer", "benefits", "example", "compare", "reviews", "pricing", "faq", "related"],
};

export default function MoodTrackerAppPage() {
  return <SeoLanding content={content} />;
}
