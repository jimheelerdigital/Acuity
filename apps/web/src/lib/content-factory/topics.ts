/**
 * Content Factory — carousel topic seed bank.
 *
 * 36 topics reflecting Ripple positioning. Headlines are scroll-stopping
 * hooks — short, punchy, provocative. Reason slides use ellipses, commas,
 * and emotional phrasing that makes people feel seen. NO emojis anywhere.
 */

import type { StyleLane } from "./brand";

export interface CarouselTopic {
  slug: string;
  headline: string;
  lane: StyleLane;
  reasons: string[];
}

export const CAROUSEL_TOPICS: CarouselTopic[] = [
  // ─── Mental Load ─────────────────────────────────────────────────
  {
    slug: "invisible-mental-load",
    headline: "Nobody sees this, but it's destroying you",
    lane: "cinematicReal",
    reasons: [
      "Remembering everything... for everyone",
      "Planning meals no one will thank you for",
      "Tracking deadlines that aren't even yours",
      "Managing everyone's mood, constantly",
      "Anticipating problems no one else sees coming",
      "The calendar lives in your head, nowhere else",
    ],
  },
  {
    slug: "why-youre-always-tired",
    headline: "You're not lazy. You're THIS.",
    lane: "stillLife",
    reasons: [
      "Decision fatigue hits before noon",
      "Your brain never, ever switches off",
      "You carry everyone's emotions... on top of yours",
      "A thousand roles, zero breaks between them",
      "Rest feels like something you haven't earned",
      "Always on-call, even when you're off-duty",
    ],
  },
  {
    slug: "things-no-one-sees",
    headline: "You do all of this... and nobody notices",
    lane: "paperDiorama",
    reasons: [
      "Restocking things before anyone runs out",
      "Fixing conflicts no one even noticed happened",
      "Researching the best option, every single time",
      "Remembering what everyone likes, needs, hates",
      "Quietly adjusting so everyone else is comfortable",
    ],
  },

  // ─── Repeating Patterns ──────────────────────────────────────────
  {
    slug: "patterns-you-repeat",
    headline: "Stop me if this sounds familiar...",
    lane: "risograph",
    reasons: [
      "Saying yes, when you meant no",
      "Over-explaining yourself... just to feel safe",
      "Putting yourself last, until you finally snap",
      "Starting strong, then quietly disappearing",
      "Asking for permission you don't actually need",
      "Absorbing everyone's stress like it's yours to carry",
    ],
  },
  {
    slug: "why-sundays-feel-heavy",
    headline: "Why Sunday nights hit different",
    lane: "claymation",
    reasons: [
      "You're already pre-living next week",
      "The weekend never actually felt restful",
      "Unfinished emotional business... surfacing quietly",
      "Measuring the gap between your plans and your reality",
      "That familiar guilt, for not being productive enough",
    ],
  },
  {
    slug: "same-fight-different-day",
    headline: "You're not fighting about the dishes",
    lane: "flatGraphic",
    reasons: [
      "The real issue stays buried, under logistics",
      "You react to the trigger... not the wound",
      "Neither of you actually feels heard",
      "Exhaustion makes everything feel personal",
      "Same script, different night, no resolution",
      "You know the pattern, but you can't rewrite it",
    ],
  },
  {
    slug: "cycles-you-know-but-cant-break",
    headline: "You already know this about yourself. So why can't you stop?",
    lane: "toon3d",
    reasons: [
      "Overcommitting, then resenting every single one",
      "Stress eating... again",
      "Scrolling when what you need is connection",
      "Avoiding the conversation until it explodes",
      "Telling yourself, this week will be different",
    ],
  },

  // ─── Knowing But Not Doing ───────────────────────────────────────
  {
    slug: "you-know-what-to-do",
    headline: "You know EXACTLY what to do. So why aren't you doing it?",
    lane: "stillLife",
    reasons: [
      "Knowing and doing... live in different rooms",
      "Awareness without reflection is just noise",
      "You haven't said it out loud yet",
      "Your body stores what your mind keeps avoiding",
      "Nobody has asked you the right question",
      "Reading about change, isn't changing",
    ],
  },
  {
    slug: "advice-you-give-but-wont-take",
    headline: "You'd say this to a friend in a heartbeat. But not to yourself.",
    lane: "paperDiorama",
    reasons: [
      "Rest isn't something you need to earn",
      "You're allowed to change your mind, fully",
      "Not everything needs to be optimised",
      "Stop keeping score... with yourself",
      "Ask for help before you're drowning",
    ],
  },
  {
    slug: "things-you-keep-postponing",
    headline: "You've been putting this off for months",
    lane: "risograph",
    reasons: [
      "That honest conversation you keep rehearsing",
      "The boundary you know needs to exist",
      "That appointment, the one you keep rescheduling",
      "Admitting something isn't working... anymore",
      "Forgiving yourself for the messy chapter",
      "Starting the thing you're actually excited about",
    ],
  },

  // ─── Planning vs Progress ────────────────────────────────────────
  {
    slug: "planning-vs-doing",
    headline: "Your planning habit is the problem",
    lane: "flatGraphic",
    reasons: [
      "Colour-coded lists don't move the needle",
      "Planning feels safe. Doing feels vulnerable.",
      "You're preparing for a perfect start... forever",
      "The plan changes the second real life starts",
      "Reflection beats planning, every single time",
    ],
  },
  {
    slug: "productivity-trap",
    headline: "Productivity is lying to you",
    lane: "claymation",
    reasons: [
      "Optimising your schedule won't fix your life",
      "Busyness is how you avoid sitting with yourself",
      "Every new app is just... a fresh start fantasy",
      "You don't need a system. You need clarity.",
      "Doing more won't fill what doing less reveals",
      "Spinning faster isn't the same as moving forward",
    ],
  },
  {
    slug: "goals-that-dont-stick",
    headline: "It's August. Where are your January goals?",
    lane: "cinematicReal",
    reasons: [
      "They came from who you think you should be",
      "No check-in system to catch you drifting",
      "Willpower... is a terrible long-term strategy",
      "You skipped the 'why does this matter' step",
      "Life didn't pause for your plan to work",
    ],
  },

  // ─── Failed Journaling ──────────────────────────────────────────
  {
    slug: "why-journaling-never-worked",
    headline: "Journaling didn't fail you. It was never built for you.",
    lane: "toon3d",
    reasons: [
      "Blank pages feel like another to-do item",
      "Writing at night is exhausting, not healing",
      "You didn't know what to say... so you stopped",
      "Prompts felt generic, disconnected from your life",
      "You needed to talk, not write",
      "Nobody showed you what to do with the insights",
    ],
  },
  {
    slug: "voice-vs-writing",
    headline: "What if you just... said it out loud?",
    lane: "stillLife",
    reasons: [
      "Speaking activates completely different processing",
      "You say what you really mean, unedited",
      "Three minutes talking beats thirty minutes typing",
      "Your tone reveals what your words try to hide",
      "Less friction means you actually do it",
    ],
  },
  {
    slug: "what-journaling-misses",
    headline: "Your journal can't do this for you",
    lane: "paperDiorama",
    reasons: [
      "It doesn't connect your patterns over time",
      "You re-read old entries and cringe, not learn",
      "No one summarises the themes... for you",
      "Captures moments, but never trajectories",
      "Writing filters. Your voice is unfiltered truth.",
      "You forget what you wrote within a week",
    ],
  },

  // ─── Self-Reflection ─────────────────────────────────────────────
  {
    slug: "questions-you-avoid",
    headline: "You already know the answer. You're just scared to say it.",
    lane: "risograph",
    reasons: [
      "Am I happy, or just... comfortable?",
      "When did I last do something just for me?",
      "What am I tolerating that I shouldn't be?",
      "Is this my goal, or someone else's expectation?",
      "What would I change if nobody would judge me?",
    ],
  },
  {
    slug: "3am-thoughts",
    headline: "Your 3am brain is trying to tell you something",
    lane: "cinematicReal",
    reasons: [
      "Night quiet makes suppressed feelings louder",
      "Your guard drops when you're tired enough",
      "Unprocessed days stack up... like unread mail",
      "Anxiety fills the space reflection should occupy",
      "Those thoughts don't go away. They wait.",
      "Morning buries what midnight tried to surface",
    ],
  },
  {
    slug: "mirror-not-coach",
    headline: "You don't need more advice",
    lane: "claymation",
    reasons: [
      "The answers are already inside you",
      "Advice without context is just noise",
      "Hearing your own voice creates real clarity",
      "A mirror reflects. A coach directs.",
      "You need to see yourself, not fix yourself",
    ],
  },

  // ─── Emotional Labour ────────────────────────────────────────────
  {
    slug: "emotional-labour-tax",
    headline: "This is the job you never applied for",
    lane: "flatGraphic",
    reasons: [
      "Smiling, when you're running on empty",
      "Being the calm one... so others can fall apart",
      "Translating everyone's feelings into action items",
      "Holding space for others, but never for yourself",
      "Performing fine, when you're anything but",
      "Managing moods is your unpaid second job",
    ],
  },
  {
    slug: "why-you-feel-touched-out",
    headline: "Your body is screaming. You keep ignoring it.",
    lane: "toon3d",
    reasons: [
      "Sensory overload is real, not weakness",
      "Everyone needs something from you, constantly",
      "You haven't had uninterrupted silence in weeks",
      "Your nervous system needs a break from being needed",
      "Being present for everyone... depletes your own presence",
    ],
  },

  // ─── Identity & Growth ───────────────────────────────────────────
  {
    slug: "who-are-you-outside-roles",
    headline: "Take away the title. Who are you?",
    lane: "stillLife",
    reasons: [
      "Mother, partner, employee... but who else?",
      "You lost your hobbies when life got serious",
      "Your identity merged with your responsibilities",
      "You forgot what excited you at twenty-five",
      "Rediscovery starts with one honest question",
      "You're allowed to evolve beyond your resume",
    ],
  },
  {
    slug: "growth-looks-different-at-40",
    headline: "Growth after 40 doesn't look like it used to",
    lane: "paperDiorama",
    reasons: [
      "It's subtler, harder to measure externally",
      "You're unlearning more than you're learning",
      "Progress now means better boundaries, not more hustle",
      "The wins are quieter... and more meaningful",
      "You're finally doing it for you, not for proof",
    ],
  },
  {
    slug: "permission-to-change",
    headline: "Plot twist: you're allowed to change your mind",
    lane: "risograph",
    reasons: [
      "What you wanted at 30 doesn't have to fit at 42",
      "Outgrowing something isn't failing at it",
      "Your values can shift without betraying anyone",
      "Changing course is data, not weakness",
      "The bravest thing is admitting... it's not working",
      "You get to rewrite the story, mid-chapter",
    ],
  },

  // ─── Relationship Patterns ───────────────────────────────────────
  {
    slug: "why-you-shut-down",
    headline: "This is why you go silent",
    lane: "cinematicReal",
    reasons: [
      "Speaking up felt unsafe growing up, so you stopped",
      "You learned that silence keeps the peace",
      "Vulnerability was punished, not rewarded",
      "You'd rather swallow it than risk the reaction",
      "Shutting down is self-protection... not apathy",
    ],
  },
  {
    slug: "things-your-partner-doesnt-see",
    headline: "Show this to your partner",
    lane: "claymation",
    reasons: [
      "The mental checklist, before you leave the house",
      "How you rehearse hard conversations in the shower",
      "The guilt you feel... for wanting time alone",
      "How much you dim yourself to avoid conflict",
      "The running tally of emotional IOUs you never cash in",
      "How you hold the family together with invisible thread",
    ],
  },

  // ─── Wellness Culture Pushback ───────────────────────────────────
  {
    slug: "self-care-isnt-candles",
    headline: "Bath bombs are not self-care",
    lane: "flatGraphic",
    reasons: [
      "Having the conversation you've been avoiding",
      "Saying no, without writing a paragraph excuse",
      "Letting the house be messy... without guilt",
      "Blocking time that nobody else can touch",
      "Admitting you need more than a bubble bath",
    ],
  },
  {
    slug: "toxic-positivity",
    headline: "'Good vibes only' is gaslighting yourself",
    lane: "risograph",
    reasons: [
      "Good vibes only... erases legitimate pain",
      "Forcing gratitude when you're struggling isn't healing",
      "Your negative emotions carry important information",
      "Positivity without processing is just suppression",
      "You're allowed to be not okay, and still be strong",
      "Real growth starts with honest, messy feelings",
    ],
  },

  // ─── Daily Life / Decompression ──────────────────────────────────
  {
    slug: "ways-to-decompress",
    headline: "Do this tonight instead of doom scrolling",
    lane: "toon3d",
    reasons: [
      "Talk it out. Three minutes beats hours of spiralling.",
      "Name the feeling, before you try to fix it",
      "Let your body move, without calling it exercise",
      "Put the phone down. Stare at nothing. Five minutes.",
      "Stop solving. Just describe what happened today.",
    ],
  },

  // ─── "Signs That" Format ─────────────────────────────────────────
  {
    slug: "signs-youre-burnt-out",
    headline: "You're not tired. You're burnt out.",
    lane: "claymation",
    reasons: [
      "You dread things you used to enjoy",
      "Small tasks feel... impossibly heavy",
      "You can't remember the last time you laughed hard",
      "Sleep doesn't make you feel rested anymore",
      "You're irritable with the people you love most",
      "Everything feels like it's your responsibility",
      "You fantasise about disappearing, just for a week",
    ],
  },
  {
    slug: "signs-you-need-boundaries",
    headline: "If you feel resentful, read this",
    lane: "flatGraphic",
    reasons: [
      "You feel resentful... but you can't explain why",
      "People come to you, but never ask how you are",
      "You say yes, and immediately regret it",
      "Your calendar is full, but none of it is for you",
      "You feel guilty every single time you rest",
      "You've lost track of what you actually want",
    ],
  },
  {
    slug: "signs-youre-people-pleasing",
    headline: "This habit is quietly ruining your life",
    lane: "paperDiorama",
    reasons: [
      "You apologise for things that aren't your fault",
      "You change your opinion based on who's in the room",
      "Saying no feels physically uncomfortable",
      "You rehearse texts for twenty minutes before sending",
      "Everyone thinks you're fine... because you never say otherwise",
    ],
  },
  {
    slug: "signs-youre-emotionally-exhausted",
    headline: "You're not lazy. Read this.",
    lane: "toon3d",
    reasons: [
      "You have the time, but zero motivation",
      "Your to-do list makes you want to cry",
      "You zone out mid-conversation... without realising",
      "Weekends feel like recovery, not recreation",
      "You're running on autopilot through your own life",
      "One more decision, and you might break",
    ],
  },
  {
    slug: "signs-you-need-to-talk",
    headline: "That thing you keep replaying? Say it out loud.",
    lane: "risograph",
    reasons: [
      "The same thought, looping... for days",
      "You've journaled about it but nothing shifted",
      "Your chest feels tight, but you can't name why",
      "You keep almost telling someone, then stopping",
      "You know the answer. You just need to hear yourself say it.",
    ],
  },
  {
    slug: "signs-youre-healing",
    headline: "You might not see it yet... but you're healing",
    lane: "claymation",
    reasons: [
      "You catch the pattern, before you repeat it",
      "Old triggers don't hit as hard anymore",
      "You choose rest... without the guilt spiral",
      "You say what you mean, the first time",
      "You're less interested in proving yourself to people",
      "Silence feels comfortable, instead of terrifying",
    ],
  },
];
