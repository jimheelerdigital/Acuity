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
    text: "What\u2019s it costing you?",
    options: [
      { label: "My energy" },
      { label: "My relationships" },
      { label: "My health" },
      { label: "My career" },
      { label: "My sense of self" },
      { label: "Time I can\u2019t get back" },
    ],
    multiSelect: true,
    normalization: "On average, people select 3 of these.",
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
    text: "If something could show you one pattern about yourself this week, you\u2019d want to know\u2026",
    options: [
      { label: "Why I keep repeating the same mistakes" },
      { label: "What\u2019s actually stressing me out" },
      { label: "Where my time and energy go" },
      { label: "What I really want but won\u2019t admit" },
    ],
    normalization: "This is exactly what Acuity is built to show you.",
  },
];

// ─── Mirror Templates (Screen 10) ──────────────────────────────────────────

export interface MirrorLine {
  build: (answers: Record<string, string | string[]>) => string;
}

function lc(s: string): string {
  // lowercase first char for mid-sentence embedding
  if (!s) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

export const MIRROR_TEMPLATES: Record<Branch, (a: Record<string, string | string[]>) => string> = {
  blur: (a) =>
    `Your days are running together. You can\u2019t remember where the time goes, and the scariest part is ${lc(String(a.branch_q4 ?? "how fast time is moving"))}.`,
  patterns: (a) =>
    `The same cycle keeps playing out \u2014 ${lc(String(a.branch_q2 ?? "the same pattern"))}. Every time, you feel ${lc(String(a.branch_q3 ?? "exhausted"))}.`,
  rumination: (a) =>
    `Your brain won\u2019t stop. It hits hardest ${lc(String(a.branch_q2 ?? "at night"))}, and when it starts, it\u2019s ${lc(String(a.branch_q3 ?? "replaying everything"))}.`,
  graveyard: (a) =>
    `You tried ${lc(String(a.branch_q2 ?? "something"))}. It lasted ${lc(String(a.branch_q3 ?? "a while"))}. It stopped because ${lc(String(a.branch_q4 ?? "life got in the way"))}.`,
  mask: (a) =>
    `You\u2019re holding it together for ${lc(String(a.branch_q2 ?? "everyone"))}. When someone asks how you are, you say ${lc(String(a.branch_q3 ?? "\u2018fine\u2019"))}.`,
  drift: (a) =>
    `You\u2019ve been drifting for ${lc(String(a.branch_q2 ?? "a while"))}. The thing that slipped the most: ${lc(String(a.branch_q4 ?? "your sense of who you are"))}.`,
};

export function buildMirrorLines(branch: Branch, answers: Record<string, string | string[]>): string[] {
  const lines: string[] = [];

  // Line 1: core pain from branch
  lines.push(MIRROR_TEMPLATES[branch](answers));

  // Line 2: duration
  const dur = String(answers.shared_q5 ?? "a while");
  lines.push(`This has been going on for ${lc(dur)}.`);

  // Line 3: cost (multi-select)
  const costRaw = answers.shared_q6;
  const costs = Array.isArray(costRaw) ? costRaw : costRaw ? [costRaw] : ["your energy"];
  const costStr =
    costs.length === 1
      ? lc(costs[0])
      : costs.length === 2
        ? `${lc(costs[0])} and ${lc(costs[1])}`
        : `${costs.slice(0, -1).map(lc).join(", ")}, and ${lc(costs[costs.length - 1])}`;
  lines.push(`It\u2019s costing you ${costStr}.`);

  // Line 4: brain state
  const brain = String(answers.shared_q8 ?? "scattered");
  lines.push(`By the end of the day, your brain feels ${lc(brain)}.`);

  // Line 5: desire
  const desire = String(answers.shared_q9 ?? "why you keep repeating the same mistakes");
  lines.push(`What you want to know: ${lc(desire)}.`);

  return lines;
}

// ─── Snapshot Templates (Screen 13) ─────────────────────────────────────────

export interface SnapshotData {
  tasks: string[];
  goal: string;
  theme: string;
}

export const SNAPSHOT_TEMPLATES: Record<Branch, SnapshotData> = {
  blur: {
    tasks: [
      "\u2610 Review last week\u2019s calendar for patterns",
      "\u2610 Set 3 priorities for tomorrow",
      "\u2610 Block 30 minutes for the thing you keep postponing",
    ],
    goal: "\uD83C\uDFAF Build a record of my days \u2192 0% this week",
    theme: "Memory Gap: Untracked \u2014 recording begins",
  },
  patterns: {
    tasks: [
      "\u2610 Write down what triggered today\u2019s cycle",
      "\u2610 Ask the other person how they experienced it",
      "\u2610 Notice the pattern next time before reacting",
    ],
    goal: "\uD83C\uDFAF Break the cycle \u2192 0% this week",
    theme: "Recurring Conflict: Unresolved \u2014 tracking begins",
  },
  rumination: {
    tasks: [
      "\u2610 Do a 60-second brain dump before bed tonight",
      "\u2610 Write down the 3 thoughts that keep looping",
      "\u2610 Schedule the thing you keep worrying about",
    ],
    goal: "\uD83C\uDFAF Process my day before bed \u2192 0% this week",
    theme: "Rumination Loop: Active \u2014 tracking begins",
  },
  graveyard: {
    tasks: [
      "\u2610 Delete one app you\u2019re not using",
      "\u2610 Try Acuity for 7 days instead",
      "\u2610 Set a reminder to check your weekly report Sunday",
    ],
    goal: "\uD83C\uDFAF Stick with one thing for 30 days \u2192 0% this week",
    theme: "Commitment Pattern: Short cycles \u2014 tracking begins",
  },
  mask: {
    tasks: [
      "\u2610 Tell one person how you actually feel this week",
      "\u2610 Take 10 minutes for yourself today \u2014 no screens",
      "\u2610 Read your weekly report before saying \u2018I\u2019m fine\u2019 again",
    ],
    goal: "\uD83C\uDFAF Check in with myself daily \u2192 0% this week",
    theme: "Emotional Masking: High \u2014 tracking begins",
  },
  drift: {
    tasks: [
      "\u2610 Write down one thing you used to care about",
      "\u2610 Compare this week to what you wanted 2 years ago",
      "\u2610 Pick one small thing to reclaim this week",
    ],
    goal: "\uD83C\uDFAF Reconnect with what matters \u2192 0% this week",
    theme: "Life Direction: Off-course \u2014 tracking begins",
  },
};

// ─── Timeline Templates (Screen 14) ─────────────────────────────────────────

export interface TimelineWeek {
  week: string;
  text: string;
  badge?: string;
}

export const TIMELINE_TEMPLATES: Record<Branch, TimelineWeek[]> = {
  blur: [
    { week: "Week 1", text: "Tasks captured. Mood tracked. For the first time, your days have a record.", badge: "You\u2019re here" },
    { week: "Week 2", text: "Patterns emerge. You mentioned the same thing three times without realizing it." },
    { week: "Week 3", text: "Your Life Matrix takes shape. Six domains \u2014 Health, Career, Relationships, Growth, Fun, Purpose \u2014 each scored by your own words." },
    { week: "Week 4", text: "Your first monthly memoir. A story of your month. You remember every week." },
  ],
  patterns: [
    { week: "Week 1", text: "The cycle gets named. Acuity spots the trigger you keep missing.", badge: "You\u2019re here" },
    { week: "Week 2", text: "The weekly report shows it happens on the same days, for the same reasons." },
    { week: "Week 3", text: "Your Life Matrix takes shape. Six domains \u2014 Health, Career, Relationships, Growth, Fun, Purpose \u2014 each scored by your own words." },
    { week: "Week 4", text: "Your first memoir. The pattern is documented. Now you can choose differently." },
  ],
  rumination: [
    { week: "Week 1", text: "Your brain has somewhere to put it. The nightly replay starts to lose its grip.", badge: "You\u2019re here" },
    { week: "Week 2", text: "You\u2019re sleeping better. The debrief caught the thought before it reached the pillow." },
    { week: "Week 3", text: "Your Life Matrix takes shape. Six domains \u2014 Health, Career, Relationships, Growth, Fun, Purpose \u2014 each scored by your own words." },
    { week: "Week 4", text: "Your first memoir. A month of processed thoughts instead of spiraling ones." },
  ],
  graveyard: [
    { week: "Week 1", text: "Day 1 done. Then day 2. This is already longer than the last thing you tried.", badge: "You\u2019re here" },
    { week: "Week 2", text: "Two weeks. You haven\u2019t quit. Because it only asks for 60 seconds." },
    { week: "Week 3", text: "Your Life Matrix takes shape. Six domains \u2014 Health, Career, Relationships, Growth, Fun, Purpose \u2014 each scored by your own words." },
    { week: "Week 4", text: "Your first memoir. 30 days in a row. The longest you\u2019ve stuck with anything." },
  ],
  mask: [
    { week: "Week 1", text: "You said how you actually feel. Nobody judged. Nobody worried. It just listened.", badge: "You\u2019re here" },
    { week: "Week 2", text: "The weekly report sees what no one else does. It reads like a conversation you needed to have." },
    { week: "Week 3", text: "Your Life Matrix takes shape. Six domains \u2014 Health, Career, Relationships, Growth, Fun, Purpose \u2014 each scored by your own words." },
    { week: "Week 4", text: "Your first memoir. A month of honesty. You\u2019ve never had that before." },
  ],
  drift: [
    { week: "Week 1", text: "You started paying attention again. Your Life Matrix shows where you actually spend your time.", badge: "You\u2019re here" },
    { week: "Week 2", text: "You can feel the difference between a week you chose and a week that just happened." },
    { week: "Week 3", text: "Your Life Matrix takes shape. Six domains \u2014 Health, Career, Relationships, Growth, Fun, Purpose \u2014 each scored by your own words." },
    { week: "Week 4", text: "Your first memoir. A month of paying attention. You\u2019re not drifting anymore." },
  ],
};

// ─── Paywall Hooks (Screen 15) ──────────────────────────────────────────────

export const PAYWALL_HOOKS: Record<Branch, string> = {
  blur: "Your days don\u2019t have to disappear.",
  patterns: "The cycle breaks when you see it.",
  rumination: "Your brain deserves somewhere to put it all.",
  graveyard: "This one sticks. Because it only asks for 60 seconds.",
  mask: "You don\u2019t have to hold it together here.",
  drift: "Start paying attention before another year slips by.",
};

// ─── Processing Theater Text (Screen 12) ────────────────────────────────────

export const PROCESSING_STAGES: { text: string; endSec: number }[] = [
  { text: "Analyzing your patterns\u2026", endSec: 3 },
  { text: "Mapping your blind spots\u2026", endSec: 5 },
  { text: "Identifying what to track first\u2026", endSec: 7 },
  { text: "Preparing your personalized plan\u2026", endSec: 9 },
  { text: "Your profile is ready.", endSec: 10 },
];

// ─── Q9 → Theme Mapping (for snapshot) ──────────────────────────────────────

export const DESIRE_TO_THEME: Record<string, string> = {
  "Why I keep repeating the same mistakes": "Pattern Repetition: Unidentified \u2014 tracking begins",
  "What\u2019s actually stressing me out": "Stress Source: Unidentified \u2014 tracking begins",
  "Where my time and energy go": "Energy Drain: Unmapped \u2014 tracking begins",
  "What I really want but won\u2019t admit": "Hidden Desire: Suppressed \u2014 tracking begins",
};

// ─── Snapshot Goal Override (per branch, with Q2 mapping for patterns) ──────

export function getSnapshotGoal(branch: Branch, answers: Record<string, string | string[]>): string {
  if (branch === "patterns") {
    const q2 = String(answers.branch_q2 ?? "the cycle");
    return `\uD83C\uDFAF Break the ${lc(q2)} cycle \u2192 0% this week`;
  }
  return SNAPSHOT_TEMPLATES[branch].goal;
}
