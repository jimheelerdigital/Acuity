import { SeoLanding } from "@/components/marketing/seo-landing/SeoLanding";
import { priceFaqAnswer, seoMetadata } from "@/components/marketing/seo-landing/meta";
import type { SeoLandingContent } from "@/components/marketing/seo-landing/types";
import { PRODUCT_CATEGORY } from "@/lib/positioning";

// Static marketing page; refreshed daily so pricing copy follows the live tier.
export const revalidate = 86400;

const DESCRIPTION =
  "Ripple is an AI journal app that does the follow-up: it turns what you say into to-dos with dates, tracks habits and mood, and spots patterns. Try 7 days free.";

export const metadata = seoMetadata({
  slug: "ai-journal-app",
  title: "AI Journal App That Turns Talk Into a Plan",
  description: DESCRIPTION,
});

const content: SeoLandingContent = {
  slug: "ai-journal-app",
  crumb: "AI journal app",
  pageName: "Ripple: an AI journal app that turns what you say into a plan",
  description: DESCRIPTION,
  hero: {
    eyebrow: "AI journal app",
    h1: "An AI journal app that turns what you say",
    h1Accent: "into a plan.",
    intro: [
      "Ripple is an AI journal app that does something with what you write or say. Talk or type whatever is on your mind, and Ripple turns it into your to-do list with the dates you mentioned, checks off your habits, tracks your mood and shows you what keeps coming up.",
      `Most journals stop at the entry. Ripple, ${PRODUCT_CATEGORY}, picks up where the entry ends, and every Sunday it writes up your week for you.`,
    ],
    chips: ["Reply to Marcus: Wednesday", "Voice or typed", "Private to your account", "To-dos with dates", "Weekly report every Sunday"],
    card: {
      label: "Example: one entry",
      said: "Big meeting went better than I expected. Still haven’t replied to Marcus about the offsite, need to do that by Wednesday. Skipped my run again. I think I’m avoiding the budget talk with Sam.",
      items: [
        { label: "To-do", value: "Reply to Marcus about the offsite · Wednesday", tone: "todo" },
        { label: "Mood", value: "Relieved, a bit avoidant", tone: "mood" },
        { label: "Habit", value: "Run: skipped", tone: "habit" },
        { label: "Keeps coming up", value: "The budget talk with Sam has come up three weeks running.", tone: "pattern" },
      ],
    },
  },
  how: {
    eyebrow: "How it works",
    title: "Write it, or just say it. Ripple does the follow-up.",
    steps: [
      {
        title: "Talk or type, unedited",
        body: "No prompts to answer and no blank page. Talk the way you would to a friend, or type when you can’t talk. Each one is saved as a debrief in your private account.",
      },
      {
        title: "Ripple reads it for you",
        body: "It pulls out the to-dos and the dates you said, checks off habits you mentioned, notes your mood, and files what you talked about into areas of your life like work, family and health.",
      },
      {
        title: "Come back to a plan, not a pile",
        body: "Your list is ready and your habits are up to date. Every Sunday a weekly report pulls the week together: what moved, what slipped, what keeps coming up.",
      },
    ],
  },
  example: {
    eyebrow: "What you said → what Ripple caught",
    title: "What a journal keeps, and what Ripple catches.",
    intro: "A regular journal would save these as two entries. Ripple saves them too, then does the reading back for you.",
    examples: [
      {
        label: "A flat week",
        said: "I keep saying I’ll start the course and I haven’t opened it. Sophie’s recital is Thursday, I need to leave work early. Feeling flat. Haven’t been to the gym since the trip.",
        tasks: [
          { text: "Leave early for Sophie’s recital", when: "Thursday" },
          { text: "Open the course and do lesson one" },
        ],
        habits: ["Gym: not since the trip"],
        mood: "Flat",
        pattern: "The course comes up most weeks and hasn’t moved yet.",
      },
      {
        label: "Talking it through",
        said: "Had the talk with my brother about Dad’s care. Went better than I thought. We agreed I’d call the care home Monday and he’d handle the paperwork. Walked twice. Slept badly.",
        tasks: [{ text: "Call the care home", when: "Monday" }],
        habits: ["Walk: 2 this week"],
        mood: "Relieved, tired",
        pattern: "Dad’s care shows up in most of your heavier weeks.",
      },
    ],
  },
  benefits: {
    eyebrow: "What the AI actually does",
    title: "A journal that does the follow-up.",
    intro: "Plenty of journaling apps are good at storing what you wrote. Ripple is built around what happens next, so the things you said don’t stay on the page.",
    cards: [
      {
        title: "Your entries become a to-do list",
        body: "Mention it once and it’s on your list, with the day you said it was due. Things you bring up again and again get flagged, so they stop slipping.",
        tone: "white",
        wide: true,
        visual: {
          kind: "tasks",
          items: [
            { text: "Renew your passport", tag: "Done", done: true, tagKind: "done" },
            { text: "Reply to Marcus about the offsite", tag: "Wednesday", tagKind: "date" },
            { text: "Book the car service", tag: "Friday", tagKind: "date" },
            { text: "Talk to Sam about the budget", tag: "Mentioned 3 times", tagKind: "count" },
          ],
        },
      },
      {
        title: "It remembers what you keep circling",
        body: "Ripple connects entries across weeks, so the thing you’ve mentioned four times gets noticed, even if you never wrote “this matters”.",
        tone: "violet",
        visual: { kind: "chips", chips: ["The budget · 6", "Sleep · 5", "Marcus · 4", "Running · 4"] },
      },
      {
        title: "Your mood, without a mood scale",
        body: "Ripple reads the tone of what you said and plots it over time, so you can look back at your heavy weeks and your good ones.",
        tone: "white",
        visual: { kind: "mood", points: [55, 42, 38, 50, 64, 58, 70], caption: "Example mood line dipping then recovering over several weeks" },
      },
      {
        title: "Habits that log themselves",
        body: "Say you ran, read or stretched and it’s checked off. Skip it for a while and Ripple notices.",
        tone: "mint",
        visual: {
          kind: "habits",
          rows: [
            { name: "Run", on: [1, 0, 1, 0, 0, 1, 0] },
            { name: "Read", on: [1, 1, 1, 0, 1, 1, 1] },
          ],
        },
      },
      {
        title: "A weekly report you didn’t write",
        body: "Every Sunday: what happened, what moved, what slipped, and one thing worth doing next. The throughline you would never have time to piece together.",
        tone: "ink",
        visual: {
          kind: "report",
          rows: [
            { tag: "MOVED", text: "Offsite plans: replied and booked." },
            { tag: "SLIPPED", text: "Running: once this week." },
            { tag: "PATTERN", text: "The budget comes up whenever work gets loud." },
          ],
        },
      },
      {
        title: "Life Matrix: the wider view",
        body: "The main areas of your life, scored from what you talk about and tracked over time, so you can see what’s thriving and what’s slipping.",
        tone: "sage",
        visual: {
          kind: "bars",
          rows: [
            { name: "Family", pct: 80, color: "#F27A55" },
            { name: "Work", pct: 71, color: "#6D5EF0" },
            { name: "Health", pct: 52, color: "#F2B544" },
            { name: "Growth", pct: 46, color: "#2E9C78" },
          ],
        },
      },
    ],
  },
  compare: {
    eyebrow: "Why this instead of a regular journal",
    title: "The entry is where Ripple starts.",
    headers: ["A traditional journal", "Ripple"],
    rows: [
      { label: "Getting started", other: "A blank page or a daily prompt.", ripple: "Talk or type whatever is in your head, in any order." },
      { label: "After you write", other: "The entry sits in a list.", ripple: "To-dos, habits and mood are pulled out and kept up to date." },
      { label: "Looking back", other: "You reread old entries to find the thread.", ripple: "Ripple shows what keeps coming up and sends a weekly report." },
      { label: "How you add to it", other: "Usually typing or handwriting.", ripple: "Voice or typed, on iPhone, Android and the web." },
    ],
    note: "Paper journals and writing apps are great when writing is the point. Ripple is for when you want what you said to turn into something you can act on.",
  },
  explainer: {
    eyebrow: "Choosing an AI journal app",
    title: "What to look for in an AI journal.",
    paragraphs: [
      "“AI journal” can mean a lot of things. Some apps use AI to suggest prompts, some summarize your entries, some answer back like a chat. The useful question is simple: what does the AI do with your entries once they’re written?",
      "Ripple’s answer is follow-up. Your words become a to-do list with dates, an up-to-date habit log, a mood line and a short list of the things you keep coming back to. Then, once a week, it writes the week up so you don’t have to reread anything.",
      "It isn’t trying to be a therapist or a coach, and it won’t lecture you. It keeps track of what you said and shows you what’s really going on, so you can decide what to change.",
    ],
    points: [
      { title: "It acts on what you said", body: "Tasks and dates should come out of your entries without you rewriting them as a list." },
      { title: "It remembers across entries", body: "One entry is a note. Ten entries are a pattern, and the app should be the one to spot it." },
      { title: "It stays private", body: "Your debriefs live in your own account, and you can delete any of them, or your whole account, whenever you want." },
      { title: "It takes your voice", body: "Talking is quicker than typing for most people when there’s a lot on their mind, and it skips the blank page." },
    ],
  },
  reviewsTitle: "“I found out I mention quitting my job every Monday.”",
  faqs: [
    {
      q: "What is an AI journal app?",
      a: "An AI journal app uses AI to do something with your entries beyond storing them. In Ripple’s case that means turning what you say into a to-do list with dates, checking off habits, tracking your mood, finding patterns across weeks and writing a weekly report.",
    },
    {
      q: "What is the best AI journaling app?",
      a: "It depends on what you want from it. If you want prompts and a place to write, many apps do that well. If you want your entries to turn into a plan (to-dos, habits, mood and patterns) without extra work, that’s what Ripple is built for. The 7-day free trial is the easiest way to see if it fits.",
    },
    {
      q: "Do I have to talk, or can I type?",
      a: "Either. Ripple is built around talking because it’s quicker and there’s no blank page, but you can type any debrief and it gets the same follow-up.",
    },
    {
      q: "Is my journal private?",
      a: "Yes. Your debriefs live in your own private account. You can delete any debrief, or your whole account, whenever you want.",
    },
    {
      q: "Does Ripple give therapy or advice?",
      a: "No. Ripple isn’t therapy and doesn’t give medical advice. It keeps track of what you say, turns it into your to-do list and shows you your own patterns, so you can decide what to change.",
    },
    { q: "How much does Ripple cost?", a: priceFaqAnswer() },
  ],
  finalCta: {
    title: "Say it once. Ripple handles the follow-up.",
    body: "Your entries, turned into a list, a habit log, a mood line and a weekly report. Try it free for a week.",
  },
  order: ["how", "example", "benefits", "compare", "explainer", "reviews", "pricing", "faq", "related"],
};

export default function AiJournalAppPage() {
  return <SeoLanding content={content} />;
}
