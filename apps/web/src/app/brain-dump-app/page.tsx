import { SeoLanding } from "@/components/marketing/seo-landing/SeoLanding";
import { priceFaqAnswer, seoMetadata } from "@/components/marketing/seo-landing/meta";
import type { SeoLandingContent } from "@/components/marketing/seo-landing/types";
import { PRODUCT_CATEGORY } from "@/lib/positioning";

// Static marketing page; refreshed daily so pricing copy follows the live tier.
export const revalidate = 86400;

const DESCRIPTION =
  "Ripple is a brain dump app: say everything in your head, in any order, and it sorts it into to-dos with dates, habits, mood and patterns. Try 7 days free.";

export const metadata = seoMetadata({
  slug: "brain-dump-app",
  title: "Brain Dump App That Sorts It for You",
  description: DESCRIPTION,
});

const content: SeoLandingContent = {
  slug: "brain-dump-app",
  crumb: "Brain dump app",
  pageName: "Ripple: a brain dump app that sorts it for you",
  description: DESCRIPTION,
  hero: {
    eyebrow: "Brain dump app",
    h1: "A brain dump app that",
    h1Accent: "sorts it for you.",
    intro: [
      "Ripple is a brain dump app that does the sorting after you empty your head. Say everything on your mind in whatever order it comes out, and Ripple turns it into a to-do list with the dates you mentioned, checks off habits, notes your mood and keeps track of what keeps coming up.",
      `You don’t need categories, headings or a tidy list. The mess is the input. Ripple is ${PRODUCT_CATEGORY}, and the brain dump (we call each one a debrief) is where all of it starts.`,
    ],
    chips: ["4 to-dos found", "Any order", "Dates kept", "Voice or typed", "Nothing to file"],
    card: {
      label: "Example brain dump",
      said: "Okay. Dentist for Leo, the car’s making that noise again, I owe Nadia a reply, the insurance renewal is due by the 30th, I didn’t stretch at all this week, and I’m tired of being the one who remembers everything.",
      items: [
        { label: "To-do", value: "Book Leo’s dentist · Get the car checked · Reply to Nadia · Insurance by the 30th", tone: "todo" },
        { label: "Habit", value: "Stretch: skipped all week", tone: "habit" },
        { label: "Mood", value: "Tired, carrying a lot", tone: "mood" },
        { label: "Keeps coming up", value: "Being “the one who remembers” comes up when the list gets long.", tone: "pattern" },
      ],
    },
  },
  how: {
    eyebrow: "How it works",
    title: "Empty your head. Ripple does the sorting.",
    steps: [
      {
        title: "Dump it all out",
        body: "Talk (or type) everything at once: errands, worries, ideas, the thing you forgot last week. Half-sentences and tangents are fine.",
      },
      {
        title: "Ripple puts it in place",
        body: "To-dos go on your list with any dates you said. Habits you mentioned get checked off. Your mood is noted. What you talked about is filed by area of life.",
      },
      {
        title: "Pick up the list, leave the noise",
        body: "Open Ripple and the list is waiting. Things that keep resurfacing get flagged, so the important ones stop hiding among the small ones.",
      },
    ],
  },
  benefits: {
    eyebrow: "What happens to your brain dump",
    title: "Every kind of thought gets a place.",
    intro: "A brain dump mixes tasks, feelings, habits and worries in the same breath. Ripple pulls them apart so each one ends up somewhere useful.",
    cards: [
      {
        title: "Sorted, not just saved",
        body: "One long ramble comes back as separate pieces: things to do, habits done or skipped, how you were feeling, and what keeps repeating.",
        tone: "white",
        wide: true,
        visual: {
          kind: "sort",
          said: "Dentist for Leo, insurance by the 30th, didn’t stretch, so tired of remembering everything.",
          buckets: [
            { label: "To-do", items: ["Book Leo’s dentist", "Insurance by the 30th"] },
            { label: "Habit", items: ["Stretch: skipped"] },
            { label: "Keeps coming up", items: ["Being the one who remembers"] },
            { label: "Mood", items: ["Tired"] },
          ],
        },
      },
      {
        title: "The dates you said, kept",
        body: "“By the 30th”, “before Thursday”, “next week”. Ripple keeps the timing you mentioned and puts it on the task.",
        tone: "peach",
        visual: {
          kind: "tasks",
          items: [
            { text: "Insurance renewal", tag: "By the 30th", tagKind: "date" },
            { text: "Finish the deck", tag: "Tuesday", tagKind: "date" },
            { text: "Get the car checked", tag: "Mentioned 4 times", tagKind: "count" },
          ],
        },
      },
      {
        title: "The repeats get noticed",
        body: "The gutter you’ve mentioned in four separate brain dumps doesn’t get lost in the pile. Ripple counts what keeps coming back.",
        tone: "violet",
        visual: { kind: "chips", chips: ["The car · 4", "Money · 6", "Mom · 5", "Side project · 3"] },
      },
      {
        title: "Your mood comes along",
        body: "Each brain dump gets a mood read from your own words, so a week of them shows which days were heavy.",
        tone: "white",
        visual: {
          kind: "week",
          days: [
            { day: "Mon", word: "scattered", level: 2 },
            { day: "Tue", word: "okay", level: 3 },
            { day: "Wed", word: "heavy", level: 1 },
            { day: "Thu", word: "okay", level: 3 },
            { day: "Fri", word: "lighter", level: 4 },
            { day: "Sat", word: "good", level: 5 },
            { day: "Sun", word: "good", level: 4 },
          ],
        },
      },
      {
        title: "Habits buried in the ramble",
        body: "“Did yoga once”, “haven’t run since the trip”. Habits mentioned in passing still get counted.",
        tone: "mint",
        visual: {
          kind: "habits",
          rows: [
            { name: "Yoga", on: [0, 0, 1, 0, 0, 0, 0] },
            { name: "Walk", on: [1, 1, 0, 1, 1, 0, 1] },
          ],
        },
      },
      {
        title: "The week, pulled together",
        body: "Every Sunday the brain dumps become one weekly report: what got done, what slipped, and the one thing worth doing next.",
        tone: "ink",
        visual: {
          kind: "report",
          rows: [
            { tag: "MOVED", text: "Insurance renewed, dentist booked." },
            { tag: "SLIPPED", text: "The gutter, again." },
            { tag: "NEXT", text: "Call someone about the gutter on Monday." },
          ],
        },
      },
    ],
  },
  explainer: {
    eyebrow: "What a brain dump is",
    title: "Why brain dumps work, and where they stop.",
    paragraphs: [
      "A brain dump is the simple act of getting everything out of your head and somewhere outside it: tasks, worries, ideas and reminders, all at once, without organizing them first. People do it on paper, in notes apps and out loud.",
      "The relief is real. But a paper brain dump leaves the sorting to you. You end up with a page of half-sentences you have to rewrite into a list, with the errands and the worries sitting side by side, and next week you start a fresh page with no link to the last one.",
      "Ripple keeps the easy part (saying it all) and takes the second part off your hands. That’s the difference between a brain dump app and a notes app: one stores the mess, the other turns it into a list you can work from and remembers what keeps coming back.",
    ],
    points: [
      { title: "Don’t edit while you talk", body: "Say it in the order it arrives. Sorting is Ripple’s job, not yours." },
      { title: "Include the small stuff", body: "The dog food and the permission slip take up space too. Get them out with the big things." },
      { title: "Say the dates out loud", body: "“By Friday” turns a vague worry into a task with a deadline Ripple can keep." },
      { title: "Mention how you feel", body: "A word or two about your mood gives the week some shape when you look back at it." },
    ],
  },
  example: {
    eyebrow: "What you said → what Ripple caught",
    title: "Two brain dumps, sorted.",
    examples: [
      {
        label: "The work spiral",
        said: "Need to finish the deck for Tuesday, chase the invoice from Hartley, I said I’d mentor the new hire and haven’t, my back’s killing me from sitting so I should book physio, and I want to start that side project before I lose the idea.",
        tasks: [
          { text: "Finish the deck", when: "Tuesday" },
          { text: "Chase the Hartley invoice" },
          { text: "Set up time with the new hire" },
          { text: "Book physio" },
        ],
        habits: ["Side project: 0 hours"],
        mood: "Scattered",
        pattern: "The side project keeps getting pushed behind client work.",
      },
      {
        label: "The household one",
        said: "School photo form, groceries, Mom wants me to look at her phone again, the gutter, the gutter, the gutter. Did yoga once. Kind of proud I said no to the bake sale.",
        tasks: [
          { text: "Return the school photo form" },
          { text: "Groceries" },
          { text: "Help Mom with her phone" },
          { text: "Get the gutter fixed" },
        ],
        habits: ["Yoga: 1 this week"],
        mood: "Frazzled, a bit proud",
        pattern: "The gutter has come up in four brain dumps.",
      },
    ],
  },
  compare: {
    eyebrow: "Why this instead of a notes app",
    title: "A notes app keeps it. Ripple sorts it.",
    headers: ["Paper or a notes app", "Ripple"],
    rows: [
      { label: "Getting it out", other: "Write or type it all down.", ripple: "Say it, or type it. Any order, no formatting." },
      { label: "Sorting", other: "You rewrite it into a list afterwards.", ripple: "To-dos, habits, mood and themes are separated for you." },
      { label: "Dates", other: "Only if you set reminders yourself.", ripple: "The dates you mentioned go on the task." },
      { label: "Over weeks", other: "Each page starts from scratch.", ripple: "Ripple notices what keeps coming back and writes up your week." },
    ],
  },
  reviewsTitle: "“I never forget anything anymore.”",
  faqs: [
    {
      q: "What is a brain dump app?",
      a: "A brain dump app is somewhere to empty everything in your head at once. Ripple goes a step further: after you talk or type it all out, it sorts it into a to-do list with dates, checks off habits, notes your mood and tracks what keeps coming up.",
    },
    {
      q: "How is Ripple different from a notes app?",
      a: "A notes app stores what you wrote, exactly as you wrote it. Ripple reads it for you: tasks go on your list with their dates, habits get checked off, and themes you repeat across weeks get flagged. Every Sunday you also get a weekly report.",
    },
    {
      q: "Can I brain dump by voice?",
      a: "Yes. Talking is what Ripple is built around, so you can say it all out loud in whatever order it comes. You can also type whenever you’d rather.",
    },
    {
      q: "What if my brain dump is messy or jumps around?",
      a: "That’s fine. Ramble away. Ripple pulls the to-dos, habits, mood and patterns out of however you say it, tangents included.",
    },
    {
      q: "How often should I brain dump?",
      a: "Whenever your head feels full. There’s no schedule and no minimum. Ripple works with whatever you give it, whether that’s most days or only when a week gets loud.",
    },
    {
      q: "Where do my brain dumps go?",
      a: "Into your private account. You can delete any debrief, or your whole account, whenever you want.",
    },
    { q: "How much does Ripple cost?", a: priceFaqAnswer() },
  ],
  finalCta: {
    title: "Say it all. Ripple sorts it.",
    body: "Empty your head in any order and get back a list, your habits, your mood and what keeps coming up. Try it free for a week.",
  },
  order: ["how", "benefits", "explainer", "example", "compare", "reviews", "pricing", "faq", "related"],
};

export default function BrainDumpAppPage() {
  return <SeoLanding content={content} />;
}
