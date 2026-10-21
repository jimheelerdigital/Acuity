/**
 * Page copy for /compare/[slug] and /alternatives/[slug] (2026-10-21).
 *
 * Competitor facts come from lib/compare-data.ts (verified 2026-10-21 on
 * each company's own pages). Don't add a competitor claim here that isn't
 * backed there. Each page's wording is written for that competitor so the
 * pages aren't near-duplicates.
 *
 * Copy rules: no em dashes, no hype words, fair to competitors, no
 * recording-duration or time-of-day claims, never claim Ripple treats,
 * diagnoses, cures or replaces therapy, never "no card required", no
 * encryption / HIPAA / AI-training claims for Ripple.
 */
import { RIPPLE, type AlternativeSlug, type AppKey, type CompareSlug } from "@/lib/compare-data";

import type { Faq } from "./ui";

const M = RIPPLE.pricing.monthly;
const Y = RIPPLE.pricing.yearly;
const PRICE_LINE = `Ripple is ${M} a month or ${Y} a year, with a 7-day free trial. There is one plan and no free tier.`;

type Point = { title: string; body: string };

export type CompareCopy = {
  competitor: Exclude<AppKey, "ripple">;
  /** Full <title>, ≤60 chars incl. " | Ripple". */
  title: string;
  /** 150–160 chars. */
  description: string;
  h1: string;
  /** Two-sentence verdict shown as the hero lede. */
  verdict: [string, string];
  /** One line for the /compare hub card. */
  hubLine: string;
  tableIntro: string;
  theyWinTitle: string;
  theyWin: Point[];
  rippleWinsTitle: string;
  rippleWins: Point[];
  pickThem: string[];
  pickRipple: string[];
  switching: string[];
  alternativesSlug?: AlternativeSlug;
  faqs: Faq[];
  cta: { title: string; body: string };
};

