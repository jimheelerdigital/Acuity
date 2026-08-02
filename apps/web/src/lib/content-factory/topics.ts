/**
 * Content Factory — carousel topic seed bank.
 *
 * 30 topics reflecting Ripple positioning: mental load, invisible labour,
 * repeating patterns, knowing-but-not-doing, planning vs progress, failed
 * journaling. Each topic has 5-7 reasons (4-7 words each) that become
 * individual carousel slides.
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
    headline: "The invisible weight you carry daily",
    lane: "cinematicReal",
    reasons: [
      "Remembering everyone's appointments and needs",
      "Planning meals nobody thanks you for",
      "Tracking school forms and deadlines",
      "Managing the household emotional climate",
      "Anticipating problems before they happen",
      "Carrying the family calendar in your head",
    ],
  },
  {
    slug: "why-youre-always-tired",
    headline: "Why you're always tired (it's not sleep)",
    lane: "toon3d",
    reasons: [
      "Decision fatigue hits before noon",
      "Your brain never fully switches off",
      "You process everyone's emotions too",
      "Context-switching between a thousand roles",
      "Rest feels guilty instead of restorative",
      "You're always on-call even when off-duty",
    ],
  },
  {
    slug: "things-no-one-sees",
    headline: "Things you do that no one sees",
    lane: "paperDiorama",
    reasons: [
      "Restocking before anyone notices it's empty",
      "Smoothing over conflicts nobody noticed",
      "Researching the best option for everything",
      "Keeping track of what everyone likes",
      "Quietly adjusting plans so everyone's happy",
    ],
  },

  // ─── Repeating Patterns ──────────────────────────────────────────
  {
    slug: "patterns-you-repeat",
    headline: "Patterns you keep repeating (but don't see)",
    lane: "risograph",
    reasons: [
      "Saying yes when you mean no",
      "Over-explaining yourself to feel safe",
      "Putting yourself last until you snap",
      "Starting strong then quietly quitting",
      "Seeking permission you don't need",
      "Absorbing other people's stress as yours",
    ],
  },
  {
    slug: "why-sundays-feel-heavy",
    headline: "Why Sundays feel heavier than Mondays",
    lane: "claymation",
    reasons: [
      "You're already pre-living next week",
      "The weekend didn't feel restful enough",
      "Unfinished emotional business surfaces quietly",
      "You measure the gap between plans and reality",
      "Guilt about not being productive enough",
    ],
  },
  {
    slug: "same-fight-different-day",
    headline: "Same fight, different day — here's why",
    lane: "flatGraphic",
    reasons: [
      "The real issue stays buried beneath logistics",
      "You react to the trigger, not the wound",
      "Neither person feels truly heard",
      "Exhaustion makes everything feel personal",
      "Old patterns get rehearsed, not resolved",
      "You know the script but can't rewrite it",
    ],
  },
  {
    slug: "cycles-you-know-but-cant-break",
    headline: "Cycles you know about but can't break",
    lane: "toon3d",
    reasons: [
      "Overcommitting then resenting every commitment",
      "Emotional eating after a stressful day",
      "Scrolling when you need real connection",
      "Avoiding hard conversations until they explode",
      "Promising yourself this week will be different",
    ],
  },

  // ─── Knowing But Not Doing ───────────────────────────────────────
  {
    slug: "you-know-what-to-do",
    headline: "You know exactly what to do (so why don't you?)",
    lane: "stillLife",
    reasons: [
      "Knowing and doing live in different rooms",
      "Awareness without reflection is just noise",
      "You haven't named it out loud yet",
      "Your body stores what your mind avoids",
      "No one's asked you the right question",
      "Reading about change isn't changing",
    ],
  },
  {
    slug: "advice-you-give-but-wont-take",
    headline: "Advice you'd give a friend but won't take",
    lane: "paperDiorama",
    reasons: [
      "Rest isn't something you have to earn",
      "You're allowed to change your mind",
      "Not everything needs to be optimised",
      "Stop keeping score with yourself",
      "Ask for help before you're desperate",
    ],
  },
  {
    slug: "things-you-keep-postponing",
    headline: "Things you keep postponing (and why)",
    lane: "risograph",
    reasons: [
      "That honest conversation you need to have",
      "The boundary you know needs setting",
      "Booking that appointment you keep delaying",
      "Admitting something isn't working anymore",
      "Forgiving yourself for the messy chapter",
      "Starting the thing you're actually excited about",
    ],
  },

  // ─── Planning vs Progress ────────────────────────────────────────
  {
    slug: "planning-vs-doing",
    headline: "Planning feels productive — but is it?",
    lane: "flatGraphic",
    reasons: [
      "Colour-coded lists don't move the needle",
      "Planning is safe; doing is vulnerable",
      "You're preparing for a perfect start forever",
      "The plan changes the moment real life starts",
      "Reflection beats planning every single time",
    ],
  },
  {
    slug: "productivity-trap",
    headline: "The productivity trap nobody warns you about",
    lane: "claymation",
    reasons: [
      "Optimising your schedule won't fix your life",
      "Busyness is how you avoid sitting with yourself",
      "Every new app is a fresh start fantasy",
      "You don't need a system — you need clarity",
      "Doing more won't fill the gap doing less reveals",
      "Efficiency without direction is just spinning faster",
    ],
  },
  {
    slug: "goals-that-dont-stick",
    headline: "Why your goals never stick past February",
    lane: "cinematicReal",
    reasons: [
      "They came from who you think you should be",
      "No check-in system to catch you drifting",
      "Willpower is a terrible long-term strategy",
      "You skipped the 'why does this matter' step",
      "Life doesn't pause for your plan to work",
    ],
  },

  // ─── Failed Journaling ──────────────────────────────────────────
  {
    slug: "why-journaling-never-worked",
    headline: "Why journaling never worked for you (until now)",
    lane: "toon3d",
    reasons: [
      "Blank pages feel like another to-do item",
      "Writing at night is exhausting, not healing",
      "You didn't know what to say so you stopped",
      "Prompts felt generic and disconnected from you",
      "You needed to talk, not write",
      "Nobody showed you what to do with the insights",
    ],
  },
  {
    slug: "voice-vs-writing",
    headline: "Voice beats writing — here's the science",
    lane: "stillLife",
    reasons: [
      "Speaking activates different emotional processing",
      "You say what you really mean, unedited",
      "Talking is 3x faster than typing thoughts",
      "Your tone reveals what your words hide",
      "Less friction means you actually do it",
    ],
  },
  {
    slug: "what-journaling-misses",
    headline: "What traditional journaling always misses",
    lane: "paperDiorama",
    reasons: [
      "It doesn't connect your patterns over time",
      "You re-read old entries and cringe, not learn",
      "No one summarises the themes for you",
      "It captures moments but not trajectories",
      "Writing filters; your voice is unfiltered truth",
      "You forget what you wrote within a week",
    ],
  },

  // ─── Self-Reflection ─────────────────────────────────────────────
  {
    slug: "questions-you-avoid",
    headline: "Questions you avoid asking yourself",
    lane: "risograph",
    reasons: [
      "Am I happy or just comfortable?",
      "When did I last do something just for me?",
      "What am I tolerating that I shouldn't be?",
      "Is this my goal or someone else's expectation?",
      "What would I change if nobody would judge me?",
    ],
  },
  {
    slug: "3am-thoughts",
    headline: "Your 3am thoughts are trying to tell you something",
    lane: "cinematicReal",
    reasons: [
      "Night quiet makes suppressed feelings louder",
      "Your guard drops when you're tired enough",
      "Unprocessed days stack up like unread mail",
      "Anxiety fills the space reflection should occupy",
      "Those thoughts don't go away — they wait",
      "Morning buries what midnight tried to surface",
    ],
  },
  {
    slug: "mirror-not-coach",
    headline: "You don't need a coach — you need a mirror",
    lane: "claymation",
    reasons: [
      "The answers are already inside you",
      "Advice without context is just noise",
      "Hearing your own voice creates real clarity",
      "A mirror reflects; a coach directs",
      "You need to see yourself, not fix yourself",
    ],
  },

  // ─── Emotional Labour ────────────────────────────────────────────
  {
    slug: "emotional-labour-tax",
    headline: "The emotional labour tax you pay every day",
    lane: "flatGraphic",
    reasons: [
      "Smiling when you're running on empty",
      "Being the calm one so others can fall apart",
      "Translating everyone's feelings into action items",
      "Holding space for others but never for yourself",
      "Performing fine when you're anything but",
      "Managing moods is your unpaid second job",
    ],
  },
  {
    slug: "why-you-feel-touched-out",
    headline: "Why you feel touched out by everything",
    lane: "toon3d",
    reasons: [
      "Sensory overload is real, not weakness",
      "Everyone needs something from your body or attention",
      "You haven't had uninterrupted silence in weeks",
      "Your nervous system needs a break from being needed",
      "Being present for others depletes your own presence",
    ],
  },

  // ─── Identity & Growth ───────────────────────────────────────────
  {
    slug: "who-are-you-outside-roles",
    headline: "Who are you outside your roles?",
    lane: "stillLife",
    reasons: [
      "Mother, partner, employee — but who else?",
      "You lost hobbies when life got serious",
      "Your identity merged with your responsibilities",
      "You forgot what excited you at twenty-five",
      "Rediscovery starts with one honest question",
      "You're allowed to evolve beyond your resume",
    ],
  },
  {
    slug: "growth-looks-different-at-40",
    headline: "Growth looks different at 40 — and that's okay",
    lane: "paperDiorama",
    reasons: [
      "It's subtler and harder to measure externally",
      "You're unlearning more than you're learning",
      "Progress now means better boundaries, not more hustle",
      "The wins are quieter and more meaningful",
      "You're finally doing it for you, not for proof",
    ],
  },
  {
    slug: "permission-to-change",
    headline: "Permission to change your mind about everything",
    lane: "risograph",
    reasons: [
      "What you wanted at 30 doesn't have to fit at 42",
      "Outgrowing something isn't the same as failing at it",
      "Your values can shift without betraying anyone",
      "Changing course is data, not weakness",
      "The bravest thing is admitting it's not working",
      "You get to rewrite the story mid-chapter",
    ],
  },

  // ─── Relationship Patterns ───────────────────────────────────────
  {
    slug: "why-you-shut-down",
    headline: "Why you shut down instead of speaking up",
    lane: "cinematicReal",
    reasons: [
      "Speaking up felt unsafe growing up, so you stopped",
      "You learned that silence keeps the peace",
      "Vulnerability was punished, not rewarded",
      "You'd rather swallow it than risk the reaction",
      "Shutting down is self-protection, not apathy",
    ],
  },
  {
    slug: "things-your-partner-doesnt-see",
    headline: "Things your partner doesn't see (but should)",
    lane: "claymation",
    reasons: [
      "The mental checklist before you leave the house",
      "How you rehearse hard conversations in the shower",
      "The guilt you feel for wanting time alone",
      "How much you dim yourself to avoid conflict",
      "The running tally of emotional IOUs you never cash in",
      "How you hold the family together with invisible thread",
    ],
  },

  // ─── Wellness Culture Pushback ───────────────────────────────────
  {
    slug: "self-care-isnt-candles",
    headline: "Self-care isn't candles and bath bombs",
    lane: "flatGraphic",
    reasons: [
      "It's having the hard conversation you've been avoiding",
      "It's saying no without writing a paragraph excuse",
      "It's letting the house be messy without guilt",
      "It's blocking time that nobody else can touch",
      "It's admitting you need more than a bubble bath",
    ],
  },
  {
    slug: "toxic-positivity",
    headline: "Toxic positivity is gaslighting yourself",
    lane: "risograph",
    reasons: [
      "Good vibes only erases legitimate pain",
      "Forcing gratitude when you're struggling isn't healing",
      "Your negative emotions carry important information",
      "Positivity without processing is just suppression",
      "You're allowed to be not okay and still be strong",
      "Real growth starts with honest, messy feelings",
    ],
  },

  // ─── Daily Life ──────────────────────────────────────────────────
  {
    slug: "end-of-day-brain-dump",
    headline: "What happens when you debrief your day out loud",
    lane: "toon3d",
    reasons: [
      "Your thoughts stop looping and start landing",
      "You notice patterns you couldn't see inside your head",
      "Small wins surface that you'd otherwise forget",
      "Tomorrow feels less overwhelming when today is processed",
      "Three minutes of talking replaces hours of overthinking",
    ],
  },
];
