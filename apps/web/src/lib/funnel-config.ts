/**
 * Funnel configuration — all quiz content, branch questions, mirror
 * templates, snapshot templates, timeline copy, and paywall hooks.
 *
 * Kept in a separate file so copy can be edited without touching
 * component logic.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type Branch = "blur" | "patterns" | "rumination" | "graveyard" | "mask" | "drift";

export interface QuestionOption {
  label: string;
  /** Only used on the entry question — maps option to a branch key */
  branch?: Branch;
}

export interface Question {
  id: string;
  text: string;
  options: QuestionOption[];
  multiSelect?: boolean;
  normalization?: string;
}

// ─── Entry Question (Screen 1) ──────────────────────────────────────────────

export const ENTRY_QUESTION: Question = {
  id: "entry",
  text: "What\u2019s been on your mind lately?",
  options: [
    { label: "My days blur together and nothing sticks", branch: "blur" },
    { label: "I keep having the same fights and patterns", branch: "patterns" },
    { label: "My brain won\u2019t stop at night", branch: "rumination" },
    { label: "I\u2019ve tried journaling, apps, therapy \u2014 nothing worked", branch: "graveyard" },
    { label: "I\u2019m holding it together but barely", branch: "mask" },
    { label: "I had goals once. I don\u2019t know where they went", branch: "drift" },
  ],
};

// ─── Branch Questions (Screens 2-4) ─────────────────────────────────────────

export const BRANCH_QUESTIONS: Record<Branch, [Question, Question, Question]> = {
  blur: [
    {
      id: "branch_q2",
      text: "What does a typical day feel like?",
      options: [
        { label: "Autopilot \u2014 I don\u2019t remember half of it" },
        { label: "Busy but empty" },
        { label: "Fine on the surface, foggy underneath" },
        { label: "Like I\u2019m watching someone else live my life" },
      ],
    },
    {
      id: "branch_q3",
      text: "When you try to remember last Tuesday, you\u2026",
      options: [
        { label: "Draw a complete blank" },
        { label: "Remember feelings but not facts" },
        { label: "Can piece it together if I try hard" },
        { label: "Remember what I did but not why it mattered" },
      ],
    },
    {
      id: "branch_q4",
      text: "The scariest part is\u2026",
      options: [
        { label: "How fast time is moving" },
        { label: "That I might already be living my best life and this is it" },
        { label: "That nobody notices" },
        { label: "That I\u2019ve stopped caring" },
      ],
    },
  ],
  patterns: [
    {
      id: "branch_q2",
      text: "What keeps repeating?",
      options: [
        { label: "The same argument with my partner" },
        { label: "The same frustration at work" },
        { label: "The same cycle with family" },
        { label: "The same dynamic in every relationship" },
      ],
    },
    {
      id: "branch_q3",
      text: "When it happens again, you feel\u2026",
      options: [
        { label: "Exhausted \u2014 I know exactly how it\u2019ll end" },
        { label: "Angry at myself for falling into it again" },
        { label: "Numb \u2014 I\u2019ve stopped reacting" },
        { label: "Confused \u2014 I don\u2019t understand why" },
      ],
    },
    {
      id: "branch_q4",
      text: "You\u2019ve tried to break it by\u2026",
      options: [
        { label: "Talking it out" },
        { label: "Giving space" },
        { label: "Reading about it" },
        { label: "Ignoring it and hoping it changes" },
        { label: "Nothing \u2014 I don\u2019t know where to start" },
      ],
    },
  ],
  rumination: [
    {
      id: "branch_q2",
      text: "When does it hit hardest?",
      options: [
        { label: "The moment I lie down" },
        { label: "During any quiet moment" },
        { label: "When I\u2019m driving or showering" },
        { label: "It never fully stops" },
      ],
    },
    {
      id: "branch_q3",
      text: "What\u2019s your brain doing?",
      options: [
        { label: "Replaying conversations" },
        { label: "Running through tomorrow\u2019s problems" },
        { label: "Worrying about things I can\u2019t control" },
        { label: "All of the above, in random order" },
      ],
    },
    {
      id: "branch_q4",
      text: "You\u2019ve tried to quiet it by\u2026",
      options: [
        { label: "Scrolling until I\u2019m exhausted" },
        { label: "Meditation or breathing exercises" },
        { label: "Writing things down" },
        { label: "Nothing \u2014 I just wait for it to pass" },
      ],
    },
  ],
  graveyard: [
    {
      id: "branch_q2",
      text: "What\u2019s the most recent thing you tried?",
      options: [
        { label: "A journaling app" },
        { label: "Therapy or coaching" },
        { label: "A productivity system" },
        { label: "Meditation or mindfulness" },
        { label: "A self-help book" },
      ],
    },
    {
      id: "branch_q3",
      text: "How long did it last?",
      options: [
        { label: "Less than a week" },
        { label: "A few weeks" },
        { label: "A month or two" },
        { label: "I\u2019m technically still doing it but getting nothing from it" },
      ],
    },
    {
      id: "branch_q4",
      text: "Why did it stop working?",
      options: [
        { label: "Too much effort" },
        { label: "Felt pointless \u2014 nothing changed" },
        { label: "Life got in the way" },
        { label: "I forgot about it" },
        { label: "It wasn\u2019t built for how my brain works" },
      ],
    },
  ],
  mask: [
    {
      id: "branch_q2",
      text: "Who are you holding it together for?",
      options: [
        { label: "My partner" },
        { label: "My kids" },
        { label: "My team at work" },
        { label: "Everyone" },
        { label: "Honestly, just myself" },
      ],
    },
    {
      id: "branch_q3",
      text: "The last time someone asked how you\u2019re doing, you said\u2026",
      options: [
        { label: "\u2018Fine\u2019 \u2014 it\u2019s easier" },
        { label: "\u2018Busy\u2019 \u2014 so they don\u2019t ask more" },
        { label: "The truth \u2014 and they didn\u2019t know what to say" },
        { label: "I can\u2019t remember the last time someone asked" },
      ],
    },
    {
      id: "branch_q4",
      text: "What you actually need is\u2026",
      options: [
        { label: "Someone to see what\u2019s really going on" },
        { label: "Permission to not be okay" },
        { label: "A place to put all of this" },
        { label: "To understand why I feel this way" },
      ],
    },
  ],
  drift: [
    {
      id: "branch_q2",
      text: "When did you start noticing?",
      options: [
        { label: "Recently \u2014 something woke me up" },
        { label: "It\u2019s been building for months" },
        { label: "Years \u2014 I just didn\u2019t want to admit it" },
        { label: "I\u2019m not sure it ever wasn\u2019t there" },
      ],
    },
    {
      id: "branch_q3",
      text: "The version of you from 2 years ago would be\u2026",
      options: [
        { label: "Disappointed" },
        { label: "Confused" },
        { label: "Unsurprised" },
        { label: "They wouldn\u2019t recognize me" },
      ],
    },
    {
      id: "branch_q4",
      text: "What slipped the most?",
      options: [
        { label: "My ambition" },
        { label: "My relationships" },
        { label: "My health" },
        { label: "My sense of who I am" },
      ],
    },
  ],
};

// ─── Shared Questions (Screens 5-9) ─────────────────────────────────────────