export const COMPARE_COPY: Record<CompareSlug, CompareCopy> = {
  "ripple-vs-rosebud": {
    competitor: "rosebud",
    title: "Ripple vs Rosebud: Which AI Journal Fits You? | Ripple",
    description:
      "Ripple vs Rosebud, compared honestly: Rosebud's AI talks back and remembers; Ripple turns what you say into to-dos and habits. Prices, features, who fits.",
    h1: "Ripple vs Rosebud: which AI journal fits you?",
    verdict: [
      "Pick Rosebud if you want an AI that asks you follow-up questions and remembers what you told it weeks ago. Pick Ripple if you want what you say turned into a to-do list with dates, habit check-offs and a weekly report, without a conversation.",
      "Both take voice, both cost money now that Rosebud's help center says its free plan ended on September 30, 2026, and they solve different problems.",
    ],
    hubLine: "Rosebud talks back and remembers. Ripple turns what you say into tasks and habits.",
    tableIntro:
      "Rosebud and Ripple both accept voice and both look for patterns. The difference is what happens after you finish talking: Rosebud starts a conversation, Ripple files the follow-up.",
    theyWinTitle: "Rosebud is the better pick for reflection with an AI",
    theyWin: [
      {
        title: "It talks back",
        body: "Rosebud asks follow-up questions on each entry and offers guided prompts, including IFS-based ones. If you want something closer to a reflective conversation, Ripple does not do that.",
      },
      {
        title: "Long-term memory",
        body: "Rosebud highlights a memory system that carries what you said across entries. It is the main reason it gives for retiring the free plan.",
      },
      {
        title: "Privacy statements in writing",
        body: "Rosebud says entries are encrypted in transit and at rest and are never used to train AI. Ripple doesn't make those claims yet.",
      },
      {
        title: "Track record",
        body: "Rosebud shows a 4.9 rating from thousands of App Store reviews. Ripple is newer and much smaller.",
      },
    ],
    rippleWinsTitle: "Ripple is the better pick when you need follow-through",
    rippleWins: [
      {
        title: "Tasks with dates, pulled out for you",
        body: "Say “call the dentist before Friday” and it lands on your list with Friday attached. Rosebud says action items can go on checklists; Ripple is built around that step.",
      },
      {
        title: "Habits checked off from what you said",
        body: "Mention your walk and it's checked off. Skip it for a few days and Ripple notices. You don't keep a separate tracker.",
      },
      {
        title: "Life Matrix and a Sunday report",
        body: "Ripple scores your life areas over time and writes up what moved, what slipped and what keeps coming up, every Sunday.",
      },
      {
        title: "Lower price",
        body: `${M} a month against Rosebud's $12.99, or ${Y} a year against $107.99.`,
      },
    ],
    pickThem: [
      "You want an AI to ask you questions back",
      "Reflection and self-understanding are the goal",
      "Written privacy commitments matter most to you",
      "You liked Rosebud before and the price works for you",
    ],
    pickRipple: [
      "Your head is full of other people's to-dos and dates",
      "You want habits tracked without opening a tracker",
      "You'd rather talk and get a list back than have a chat",
      "You want a weekly write-up of what actually happened",
    ],
    switching: [
      "Rosebud's help center says entries stay in your account and can be exported, so export first if you want a copy. You don't need your old entries for Ripple to be useful: it starts sorting from your first debrief.",
      "For the first week, just talk about what's on your plate. By Sunday you'll see your to-do list, habit streaks, a mood line and your first weekly report, and you can judge it on that.",
    ],
    alternativesSlug: "rosebud",
    faqs: [
      {
        q: "Is Rosebud still free?",
        a: "Rosebud's help center says the free plan was retired on September 30, 2026, with entries kept and exportable. Its homepage still uses the words “free to use”, so check the app before you sign up. The Bloom plan is $12.99 a month or $107.99 a year.",
      },
      {
        q: "Is Ripple cheaper than Rosebud?",
        a: `Yes. ${PRICE_LINE} Rosebud's Bloom plan is $12.99 a month or $107.99 a year.`,
      },
      {
        q: "Does Ripple talk back like Rosebud?",
        a: "No. Ripple doesn't have a chat companion. It reads what you said and gives you back a to-do list, habit check-offs, mood, patterns and a weekly report.",
      },
      {
        q: "Can I use both?",
        a: "Yes, and some people would. Rosebud for reflective conversation, Ripple for the practical follow-up. Run Ripple's free week alongside and see which one you keep opening.",
      },
      {
        q: "Is either app a replacement for therapy?",
        a: "Ripple isn't, and doesn't claim to treat, diagnose or replace anything. It's a tool for getting what's in your head into order.",
      },
    ],
    cta: { title: "Say it once. Get the list back.", body: "Try Ripple for 7 days and see what it pulls out of what you say." },
  },

  "ripple-vs-mindsera": {
    competitor: "mindsera",
    title: "Ripple vs Mindsera: Thinking Tool or Life Planner? | Ripple",
    description:
      "Ripple vs Mindsera: Mindsera offers 52+ thinking frameworks and a free plan; Ripple turns what you say into to-dos, habits and a weekly report. Full comparison.",
    h1: "Ripple vs Mindsera: a thinking tool or a life planner?",
    verdict: [
      "Mindsera is built for working through ideas: frameworks, emotion analysis and personality insights, with a real free plan. Ripple is built for the practical side: what you say becomes your to-do list, your habit log and a weekly report.",
      "If you journal to think more clearly, Mindsera has more depth. If you journal because there's too much to keep track of, Ripple does more of the work.",
    ],
    hubLine: "Mindsera helps you think through ideas. Ripple keeps track of what you said you'd do.",
    tableIntro:
      "Both apps have voice input, mood and habit features. Mindsera adds frameworks, emotion and personality analysis; Ripple adds to-dos with dates and a Life Matrix.",
    theyWinTitle: "Mindsera wins on depth and on its free plan",
    theyWin: [
      { title: "52+ thinking frameworks", body: "Templates for decisions, goal setting and reflection. Ripple has nothing like this; it doesn't give you prompts at all." },
      { title: "A real free plan", body: "Mindsera's free Curious plan includes the journal, habit tracker and templates. Ripple has a 7-day trial and no free tier." },
      { title: "More input options", body: "Voice mode, a call mode and scanning of paper pages. Ripple takes voice and typing only." },
      { title: "Emotion and personality analysis", body: "Mindsera maps emotions and offers personality insights. Ripple tracks mood over time but doesn't profile you." },
    ],
    rippleWinsTitle: "Ripple wins on turning words into next steps",
    rippleWins: [
      { title: "To-dos with dates", body: "Ripple pulls tasks and the dates you mentioned out of what you said. Mindsera's pages don't mention task extraction." },
      { title: "Habits from what you say", body: "Both track habits, but in Ripple you don't tap anything: mention the habit and it's checked off; skip it and Ripple notices." },
      { title: "Less to set up", body: "No framework to choose and no template to fill. Talk, and Ripple sorts it." },
      { title: "Cheaper paid plan", body: `${M} a month against Mindsera Genius at $14.99, or ${Y} a year against $129.` },
    ],
    pickThem: [
      "You like structured exercises and frameworks",
      "You want to analyse how you think and feel",
      "You want a free plan that you can keep using",
      "You journal on paper and want to scan pages",
    ],
    pickRipple: [
      "You want fewer dropped balls, not more insight exercises",
      "You'd rather talk freely than pick a template",
      "You want habits checked off from what you say",
      "A weekly report of what moved and what slipped sounds useful",
    ],
    switching: [
      "Mindsera's free plan includes export, so you can keep your history there and still try Ripple. Nothing has to move over for Ripple to work.",
      "A good test: for a week, use Mindsera when you want to think something through and Ripple when you need to offload. You'll see quickly which job you have more of.",
    ],
    alternativesSlug: "mindsera",
    faqs: [
      { q: "Is Mindsera free?", a: "Mindsera has a free Curious plan with the journal, habit tracker and 52+ templates. The Genius plan is $14.99 a month or $129 a year." },
      { q: "How much is Ripple compared with Mindsera?", a: `${PRICE_LINE} That's less than Mindsera Genius, though Mindsera has a free plan and Ripple doesn't.` },
      { q: "Does Ripple have journaling frameworks like Mindsera?", a: "No. Ripple has no templates or prompts. You talk or type about whatever is on your mind and it pulls out tasks, habits, mood and patterns." },
      { q: "Which is better for habits?", a: "Both track habits. Mindsera has a habit tracker with streaks that you update. Ripple checks off habits when you mention them and notices when you skip one." },
    ],
    cta: { title: "Less thinking about your list. More done.", body: "Try Ripple free for 7 days and talk through your week." },
  },

  "ripple-vs-reflection": {
    competitor: "reflection",
    title: "Ripple vs Reflection: AI Coach or AI Organizer? | Ripple",
    description:
      "Ripple vs Reflection: Reflection has a free plan, an AI coach and 100+ guided programs; Ripple turns what you say into tasks, habits and patterns. Compared.",
    h1: "Ripple vs Reflection: an AI coach or an AI organizer?",
    verdict: [
      "Reflection is a guided journal with an AI coach, 100+ programs and a free plan, and its Premium price is low. Ripple doesn't coach; it takes what you say and turns it into to-dos, habit check-offs, mood, patterns and a weekly report.",
      "Choose Reflection to be guided. Choose Ripple to be organized.",
    ],
    hubLine: "Reflection guides you with programs and a coach. Ripple organizes what you already said.",
    tableIntro: "Reflection leads with programs and conversation. Ripple leads with what happens to your words afterwards.",
    theyWinTitle: "Reflection wins on guidance, price and free access",
    theyWin: [
      { title: "Free Forever plan", body: "Unlimited entries, reviews and prompts at no cost. Ripple has no free tier." },
      { title: "Cheaper Premium", body: "Reflection Premium is $8 a month or $69 a year, below Ripple's price." },
      { title: "Guided programs and a coach", body: "100+ programs, an AI coach and “Ask Your Journal”. Ripple doesn't guide or chat." },
      { title: "More ways in", body: "Photos, handwriting scans, voice calls, and apps for Mac and web as well as phones." },
    ],
    rippleWinsTitle: "Ripple wins when the problem is too much to track",
    rippleWins: [
      { title: "Your to-do list, built from what you said", body: "Dates included. Reflection's pages don't mention tasks." },
      { title: "Habits without a tracker", body: "Mention it and it's checked off; skip it and Ripple notices. Reflection's pages don't mention habit tracking." },
      { title: "Life Matrix", body: "Your life areas, like work, family and health, scored over time, so you can see what's getting attention and what isn't." },
      { title: "No program to follow", body: "Some weeks you don't want a lesson. You just want it out of your head and sorted." },
    ],
    pickThem: ["You want guided programs and a coach", "You want a free plan or the lowest paid price", "You like adding photos or scanning handwriting", "You journal on a Mac"],
    pickRipple: ["You need your tasks and dates caught for you", "You want habits tracked from what you say", "You'd rather talk freely than follow a program", "You want a weekly report of your actual week"],
    switching: [
      "Reflection's free plan means you don't have to cancel anything to try Ripple. Keep your history there.",
      "Use Ripple for a week for the practical stuff: errands, plans, the habit you keep meaning to restart. Then compare how much of it got done.",
    ],
    alternativesSlug: "reflection",
    faqs: [
      { q: "Is Reflection free?", a: "Yes, Reflection has a Free Forever plan with unlimited entries. Premium is $8 a month or $5.75 a month billed annually, with a 7-day free trial." },
      { q: "Is Ripple more expensive than Reflection?", a: `Yes. ${PRICE_LINE} Reflection Premium costs less and Reflection has a free plan.` },
      { q: "Does Reflection track tasks or habits?", a: "We didn't find task extraction or habit tracking on Reflection's own pages. It focuses on prompts, programs, an AI coach and reviews." },
      { q: "Does Ripple have an AI coach?", a: "No. Ripple doesn't chat or coach. It reads your entries and gives back to-dos, habits, mood, patterns, a Life Matrix and a weekly report." },
    ],
    cta: { title: "Get it out of your head and into a plan.", body: "Try Ripple for 7 days alongside Reflection and see which you need more." },
  },

  "ripple-vs-day-one": {
    competitor: "dayone",
    title: "Ripple vs Day One: Keepsake Journal or To-Do Help? | Ripple",
    description:
      "Ripple vs Day One: Day One is a lifelong, photo-rich, end-to-end encrypted journal; Ripple turns what you say into to-dos, habits and a weekly report.",
    h1: "Ripple vs Day One: a keepsake journal or help with the to-dos?",
    verdict: [
      "Day One is the best-known journal for keeping a record of your life: photos, video, audio, end-to-end encryption and apps on almost every device. Ripple isn't a keepsake; it's for getting what's in your head into a to-do list, habits and a weekly report.",
      "If you want to look back in ten years, use Day One. If you want this week to go better, try Ripple.",
    ],
    hubLine: "Day One keeps a beautiful record of your life. Ripple acts on what you said this week.",
    tableIntro: "Day One is a place to keep entries. Ripple is a system that does something with them.",
    theyWinTitle: "Day One wins as a journal you keep for life",
    theyWin: [
      { title: "End-to-end encryption", body: "Day One offers end-to-end encryption, including on the free Basic plan. Ripple doesn't claim that." },
      { title: "Photos, video, audio, drawings", body: "Rich entries you'll want to look back on. Ripple has no photo or multimedia journaling." },
      { title: "Every device", body: "iPhone, iPad, Apple Watch, Android, Mac, Windows and web." },
      { title: "Free plan and a long record", body: "A free Basic plan, years of history and one of the largest review counts of any journal app." },
    ],
    rippleWinsTitle: "Ripple wins on follow-through",
    rippleWins: [
      { title: "Your words become a to-do list", body: "With the dates you said. Day One's pages don't mention tasks." },
      { title: "Habits, not just streaks", body: "Day One tracks journaling streaks. Ripple tracks the habits you talk about and notices when you skip them." },
      { title: "Insight without paying for Gold", body: "Day One's AI summaries and Daily Chat sit on the $74.99 Gold plan. Ripple's mood, patterns, Life Matrix and weekly report are all in its one plan." },
      { title: "Built for talking", body: "Day One supports audio. Ripple is designed around talking it out and getting a sorted result back." },
    ],
    pickThem: ["You want a lifelong record with photos and video", "End-to-end encryption is a must", "You use Windows or Apple Watch", "You want a free plan"],
    pickRipple: ["You journal to clear your head, not to keep a scrapbook", "Tasks and dates keep slipping", "You want habits tracked from what you say", "You'd like a weekly report without paying for a top tier"],
    switching: [
      "You don't need to leave Day One. Many people would keep it for memories and photos and use Ripple for the day-to-day load.",
      "If you do move, keep your Day One archive where it is. Ripple works from your first entry, so there's nothing to import before it's useful.",
    ],
    alternativesSlug: "day-one",
    faqs: [
      { q: "How much does Day One cost?", a: "Day One Basic is free. Silver is $49.99 a year and Gold, which adds the AI features, is $74.99 a year, per Day One's pricing page." },
      { q: "Is Ripple cheaper than Day One?", a: `${PRICE_LINE} Day One Silver is cheaper per year; Day One Gold is $74.99 a year.` },
      { q: "Does Ripple have end-to-end encryption like Day One?", a: "We don't claim end-to-end encryption for Ripple. If that is your top requirement, Day One is the safer choice." },
      { q: "Can I add photos in Ripple?", a: "No. Ripple is for voice and typed entries. Day One is far better for photos and video." },
      { q: "Can I use Day One and Ripple together?", a: "Yes. Day One for the record you want to keep, Ripple for the to-dos, habits and patterns in what you say." },
    ],
    cta: { title: "Keep the memories. Hand off the to-dos.", body: "Try Ripple for 7 days next to your journal." },
  },

  "ripple-vs-dayora": {
    competitor: "dayora",
    title: "Ripple vs Dayora: Comparing Two AI Journals | Ripple",
    description:
      "Ripple vs Dayora: Dayora gives a lot away free but says it may train AI on your entries; Ripple turns what you say into tasks and habits. Side by side.",
    h1: "Ripple vs Dayora: comparing two AI journals",
    verdict: [
      "Dayora gives you a lot for free, including voice, mood tracking and a reply to every entry, and it's upfront that it may use your entries to train AI models. Ripple is paid, doesn't chat, and turns what you say into to-dos, habit check-offs and a weekly report.",
      "If cost is the deciding factor and the training terms are fine with you, Dayora is worth a look. If you want tasks and habits handled, Ripple is the closer fit.",
    ],
    hubLine: "Dayora is free and conversational. Ripple is paid and turns talk into tasks and habits.",
    tableIntro: "Dayora is a web-based AI journal that replies to you. Ripple is a phone and web app that organizes what you said.",
    theyWinTitle: "Dayora wins on price and conversation",
    theyWin: [
      { title: "Generous free core", body: "Unlimited entries, voice with transcription, mood tracking and full export, free. Ripple has no free tier." },
      { title: "A reply to every entry", body: "Dayora writes back and holds Reflect conversations. Ripple doesn't chat." },
      { title: "Relationship insights", body: "Its “Your Circle” feature looks at the people you write about. Ripple doesn't have that." },
      { title: "Editable AI memory", body: "You can see and delete what Dayora remembers about you." },
    ],
    rippleWinsTitle: "Ripple wins on tasks, habits and apps",
    rippleWins: [
      { title: "To-dos with dates", body: "Ripple turns what you said into a list with dates. Dayora's pages don't mention tasks." },
      { title: "Habit tracking", body: "Mention a habit and Ripple checks it off; skip it and Ripple notices. Dayora's pages don't mention habits." },
      { title: "iPhone and Android apps", body: "Ripple has native apps plus web. We found Dayora described as a browser-based app and no app store listing." },
      { title: "Training terms", body: "Dayora says it may use entries to train AI models. We don't make AI-training promises for Ripple we haven't verified, so ask us if this matters to you." },
    ],
    pickThem: ["You want a capable AI journal for free", "You want the AI to reply to what you write", "You're comfortable with its training terms", "You mostly journal in a browser"],
    pickRipple: ["You want tasks and habits pulled from what you say", "You want an app on your phone", "You'd rather get a list back than a reply", "A Life Matrix and Sunday report appeal to you"],
    switching: [
      "Dayora's free core includes full export, so you can keep a copy of everything before you try something else.",
      "Ripple's 7-day trial collects a card up front. We remind you on day 4, and you pay nothing if you cancel before day 7.",
    ],
    faqs: [
      { q: "Is Dayora free?", a: "Dayora has a free core with unlimited entries, voice, mood and export. Plus is $9 a month or $72 a year, with a $6 a month rate for people who join before November 1, 2026." },
      { q: "Does Dayora use my entries to train AI?", a: "Dayora's own homepage and privacy policy say it may use your entries to train and improve the AI models that power it. It also says it never sells entries." },
      { q: "How much is Ripple?", a: PRICE_LINE },
      { q: "Does Ripple reply to my entries?", a: "Not as a conversation. Ripple turns your entry into to-dos, habit check-offs, a mood reading and patterns, and writes a weekly report every Sunday." },
    ],
    cta: { title: "Talk it out. Get a plan back.", body: "Try Ripple for 7 days on your phone or the web." },
  },

  "ripple-vs-daylio": {
    competitor: "daylio",
    title: "Ripple vs Daylio: Mood Taps or Talking It Out? | Ripple",
    description:
      "Ripple vs Daylio: Daylio logs mood and activities in two taps and keeps data on your phone; Ripple reads what you say for tasks, habits and patterns over time.",
    h1: "Ripple vs Daylio: mood taps or talking it out?",
    verdict: [
      "Daylio is the quickest way to log a mood: a couple of taps, an activity or two, and charts over time, with your data kept on your phone. Ripple asks a little more of you (talking or typing) and gives back more: to-dos with dates, habits checked off, mood, patterns and a weekly report.",
      "If you want logging that takes seconds, Daylio is hard to beat. If tapping a face never told you why the week went sideways, Ripple reads the why from your own words.",
    ],
    hubLine: "Daylio is two-tap mood logging. Ripple reads your words for tasks, habits and the why.",
    tableIntro: "Daylio uses taps and icons. Ripple uses your own words. That one difference drives most of the table below.",
    theyWinTitle: "Daylio wins on speed, price and on-device data",
    theyWin: [
      { title: "Two taps", body: "Pick a mood and activities and you're done. Nothing in Ripple is that fast." },
      { title: "Data stays on your phone", body: "Daylio says it doesn't send your data to its servers. Ripple is a cloud app with a web version." },
      { title: "Free to start", body: "Daylio is free with a Premium upgrade. Ripple has no free tier." },
      { title: "Charts and goals", body: "Clear mood and activity stats, plus daily, weekly or monthly goals." },
    ],
    rippleWinsTitle: "Ripple wins when you want more than a mood score",
    rippleWins: [
      { title: "It reads what you said", body: "Daylio has no AI reading your notes. Ripple picks out tasks, habits, mood and what keeps coming up." },
      { title: "To-dos from your words", body: "Daylio doesn't make a to-do list. Ripple does, with dates." },
      { title: "Habits without the tapping", body: "Say you went for a walk and it's checked off." },
      { title: "Web as well as phone", body: "Daylio is phone only. Ripple is on iOS, Android and the web." },
    ],
    pickThem: ["You want the fastest possible mood log", "You don't want to write or talk", "On-device storage matters to you", "You want a free app"],
    pickRipple: ["Mood taps never told you the reason", "You have a lot to track beyond mood", "You'd like to talk instead of tapping icons", "You want a weekly write-up of your week"],
    switching: [
      "You don't have to give up Daylio's charts. Some people keep the quick daily tap and use Ripple when there's more to say.",
      "Start by saying out loud the things you'd normally note in Daylio, plus whatever's on your list. Ripple will sort the to-dos and habits from the mood.",
    ],
    alternativesSlug: "daylio",
    faqs: [
      { q: "Is Daylio free?", a: "Daylio is free to download with a Premium upgrade. The App Store lists in-app purchases from $4.99 to $59.99." },
      { q: "Is Ripple a mood tracker?", a: "It tracks mood, but from your words rather than taps. It also builds your to-do list, tracks habits, shows patterns and scores your life areas in the Life Matrix." },
      { q: "How much is Ripple?", a: PRICE_LINE },
      { q: "Does Daylio use AI?", a: "We didn't find AI features on Daylio's own pages. It offers mood and activity stats and charts." },
    ],
    cta: { title: "Find out why the week felt like that.", body: "Talk to Ripple for 7 days and see what it picks up." },
  },

  "ripple-vs-finch": {
    competitor: "finch",
    title: "Ripple vs Finch: Self-Care Pet or Life Optimizer? | Ripple",
    description:
      "Ripple vs Finch: Finch makes self-care a gentle game with a virtual pet and is free to start; Ripple turns what you say into tasks, habits and patterns.",
    h1: "Ripple vs Finch: a self-care pet or a life optimizer?",
    verdict: [
      "Finch turns small self-care goals into a gentle game with a virtual pet, it's free to start and its reviews are glowing. Ripple is for adults carrying a lot: you talk, and it turns that into to-dos, habit check-offs, mood, patterns and a weekly report.",
      "Pick Finch if motivation is the problem. Pick Ripple if keeping track is the problem.",
    ],
    hubLine: "Finch makes self-care a game. Ripple keeps track of everything you're carrying.",
    tableIntro: "Finch is warm, playful and goal-based. Ripple is practical and built around what you say.",
    theyWinTitle: "Finch wins on warmth and price",
    theyWin: [
      { title: "It's kind and playful", body: "Caring for a small bird is a low-pressure way to do small things for yourself." },
      { title: "Free to start", body: "Finch is free, with an optional Finch Plus. Ripple has no free tier." },
      { title: "Loved by its users", body: "Finch shows a 4.9 rating from hundreds of thousands of App Store ratings." },
      { title: "Self-care goals", body: "Habit and goal setting built into the game." },
    ],
    rippleWinsTitle: "Ripple wins on the real-life load",
    rippleWins: [
      { title: "Catches your to-dos", body: "The dentist, the permission slip, the email to your boss, with dates. Finch's pages don't mention pulling tasks from entries." },
      { title: "Habits from what you say", body: "No tapping. Mention it and it's checked off." },
      { title: "Patterns and Life Matrix", body: "See what keeps coming up and how your life areas are trending." },
      { title: "Built for grown-up weeks", body: "No pet to look after. Just your week, sorted." },
    ],
    pickThem: ["You want gentle motivation for small self-care steps", "A game makes habits stick for you", "You want a free app", "You enjoy a cute, playful design"],
    pickRipple: ["Your problem is the amount, not the motivation", "You want tasks and dates caught for you", "You'd rather talk than tap", "You want a weekly report of what happened"],
    switching: [
      "Finch and Ripple do different jobs, so there's no reason to stop one to try the other.",
      "Use Ripple for a week for the things in your head that aren't self-care goals: work, kids, parents, the house. That's where it's strongest.",
    ],
    faqs: [
      { q: "Is Finch free?", a: "Finch is free with an optional Finch Plus subscription. The App Store lists in-app purchases from $5.99 to $69.99." },
      { q: "Is Ripple a habit tracker like Finch?", a: "Ripple tracks habits, but from what you say rather than a game. Mention a habit and it's checked off; skip it and Ripple notices." },
      { q: "How much is Ripple?", a: PRICE_LINE },
      { q: "Does Ripple have a pet or game?", a: "No. Ripple has streaks and milestones, but no pet. It's built around your to-dos, habits, mood and patterns." },
    ],
    cta: { title: "Carrying a lot? Put it down here.", body: "Try Ripple for 7 days and see what it catches." },
  },

  "ripple-vs-stoic": {
    competitor: "stoic",
    title: "Ripple vs Stoic: Which Journal App Suits You? | Ripple",
    description:
      "Ripple vs Stoic: Stoic offers structured routines, a planner and meditation; Ripple turns what you say into to-dos, habits and a weekly report. Compared.",
    h1: "Ripple vs Stoic: which journal app suits you?",
    verdict: [
      "Stoic is an all-in-one routine app: guided journaling, mood, habits, a planner, meditation and breathing, on almost every platform. Ripple does fewer things and does them for you: you talk, and it fills in your to-do list, checks off habits and writes your weekly report.",
      "If you like a structured routine, Stoic is a strong pick. If you'd rather not fill in a planner at all, Ripple is built for that.",
    ],
    hubLine: "Stoic is a structured routine app. Ripple fills in your list and habits from what you say.",
    tableIntro: "Both apps track mood and habits. The difference is who does the filling in.",
    theyWinTitle: "Stoic wins on range and structure",
    theyWin: [
      { title: "Routines with structure", body: "Guided morning and evening journaling for people who like a set format." },
      { title: "Meditation and breathing", body: "Stoic includes them. Ripple doesn't." },
      { title: "Photos and video", body: "Stoic accepts photos and video in entries. Ripple doesn't." },
      { title: "Lifetime option", body: "The App Store lists a $299 lifetime purchase, along with Premium and AI tiers." },
    ],
    rippleWinsTitle: "Ripple wins on doing the admin for you",
    rippleWins: [
      { title: "The list fills itself", body: "Stoic has a planner and to-do list you fill in. Ripple builds your list from what you said, with dates." },
      { title: "Habits checked off by voice", body: "Mention it and it's done. Skip it and Ripple notices." },
      { title: "No fixed routine", body: "Talk whenever something's on your mind. There's no set format to keep up." },
      { title: "One simple plan", body: `${M} a month or ${Y} a year, with everything in.` },
    ],
    pickThem: ["You want a guided daily routine", "Meditation and breathing in the same app appeals", "You want photos and video in entries", "You'd like a lifetime purchase option"],
    pickRipple: ["Filling in planners is the step you skip", "You want tasks pulled out of what you say", "You'd rather talk freely than follow a template", "You want one plan with everything included"],
    switching: [
      "Stoic keeps journals on your device. If you move, keep your Stoic data where it is; Ripple doesn't need it to get going.",
      "For a week, skip the planner and just talk Ripple through your day. See if the list it builds is the one you would have written.",
    ],
    faqs: [
      { q: "How much does Stoic cost?", a: "Stoic is free to download. The App Store lists Premium from $6.99 to $39.99, an AI tier from $12.99 to $99.99, and a $299 lifetime option." },
      { q: "How much is Ripple?", a: PRICE_LINE },
      { q: "Does Stoic pull tasks out of entries?", a: "Stoic has a planner and to-do list. We didn't find anything on its pages saying it creates tasks from your entries." },
      { q: "Does Ripple include meditation?", a: "No. Ripple focuses on your to-dos, habits, mood, patterns, Life Matrix and weekly report." },
    ],
    cta: { title: "Skip the planner. Just say it.", body: "Try Ripple for 7 days and let it build your list." },
  },

  "ripple-vs-apple-journal": {
    competitor: "applejournal",
    title: "Ripple vs Apple Journal: Is Built-In Enough? | Ripple",
    description:
      "Ripple vs Apple Journal: Apple's journal is free, built in and end-to-end encrypted in iCloud; Ripple turns what you say into tasks, habits and a report.",
    h1: "Ripple vs Apple Journal: is the built-in app enough?",
    verdict: [
      "Apple Journal is free, already on your iPhone, suggests moments from your photos, places and workouts, and is end-to-end encrypted in iCloud. Ripple costs money and does a different job: it turns what you say into to-dos, habit check-offs, mood, patterns and a weekly report.",
      "For a private record of your days, Apple Journal is enough. For help with what's still on your plate, it isn't built for that.",
    ],
    hubLine: "Apple Journal is free and private. Ripple does the follow-up on what you say.",
    tableIntro: "Apple Journal records moments. Ripple acts on what you said.",
    theyWinTitle: "Apple Journal wins on price, privacy and convenience",
    theyWin: [
      { title: "Free and already installed", body: "Nothing to download or pay for. Ripple has a paid plan." },
      { title: "End-to-end encrypted", body: "Apple says entries stored in iCloud are end-to-end encrypted, with suggestions made on device." },
      { title: "Suggestions from your life", body: "It suggests entries from your photos, places, music and workouts." },
      { title: "Rich entries", body: "Photos, videos, audio and locations." },
    ],
    rippleWinsTitle: "Ripple wins on what happens after the entry",
    rippleWins: [
      { title: "Tasks and dates", body: "Apple Journal doesn't make to-do lists. Ripple pulls them from what you said." },
      { title: "Habits", body: "Ripple checks off habits you mention and notices skipped ones." },
      { title: "Patterns and a weekly report", body: "Mood over time, recurring themes, Life Matrix and a written report every Sunday." },
      { title: "Android and web", body: "Apple Journal is Apple-only. Ripple works on iOS, Android and the web." },
    ],
    pickThem: ["You want a free, private diary", "You like prompts from your photos and places", "You only use Apple devices", "You don't need tasks or habits tracked"],
    pickRipple: ["You need help with what's still on your plate", "You want habits tracked from what you say", "You use Android or a non-Apple computer", "You want a weekly report"],
    switching: [
      "Keep Apple Journal for memories. Ripple is a different tool and doesn't need your old entries.",
      "Try this for a week: when something's on your mind, tell Ripple instead of writing it in Journal. Then look at the list and report it gives back.",
    ],
    faqs: [
      { q: "Is Apple Journal free?", a: "Yes. It's built into iPhone (iOS 17.2 and later) and Apple lists no price." },
      { q: "Is Apple Journal private?", a: "Apple says all Journal entries are end-to-end encrypted when stored in iCloud and that suggestions are created on device." },
      { q: "How much is Ripple?", a: PRICE_LINE },
      { q: "Does Ripple work on iPhone?", a: "Yes. Ripple is on iOS, Android and the web." },
    ],
    cta: { title: "Your journal remembers. Ripple follows up.", body: "Try Ripple for 7 days on your iPhone." },
  },

  "ripple-vs-reflectly": {
    competitor: "reflectly",
    title: "Ripple vs Reflectly: Which Mood Journal Fits? | Ripple",
    description:
      "Ripple vs Reflectly: Reflectly asks friendly guided questions and tracks mood; Ripple turns what you say into to-dos, habits and patterns. Honest comparison.",
    h1: "Ripple vs Reflectly: which mood journal fits?",
    verdict: [
      "Reflectly makes starting easy with upbeat, AI-guided questions, mood tracking and daily to monthly overviews. Ripple skips the questions: you talk or type freely and it turns that into to-dos, habit check-offs, mood, patterns and a weekly report.",
      "If you want to be asked how your day went, Reflectly does that well. If you want what you said turned into something you can act on, try Ripple.",
    ],
    hubLine: "Reflectly asks you guided questions. Ripple turns what you say into tasks and habits.",
    tableIntro: "Reflectly is question-led and typing-first. Ripple is talk-first and action-led.",
    theyWinTitle: "Reflectly wins on easy starts",
    theyWin: [
      { title: "Guided questions", body: "Friendly prompts make it easy to write something every day. Ripple doesn't prompt you." },
      { title: "Free to download", body: "Reflectly is free with a Premium upgrade. Ripple has no free tier." },
      { title: "Overviews", body: "Daily, weekly and monthly overviews of your mood." },
      { title: "Familiar and established", body: "A 4.6 rating from tens of thousands of App Store ratings." },
    ],
    rippleWinsTitle: "Ripple wins on talking and follow-up",
    rippleWins: [
      { title: "Talk instead of type", body: "Ripple is built around voice. Reflectly's pages don't mention voice input." },
      { title: "Your to-do list", body: "Tasks and dates from what you said. Reflectly's pages don't mention tasks." },
      { title: "Habits", body: "Ripple checks off habits you mention. Reflectly's pages don't mention habits." },
      { title: "Life Matrix", body: "Your life areas scored over time, alongside mood and patterns." },
    ],
    pickThem: ["You like being asked questions", "You prefer typing short entries", "You mainly want mood tracking", "You want a free download"],
    pickRipple: ["You'd rather talk than type", "Your mind is full of tasks, not just feelings", "You want habits tracked without a tracker", "You want a weekly report"],
    switching: [
      "Keep Reflectly if you like its daily questions. Ripple can sit alongside it for the practical side.",
      "When you start Ripple, talk the way you'd answer Reflectly's “how was your day?”, then add what's still to do. Ripple will separate the two.",
    ],
    faqs: [
      { q: "Is Reflectly still available?", a: "Yes. Reflectly is on the App Store and Google Play, and its App Store listing showed a recent update when we checked in October 2026." },
      { q: "How much does Reflectly cost?", a: "Reflectly is free to download. The App Store lists Premium in-app purchases from $4.99 to $59.99." },
      { q: "How much is Ripple?", a: PRICE_LINE },
      { q: "Can I type in Ripple?", a: "Yes. You can talk or type. Either way, Ripple pulls out your tasks, habits, mood and patterns." },
    ],
    cta: { title: "Say what's on your mind. See what's in it.", body: "Try Ripple for 7 days." },
  },
};

