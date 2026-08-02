/**
 * Content Factory — carousel topic seed bank.
 *
 * 30 topics reflecting Ripple positioning: mental load, invisible labour,
 * repeating patterns, knowing-but-not-doing, planning vs progress, failed
 * journaling. Headlines use numbered listicle hooks ("Top 5…", "7 signs…")
 * for TikTok/Instagram engagement. Each topic has 5-7 reasons (4-7 words
 * each) that become individual carousel slides.
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
    headline: "6 invisible things draining your energy every day",
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
    headline: "6 reasons you're exhausted (and it's not sleep)",
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
    headline: "Top 5 things you do that nobody ever notices",
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
    headline: "6 patterns you keep repeating without realising",
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
    headline: "5 reasons Sundays feel heavier than Mondays",
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
    headline: "6 reasons you keep having the same fight",
    lane: "flatGraphic",
    reasons: [
      "The real issue stays buried beneath logistics",
      "You react to the trigger not the wound",
      "Neither person feels truly heard",
      "Exhaustion makes everything feel personal",
      "Old patterns get rehearsed not resolved",
      "You know the script but can't rewrite it",
    ],
  },
  {
    slug: "cycles-you-know-but-cant-break",
    headline: "5 cycles you know about but can't seem to break",
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
    headline: "6 reasons knowing what to do isn't the same as doing it",
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
    headline: "Top 5 things you'd tell a friend but won't do yourself",
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
    headline: "6 things you keep putting off (and why you should stop)",
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
    headline: "5 signs your planning habit is actually holding you back",
    lane: "flatGraphic",
    reasons: [
      "Colour-coded lists don't move the needle",
      "Planning is safe — doing is vulnerable",
      "You're preparing for a perfect start forever",
      "The plan changes the moment real life starts",
      "Reflection beats planning every single time",
    ],
  },
  {
    slug: "productivity-trap",
    headline: "6 productivity traps nobody warns you about",
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
    headline: "5 reasons your goals never stick past February",
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
    headline: "6 reasons journaling never worked for you (until now)",
    lane: "toon3d",
    reasons: [
      "Blank pages feel like another to-do item",
      "Writing at night is exhausting not healing",
      "You didn't know what to say so you stopped",
      "Prompts felt generic and disconnected from you",
      "You needed to talk not write",
      "Nobody showed you what to do with the insights",
    ],
  },
  {
    slug: "voice-vs-writing",
    headline: "5 reasons voice journaling beats writing every time",
    lane: "stillLife",
    reasons: [
      "Speaking activates different emotional processing",
      "You say what you really mean unedited",
      "Talking is 3x faster than typing thoughts",
      "Your tone reveals what your words hide",
      "Less friction means you actually do it",
    ],
  },
  {
    slug: "what-journaling-misses",
    headline: "6 things traditional journaling always gets wrong",
    lane: "paperDiorama",
    reasons: [
      "It doesn't connect your patterns over time",
      "You re-read old entries and cringe not learn",
      "No one summarises the themes for you",
      "It captures moments but not trajectories",
      "Writing filters — your voice is unfiltered truth",
      "You forget what you wrote within a week",
    ],
  },

  // ─── Self-Reflection ─────────────────────────────────────────────
  {
    slug: "questions-you-avoid",
    headline: "5 questions you've been avoiding asking yourself",
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
    headline: "6 reasons your 3am thoughts won't leave you alone",
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
    headline: "Top 5 reasons you need a mirror not a coach",
    lane: "claymation",
    reasons: [
      "The answers are already inside you",
      "Advice without context is just noise",
      "Hearing your own voice creates real clarity",
      "A mirror reflects — a coach directs",
      "You need to see yourself not fix yourself",
    ],
  },

  // ─── Emotional Labour ────────────────────────────────────────────
  {
    slug: "emotional-labour-tax",
    headline: "6 emotional labour taxes you pay every single day",
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
    headline: "5 reasons you feel completely touched out",
    lane: "toon3d",
    reasons: [
      "Sensory overload is real not weakness",
      "Everyone needs something from your body or attention",
      "You haven't had uninterrupted silence in weeks",
      "Your nervous system needs a break from being needed",
      "Being present for others depletes your own presence",
    ],
  },

  // ─── Identity & Growth ───────────────────────────────────────────
  {
    slug: "who-are-you-outside-roles",
    headline: "6 signs you've lost yourself inside your roles",
    lane: "stillLife",
    reasons: [
      "Mother partner employee — but who else?",
      "You lost hobbies when life got serious",
      "Your identity merged with your responsibilities",
      "You forgot what excited you at twenty-five",
      "Rediscovery starts with one honest question",
      "You're allowed to evolve beyond your resume",
    ],
  },
  {
    slug: "growth-looks-different-at-40",
    headline: "5 ways growth looks different after 40",
    lane: "paperDiorama",
    reasons: [
      "It's subtler and harder to measure externally",
      "You're unlearning more than you're learning",
      "Progress now means better boundaries not more hustle",
      "The wins are quieter and more meaningful",
      "You're finally doing it for you not for proof",
    ],
  },
  {
    slug: "permission-to-change",
    headline: "6 things you have full permission to change right now",
    lane: "risograph",
    reasons: [
      "What you wanted at 30 doesn't have to fit at 42",
      "Outgrowing something isn't the same as failing at it",
      "Your values can shift without betraying anyone",
      "Changing course is data not weakness",
      "The bravest thing is admitting it's not working",
      "You get to rewrite the story mid-chapter",
    ],
  },

  // ─── Relationship Patterns ───────────────────────────────────────
  {
    slug: "why-you-shut-down",
    headline: "5 reasons you shut down instead of speaking up",
    lane: "cinematicReal",
    reasons: [
      "Speaking up felt unsafe growing up so you stopped",
      "You learned that silence keeps the peace",
      "Vulnerability was punished not rewarded",
      "You'd rather swallow it than risk the reaction",
      "Shutting down is self-protection not apathy",
    ],
  },
  {
    slug: "things-your-partner-doesnt-see",
    headline: "6 things your partner doesn't see (but should)",
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
    headline: "Top 5 things that are actually self-care (not bath bombs)",
    lane: "flatGraphic",
    reasons: [
      "Having the hard conversation you've been avoiding",
      "Saying no without writing a paragraph excuse",
      "Letting the house be messy without guilt",
      "Blocking time that nobody else can touch",
      "Admitting you need more than a bubble bath",
    ],
  },
  {
    slug: "toxic-positivity",
    headline: "6 ways toxic positivity is secretly gaslighting you",
    lane: "risograph",
    reasons: [
      "Good vibes only erases legitimate pain",
      "Forcing gratitude when you're struggling isn't healing",
      "Your negative emotions carry important information",
      "Positivity without processing is just suppression",
      "You're allowed to be not okay and still be strong",
      "Real growth starts with honest messy feelings",
    ],
  },

  // ─── Daily Life / Decompression ──────────────────────────────────
  {
    slug: "ways-to-decompress",
    headline: "Top 5 ways to decompress when you're overwhelmed",
    lane: "toon3d",
    reasons: [
      "Talk it out — three minutes of voice beats hours of spiralling",
      "Name the feeling before you try to fix it",
      "Let your body move without calling it exercise",
      "Put the phone down and stare at nothing for five minutes",
      "Stop solving — just describe what happened today",
    ],
  },
];