export const SHARED_QUESTIONS: Question[] = [
  {
    id: "shared_q5",
    text: "How long have you felt this way?",
    options: [
      { label: "A few weeks" },
      { label: "A few months" },
      { label: "Over a year" },
      { label: "I can\u2019t remember when it started" },
    ],
    normalization: "Most people have felt this way for over a year before they do something about it.",
  },
  {
    id: "shared_q6",
    text: "What\u2019s it costing you most?",
    options: [
      { label: "My energy" },
      { label: "My relationships" },
      { label: "My health" },
      { label: "My career" },
      { label: "My sense of self" },
      { label: "Time I can\u2019t get back" },
    ],
    normalization: "Naming the cost makes it real.",
  },
  {
    id: "shared_q7",
    text: "When you imagine things actually changing, you feel\u2026",
    options: [
      { label: "Hopeful" },
      { label: "Skeptical \u2014 I\u2019ve felt this before" },
      { label: "Scared it might not work" },
      { label: "Desperate \u2014 I need something to work" },
    ],
    normalization: "72% of people feel skeptical. That\u2019s normal.",
  },
  {
    id: "shared_q8",
    text: "How does your brain feel at the end of most days?",
    options: [
      { label: "Scattered \u2014 too many tabs open" },
      { label: "Foggy \u2014 can\u2019t think clearly" },
      { label: "Racing \u2014 won\u2019t slow down" },
      { label: "Empty \u2014 used everything up" },
      { label: "Fine actually \u2014 mornings are worse" },
    ],
    normalization: "The most common answer is \u2018scattered.\u2019 You\u2019re not alone.",
  },
  {
    id: "shared_q9",
    text: "What\u2019s one pattern you\u2019d like to stop?",
    options: [
      { label: "Snapping at people I love, then feeling guilty" },
      { label: "Putting everyone else first until I have nothing left" },
      { label: "Starting things and watching them fizzle" },
      { label: "Replaying the same worries on a loop" },
    ],
    normalization: "Naming it is the first step to breaking it.",
  },
];

// ─── Tally Counter: per-option full headers + mirror echo phrases ──────────

// Full natural-language tally headers — each passes a read-aloud test
const TALLY_HEADERS: Record<string, string> = {
  "Snapping at people I love, then feeling guilty": "How many times did you snap at someone you love this week?",
  "Putting everyone else first until I have nothing left": "How many times did you put yourself last this week?",
  "Starting things and watching them fizzle": "How many things fizzled out on you this week?",
  "Replaying the same worries on a loop": "How many times did the same worry replay this week?",
};

const TALLY_HEADER_FALLBACK = "How many times did it happen this week?";

export function getTallyHeader(q9Answer: string): string {
  return TALLY_HEADERS[q9Answer] || TALLY_HEADER_FALLBACK;
}

// Shorter phrases for Mirror Beat 2 echo: "You said you want to stop ___."
const MIRROR_ECHO_PHRASES: Record<string, string> = {
  "Snapping at people I love, then feeling guilty": "snapping at the people you love",
  "Putting everyone else first until I have nothing left": "putting yourself last",
  "Starting things and watching them fizzle": "watching things fizzle",
  "Replaying the same worries on a loop": "the replay loop",
};

export function getTallyPhrase(q9Answer: string): string {
  return MIRROR_ECHO_PHRASES[q9Answer] || "the pattern";
}

// ─── Tally Echo for Gap 1 ──────────────────────────────────────────────────

export function getTallyEcho(tallyValue: string): string {
  if (tallyValue === "lost_count") {
    return "So many times you\u2019ve stopped counting. That\u2019s the loudest answer there is.";
  }
  const n = parseInt(tallyValue, 10);
  if (isNaN(n) || n < 1) return "";
  if (n === 1) return "Even once a week is 52 times a year.";
  const yearly = Math.round((n * 52) / 10) * 10; // round to clean 10s
  const display = n > 20 ? "20+" : String(n);
  return `${display} times this week. At that pace, that\u2019s roughly ${yearly} times a year.`;
}

// ─── Tally Kicker for Gap 1 (condensed format for uppercase kicker line) ────

export function getTallyKicker(tallyValue: string): string {
  if (tallyValue === "lost_count") return "TOO MANY TO COUNT";
  const n = parseInt(tallyValue, 10);
  if (isNaN(n) || n < 1) return "";
  if (n === 1) return "ONCE A WEEK · 52 A YEAR";
  const yearly = Math.round((n * 52) / 10) * 10;
  const display = n > 20 ? "20+" : String(n);
  return `${display} TIMES THIS WEEK · ~${yearly} A YEAR`;
}

// ─── Time-Math Mapping (duration answer → evening count) ────────────────────

export interface TimeMathContent {
  show: boolean;
  herDuration: string;
  count: number | null;  // null means "thousands"
  label: string;
}

export function getTimeMathContent(durationAnswer: string): TimeMathContent {
  switch (durationAnswer) {
    case "A few weeks":
      return { show: false, herDuration: "", count: null, label: "" }; // skip — numbers too small
    case "A few months":
      return { show: true, herDuration: "a few months", count: 90, label: "evenings" };
    case "Over a year":
      return { show: true, herDuration: "over a year", count: 365, label: "evenings" };
    case "I can\u2019t remember when it started":
      return { show: true, herDuration: "longer than you can remember", count: null, label: "of evenings" };
    default:
      return { show: false, herDuration: "", count: null, label: "" };
  }
}

// ─── Mirror Templates (Screen 10) — v4: 3-beat, ≤70 words ────────────────

