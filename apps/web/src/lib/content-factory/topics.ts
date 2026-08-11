/**
 * Content Factory — carousel topic seed bank.
 *
 * 36 topics reflecting Ripple positioning. Headlines are scroll-stopping
 * hooks — short, punchy, provocative. Reason slides use ellipses, commas,
 * and emotional phrasing that makes people feel seen. NO emojis anywhere.
 *
 * All copy uses US English spelling.
 * Target audience: women ~40-50 carrying heavy mental load.
 */

import type { StyleLane } from "./brand";

export type HeadlineStyle = "hook" | "listicle";

export interface CarouselTopic {
  slug: string;
  headline: string;
  style: HeadlineStyle;
  lane: StyleLane;
  reasons: string[];
  /**
   * The physical gesture/emotion the cover's main character performs in the
   * animated cover video. Should embody the feeling the post invokes —
   * written as a short motion direction for image-to-video generation.
   * Optional because AI-generated topics don't have one; the animate
   * pipeline falls back to a default beat.
   */
  emotionBeat?: string;
}

export const CAROUSEL_TOPICS: CarouselTopic[] = [
  // ─── Mental Load ─────────────────────────────────────────────────
  {
    slug: "invisible-mental-load",
    headline: "6 invisible things draining your energy every day",
    emotionBeat:
      "she pauses mid-task, eyes closing briefly as she steadies herself with a slow breath, shoulders heavy under an invisible weight, then a weary glance to camera",
    style: "hook",
    lane: "cinematicReal",
    reasons: [
      "Remembering everything for everyone",
      "Planning meals no one will thank you for",
      "Tracking deadlines that aren't even yours",
      "Managing everyone's mood, constantly",
      "Anticipating problems no one else sees",
      "The calendar lives in your head and nowhere else",
    ],
  },
  {
    slug: "why-youre-always-tired",
    headline: "6 reasons you're exhausted (and none of them are sleep)",
    emotionBeat:
      "she leans back and lets her shoulders drop with a long exhausted exhale, head tilting back briefly before a drained but knowing look to camera",
    style: "listicle",
    lane: "paperDiorama",
    reasons: [
      "Decision fatigue hits before noon",
      "Your brain never actually switches off",
      "You carry everyone's emotions on top of yours",
      "A thousand roles with zero breaks between them",
      "Rest feels like something you haven't earned yet",
      "Always on call, even when you're off duty",
    ],
  },
  {
    slug: "things-no-one-sees",
    headline: "5 things you do every day that nobody will ever notice",
    emotionBeat:
      "a small tired shrug — shoulders lifting then dropping with a slow exhale — followed by a soft, self-aware half-smile to camera, as if to say 'yep, that's my life'",
    style: "listicle",
    lane: "paperDiorama",
    reasons: [
      "Restocking things before anyone runs out",
      "Fixing conflicts no one even knew happened",
      "Researching the best option every single time",
      "Remembering what everyone likes, needs, and hates",
      "Quietly adjusting so everyone else is comfortable",
    ],
  },

  // ─── Repeating Patterns ──────────────────────────────────────────
  {
    slug: "patterns-you-repeat",
    headline: "6 patterns you keep repeating without realizing",
    emotionBeat:
      "she starts to gesture, stops herself mid-motion, and shakes her head with a rueful half-smile of recognition toward camera",
    style: "hook",
    lane: "flatGraphic",
    reasons: [
      "Saying yes when you meant no",
      "Over-explaining yourself just to feel safe",
      "Putting yourself last until you finally snap",
      "Starting strong, then quietly disappearing",
      "Asking for permission you don't actually need",
      "Absorbing everyone's stress like it's yours",
    ],
  },
  {
    slug: "why-sundays-feel-heavy",
    headline: "5 reasons Sunday nights feel heavier than Monday mornings",
    emotionBeat:
      "she hugs her arms around herself and sighs, gaze drifting away heavily before returning to camera with quiet resignation",
    style: "listicle",
    lane: "claymation",
    reasons: [
      "You're already pre-living next week",
      "The weekend never actually felt restful",
      "Unfinished emotional business surfacing quietly",
      "Measuring the gap between your plans and reality",
      "That familiar guilt for not being productive enough",
    ],
  },
  {
    slug: "same-fight-different-day",
    headline: "6 reasons you keep having the same fight",
    emotionBeat:
      "she pinches the bridge of her nose and exhales in frustration, then looks up at camera with a tired 'here we go again' expression",
    style: "hook",
    lane: "flatGraphic",
    reasons: [
      "The real issue stays buried under logistics",
      "You react to the trigger, not the wound",
      "Neither of you actually feels heard",
      "Exhaustion makes everything feel personal",
      "Same script, different night, no resolution",
      "You know the pattern but can't rewrite it alone",
    ],
  },
  {
    slug: "cycles-you-know-but-cant-break",
    headline: "5 cycles you already know about but still can't break",
    emotionBeat:
      "she rolls her eyes gently at herself, a self-deprecating smile forming as she gives a slow one-shoulder shrug toward camera",
    style: "listicle",
    lane: "toon3d",
    reasons: [
      "Overcommitting, then resenting every single one",
      "Stress eating again",
      "Scrolling when what you need is connection",
      "Avoiding the conversation until it explodes",
      "Telling yourself this week will be different",
    ],
  },

  // ─── Knowing But Not Doing ───────────────────────────────────────
  {
    slug: "you-know-what-to-do",
    headline: "6 reasons knowing what to do isn't the same as doing it",
    emotionBeat:
      "she hesitates with her hand hovering mid-air, then lowers it slowly and meets the camera with a caught-in-the-act knowing look",
    style: "hook",
    lane: "paperDiorama",
    reasons: [
      "Knowing and doing live in different rooms",
      "Awareness without reflection is just noise",
      "You haven't said it out loud yet",
      "Your body stores what your mind keeps avoiding",
      "Nobody has asked you the right question",
      "Reading about change isn't changing",
    ],
  },
  {
    slug: "advice-you-give-but-wont-take",
    headline: "Top 5 things you'd tell a friend but refuse to do yourself",
    emotionBeat:
      "she wags a finger as if giving advice, then catches herself, hand dropping as she gives the camera a guilty, warm smile",
    style: "listicle",
    lane: "paperDiorama",
    reasons: [
      "Rest isn't something you need to earn",
      "You're allowed to change your mind, fully",
      "Not everything needs to be optimized",
      "Stop keeping score with yourself",
      "Ask for help before you're drowning",
    ],
  },
  {
    slug: "things-you-keep-postponing",
    headline: "6 things you've been putting off (start with number 1)",
    emotionBeat:
      "she glances at something off-frame, winces slightly, and turns back to camera with an avoidant, sheepish half-smile",
    style: "listicle",
    lane: "flatGraphic",
    reasons: [
      "That honest conversation you keep rehearsing",
      "The boundary you know needs to exist",
      "That appointment you keep rescheduling",
      "Admitting something isn't working anymore",
      "Forgiving yourself for the messy chapter",
      "Starting the thing you're actually excited about",
    ],
  },

  // ─── Planning vs Progress ────────────────────────────────────────
  {
    slug: "planning-vs-doing",
    headline: "5 signs your planning habit is actually holding you back",
    emotionBeat:
      "she stops mid-gesture as if setting a plan aside, exhales slowly, and lifts a self-aware eyebrow at the camera",
    style: "listicle",
    lane: "flatGraphic",
    reasons: [
      "Color-coded lists don't move the needle",
      "Planning feels safe, doing feels vulnerable",
      "You're preparing for a perfect start forever",
      "The plan changes the second real life starts",
      "Reflection beats planning every single time",
    ],
  },
  {
    slug: "productivity-trap",
    headline: "6 productivity traps that are keeping you stuck",
    emotionBeat:
      "her busy hands gradually still, she exhales and loosens her shoulders, giving the camera a look of dawning relief",
    style: "listicle",
    lane: "claymation",
    reasons: [
      "Optimizing your schedule won't fix your life",
      "Busyness is how you avoid sitting with yourself",
      "Every new app is just a fresh start fantasy",
      "You don't need a system, you need clarity",
      "Doing more won't fill what doing less reveals",
      "Spinning faster isn't the same as moving forward",
    ],
  },
  {
    slug: "goals-that-dont-stick",
    headline: "5 reasons your goals never survive past February",
    emotionBeat:
      "she deflates slightly with a sigh, then softens into an honest, forgiving smile at the camera",
    style: "listicle",
    lane: "cinematicReal",
    reasons: [
      "They came from who you think you should be",
      "No check-in system to catch you drifting",
      "Willpower is a terrible long-term strategy",
      "You skipped the 'why does this matter' step",
      "Life didn't pause for your plan to work",
    ],
  },

  // ─── Failed Journaling ──────────────────────────────────────────
  {
    slug: "why-journaling-never-worked",
    headline: "6 reasons journaling never worked for you",
    emotionBeat:
      "she shakes her head slowly with a been-there smile, shrugging lightly as tension visibly leaves her shoulders",
    style: "listicle",
    lane: "toon3d",
    reasons: [
      "Blank pages feel like another to-do item",
      "Writing at night is exhausting, not healing",
      "You didn't know what to say so you stopped",
      "Prompts felt generic and disconnected from your life",
      "You needed to talk, not write",
      "Nobody showed you what to do with the insights",
    ],
  },
  {
    slug: "voice-vs-writing",
    headline: "5 reasons talking beats writing every time",
    emotionBeat:
      "her face lights up as she starts speaking mid-gesture, hands opening expressively, warm and animated toward camera",
    style: "listicle",
    lane: "paperDiorama",
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
    headline: "6 things your journal will never do for you",
    emotionBeat:
      "she tilts her head skeptically, then gives a knowing look to camera with a slow one-shoulder shrug",
    style: "listicle",
    lane: "paperDiorama",
    reasons: [
      "It doesn't connect your patterns over time",
      "You reread old entries and cringe, not learn",
      "No one summarizes the themes for you",
      "Captures moments but never trajectories",
      "Writing filters, your voice is unfiltered truth",
      "You forget what you wrote within a week",
    ],
  },

  // ─── Self-Reflection ─────────────────────────────────────────────
  {
    slug: "questions-you-avoid",
    headline: "5 questions you've been avoiding asking yourself",
    emotionBeat:
      "her gaze drifts far away in thought, breath catching, before she slowly returns to camera, vulnerable and open",
    style: "hook",
    lane: "flatGraphic",
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
    emotionBeat:
      "she stares into the distance, restless, blinking slowly, then turns to camera with quiet, wide-awake honesty",
    style: "hook",
    lane: "cinematicReal",
    reasons: [
      "Night quiet makes suppressed feelings louder",
      "Your guard drops when you're tired enough",
      "Unprocessed days stack up like unread mail",
      "Anxiety fills the space reflection should occupy",
      "Those thoughts don't go away, they wait",
      "Morning buries what midnight tried to surface",
    ],
  },
  {
    slug: "mirror-not-coach",
    headline: "Top 5 reasons you need a mirror, not a coach",
    emotionBeat:
      "she straightens gently and meets the camera dead-on, chin lifting with calm self-recognition and a slow steadying breath",
    style: "hook",
    lane: "claymation",
    reasons: [
      "The answers are already inside you",
      "Advice without context is just noise",
      "Hearing your own voice creates real clarity",
      "A mirror reflects, a coach directs",
      "You need to see yourself, not fix yourself",
    ],
  },

  // ─── Emotional Labor ────────────────────────────────────────────
  {
    slug: "emotional-labour-tax",
    headline: "6 emotional labor taxes you pay every single day",
    emotionBeat:
      "her practiced smile fades into a tired real expression as her shoulders finally drop, eyes meeting camera honestly",
    style: "listicle",
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
    emotionBeat:
      "she wraps her arms around herself protectively and exhales, closing her eyes for a beat before a depleted glance at camera",
    style: "hook",
    lane: "toon3d",
    reasons: [
      "Sensory overload is real, not weakness",
      "Everyone needs something from you, constantly",
      "You haven't had uninterrupted silence in weeks",
      "Your nervous system needs a break from being needed",
      "Being present for everyone depletes your own presence",
    ],
  },

  // ─── Identity & Growth ───────────────────────────────────────────
  {
    slug: "who-are-you-outside-roles",
    headline: "6 signs you've completely lost yourself inside your roles",
    emotionBeat:
      "she looks down at herself as if seeing a stranger, then up to camera with searching, quietly curious eyes",
    style: "listicle",
    lane: "paperDiorama",
    reasons: [
      "Mother, partner, employee, but who else?",
      "You lost your hobbies when life got serious",
      "Your identity merged with your responsibilities",
      "You forgot what excited you at twenty-five",
      "Rediscovery starts with one honest question",
      "You're allowed to evolve beyond your resume",
    ],
  },
  {
    slug: "growth-looks-different-at-40",
    headline: "5 ways growth looks totally different after 40",
    emotionBeat:
      "she relaxes into a slow, settled smile, shoulders easing down, a calm contented breath toward camera",
    style: "listicle",
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
    headline: "6 things you have full permission to change right now",
    emotionBeat:
      "she lifts her chin and releases a held breath, posture opening with relief, a liberated soft smile to camera",
    style: "hook",
    lane: "flatGraphic",
    reasons: [
      "What you wanted at 30 doesn't have to fit at 42",
      "Outgrowing something isn't failing at it",
      "Your values can shift without betraying anyone",
      "Changing course is data, not weakness",
      "The bravest thing is admitting it's not working",
      "You get to rewrite the story mid-chapter",
    ],
  },

  // ─── Relationship Patterns ───────────────────────────────────────
  {
    slug: "why-you-shut-down",
    headline: "5 reasons you shut down instead of speaking up",
    emotionBeat:
      "she starts to speak, stops, lips pressing together as she looks down, then a guarded glance back to camera",
    style: "hook",
    lane: "cinematicReal",
    reasons: [
      "Speaking up felt unsafe growing up so you stopped",
      "You learned that silence keeps the peace",
      "Vulnerability was punished, not rewarded",
      "You'd rather swallow it than risk the reaction",
      "Shutting down is self-protection, not apathy",
    ],
  },
  {
    slug: "things-your-partner-doesnt-see",
    headline: "6 things your partner doesn't see (but should)",
    emotionBeat:
      "she gestures subtly at the unseen work around her, then gives the camera a tired, conspiratorial 'you see it, right?' look",
    style: "hook",
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
    emotionBeat:
      "she waves a dismissive hand with a wry smirk, then settles into a real, grounded smile at camera as her posture opens",
    style: "hook",
    lane: "flatGraphic",
    reasons: [
      "Having the conversation you've been avoiding",
      "Saying no without writing a paragraph excuse",
      "Letting the house be messy without guilt",
      "Blocking time that nobody else can touch",
      "Admitting you need more than a bubble bath",
    ],
  },
  {
    slug: "toxic-positivity",
    headline: "6 ways toxic positivity is secretly gaslighting you",
    emotionBeat:
      "her forced grin drops deliberately into a real, level expression, one eyebrow raised knowingly at the camera",
    style: "hook",
    lane: "flatGraphic",
    reasons: [
      "Good vibes only erases legitimate pain",
      "Forcing gratitude when you're struggling isn't healing",
      "Your negative emotions carry important information",
      "Positivity without processing is just suppression",
      "You're allowed to not be okay and still be strong",
      "Real growth starts with honest, messy feelings",
    ],
  },

  // ─── Daily Life / Decompression ──────────────────────────────────
  {
    slug: "ways-to-decompress",
    headline: "Top 5 ways to decompress when you're overwhelmed",
    emotionBeat:
      "she rolls her shoulders back and exhales long and slow, visible relief washing over her face, softening toward camera",
    style: "hook",
    lane: "toon3d",
    reasons: [
      "Talk it out, three minutes beats hours of spiraling",
      "Name the feeling before you try to fix it",
      "Let your body move without calling it exercise",
      "Put the phone down and stare at nothing for five minutes",
      "Stop solving, just describe what happened today",
    ],
  },

  // ─── "Signs That" Format ─────────────────────────────────────────
  {
    slug: "signs-youre-burnt-out",
    headline: "7 signs you're actually burnt out, not just tired",
    emotionBeat:
      "she rubs her temple slowly, eyes heavy, then gives the camera a flat, exhausted look of recognition",
    style: "listicle",
    lane: "claymation",
    reasons: [
      "You dread things you used to enjoy",
      "Small tasks feel impossibly heavy",
      "You can't remember the last time you laughed hard",
      "Sleep doesn't make you feel rested anymore",
      "You're irritable with the people you love most",
      "Everything feels like it's your responsibility",
      "You fantasize about disappearing, just for a week",
    ],
  },
  {
    slug: "signs-you-need-boundaries",
    headline: "6 signs you desperately need better boundaries",
    emotionBeat:
      "she holds up a gentle hand as if to say 'enough', exhaling as her posture firms, steady eyes on camera",
    style: "listicle",
    lane: "flatGraphic",
    reasons: [
      "You feel resentful but you can't explain why",
      "People come to you but never ask how you are",
      "You say yes and immediately regret it",
      "Your calendar is full but none of it is for you",
      "You feel guilty every single time you rest",
      "You've lost track of what you actually want",
    ],
  },
  {
    slug: "signs-youre-people-pleasing",
    headline: "5 signs you're a people pleaser (and it's costing you)",
    emotionBeat:
      "she nods along agreeably, catches herself mid-nod, and freezes with a self-aware wince toward camera",
    style: "hook",
    lane: "paperDiorama",
    reasons: [
      "You apologize for things that aren't your fault",
      "You change your opinion based on who's in the room",
      "Saying no feels physically uncomfortable",
      "You rehearse texts for twenty minutes before sending",
      "Everyone thinks you're fine because you never say otherwise",
    ],
  },
  {
    slug: "signs-youre-emotionally-exhausted",
    headline: "6 signs you're emotionally exhausted (not lazy)",
    emotionBeat:
      "she slumps softly, letting her head rest to one side with a long blink, then a drained honest gaze at camera",
    style: "hook",
    lane: "toon3d",
    reasons: [
      "You have the time but zero motivation",
      "Your to-do list makes you want to cry",
      "You zone out mid-conversation without realizing",
      "Weekends feel like recovery, not recreation",
      "You're running on autopilot through your own life",
      "One more decision and you might break",
    ],
  },
  {
    slug: "signs-you-need-to-talk",
    headline: "5 signs you need to talk it out, not think it out",
    emotionBeat:
      "she presses a hand to her chest, takes a breath as if about to finally say it, lips parting toward camera",
    style: "hook",
    lane: "flatGraphic",
    reasons: [
      "The same thought looping for days",
      "You've journaled about it but nothing shifted",
      "Your chest feels tight but you can't name why",
      "You keep almost telling someone, then stopping",
      "You know the answer, you just need to hear yourself say it",
    ],
  },
  {
    slug: "signs-youre-healing",
    headline: "6 quiet signs you're actually healing",
    emotionBeat:
      "a slow genuine smile spreads as she exhales, shoulders settling with ease, warm quiet pride toward camera",
    style: "listicle",
    lane: "claymation",
    reasons: [
      "You catch the pattern before you repeat it",
      "Old triggers don't hit as hard anymore",
      "You choose rest without the guilt spiral",
      "You say what you mean the first time",
      "You're less interested in proving yourself to people",
      "Silence feels comfortable instead of terrifying",
    ],
  },
];
