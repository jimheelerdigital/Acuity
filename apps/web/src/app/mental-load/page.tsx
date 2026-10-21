import { SeoLanding } from "@/components/marketing/seo-landing/SeoLanding";
import { priceFaqAnswer, seoMetadata } from "@/components/marketing/seo-landing/meta";
import type { SeoLandingContent } from "@/components/marketing/seo-landing/types";
import { PRODUCT_CATEGORY } from "@/lib/positioning";

// Static marketing page; refreshed daily so pricing copy follows the live tier.
export const revalidate = 86400;

const DESCRIPTION =
  "The mental load is the invisible work of remembering everyone’s lists. How to manage it, and how Ripple keeps track so it isn’t all held in your head.";

export const metadata = seoMetadata({
  slug: "mental-load",
  title: "The Mental Load and How to Manage It",
  description: DESCRIPTION,
});

const content: SeoLandingContent = {
  slug: "mental-load",
  crumb: "The mental load",
  pageName: "The mental load: what it is and how to manage it",
  description: DESCRIPTION,
  hero: {
    eyebrow: "The mental load",
    h1: "Put the mental load somewhere",
    h1Accent: "that keeps track.",
    intro: [
      "The mental load is the invisible work of keeping track: remembering the appointments, the forms, the birthdays, what’s running low and who needs what, on top of actually doing any of it. Managing it isn’t about doing less. It’s about not having to hold it all in your head.",
      `Ripple is ${PRODUCT_CATEGORY}. You say what’s on your mind and it keeps track for you: your to-do list with the dates you mentioned, your habits, your mood and the things that keep coming up.`,
    ],
    chips: ["Mom’s appointment: Thursday", "Everyone’s dates in one list", "Your own things too", "What keeps coming up", "Weekly report every Sunday"],
    card: {
      label: "Example: what’s in your head",
      said: "Mom’s appointment moved to Thursday, Emma’s form is due Friday, we’re out of dog food, I need to call the plumber, and I still haven’t booked my own checkup.",
      items: [
        { label: "To-do", value: "Mom’s appointment (Thu) · Emma’s form (Fri) · Dog food · Call the plumber · Book your checkup", tone: "todo" },
        { label: "Mood", value: "Stretched thin", tone: "mood" },
        { label: "Habit", value: "Walk: skipped 3 days", tone: "habit" },
        { label: "Keeps coming up", value: "Your own appointments are what you push back first.", tone: "pattern" },
      ],
    },
  },
  explainer: {
    eyebrow: "What is the mental load?",
    title: "The work nobody sees: remembering.",
    paragraphs: [
      "The mental load (sometimes called cognitive labor or invisible labor) is the planning, remembering and anticipating that keeps a household, a family or a team running. It’s knowing the school form is due, noticing the medicine is running low, remembering whose birthday is next week, and keeping all of it in mind until it’s done.",
      "It’s tiring in a particular way, because it never fully switches off. The tasks themselves are often small. What wears you down is being the one who has to remember them, and the sense that if you put the list down for a day, something will slip.",
      "Lots of people carry a version of it: parents, people looking after aging parents, managers, small-business owners, anyone running a home. It often goes unnoticed because the result of doing it well is that nothing goes wrong. Naming it is a good first step. Getting it out of your head is the next one.",
    ],
    points: [
      { title: "Get it out of your head", body: "A list you trust is lighter than a list you carry. The format matters less than having one place it all goes." },
      { title: "Keep the dates, not just the tasks", body: "“Form due Friday” is easier to let go of than “form”, because you know when it actually needs you." },
      { title: "Hand over whole jobs", body: "Where you can share the load, share the remembering too, not only the doing." },
      { title: "Notice what keeps coming back", body: "If the same worry shows up week after week, it’s usually worth dealing with head-on rather than carrying." },
    ],
  },
  how: {
    eyebrow: "How Ripple helps",
    title: "Ripple takes over the remembering.",
    steps: [
      {
        title: "Say it as it comes",
        body: "In the car, between meetings, walking the dog. Everything that’s swirling, in whatever order, by voice or typed.",
      },
      {
        title: "Ripple keeps the list",
        body: "Each task goes on your list with the date you mentioned. Habits get checked off and your mood is noted, so the list stays current without you rewriting it.",
      },
      {
        title: "See where it’s all going",
        body: "Every Sunday you get a weekly report. Over time, Ripple shows which parts of your life take the most of you, and which of your own things keep getting pushed back.",
      },
    ],
  },
  benefits: {
    eyebrow: "What changes",
    title: "Not doing less. Remembering less.",
    intro: "Ripple won’t pick up the dry cleaning. What it does is hold the list, keep the dates and point out what’s been waiting too long, so your head has room for something else.",
    cards: [
      {
        title: "Everyone’s dates, in one list",
        body: "Your mom’s appointment, the school form, the insurance renewal and your own checkup, each with the day you said it was due.",
        tone: "white",
        wide: true,
        visual: {
          kind: "tasks",
          items: [
            { text: "Call the plumber", tag: "Done", done: true, tagKind: "done" },
            { text: "Mom’s appointment", tag: "Thursday", tagKind: "date" },
            { text: "Sign Emma’s form", tag: "Friday", tagKind: "date" },
            { text: "Book your checkup", tag: "Mentioned 4 times", tagKind: "count" },
          ],
        },
      },
      {
        title: "Your own things don’t get lost",
        body: "When your checkup or your walk keeps getting pushed back for everyone else’s plans, Ripple notices and says so.",
        tone: "peach",
        visual: { kind: "quote", text: "Your own appointments are what you push back first.", caption: "Keeps coming up" },
      },
      {
        title: "Where your week went",
        body: "Ripple counts what you talk about, so you can see how much of your head goes to work, family and caring for others, and how little is left for you.",
        tone: "violet",
        visual: { kind: "chips", chips: ["Family · 27", "Work · 22", "Mom’s care · 14", "You · 6"] },
      },
      {
        title: "Habits that are yours",
        body: "Say you walked, read or got to the gym and it’s checked off. When your habits are the first thing to go, you’ll see it.",
        tone: "mint",
        visual: {
          kind: "habits",
          rows: [
            { name: "Walk", on: [1, 0, 0, 0, 1, 1, 0] },
            { name: "Read", on: [0, 1, 0, 0, 0, 1, 1] },
          ],
          note: "Walk: skipped 3 days in a row",
        },
      },
      {
        title: "Life Matrix",
        body: "The main areas of your life, scored and tracked over time, so you can see what’s thriving and what’s quietly slipping.",
        tone: "white",
        visual: {
          kind: "bars",
          rows: [
            { name: "Family", pct: 84, color: "#F27A55" },
            { name: "Work", pct: 74, color: "#6D5EF0" },
            { name: "Health", pct: 48, color: "#F2B544" },
            { name: "Fun", pct: 36, color: "#2E9C78" },
          ],
        },
      },
      {
        title: "Your week, written up for you",
        body: "Every Sunday: what got done, what slipped, what keeps coming up, and one thing worth doing next.",
        tone: "ink",
        visual: {
          kind: "report",
          rows: [
            { tag: "MOVED", text: "Mom’s paperwork: finished." },
            { tag: "SLIPPED", text: "Your checkup, pushed again." },
            { tag: "NEXT", text: "Book the checkup Monday. You’ve mentioned it four times." },
          ],
        },
      },
    ],
  },
  example: {
    eyebrow: "What you said → what Ripple caught",
    title: "From swirl to list.",
    intro: "The way the mental load actually sounds when you say it out loud, and what Ripple does with it.",
    examples: [
      {
        label: "Family logistics",
        said: "Jake needs new cleats before Saturday, the vet called about Bella’s shots, Dan’s away so it’s all me this week, and I promised Mom I’d sort out her pharmacy delivery.",
        tasks: [
          { text: "Buy Jake’s cleats", when: "Saturday" },
          { text: "Book Bella’s shots" },
          { text: "Set up Mom’s pharmacy delivery" },
        ],
        habits: ["Walk: none this week"],
        mood: "Doing it all solo",
        pattern: "The weeks Dan travels are your heaviest weeks.",
      },
      {
        label: "Work and home at once",
        said: "Quarter-end at work, three reports due. The school wants volunteers again and I should say no. My sister keeps asking about holiday plans. I really want to get back to running.",
        tasks: [
          { text: "Finish the three reports", when: "Quarter-end" },
          { text: "Reply to the school" },
          { text: "Answer your sister about the holidays" },
        ],
        habits: ["Run: not started"],
        mood: "Overloaded, clear on what to drop",
        pattern: "Running comes up every week you’re busiest, and gets dropped first.",
      },
    ],
  },
  compare: {
    eyebrow: "Why this instead of more reminders",
    title: "Reminders still need you to remember.",
    headers: ["Reminders you set up yourself", "Ripple"],
    rows: [
      { label: "Getting it down", other: "Type each task and set each reminder.", ripple: "Say everything at once. Ripple makes the list." },
      { label: "The remembering", other: "You still have to remember to add it.", ripple: "It’s on the list the moment you mention it." },
      { label: "Your own needs", other: "Often not on the list at all.", ripple: "Ripple notices what you keep pushing back." },
      { label: "Seeing the load", other: "Hard to see how much you’re carrying.", ripple: "The weekly report and Life Matrix show where your weeks go." },
    ],
    note: "Calendars, shared lists and reminders are all worth using. Ripple sits upstream of them: it catches things the moment they cross your mind, so nothing has to wait in your head until you get around to typing it in.",
  },
  reviewsTitle: "“The task manager is a lifesaver.”",
  faqs: [
    {
      q: "What is the mental load?",
      a: "The mental load is the invisible work of keeping track of everything a household, family or team needs: appointments, forms, birthdays, supplies, who needs what and when. It’s the remembering and planning that sits on top of the actual tasks.",
    },
    {
      q: "How do you manage the mental load?",
      a: "Get it out of your head and into one place you trust, keep the dates with the tasks, share whole jobs (remembering included) where you can, and notice what keeps coming back so you can deal with it directly. Ripple helps with the first, second and last of those by keeping the list for you as you talk.",
    },
    {
      q: "Is the mental load the same as being busy?",
      a: "Not quite. Busy is about how much you do. The mental load is about how much you have to keep track of, which can be heavy even on a quiet day.",
    },
    {
      q: "How does Ripple help with the mental load?",
      a: "You say what’s on your mind, by voice or typed, and Ripple turns it into a to-do list with the dates you mentioned, checks off your habits, tracks your mood and shows what keeps coming up. Every Sunday it sends a weekly report, so you can see where your weeks are going.",
    },
    {
      q: "Will Ripple tell me what to do?",
      a: "No lectures. Ripple keeps track and shows you what’s really going on, including the things that keep coming up, and the weekly report suggests one thing worth doing next. What you change is up to you.",
    },
    {
      q: "Is Ripple therapy?",
      a: "No. Ripple is an AI habit tracker and voice journal: it keeps track of what you say, turns it into your to-do list and shows you your own patterns. It isn’t therapy and doesn’t give medical advice.",
    },
    { q: "How much does Ripple cost?", a: priceFaqAnswer() },
  ],
  finalCta: {
    title: "Put it down somewhere.",
    body: "Say what’s on your mind. Ripple keeps track of the rest. Try it free for a week.",
  },
  order: ["explainer", "how", "benefits", "example", "compare", "reviews", "pricing", "faq", "related"],
};

export default function MentalLoadPage() {
  return <SeoLanding content={content} />;
}
