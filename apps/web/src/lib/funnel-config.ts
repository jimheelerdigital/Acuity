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
    "You\u2019re busy every single day. And at the end of every single day, you feel like you did nothing. The calendar is full. The feeling is empty.",
  "Fine on the surface, foggy underneath":
    "On the surface, you\u2019re fine. Functioning. Showing up. But underneath there\u2019s a fog you can\u2019t name \u2014 and the scariest part is you\u2019re getting used to it.",
  "Like I\u2019m watching someone else live my life":
    "You feel like you\u2019re watching your own life from the outside. Going through the motions. Present but not there. And nobody notices because you\u2019ve gotten so good at pretending.",
};

const PATTERNS_LINE1: Record<string, string> = {
  "The same argument with my partner":
    "You already know how the fight ends. You\u2019ve had it enough times to script it. The words change but the feeling is exactly the same \u2014 and so is the silence after.",
  "The same frustration at work":
    "The same frustration keeps showing up at work. Different meeting, different day, same feeling in your chest. You\u2019ve tried to let it go. It keeps coming back because you keep not seeing why.",
  "The same cycle with family":
    "The family dynamic that\u2019s been running since you were a kid is still running. You thought you\u2019d outgrow it. You didn\u2019t. You just got better at performing through it.",
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
    `You downloaded a journaling app because you read somewhere that writing helps. You used it for ${lc(q3)}. Then you stopped \u2014 not because it was bad, but because staring at a blank screen felt like one more thing to fail at.`,
  "Therapy or coaching": (_q3) =>
    "You tried therapy. It helped when you were in the room. But the insights faded by Wednesday, and you couldn\u2019t justify the cost for something that evaporated between sessions.",
  "A productivity system": (_q3) =>
    "You built a system. You organized your life into apps and dashboards and lists. Then you spent more time maintaining the system than actually living. The system became the problem.",
  "Meditation or mindfulness": (_q3) =>
    "Someone told you to meditate. You tried. Sitting still with your own thoughts felt like being locked in a room with the one person you were trying to get away from \u2014 yourself.",
  "A self-help book": (_q3) =>
    "You read the book. You highlighted the passages. You felt something shift for about three days. Then the book went on the shelf next to the others. And you went back to exactly where you were.",
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
    "You\u2019re not even sure when you started drifting \u2014 which is the scariest part. It\u2019s not that you lost yourself. It\u2019s that the losing happened so gradually you didn\u2019t notice until you tried to find yourself and couldn\u2019t.",
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
  "Why I keep repeating the same mistakes":
    "Deep down, you already know what you\u2019d want to see: why you keep ending up here. The same mistakes. The same patterns. The same version of stuck.",
  "What\u2019s actually stressing me out":
    "You want to know what\u2019s actually stressing you out \u2014 not the surface reasons you tell people, but the real thing underneath that you can\u2019t quite name.",
  "Where my time and energy go":
    "You want to know where it all goes. The time. The energy. You start every week with plans and end every week wondering what happened to them.",
  "What I really want but won\u2019t admit":
    "There\u2019s something you want that you won\u2019t say out loud. Maybe you\u2019re afraid it\u2019s too late. Maybe you\u2019re afraid it\u2019s not. Either way, it\u2019s there \u2014 and it\u2019s not going away.",
};

// ─── Build Mirror Lines ─────────────────────────────────────────────────────

export function buildMirrorLines(branch: Branch, answers: Record<string, string | string[]>): string[] {
  const lines: string[] = [];

  // Line 1: core pain from branch (answer-specific)
  lines.push(getLine1(branch, answers));

  // Line 2: duration (emotionally weighted)
  const dur = String(answers.shared_q5 ?? "");
  lines.push(DURATION_LINES[dur] ?? DURATION_LINES["Over a year"]!);

  // Line 3: cost (multi-select, emotionally specific)
  const costRaw = answers.shared_q6;
  const costs = Array.isArray(costRaw) ? costRaw : costRaw ? [costRaw] : ["My energy"];
  if (costs.length === 1) {
    const rewrite = COST_REWRITES[costs[0]];
    lines.push(rewrite ? `It\u2019s draining ${rewrite}.` : `It\u2019s costing you ${lc(costs[0])}.`);
  } else {
    const rewritten = costs.map((c) => COST_REWRITES[c] ?? lc(c));
    const joined = rewritten.length === 2
      ? `${rewritten[0]} and ${rewritten[1]}`
      : `${rewritten.slice(0, -1).join(", ")}, and ${rewritten[rewritten.length - 1]}`;
    lines.push(`It\u2019s draining ${joined}.`);
  }

  // Line 4: brain state (sensory, specific)
  const brain = String(answers.shared_q8 ?? "");
  lines.push(BRAIN_REWRITES[brain] ?? BRAIN_REWRITES["Scattered \u2014 too many tabs open"]!);

  // Line 5: desire (emotionally loaded)
  const desire = String(answers.shared_q9 ?? "");
  lines.push(DESIRE_REWRITES[desire] ?? DESIRE_REWRITES["Why I keep repeating the same mistakes"]!);

  return lines;
}