// ─── Alternatives pages ──────────────────────────────────────────────────

export type AlternativesCopy = {
  competitor: Exclude<AppKey, "ripple">;
  title: string;
  description: string;
  h1: string;
  lede: string[];
  whyLook: Point[];
  fairNote: string;
  picks: { app: AppKey; label: string; why: string; compareSlug?: CompareSlug }[];
  checklist: string[];
  compareSlug: CompareSlug;
  faqs: Faq[];
  cta: { title: string; body: string };
};

export const ALTERNATIVES_COPY: Record<AlternativeSlug, AlternativesCopy> = {
  rosebud: {
    competitor: "rosebud",
    title: "Rosebud Alternatives: 5 AI Journals Compared | Ripple",
    description:
      "Looking for a Rosebud alternative? Five AI journal apps compared on price, free plans, voice, tasks and habits, with an honest note on where Rosebud still wins.",
    h1: "The best Rosebud alternative for turning talk into a plan",
    lede: [
      "The best Rosebud alternative depends on why you're leaving. If you want a free AI journal, look at Reflection or Mindsera. If you want what you say turned into to-dos and habits, that's what Ripple is for.",
      "Rosebud's help center says its free plan was retired on September 30, 2026, which is why many people are looking right now.",
    ],
    whyLook: [
      { title: "The free plan ended", body: "Rosebud's help center says the free plan was retired on September 30, 2026. Entries stay and can be exported." },
      { title: "The price", body: "Bloom is $12.99 a month or $107.99 a year, with higher Thrive tiers on the App Store." },
      { title: "You want action, not conversation", body: "Rosebud is built around reflection with an AI. Some people want the to-dos and habits handled instead." },
      { title: "You want a different style", body: "Frameworks, guided programs or a plain journal can suit some people better than chat." },
    ],
    fairNote:
      "To be fair to Rosebud: it has long-term memory, follow-up questions, clear written privacy commitments and a 4.9 App Store rating. If those are why you chose it, it may still be the right app.",
    picks: [
      { app: "ripple", label: "Best for turning what you say into tasks and habits", why: "You talk or type whenever; Ripple builds your to-do list with dates, checks off habits you mention, tracks mood and patterns, scores your Life Matrix and sends a weekly report. No chat companion, and no free tier, but it costs less than Rosebud.", compareSlug: "ripple-vs-rosebud" },
      { app: "reflection", label: "Best free AI coach", why: "A Free Forever plan, an AI coach, 100+ guided programs and Premium from $8 a month. The closest to Rosebud's conversational style at a lower price.", compareSlug: "ripple-vs-reflection" },
      { app: "mindsera", label: "Best for structured thinking", why: "A free plan with a habit tracker and 52+ frameworks, plus emotion and personality analysis. Genius is $14.99 a month.", compareSlug: "ripple-vs-mindsera" },
      { app: "dayora", label: "Best free AI journal, with a caveat", why: "Voice, mood and a reply to every entry free. Dayora says it may use entries to train AI models, so read its terms.", compareSlug: "ripple-vs-dayora" },
      { app: "dayone", label: "Best classic journal", why: "A free plan, end-to-end encryption and rich media. AI features are on the $74.99 a year Gold plan.", compareSlug: "ripple-vs-day-one" },
    ],
    checklist: [
      "Export your Rosebud entries first, so you have a copy whatever you decide",
      "Decide whether you want an AI to talk to, or an app that acts on what you said",
      "Check whether a free plan matters, or a lower paid price is fine",
      "Read each app's privacy terms, especially on AI training",
    ],
    compareSlug: "ripple-vs-rosebud",
    faqs: [
      { q: "Did Rosebud get rid of its free plan?", a: "Rosebud's help center says the free plan was retired on September 30, 2026. Its homepage still says “free to use”, so check the app itself for your account." },
      { q: "What's the best free Rosebud alternative?", a: "Reflection has a Free Forever plan with an AI coach. Mindsera's free plan includes frameworks and a habit tracker. Dayora's free core is generous but it says it may train AI on entries." },
      { q: "Is Ripple a good Rosebud alternative?", a: `If you want tasks and habits pulled from what you say, yes. If you want an AI to talk back, no. ${PRICE_LINE}` },
      { q: "Can I bring my Rosebud entries to another app?", a: "Rosebud says entries can be exported. Whether another app can import them varies; Ripple works from your first entry without your history." },
    ],
    cta: { title: "Try the alternative that acts on what you say.", body: "7 days free, then decide." },
  },

  "day-one": {
    competitor: "dayone",
    title: "Day One Alternatives: 5 Journals That Do More | Ripple",
    description:
      "Day One alternatives compared: five journal apps for people who want AI, tasks, habits or a lower price, with an honest note on where Day One is still best.",
    h1: "The best Day One alternative for people who want follow-through",
    lede: [
      "The best Day One alternative depends on what you want your journal to do. If you want it to act on what you write or say, Ripple turns entries into to-dos, habits and a weekly report. If you want AI conversation, Rosebud or Reflection.",
      "If you love Day One as a keepsake, you may not need to replace it at all.",
    ],
    whyLook: [
      { title: "AI is on the top plan", body: "Day One's AI summaries and Daily Chat are on Gold, $74.99 a year." },
      { title: "It stores, it doesn't act", body: "Day One keeps entries beautifully. It doesn't turn them into tasks or track habits beyond journaling streaks." },
      { title: "Typing is a wall", body: "Some people want to talk it out and get something sorted back." },
      { title: "You want patterns", body: "Mood over time and recurring themes, without reading back through years of entries." },
    ],
    fairNote:
      "Day One remains one of the best journals made: end-to-end encryption on the free plan, photos and video, apps on nearly every device and a huge number of reviews. As a lifelong record, nothing on this list beats it.",
    picks: [
      { app: "ripple", label: "Best for turning what you say into tasks and habits", why: "Talk or type, and Ripple builds your to-do list with dates, checks off habits you mention, tracks mood and patterns, and sends a weekly report. No photos or encryption claims; it's for the follow-through, not the keepsake.", compareSlug: "ripple-vs-day-one" },
      { app: "rosebud", label: "Best for AI conversation and memory", why: "Follow-up questions and long-term memory. Paid only, $12.99 a month, per its help center since September 30, 2026.", compareSlug: "ripple-vs-rosebud" },
      { app: "reflection", label: "Best value AI journal", why: "Free plan, photos, handwriting scan, Mac and web apps, and Premium from $8 a month.", compareSlug: "ripple-vs-reflection" },
      { app: "applejournal", label: "Best free option on iPhone", why: "Built in, end-to-end encrypted in iCloud, with suggestions from your photos and places.", compareSlug: "ripple-vs-apple-journal" },
      { app: "stoic", label: "Best for structured routines", why: "Guided journaling with habits, a planner and meditation, on most platforms.", compareSlug: "ripple-vs-stoic" },
    ],
    checklist: [
      "Keep your Day One archive; you can run another app alongside it",
      "Decide whether you want a record, a conversation or follow-through",
      "If encryption is a must, check each app's own claims",
      "Compare total yearly cost, not just the monthly price",
    ],
    compareSlug: "ripple-vs-day-one",
    faqs: [
      { q: "What's the best free Day One alternative?", a: "Apple Journal if you use an iPhone. Reflection if you want AI features on a free plan." },
      { q: "Which Day One alternative has AI without the top tier?", a: "Ripple includes its to-dos, habits, mood, patterns, Life Matrix and weekly report in one plan. Reflection and Mindsera have AI on free and paid plans." },
      { q: "Is Ripple a full Day One replacement?", a: "Not for photos, video or an encrypted lifelong record. Ripple is for turning what you say into tasks, habits and patterns." },
      { q: "How much is Ripple?", a: PRICE_LINE },
    ],
    cta: { title: "Keep your journal. Add the follow-through.", body: "Try Ripple for 7 days alongside Day One." },
  },

  mindsera: {
    competitor: "mindsera",
    title: "Mindsera Alternatives: 5 AI Journals Compared | Ripple",
    description:
      "Mindsera alternatives compared: five AI journal apps for people who want less analysis and more follow-through, a lower price, or an AI that talks back.",
    h1: "The best Mindsera alternative for running your week, not analysing it",
    lede: [
      "The best Mindsera alternative for most busy people is one that does the follow-up for you. Ripple turns what you say into to-dos with dates, habits, mood and patterns, without frameworks to fill in.",
      "If you want a cheaper AI coach instead, Reflection is the obvious one to try.",
    ],
    whyLook: [
      { title: "The price", body: "Mindsera Genius is $14.99 a month or $129 a year, the highest monthly price we found among AI journals." },
      { title: "Frameworks feel like homework", body: "52+ templates are great if you like structure, and a lot to choose from if you don't." },
      { title: "You need tasks, not insight", body: "Mindsera's pages don't mention pulling to-dos out of entries." },
      { title: "You want to just talk", body: "Some people want to say it and be done." },
    ],
    fairNote:
      "Mindsera has a real free plan, a habit tracker, voice and call modes, paper-page scanning and clear statements that entries aren't used to train AI. If you journal to think, it's excellent.",
    picks: [
      { app: "ripple", label: "Best for turning what you say into tasks and habits", why: "No templates. Talk or type, and Ripple builds your to-do list, checks off habits, tracks mood and patterns and writes a weekly report.", compareSlug: "ripple-vs-mindsera" },
      { app: "reflection", label: "Best cheaper AI coach", why: "Free plan, guided programs, an AI coach and Premium from $8 a month.", compareSlug: "ripple-vs-reflection" },
      { app: "rosebud", label: "Best for AI memory", why: "Follow-up questions and long-term memory, $12.99 a month.", compareSlug: "ripple-vs-rosebud" },
      { app: "stoic", label: "Best for routines", why: "Guided morning and evening journaling plus habits and meditation.", compareSlug: "ripple-vs-stoic" },
      { app: "dayora", label: "Best free AI journal, with a caveat", why: "Generous free core; says it may use entries to train AI.", compareSlug: "ripple-vs-dayora" },
    ],
    checklist: [
      "Export from Mindsera (included on the free plan)",
      "Decide whether you want analysis or follow-through",
      "If you keep Mindsera free, you can try another app alongside it",
      "Read each app's AI-training terms",
    ],
    compareSlug: "ripple-vs-mindsera",
    faqs: [
      { q: "Is there a cheaper alternative to Mindsera?", a: `Reflection Premium is $8 a month. ${PRICE_LINE}` },
      { q: "Which Mindsera alternative has habit tracking?", a: "Ripple, Stoic and Rosebud all mention habit tracking. In Ripple, habits are checked off from what you say." },
      { q: "Does Ripple use frameworks like Mindsera?", a: "No. There are no templates or prompts in Ripple." },
      { q: "Can I keep Mindsera and try Ripple?", a: "Yes. Mindsera's free plan stays, and Ripple has a 7-day free trial." },
    ],
    cta: { title: "Less analysing. More getting it done.", body: "Try Ripple free for 7 days." },
  },

  reflection: {
    competitor: "reflection",
    title: "Reflection App Alternatives: 5 Picks Compared | Ripple",
    description:
      "Reflection app alternatives compared: five journal apps for tasks, habits, memory or a classic diary, with prices, free plans and features checked October 2026.",
    h1: "The best Reflection alternative for tasks, habits and patterns",
    lede: [
      "The best Reflection alternative depends on what's missing for you. If it's tasks and habits, Ripple turns what you say into a to-do list with dates and checks off habits you mention. If it's AI memory, Rosebud.",
      "Reflection itself is good value, so make sure the gap is real before you switch.",
    ],
    whyLook: [
      { title: "No tasks or habits", body: "We didn't find task extraction or habit tracking on Reflection's pages." },
      { title: "Programs aren't for everyone", body: "100+ guided programs suit some people; others just want to talk." },
      { title: "You want a different kind of AI", body: "Organizing rather than coaching, or memory across months." },
      { title: "You want a keepsake", body: "A long-term, media-rich record suits Day One better." },
    ],
    fairNote:
      "Reflection has a Free Forever plan, an AI coach, apps on phone, Mac and web, AES-256 encryption at rest and a written promise not to train AI on entries. At $8 a month, it's one of the best-value AI journals.",
    picks: [
      { app: "ripple", label: "Best for turning what you say into tasks and habits", why: "Ripple builds your list with dates, checks off habits you mention, tracks mood and patterns, scores your Life Matrix and sends a weekly report. Costs more than Reflection and has no free tier.", compareSlug: "ripple-vs-reflection" },
      { app: "rosebud", label: "Best for AI memory", why: "Follow-up questions and long-term memory, $12.99 a month.", compareSlug: "ripple-vs-rosebud" },
      { app: "mindsera", label: "Best for structured thinking", why: "Frameworks, emotion analysis and a free plan with habit tracking.", compareSlug: "ripple-vs-mindsera" },
      { app: "dayone", label: "Best classic journal", why: "End-to-end encryption, rich media and a free plan.", compareSlug: "ripple-vs-day-one" },
      { app: "stoic", label: "Best for routines", why: "Guided routines, a planner, habits and meditation.", compareSlug: "ripple-vs-stoic" },
    ],
    checklist: ["Keep your free Reflection account while you try others", "Name the one thing Reflection doesn't do for you", "Compare yearly costs", "Check each app's privacy terms"],
    compareSlug: "ripple-vs-reflection",
    faqs: [
      { q: "Is Reflection free?", a: "Yes, it has a Free Forever plan. Premium is $8 a month or $5.75 a month billed annually." },
      { q: "Which Reflection alternative tracks tasks?", a: "Ripple turns what you say into to-dos with dates. Stoic has a planner you fill in yourself." },
      { q: "Is Ripple more expensive than Reflection?", a: `Yes. ${PRICE_LINE}` },
      { q: "Which alternative has habit tracking?", a: "Ripple, Mindsera, Stoic and Rosebud all mention habit tracking on their pages." },
    ],
    cta: { title: "Add the follow-through.", body: "Try Ripple for 7 days and keep Reflection while you do." },
  },

  daylio: {
    competitor: "daylio",
    title: "Daylio Alternatives: 5 Mood and Habit Apps | Ripple",
    description:
      "Daylio alternatives compared: five mood and habit apps for when tap-logging isn't enough, from AI journals that read your words to gentle self-care games.",
    h1: "The best Daylio alternative for when taps aren't enough",
    lede: [
      "The best Daylio alternative is one that reads your words instead of your taps. Ripple tracks mood from what you say, and also builds your to-do list, checks off habits and spots patterns.",
      "If you want to stay with quick, playful tracking, Finch is the gentler option.",
    ],
    whyLook: [
      { title: "Taps don't explain much", body: "A mood icon says how the day felt, not why." },
      { title: "No AI", body: "We didn't find AI features on Daylio's pages." },
      { title: "No to-do list", body: "Daylio tracks mood, activities and goals, not tasks." },
      { title: "Phone only", body: "Daylio is iOS and Android. Some people want web access too." },
    ],
    fairNote:
      "Daylio is still the fastest mood log there is, keeps data on your phone, is free to start and has a 4.8 rating from tens of thousands of App Store ratings. If speed matters most, keep it.",
    picks: [
      { app: "ripple", label: "Best for turning what you say into tasks and habits", why: "Mood from your own words, plus to-dos with dates, habits checked off, patterns, Life Matrix and a weekly report. Paid, with a 7-day trial.", compareSlug: "ripple-vs-daylio" },
      { app: "finch", label: "Best gentle self-care", why: "Mood check-ins and habits in a game with a virtual pet. Free to start.", compareSlug: "ripple-vs-finch" },
      { app: "stoic", label: "Best for routines", why: "Mood trends, habits, a planner and meditation.", compareSlug: "ripple-vs-stoic" },
      { app: "reflectly", label: "Best guided mood journal", why: "Upbeat AI-guided questions and mood overviews.", compareSlug: "ripple-vs-reflectly" },
      { app: "mindsera", label: "Best for emotion analysis", why: "Emotion analysis, a habit tracker and a free plan.", compareSlug: "ripple-vs-mindsera" },
    ],
    checklist: ["Daylio stores data on your phone, so back it up first", "Decide whether you'll talk or type more than a tap", "Check whether you want tasks, not just mood", "Try one alternative alongside Daylio for a week"],
    compareSlug: "ripple-vs-daylio",
    faqs: [
      { q: "What's the best free Daylio alternative?", a: "Finch is free with an optional upgrade. Mindsera has a free plan with a habit tracker." },
      { q: "Which Daylio alternative uses AI?", a: "Ripple, Mindsera, Reflectly and Stoic all mention AI features. Ripple uses it to pull tasks, habits, mood and patterns from what you say." },
      { q: "How much is Ripple?", a: PRICE_LINE },
      { q: "Can I keep Daylio and use Ripple?", a: "Yes. Some people keep the quick daily tap and talk to Ripple when there's more to say." },
    ],
    cta: { title: "Find out what's behind the mood.", body: "Try Ripple free for 7 days." },
  },
};