function lc(s: string): string {
  // lowercase first char for mid-sentence embedding
  if (!s) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

// ─── Line 1: Branch-specific pain (emotionally confrontational) ─────────────

const BLUR_LINE1: Record<string, string> = {
  "Autopilot \u2014 I don\u2019t remember half of it":
    "Your days run on autopilot. You get to the end of the week and can\u2019t name a single moment that mattered \u2014 not because nothing happened, but because you weren\u2019t really there for any of it.",
  "Busy but empty":
    "You described your days as busy but empty. Full calendar. Nothing to show for it. That\u2019s what you told us \u2014 and the pattern is more common than you\u2019d think.",
  "Fine on the surface, foggy underneath":
    "You said it\u2019s fine on the surface but foggy underneath. Functioning. Showing up. But there\u2019s a fog you can\u2019t name \u2014 and your answers suggest it\u2019s been building for a while.",
  "Like I\u2019m watching someone else live my life":
    "You said it\u2019s like watching someone else live your life. Going through the motions. Present but not there. And your other answers suggest nobody around you sees it.",
};

const PATTERNS_LINE1: Record<string, string> = {
  "The same argument with my partner":
    "You already know how the fight ends. You\u2019ve had it enough times to script it. The words change but the feeling is exactly the same \u2014 and so is the silence after.",
  "The same frustration at work":
    "The same frustration keeps showing up at work. Different meeting, different day, same feeling in your chest. You\u2019ve tried to let it go. It keeps coming back because you keep not seeing why.",
  "The same cycle with family":
    "The family dynamic has been running for longer than you\u2019d like to admit. Maybe since you were a kid. Maybe it crept in later. Either way \u2014 you thought you\u2019d outgrow it. You didn\u2019t. You just got better at performing through it.",
  "The same dynamic in every relationship":
    "It\u2019s not one relationship. It\u2019s the pattern underneath all of them \u2014 the thing you keep doing that you can\u2019t quite see, even though everyone around you probably can.",
};

const RUMINATION_LINE1: Record<string, string> = {
  "The moment I lie down":
    "The second your head hits the pillow, your brain turns on. Conversations replay. Decisions get second-guessed. Things you should have said appear fully formed \u2014 hours too late.",
  "During any quiet moment":
    "Silence isn\u2019t peaceful for you. It\u2019s when the noise starts. Every pause in your day becomes an opening for your brain to run through everything you\u2019re not dealing with.",
  "When I\u2019m driving or showering":
    "You do your deepest thinking in the shower or behind the wheel \u2014 not because you choose to, but because those are the only moments your brain can ambush you without interruption.",
  "It never fully stops":
    "It\u2019s not that your brain gets loud sometimes. It\u2019s that it never fully stops. There\u2019s always a background hum of thoughts you can\u2019t quite finish or put away.",
};

const GRAVEYARD_LINE1: Record<string, (q3: string) => string> = {
  "A journaling app": (q3) =>
    `Maybe you downloaded a journaling app because someone said writing helps. Maybe you found it yourself. Either way \u2014 you used it for ${lc(q3)}. Then you stopped. Not because it was bad, but because staring at a blank screen felt like one more thing to fail at.`,
  "Therapy or coaching": (_q3) =>
    "Maybe therapy helped while you were in the room. Maybe coaching gave you a framework. Either way \u2014 the insights faded between sessions, and you couldn\u2019t justify the cost for something that evaporated by midweek.",
  "A productivity system": (_q3) =>
    "Maybe you built a system \u2014 apps, dashboards, lists. Maybe someone built it for you. Either way, you spent more time maintaining the system than actually living. The system became the problem.",
  "Meditation or mindfulness": (_q3) =>
    "Maybe someone told you to meditate. Maybe you found it yourself. Either way \u2014 sitting alone with your thoughts wasn\u2019t the relief they promised. It felt like being locked in a room with the one person you were trying to get away from.",
  "A self-help book": (_q3) =>
    "Maybe you read the book. Maybe you highlighted the passages. Either way \u2014 something shifted for about three days. Then it faded. And you went back to exactly where you were.",
};

const MASK_LINE1: Record<string, string> = {
  "My partner":
    "Your partner thinks you\u2019re fine because you\u2019ve made sure they think you\u2019re fine. The cost of telling the truth feels higher than the cost of carrying it alone. So you carry it.",
  "My kids":
    "Your kids see someone who has it all handled. You\u2019ve made sure of that. What they don\u2019t see is what it takes to hold that together every single day \u2014 and what it\u2019s doing to the person behind it.",
  "My team at work":
    "At work, you\u2019re the one who keeps things together. The calm one. The reliable one. Nobody asks how you\u2019re doing because you\u2019ve made it so nobody needs to.",
  "Everyone":
    "You\u2019re holding it together for everyone. Partner, kids, friends, colleagues. The one person you\u2019re not holding it together for is yourself \u2014 and you\u2019ve been last on that list for so long you forgot you were on it.",
  "Honestly, just myself":
    "You\u2019re not performing for anyone else. You\u2019re performing for yourself \u2014 maintaining the fiction that you\u2019re fine because the alternative means admitting something you\u2019re not ready to say out loud.",
};

const DRIFT_LINE1: Record<string, string> = {
  "Recently \u2014 something woke me up":
    "Something woke you up recently. A moment, a comment, a birthday, a look in the mirror \u2014 and you realized the life you\u2019re living isn\u2019t the one you planned. The gap between who you are and who you meant to be opened up and you can\u2019t unsee it.",
  "It\u2019s been building for months":
    "It\u2019s been creeping in for months. Not a crisis \u2014 more like a slow leak. You keep meaning to do something about it. But every week looks like the last one, and meaning to isn\u2019t the same as doing.",
  "Years \u2014 I just didn\u2019t want to admit it":
    "You\u2019ve known for years. You just didn\u2019t want to name it because naming it would mean you have to do something about it. So you let another year pass. And another. And now you\u2019re here.",
  "I\u2019m not sure it ever wasn\u2019t there":
    "You said you\u2019re not even sure when it started. That tracks with the rest of your answers \u2014 the drift happened so gradually that there\u2019s no clear before and after. Just a slow fade.",
};

function getLine1(branch: Branch, answers: Record<string, string | string[]>): string {
  const q2 = String(answers.branch_q2 ?? "");
  const q3 = String(answers.branch_q3 ?? "");
  switch (branch) {
    case "blur": return BLUR_LINE1[q2] ?? BLUR_LINE1["Autopilot \u2014 I don\u2019t remember half of it"]!;
    case "patterns": return PATTERNS_LINE1[q2] ?? PATTERNS_LINE1["The same argument with my partner"]!;
    case "rumination": return RUMINATION_LINE1[q2] ?? RUMINATION_LINE1["The moment I lie down"]!;
    case "graveyard": {
      const fn = GRAVEYARD_LINE1[q2] ?? GRAVEYARD_LINE1["A journaling app"]!;
      return fn(q3);
    }
    case "mask": return MASK_LINE1[q2] ?? MASK_LINE1["Everyone"]!;
    case "drift": return DRIFT_LINE1[q2] ?? DRIFT_LINE1["It\u2019s been building for months"]!;
  }
}

// ─── Line 2: Duration (emotionally weighted) ────────────────────────────────

const DURATION_LINES: Record<string, string> = {
  "A few weeks":
    "This started a few weeks ago. It\u2019s new enough to feel like a phase \u2014 but you\u2019re here, which means part of you knows it isn\u2019t.",
  "A few months":
    "You\u2019ve been carrying this for months. Long enough for it to stop feeling new and start feeling normal. That\u2019s the dangerous part \u2014 when the weight stops registering.",
  "Over a year":
    "You\u2019ve been carrying this for over a year. Long enough that it stopped feeling like a problem and started feeling like who you are.",
  "I can\u2019t remember when it started":
    "You can\u2019t even remember when this started. It\u2019s been part of you for so long that you\u2019ve forgotten what it feels like without it.",
};

// ─── Line 3: Cost (emotionally specific) ────────────────────────────────────

const COST_REWRITES: Record<string, string> = {
  "My energy": "your energy \u2014 the kind of tired that sleep doesn\u2019t fix",
  "My relationships": "your relationships \u2014 the people who matter most get the version of you that\u2019s already spent",
  "My health": "your health \u2014 the body keeps the score even when you pretend it doesn\u2019t",
  "My career": "your career \u2014 you\u2019re performing at 60% and hoping nobody notices",
  "My sense of self": "your sense of self \u2014 you used to know who you were, and now you\u2019re not sure",
  "Time I can\u2019t get back": "time you can\u2019t get back \u2014 weeks that blur into months that blur into years",
};

// ─── Line 4: Brain state (sensory, specific) ────────────────────────────────

const BRAIN_REWRITES: Record<string, string> = {
  "Scattered \u2014 too many tabs open":
    "By the time the day ends, your brain is scattered. Too many tabs open. You start a thought and lose it. You pick up your phone and forget why. It\u2019s not distraction \u2014 it\u2019s overload.",
  "Foggy \u2014 can\u2019t think clearly":
    "By the time the day ends, your brain is fog. Not tired-fog. The kind where you can\u2019t remember what you were saying mid-sentence.",
  "Racing \u2014 won\u2019t slow down":
    "By the time the day ends, your brain is still running \u2014 fast, in circles, with no off switch. You\u2019re exhausted but wired. The thoughts won\u2019t land and they won\u2019t leave.",
  "Empty \u2014 used everything up":
    "By the time the day ends, there\u2019s nothing left. Not tired. Empty. You gave everything to everyone else and now you\u2019re sitting in the aftermath with nothing for yourself.",
  "Fine actually \u2014 mornings are worse":
    "Your evenings are fine. It\u2019s the mornings that hit \u2014 the moment you wake up and remember everything that\u2019s waiting. The dread isn\u2019t at the end of the day. It\u2019s at the beginning.",
};

// ─── Line 5: Desire (emotionally loaded) ────────────────────────────────────

const DESIRE_REWRITES: Record<string, string> = {
  "Snapping at people I love, then feeling guilty":
    "You said the pattern you\u2019d most want to stop is snapping at the people you love \u2014 then carrying the guilt after. Your other answers suggest the snap isn\u2019t the problem. It\u2019s what\u2019s building up before it.",
  "Putting everyone else first until I have nothing left":
    "You said you\u2019d want to stop putting everyone else first until there\u2019s nothing left for you. Your answers paint someone who gives everything away and then wonders why they\u2019re running on empty. The pattern isn\u2019t generosity. It\u2019s erasure.",
  "Starting things and watching them fizzle":
    "You said you\u2019d want to stop starting things and watching them fizzle. Your answers suggest it\u2019s not discipline you\u2019re missing \u2014 it\u2019s something about the moment you stop that nobody\u2019s ever helped you see.",
  "Replaying the same worries on a loop":
    "You said you\u2019d want to stop the replay loop. The same worries, the same scenarios, running on repeat. Your answers suggest the loop isn\u2019t random \u2014 it\u2019s processing something your day didn\u2019t give you space to finish.",
};

// ─── Build Mirror Lines (v4: 3 beats, ≤70 words total) ─────────────────────
//
// v3 mirror was 5 dense paragraphs. v4 cuts to 3 beats:
//   Beat 1: sharpest pain reflection (1-2 sentences, branch-specific)
//   Beat 2: Q9 echo using counter-phrase + branch closer
//   Beat 3 (settle): "You don't have to keep living like this."
//
// Original 5-paragraph copy preserved below for reference / future use.

/* ── ARCHIVED FULL MIRROR COPY (unshipped as of v4) ──────────────────────
 * Line 1 (branch pain): see BLUR_LINE1, PATTERNS_LINE1, etc. above
 * Line 2 (duration): DURATION_LINES
 * Line 3 (cost): COST_REWRITES — "It's draining your energy — the kind of tired that sleep doesn't fix."
 * Line 4 (brain state): BRAIN_REWRITES — "By the time the day ends, your brain is scattered..."
 * Line 5 (desire/Q9): DESIRE_REWRITES — "You said the pattern you'd most want to stop..."
 * ──────────────────────────────────────────────────────────────────────── */

// Best 1-2 sentence pain reflection per branch (cut from the full Line 1 bank)
const MIRROR_BEAT1: Record<Branch, (answers: Record<string, string | string[]>) => string> = {
  blur: (a) => {
    const q2 = String(a.branch_q2 ?? "");
    if (q2.includes("Autopilot")) return "Your days run on autopilot. You get to the end of the week and can\u2019t name a single moment that mattered.";
    if (q2.includes("Busy")) return "Full calendar. Nothing to show for it. That\u2019s what you told us.";
    if (q2.includes("Fine")) return "Fine on the surface. Foggy underneath. Your answers suggest it\u2019s been building for a while.";
    return "Going through the motions. Present but not there. And nobody around you sees it.";
  },
  patterns: (a) => {
    const q2 = String(a.branch_q2 ?? "");
    if (q2.includes("partner")) return "You already know how the fight ends. The words change but the feeling is exactly the same.";
    if (q2.includes("work")) return "Different meeting, different day, same feeling in your chest.";
    if (q2.includes("family")) return "The family dynamic has been running longer than you\u2019d like to admit. You thought you\u2019d outgrow it.";
    return "It\u2019s not one relationship. It\u2019s the pattern underneath all of them.";
  },
  rumination: (a) => {
    const q2 = String(a.branch_q2 ?? "");
    if (q2.includes("lie down")) return "The second your head hits the pillow, your brain turns on. Conversations replay. Decisions get second-guessed.";
    if (q2.includes("quiet")) return "Silence isn\u2019t peaceful for you. It\u2019s when the noise starts.";
    if (q2.includes("driving")) return "You do your deepest thinking behind the wheel \u2014 not because you choose to, but because that\u2019s when your brain can ambush you.";
    return "It\u2019s not that your brain gets loud sometimes. It\u2019s that it never fully stops.";
  },
  graveyard: (a) => {
    const q2 = String(a.branch_q2 ?? "");
    if (q2.includes("journaling")) return "Maybe you downloaded a journaling app. You stopped \u2014 not because it was bad, but because staring at a blank screen felt like one more thing to fail at.";
    if (q2.includes("Therapy")) return "Maybe therapy helped while you were in the room. The insights faded between sessions.";
    if (q2.includes("productivity")) return "Maybe you built a system. You spent more time maintaining it than actually living.";
    if (q2.includes("Meditation")) return "Maybe someone told you to meditate. Sitting alone with your thoughts wasn\u2019t the relief they promised.";
    return "Something shifted for about three days. Then it faded. And you went back to exactly where you were.";
  },
  mask: (a) => {
    const q2 = String(a.branch_q2 ?? "");
    if (q2.includes("partner")) return "Your partner thinks you\u2019re fine because you\u2019ve made sure they think you\u2019re fine. So you carry it.";
    if (q2.includes("kids")) return "Your kids see someone who has it all handled. What they don\u2019t see is what it takes to hold that together every single day.";
    if (q2.includes("work")) return "At work, you\u2019re the reliable one. Nobody asks how you\u2019re doing because you\u2019ve made it so nobody needs to.";
    if (q2 === "Everyone") return "You\u2019re holding it together for everyone. The one person you\u2019re not holding it together for is yourself.";
    return "You\u2019re performing for yourself \u2014 maintaining the fiction that you\u2019re fine.";
  },
  drift: (a) => {
    const q2 = String(a.branch_q2 ?? "");
    if (q2.includes("Recently")) return "Something woke you up recently. The gap between who you are and who you meant to be opened up \u2014 and you can\u2019t unsee it.";
    if (q2.includes("building")) return "It\u2019s been creeping in for months. Not a crisis \u2014 more like a slow leak.";
    if (q2.includes("Years")) return "You\u2019ve known for years. You just didn\u2019t want to name it.";
    return "The drift happened so gradually there\u2019s no clear before and after. Just a slow fade.";
  },
};

// Branch-specific Q9 closer (the strongest single line from DESIRE_REWRITES)
const MIRROR_Q9_CLOSER: Record<Branch, string> = {
  blur: "The pattern isn\u2019t the fog. It\u2019s what\u2019s hiding inside it.",
  patterns: "The pattern isn\u2019t the fight. It\u2019s what builds up before it.",
  rumination: "The loop isn\u2019t random. It\u2019s processing something your day didn\u2019t give you space to finish.",
  graveyard: "It\u2019s not discipline you\u2019re missing. It\u2019s that nobody\u2019s helped you see the moment you stop.",
  mask: "The pattern isn\u2019t generosity. It\u2019s erasure.",
  drift: "The drift isn\u2019t laziness. It\u2019s invisible momentum in the wrong direction.",
};

export function buildMirrorLines(branch: Branch, answers: Record<string, string | string[]>): string[] {
  const q9 = String(answers.shared_q9 ?? "");
  const counterPhrase = getTallyPhrase(q9);
  const beat1 = MIRROR_BEAT1[branch](answers);
  const beat2 = `You said you want to stop ${counterPhrase}. ${MIRROR_Q9_CLOSER[branch]}`;
  return [beat1, beat2];
  // Beat 3 ("You don't have to keep living like this.") is rendered by the MirrorScreen component
}

// ─── Pattern Labels (deterministic mapping — taxonomy v2) ──────────────────

export interface PatternLabels {
  primary: string;
  secondary: string | null;
  area: string;
  areaFallback: boolean;
  bodyCopy: string;
  loopLine: string;
  secondaryVisible: boolean;
  stuckDeepOverride: boolean;
  collisionSuppressed: boolean;
}

const PRIMARY_PATTERN: Record<Branch, string> = {
  blur: "Mental Overload",
  patterns: "Relational Looping",
  rumination: "Racing Mind",
  graveyard: "System Fatigue",
  mask: "Invisible Load",
  drift: "Drifted Off-Course",
};

const LOOP_LINES: Record<Branch, string> = {
  blur: "Your days run together without registering \u2014 not because nothing happens, but because nothing lands.",
  patterns: "The same conversations keep cycling without resolving \u2014 different words, same feeling.",
  rumination: "Your brain keeps processing a backlog it never gets to clear \u2014 so it replays instead.",
  graveyard: "You\u2019ve tried the right things \u2014 they just weren\u2019t built for how your mind actually works.",
  mask: "You\u2019re carrying everything for everyone \u2014 and nobody sees the cost because you\u2019ve made sure they don\u2019t.",
  drift: "You know what you want \u2014 it just never converts into motion, and another month slips by.",
};

const BODY_COPY: Record<Branch, string> = {
  blur: "You\u2019re not lacking memory \u2014 you\u2019re lacking a surface for your days to land on. When nothing captures what happened, everything flattens into noise.",
  patterns: "You\u2019re not lacking communication skills \u2014 you\u2019re missing the 48-hour view. The trigger isn\u2019t the fight. It\u2019s what built up in the days before it.",
  rumination: "You\u2019re not lacking calm \u2014 you\u2019re carrying a processing backlog. Your brain replays at night because your day never gave it space to finish.",
  graveyard: "You\u2019re not lacking discipline \u2014 you\u2019ve been using tools that ask too much. Blank pages, daily prompts, meditation timers \u2014 none of them met you where you actually are.",
  mask: "You\u2019re not lacking strength \u2014 you\u2019re spending all of it on everyone else. The mask works so well that nobody thinks to ask what\u2019s underneath.",
  drift: "You\u2019re not lacking ambition \u2014 you\u2019re lacking a mirror. The gap between who you are and who you meant to be grows invisibly, one week at a time.",
};

const SECONDARY_PATTERN: Record<string, string> = {
  "Snapping at people I love, then feeling guilty": "Overflow",
  "Putting everyone else first until I have nothing left": "Last on the List",
  "Starting things and watching them fizzle": "Follow-Through Decay",
  "Replaying the same worries on a loop": "Rumination Spiral",
};

const AREA_MAP: Record<string, string> = {
  "My energy": "Energy",
  "My relationships": "Relationships",
  "My health": "Health",
  "My career": "Career",
  "My sense of self": "Identity",
  "Time I can\u2019t get back": "Time",
};

// Explicit collision pairs: primary+secondary combos that restate each other.
// Extend this set if new patterns are added.
const COLLISION_PAIRS: [string, string][] = [
  ["Racing Mind", "Rumination Spiral"],
];

function isCollision(primary: string, secondary: string): boolean {
  return COLLISION_PAIRS.some(([p, s]) => p === primary && s === secondary);
}

export function getPatternLabels(branch: Branch, answers: Record<string, string | string[]>): PatternLabels {
  const primary = PRIMARY_PATTERN[branch];
  const loopLine = LOOP_LINES[branch];
  const bodyCopy = BODY_COPY[branch];

  // Area — single-select, clean 1:1
  const costAnswer = String(answers.shared_q6 ?? "");
  const areaFallback = !costAnswer || !AREA_MAP[costAnswer];
  const area = AREA_MAP[costAnswer] ?? "Energy";

  // Secondary — from shared_q9
  const q9 = String(answers.shared_q9 ?? "");
  let secondary: string | null = SECONDARY_PATTERN[q9] ?? null;

  // Duration override → "Stuck Deep"
  const duration = String(answers.shared_q5 ?? "");
  const isLongDuration = duration === "Over a year" || duration === "I can\u2019t remember when it started";
  let stuckDeepOverride = false;
  let collisionSuppressed = false;
  let secondaryVisible = true;

  if (isLongDuration) {
    stuckDeepOverride = true;
    secondary = "Stuck Deep";
  } else if (secondary && isCollision(primary, secondary)) {
    // Collision: primary and secondary restate each other
    collisionSuppressed = true;
    secondary = null;
    secondaryVisible = false;
  }

  // If no secondary was resolved at all, hide the row
  if (!secondary) {
    secondaryVisible = false;
  }

  return { primary, secondary, area, areaFallback, bodyCopy, loopLine, secondaryVisible, stuckDeepOverride, collisionSuppressed };
}

// ─── Snapshot: Weekly Report Previews (used by Timeline screen) ────────────

export const SNAPSHOT_PREVIEWS: Record<Branch, string[]> = {
  blur: [
    "Monday\u2013Wednesday: high task volume, zero reflection. Thursday: everything blurred. Friday: you couldn\u2019t name one win.",
    "You mentioned \u2018busy\u2019 11 times but \u2018meaningful\u2019 zero times.",
    "Your energy peaks at 9am and craters by 2pm. Every day. You\u2019ve never noticed.",
  ],
  patterns: [
    "The argument happened Tuesday. But the tension started Sunday \u2014 you mentioned the same frustration three days before it surfaced.",
    "You used the word \u2018always\u2019 7 times this week. Each time, about the same person.",
    "Your mood drops 2 points the day BEFORE the pattern triggers. Not after. Before.",
  ],
  rumination: [
    "You recorded at 10:47pm. Your brain was running through tomorrow\u2019s problems. The trigger was something that happened at 2:15pm \u2014 8 hours earlier.",
    "The same thought appeared in 4 out of 7 debriefs. You described it differently each time but it\u2019s the same fear.",
    "Your calmest day was Wednesday. The only day you processed out loud before 6pm.",
  ],
  graveyard: [
    "Day 4: you almost stopped. The exact same day you stopped last time. The pattern isn\u2019t the tool. It\u2019s the day.",
    "You mentioned wanting to quit on days when you felt drained. On days you didn\u2019t feel that, you forgot you wanted to quit.",
    "One week in and you\u2019ve already said more to Acuity than you wrote in 3 months of journaling.",
  ],
  mask: [
    "You said \u2018I\u2019m fine\u2019 in 3 debriefs. Your mood score on those days was the lowest of the week.",
    "Thursday you let something real slip. One sentence about what you actually need. It\u2019s the most honest thing you said all week.",
    "Your energy for everyone else: 8/10. Your energy for yourself: 3/10. Every single day.",
  ],
  drift: [
    "You mentioned who you used to be twice. You mentioned who you want to become zero times. That ratio is the drift.",
    "Your highest energy was Sunday morning. By Monday evening it was gone. Every week resets to zero because nothing captures the spark.",
    "One week of data and the pattern is visible: the drift isn\u2019t random. It follows your calendar.",
  ],
};

// ─── Snapshot: Bottom Line (Screen 13, Section 3) ───────────────────────────

export const SNAPSHOT_BOTTOM: Record<Branch, string> = {
  blur: "Your days have a pattern. You just can\u2019t see it from inside them. One week of Acuity and you will.",
  patterns: "The cycle has a trigger. You\u2019ve been looking at the explosion. Acuity shows you the fuse.",
  rumination: "Your brain isn\u2019t broken. It\u2019s processing a backlog you\u2019ve never cleared. 60 seconds a day starts clearing it.",
  graveyard: "You didn\u2019t fail at journaling. Journaling failed you. This is what it should have been all along.",
  mask: "You\u2019ve been performing for too long. One minute a day of honesty and the mask starts to crack \u2014 in a good way.",
  drift: "You don\u2019t need motivation. You need a mirror. Acuity shows you who you\u2019re actually becoming, one day at a time.",
};

// ─── Gap Screen Content (between Mirror and Mechanism) — v4 three-screen sequence ─

function formatCostShort(cost: string): string {
  if (!cost) return "more than you realize";
  const SHORT: Record<string, string> = {
    "My energy": "your energy",
    "My relationships": "your relationships",
    "My health": "your health",
    "My career": "your career",
    "My sense of self": "your sense of self",
    "Time I can\u2019t get back": "time you can\u2019t get back",
  };
  return SHORT[cost] ?? cost.toLowerCase();
}

// kept for any legacy callers
export interface GapContent { amplify: string; imagine: string; promise: string; }
export function buildGapContent(branch: Branch, answers: Record<string, string | string[]>): GapContent {
  const g1 = buildGap1Content(branch, answers);
  return { amplify: g1.line1, imagine: g1.line2, promise: g1.line3 };
}

// ── Gap 1: "What it\u2019s costing you" (loss, personalized) ──

export interface Gap1Content { line1: string; costWords: string[]; line2: string; line3: string; }

export function buildGap1Content(branch: Branch, answers: Record<string, string | string[]>): Gap1Content {
  const cost = String(answers.shared_q6 ?? "");
  const costStr = formatCostShort(cost);

  const LINE2: Record<Branch, string> = {
    blur: "And the longer the fog runs, the more it takes \u2014 your patience, your evenings, your sense of who you are.",
    patterns: "And the longer the cycle runs, the more it takes \u2014 your patience, your evenings, your sense of who you are.",
    rumination: "And the longer the loop runs, the more it takes \u2014 your patience, your evenings, your sense of who you are.",
    graveyard: "And every tool you abandon takes a little more with it \u2014 your patience, your confidence, your belief that anything will work.",
    mask: "And every day the mask stays on, the gap widens \u2014 between who you perform and who you actually are.",
    drift: "And every week you drift, the distance grows \u2014 between who you are and who you meant to become.",
  };

  const LINE3: Record<Branch, string> = {
    blur: "Left alone, fog doesn\u2019t lift. It thickens.",
    patterns: "Left alone, cycles don\u2019t break. They dig deeper.",
    rumination: "Left alone, loops don\u2019t loosen. They tighten.",
    graveyard: "Left alone, the next thing you try ends the same way.",
    mask: "Left alone, the mask doesn\u2019t crack. It calcifies.",
    drift: "Left alone, drift doesn\u2019t reverse. It accelerates.",
  };

  // Highlight target: concise cost noun for marker-style highlighting
  const HIGHLIGHT: Record<string, string> = {
    "My energy": "energy", "My relationships": "relationships",
    "My health": "health", "My career": "career",
    "My sense of self": "sense of self",
    "Time I can\u2019t get back": "time",
  };
  const costWords = cost ? [HIGHLIGHT[cost] ?? cost.toLowerCase()] : [];
  return {
    line1: `Right now, this is costing you ${costStr}.`,
    costWords,
    line2: LINE2[branch],
    line3: LINE3[branch],
  };
}

// ── Gap 2: "How would it feel?" (interactive multi-select) ──

export const GAP2_FEELINGS = [
  { id: "lighter", label: "Lighter \u2014 like I put something heavy down" },
  { id: "clear", label: "Clear \u2014 I\u2019d finally hear myself think" },
  { id: "proud", label: "Proud \u2014 I kept a promise to myself" },
  { id: "present", label: "Present \u2014 actually THERE with the people I love" },
  { id: "control", label: "In control \u2014 my life isn\u2019t running me" },
  { id: "rested", label: "Rested \u2014 not carrying it all at midnight" },
];

export function getGap2Header(branch: Branch, answers: Record<string, string | string[]>): string {
  const cost = String(answers.shared_q6 ?? "");
  const costStr = cost ? formatCostShort(cost) : "what it\u2019s taking from you";

  const PAIN: Record<Branch, string> = {
    blur: "the fog",
    patterns: "the cycle",
    rumination: "the mental noise",
    graveyard: "the pattern of quitting",
    mask: "the mask",
    drift: "the drift",
  };

  return `If ${PAIN[branch]} and ${costStr} were completely solved \u2014 how would you feel?`;
}

// ── Gap 3: "Your future self" (dynamic animated payoff) ──

const GAP3_FEELING_LINES: Record<string, { text: string; bold: string }> = {
  lighter: { text: "You talk for 60 seconds, and the weight actually leaves. Not because the problems disappeared \u2014 but because you finally put them somewhere.", bold: "the weight actually leaves" },
  clear: { text: "The mental noise settles. For the first time in months, you can hear yourself think \u2014 because the backlog has somewhere to go.", bold: "you can hear yourself think" },
  proud: { text: "You kept a promise to yourself. Seven days in a row. Not because of discipline \u2014 because 60 seconds was always doable.", bold: "kept a promise to yourself" },
  present: { text: "You\u2019re at dinner, and you\u2019re THERE. The mental tabs are closed because you already processed them \u2014 earlier, in your own voice.", bold: "you\u2019re THERE" },
  control: { text: "Your days have shape. You know what happened, why it mattered, and what to do next \u2014 because something is finally keeping track.", bold: "finally keeping track" },
  rested: { text: "The midnight replay is quieter. Not because the thoughts stopped \u2014 but because they already have somewhere to go.", bold: "they already have somewhere to go" },
};

export interface Gap3Line { text: string; bold: string; }

export function buildGap3Lines(selectedFeelings: string[]): Gap3Line[] {
  // Cap at 3 to keep it tight
  return selectedFeelings.slice(0, 3).map((f) => GAP3_FEELING_LINES[f]).filter(Boolean);
}

export const GAP3_DISMISS_COPY = "That\u2019s okay. The patterns will wait \u2014 they always do. But if 60 seconds feels doable, the door\u2019s open.";

// ── Paywall loss-aversion recap (v4) ──

export function getPaywallLossRecap(branch: Branch | null): string {
  if (!branch) return "You\u2019ve already mapped your pattern. Walking away now means the loop keeps running \u2014 and it\u2019s been running long enough.";
  const RECAPS: Record<Branch, string> = {
    blur: "You\u2019ve already seen the fog for what it is. Walking away now means the days keep blurring \u2014 and they\u2019ve been blurring long enough.",
    patterns: "You\u2019ve already seen the cycle for what it is. Walking away now means it keeps running \u2014 and it\u2019s been running long enough.",
    rumination: "You\u2019ve already seen the loop for what it is. Walking away now means it keeps tightening \u2014 and it\u2019s been tightening long enough.",
    graveyard: "You\u2019ve already gotten further than last time. Walking away now means the next thing you try ends the same way.",
    mask: "You\u2019ve already let something real slip through. Walking away now means the mask goes back on \u2014 and it\u2019s been on long enough.",
    drift: "You\u2019ve already started paying attention. Walking away now means the drift wins another year.",
  };
  return RECAPS[branch];
}

// ─── Timeline Templates (Screen 14) ─────────────────────────────────────────

export interface TimelineWeek {
  week: string;
  text: string;
  badge?: string;
}

export function getTimelineWeeks(branch: Branch, answers: Record<string, string | string[]>): TimelineWeek[] {
  const q2 = String(answers.branch_q2 ?? "what you tried");
  const q5 = lc(String(answers.shared_q5 ?? "too long"));
  const WEEK_3_ALL = "Your Life Matrix takes shape. Six domains \u2014 Health, Career, Relationships, Growth, Fun, Purpose \u2014 each scored by your own words. For the first time, you can see where your life actually goes. Not where you think it goes. Where it actually goes.";

  const w1: Record<Branch, string> = {
    blur: "For the first time, your days have shape. You\u2019ll look back at this week and actually remember it.",
    patterns: "The cycle gets named. Not fixed yet \u2014 named. That\u2019s the part nobody else could do for you.",
    rumination: "Your brain has somewhere to put it. The 11pm replay starts losing its power because the backlog is shrinking.",
    graveyard: `You\u2019re still here on Day 7. That\u2019s already further than ${lc(q2)} got you. And it took 60 seconds a day.`,
    mask: "You said how you actually feel. Seven times. Nobody judged. Nobody worried. Something shifted.",
    drift: "You paid attention for one week straight. The fog is already thinner. You\u2019re starting to recognize yourself.",
  };
  const w2: Record<Branch, string> = {
    blur: "Your weekly report arrives Sunday. 400 words about YOUR week. You read it and think: \u2018That\u2019s exactly what happened, but I couldn\u2019t have said it myself.\u2019",
    patterns: "The report shows you the trigger. Not the fight \u2014 what happened 48 hours before it. For the first time, you\u2019re ahead of the cycle instead of inside it.",
    rumination: "The thoughts that used to ambush you at night are in your report now. Seeing them on paper takes away their power.",
    graveyard: "One week. You opened the app 6 out of 7 days. Not because of discipline \u2014 because the output actually matters.",
    mask: "The weekly report says something nobody in your life has ever said to you: \u2018Here\u2019s what\u2019s actually going on with you.\u2019 And it\u2019s right.",
    drift: "You can feel the difference between a week you paid attention to and the years you didn\u2019t. The contrast is uncomfortable. That means it\u2019s working.",
  };
  const w4: Record<Branch, string> = {
    blur: `Your first monthly memoir arrives. A story of your month. You read it and realize \u2014 you remember every week. That hasn\u2019t happened in ${q5}.`,
    patterns: "Your memoir documents the pattern from the outside. You can see the cycle on paper. You can show it to someone. You can choose differently next month.",
    rumination: "30 days of processed thoughts. Your brain is quieter. Not because the thoughts stopped \u2014 because they have somewhere to go now.",
    graveyard: "30 days. The longest you\u2019ve stuck with anything. Not because you\u2019re more disciplined \u2014 because this is the first thing that was built for how your brain actually works.",
    mask: "A month of honesty with yourself. The memoir reads like a letter from someone who finally knows you. Because it does. It\u2019s you.",
    drift: `One month of paying attention. The memoir shows you: you\u2019re not the person from ${lc(String(answers.branch_q2 ?? "before"))} anymore. You\u2019re the person who stopped drifting.`,
  };
  return [
    { week: "Week 1", text: w1[branch], badge: "Starting now" },
    { week: "Week 2", text: w2[branch] },
    { week: "Week 3", text: WEEK_3_ALL },
    { week: "Week 4", text: w4[branch] },
  ];
}

// ─── Paywall Hooks (Screen 15) ──────────────────────────────────────────────

export const PAYWALL_HOOKS: Record<Branch, string> = {
  blur: "Your days don\u2019t have to disappear.",
  patterns: "The cycle breaks when you see it.",
  rumination: "Your brain deserves somewhere to put it all.",
  graveyard: "This one sticks. Because it only asks for 60 seconds.",
  mask: "You don\u2019t have to hold it together here.",
  drift: "Start paying attention before another year slips by.",
};

export const PRICING_COPY: Record<Branch, string> = {
  blur: "Get your days back for less than a coffee a week.",
  patterns: "Break the cycle for less than a coffee a week.",
  rumination: "Quiet your brain for less than a coffee a week.",
  graveyard: "The tool that finally sticks \u2014 for less than a coffee a week.",
  mask: "A place to be honest with yourself \u2014 for less than a coffee a week.",
  drift: "Start paying attention again \u2014 for less than a coffee a week.",
};

// ─── Processing Theater Text (Screen 12) ────────────────────────────────────

export const PROCESSING_STAGES: { text: string; endSec: number }[] = [
  { text: "Analyzing your patterns\u2026", endSec: 3 },
  { text: "Mapping your blind spots\u2026", endSec: 5 },
  { text: "Identifying what to track first\u2026", endSec: 7 },
  { text: "Preparing your personalized plan\u2026", endSec: 9 },
  { text: "Your profile is ready.", endSec: 10 },
];

// (DESIRE_TO_THEME and getSnapshotGoal removed — snapshot rewritten in v2)

// ─── Paywall Dynamic Headlines (Screen 15, Section 1) ───────────────────────

/** Map raw Q5 answer to a natural-language duration phrase per branch context. */
function durPhrase(raw: string, style: "losing" | "running" | "carrying"): string {
  const v = raw.trim();
  switch (v) {
    case "A few weeks": return style === "losing" ? "weeks of lost days" : style === "running" ? "weeks" : "weeks";
    case "A few months": return "months";
    case "Over a year": return "over a year";
    case "I can\u2019t remember when it started": return style === "losing" ? "longer than you can count" : "so long you can\u2019t remember when it started";
    default: return "too long";
  }
}

export function getPaywallHeadline(branch: Branch, answers: Record<string, string | string[]>): string {
  const raw = String(answers.shared_q5 ?? "");
  const noMemory = raw === "I can\u2019t remember when it started";
  switch (branch) {
    case "blur":
      return noMemory
        ? "Your days have been disappearing for so long you stopped counting. Here\u2019s what the next 7 look like instead."
        : `${durPhrase(raw, "losing")} of days you can\u2019t remember. Here\u2019s what the next 7 look like instead.`;
    case "patterns":
      return noMemory
        ? "The same cycle has been running for as long as you can remember. Here\u2019s what it looks like when you finally see it."
        : `The same cycle has been running for ${durPhrase(raw, "running")}. Here\u2019s what it looks like when you finally see it.`;
    case "rumination":
      return noMemory
        ? "Your brain has been doing this for as long as you can remember. Here\u2019s what changes in 7 days."
        : `Your brain has been doing this for ${durPhrase(raw, "running")}. Here\u2019s what changes in 7 days.`;
    case "graveyard":
      return noMemory
        ? "You\u2019ve been trying to fix this for longer than you can remember. Here\u2019s the thing that\u2019s different."
        : `You\u2019ve been trying to fix this for ${durPhrase(raw, "carrying")}. Here\u2019s the thing that\u2019s different.`;
    case "mask":
      return noMemory
        ? "You\u2019ve been carrying this for so long it feels normal. Here\u2019s what it looks like when something actually sees it."
        : `You\u2019ve been carrying this for ${durPhrase(raw, "carrying")}. Here\u2019s what it looks like when something actually sees it.`;
    case "drift":
      return noMemory
        ? "You\u2019ve been drifting for longer than you can pin down. Here\u2019s what 30 days of paying attention looks like."
        : `You\u2019ve been drifting for ${durPhrase(raw, "carrying")}. Here\u2019s what 30 days of paying attention looks like.`;
  }
}

// ─── Paywall Cost of Inaction (Screen 15, Section 2) ────────────────────────

export function getCostOfInaction(branch: Branch, answers: Record<string, string | string[]>): string {
  const raw = String(answers.shared_q5 ?? "");
  const dur = durPhrase(raw, "running");
  switch (branch) {
    case "blur":
      return `Without something catching it, the next 6 months look like the last 6. Same overwhelm. Same forgetting. Same feeling like the days blur together.`;
    case "patterns":
      return `The cycle you described has been running for ${dur}. It ran last month. It\u2019ll run next month. Nothing changes until something sees it.`;
    case "rumination":
      return `The thoughts that kept you up last night will keep you up tonight. And tomorrow night. That\u2019s what no visibility looks like.`;
    case "graveyard":
      return `The goals you mentioned \u2014 they\u2019ll still be sitting there in 6 months. Not because you don\u2019t care, but because nothing is tracking them.`;
    case "mask":
      return `You told us things look fine on the outside. Six months from now, they\u2019ll still look fine on the outside. The gap between what people see and what you carry just gets wider.`;
    case "drift":
      return `You described a feeling of drifting. Without something anchoring the days, next month feels exactly like this one.`;
  }
}

// ─── Create Account Screen (v3 flow — Screen 16) ──────────────────────────

export function getCreateAccountHeadline(branch: Branch): string {
  switch (branch) {
    case "blur": return "Your patterns are already forming. Create your free account to see them.";
    case "patterns": return "Your cycles are already mapped. Create your free account to see them.";
    case "rumination": return "Your thought patterns are taking shape. Create your free account to see them.";
    case "graveyard": return "Your goals are already tracked. Create your free account to see them.";
    case "mask": return "Your real story is already being written. Create your free account to see it.";
    case "drift": return "Your direction is already becoming clearer. Create your free account to see it.";
  }
}

// ─── Savings Screen (v3 flow — Screen 17) ──────────────────────────────────

export function getSavingsCostRecap(branch: Branch): string {
  switch (branch) {
    case "blur": return "You told us the days blur together. Without visibility, they\u2019ll keep blurring.";
    case "patterns": return "The cycle you described has been running for a while. This is how you see it.";
    case "rumination": return "The thoughts that kept you up aren\u2019t going away. This is how you catch them.";
    case "graveyard": return "The goals you mentioned are sitting untouched. This is how they move.";
    case "mask": return "The gap between what people see and what you carry \u2014 this is how it closes.";
    case "drift": return "The drifting you described doesn\u2019t stop on its own. This is how you anchor it.";
  }
}

export const SAVINGS_TIMELINE = [
  { week: "Week 1", text: "The noise has somewhere to go. Your head feels lighter at the end of the day." },
  { week: "Week 2", text: "You start seeing the why \u2014 the loops that run you on autopilot become visible." },
  { week: "Week 3", text: "Your life comes into focus. You can see what\u2019s thriving and what\u2019s slipping." },
  { week: "Week 4", text: "You\u2019re running your weeks, not chasing them. Less scramble, more steadiness." },
] as const;

// ─── Paywall Comparison (Section 2 — what didn't work vs Acuity) ────────────

export function getComparisonLeft(branch: Branch, answers: Record<string, string | string[]>): { label: string; cost: string; result: string } {
  const q2 = String(answers.branch_q2 ?? "");
  const q3 = String(answers.branch_q3 ?? "");
  switch (branch) {
    case "blur": return { label: "Hoping tomorrow is different", cost: "Free", result: "It wasn\u2019t" };
    case "patterns": return { label: "Talking it out", cost: "Free", result: "Same fight next week" };
    case "rumination": return { label: "Scrolling until exhausted", cost: "Free", result: "Still awake at midnight" };
    case "graveyard": return { label: q2 || "The last thing you tried", cost: "$0\u2013150/mo", result: `Lasted ${lc(q3 || "a while")}` };
    case "mask": return { label: "Carrying it alone", cost: "Free", result: "Costing you everything" };
    case "drift": return { label: "Meaning to change", cost: "Free", result: "Another year gone" };
  }
}

// ─── Paywall FAQ (Section 7) ────────────────────────────────────────────────

export const PAYWALL_FAQ = [
  { q: "Will the price go up?", a: "Yes. The founding rate of $4.99/month is for early members only. When we raise prices, your rate stays locked as long as your subscription is active. Cancel and rejoin later, and you\u2019ll pay the standard rate." },
  { q: "What happens during the free trial?", a: "Full access for 7 days. Record daily, get your first weekly report on Sunday, see your patterns emerge. Cancel anytime before day 7 and pay nothing." },
  { q: "How does it actually work?", a: "Open the app. Talk for 60 seconds about whatever\u2019s on your mind. AI extracts your tasks, goals, mood, and themes. Every Sunday, you get a 400-word report connecting the dots across your week." },
  { q: "Is it actually worth $4.99/month?", a: "One therapy session costs $150. One month of Acuity costs $4.99 and catches things therapists miss \u2014 because it listens every single day, not once a week. Your patterns don\u2019t wait for your next appointment." },
  { q: "Is my data private?", a: "Your recordings are transcribed and deleted within 24 hours. Data is encrypted, never sold, never shared. This is your space." },
  { q: "What if I\u2019ve tried everything and nothing works?", a: "Everything you tried before asked for effort \u2014 writing, meditating, showing up. Acuity asks for 60 seconds of talking. That\u2019s it. The AI does the rest. That\u2019s why it sticks when everything else didn\u2019t." },
];

// ─── Paywall Testimonials (outcome-specific) ────────────────────────────────

export const PAYWALL_TESTIMONIALS_V2 = [
  { quote: "I found out I mention quitting my job every Monday. I never noticed until the weekly report showed me. That one pattern changed everything.", name: "Sarah M." },
  { quote: "My therapist asked what changed. I showed her my Acuity report. She said \u2018this is what I try to do in sessions.\u2019", name: "James K." },
  { quote: "Week 3, Acuity told me I bring up my mom every time I\u2019m stressed about work. I\u2019ve been in therapy for a year and never connected those.", name: "Priya R." },
];