// ─── Snapshot: Pattern Insight (Screen 13, Section 1) ────────────────────────

export function getSnapshotInsight(branch: Branch, a: Record<string, string | string[]>): string {
  const q2 = lc(String(a.branch_q2 ?? ""));
  const q3 = lc(String(a.branch_q3 ?? ""));
  const q4 = lc(String(a.branch_q4 ?? ""));
  const q9 = lc(String(a.shared_q9 ?? "what\u2019s driving this"));
  switch (branch) {
    case "blur":
      return `You described your days as ${q2}. But you also said you want to know ${q9}. That gap \u2014 between how you\u2019re living and what you\u2019re looking for \u2014 is the pattern. Acuity tracks it daily until you can see it yourself.`;
    case "patterns":
      return `You said ${q2} keeps repeating. You feel ${q3} every time. There\u2019s a trigger hiding in the 48 hours before it happens. Acuity finds it.`;
    case "rumination":
      return `Your brain turns on ${q2}. It runs through ${q3}. There\u2019s a pattern in WHEN it starts \u2014 a specific moment earlier in your day that lights the fuse. Acuity catches that moment.`;
    case "graveyard":
      return `${String(a.branch_q2 ?? "What you tried")} lasted ${q3} before you stopped. It failed because ${q4}. Acuity works because it asks for 60 seconds of talking \u2014 not discipline, not structure, not a blank page.`;
    case "mask":
      return `You said you need ${q4}. But you\u2019ve been saying \u201c${lc(String(a.branch_q3 ?? "\u2018fine\u2019"))}\u201d when people ask. The distance between those two answers is exactly what Acuity measures \u2014 every day, without you performing.`;
    case "drift":
      return `${String(a.branch_q4 ?? "What matters most")} slipped the most. You\u2019ve known for ${q2}. Every week that passes without tracking it is another week of evidence you\u2019ll never get back. Acuity starts collecting it today.`;
  }
}

// ─── Snapshot: Weekly Report Previews (Screen 13, Section 2) ────────────────

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
    "One week of data and Acuity already knows: the drift isn\u2019t random. It follows your calendar.",
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
    blur: "For the first time, your days have a record. You\u2019ll look back at this week and actually remember it.",
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
    graveyard: "Two weeks. You opened the app 12 out of 14 days. Not because of discipline \u2014 because it only takes 60 seconds and the output actually matters.",
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

export function getPaywallHeadline(branch: Branch, answers: Record<string, string | string[]>): string {
  const dur = lc(String(answers.shared_q5 ?? "too long"));
  const q2 = String(answers.branch_q2 ?? "");
  const q3 = String(answers.branch_q3 ?? "");
  switch (branch) {
    case "blur": return `You\u2019ve been losing days for ${dur}. What\u2019s that worth?`;
    case "patterns": return `The same cycle has been running for ${dur}. What\u2019s one more year of it cost?`;
    case "rumination": return `Your brain has been keeping you up for ${dur}. What would you pay to sleep?`;
    case "graveyard": return `You\u2019ve spent money on ${lc(q2 || "things")} that lasted ${lc(q3 || "a while")}. This costs less.`;
    case "mask": return `You hold it together for ${lc(q2 || "everyone")} every day. Who holds it together for you?`;
    case "drift": return `${String(answers.shared_q5 ?? "Months")} of drifting. How many more years before you do something?`;
  }
}

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
  { q: "What happens during the free trial?", a: "Full access for 14 days. Record daily, get your first weekly report on Sunday, see your patterns emerge. Cancel anytime before day 14 and pay nothing." },
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
