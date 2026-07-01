/**
 * Funnel configuration — all quiz content, branch questions, pain-mirror
 * fragments, snapshot templates, timeline copy, and paywall hooks.
 *
 * Kept in a separate file so copy can be edited without touching
 * component logic.
 *
 * ─── SKELETON v6 (2026-07-01, structure-only restructure) ──────────────────
 * The funnel is a locked 17-screen skeleton. Branch CONTENT for the NEW
 * surfaces (branched Q6, Relief Flip, Current-vs-Future) is scaffolded with
 * clearly-marked TODO placeholders — the branching hooks and answer-passing
 * are wired end-to-end; per-branch copy is filled in follow-up commits.
 *
 * Screen order:
 *   1  entry            (branched — 5 branches)
 *   2  branch-q2        (branched)
 *   3  branch-q3        (branched)
 *   4  branch-q4        (branched)
 *   5  shared-q5        (SHARED — "how long have you felt this way?")
 *   6  branch-q6        (branched — "what's it costing you most?")
 *   7  pain             (branched + answer-aware — assembled from Q2+Q3+Q6)
 *   8  relief-flip      (NEW — branched — "imagine it wasn't there…")
 *   9  current-future   (NEW — branched + answer-aware — Q2 pain vs Q6 relief)
 *   10 mechanism        (branched)
 *   11 value            (SHARED — Life Matrix item removed)
 *   12 commit           (shared)
 *   13 processing       (shared)
 *   14 pattern-result   (branched)
 *   15 timeline         (branched — "one week" block removed)
 *   16 savings/paywall  (branched)
 *   17 create-account   (branched headline)
 *
 * Branch taxonomy changed 6→5: blur→overload, graveyard→stuck, drift dropped.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type Branch = "overload" | "patterns" | "rumination" | "stuck" | "mask";

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
    { label: "My days blur together and nothing sticks", branch: "overload" },
    { label: "I keep having the same fights and patterns", branch: "patterns" },
    { label: "My brain won\u2019t stop at night", branch: "rumination" },
    { label: "I\u2019ve tried journaling, apps, therapy \u2014 nothing worked", branch: "stuck" },
    { label: "I\u2019m holding it together but barely", branch: "mask" },
  ],
};

// ─── Branch Questions (Screens 2-4) ─────────────────────────────────────────

export const BRANCH_QUESTIONS: Record<Branch, [Question, Question, Question]> = {
  overload: [
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
  stuck: [
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
};

// ─── Shared Questions (Screen 5 only) ───────────────────────────────────────
//
// v6: only shared_q5 (duration) remains shared. Old shared_q6 (cost) is now
// branched (see BRANCH_Q6). Old shared_q7/q8/q9 were cut with the Time-Math,
// tally, and loss-based Gap screens.

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
];

// ─── Branched Q6 — "What's it costing you most?" (Screen 6) ─────────────────
//
// v6: the cost question is now BRANCHED (was shared). Each branch presents 4
// pain-specific cost options. Stored under answers.branch_q6 (see the
// getCurrentQuestion special-case in onboarding-funnel.tsx).
//
// TODO(copy): per-branch cost options below are placeholder copy pending the
// branch-content pass. Structure/branching is locked; wording is provisional.

export const BRANCH_Q6: Record<Branch, Question> = {
  overload: {
    id: "branch_q6",
    text: "What\u2019s it costing you most?",
    options: [
      { label: "My memory \u2014 whole days just vanish" },
      { label: "My energy \u2014 I\u2019m running on empty" },
      { label: "My presence \u2014 I\u2019m never really here" },
      { label: "My sense of self \u2014 I don\u2019t know who I am under it" },
    ],
    normalization: "Naming the cost makes it real.",
  },
  patterns: {
    id: "branch_q6",
    text: "What\u2019s it costing you most?",
    options: [
      { label: "My relationships \u2014 the same fights keep landing" },
      { label: "My peace \u2014 I\u2019m always bracing for the next round" },
      { label: "My self-respect \u2014 I hate who I become in it" },
      { label: "My hope \u2014 I\u2019ve stopped believing it can change" },
    ],
    normalization: "Naming the cost makes it real.",
  },
  rumination: {
    id: "branch_q6",
    text: "What\u2019s it costing you most?",
    options: [
      { label: "My sleep \u2014 the nights I can\u2019t shut off" },
      { label: "My focus \u2014 I can\u2019t hear myself think" },
      { label: "My calm \u2014 I\u2019m always braced for something" },
      { label: "My energy \u2014 worrying takes everything" },
    ],
    normalization: "Naming the cost makes it real.",
  },
  stuck: {
    id: "branch_q6",
    text: "What\u2019s it costing you most?",
    options: [
      { label: "My belief that anything actually works" },
      { label: "My time \u2014 wasted on tools that didn\u2019t fit" },
      { label: "My momentum \u2014 I quit before it lands" },
      { label: "My self-trust \u2014 I assume I\u2019ll fail again" },
    ],
    normalization: "Naming the cost makes it real.",
  },
  mask: {
    id: "branch_q6",
    text: "What\u2019s it costing you most?",
    options: [
      { label: "My relationships \u2014 nobody sees the real me" },
      { label: "My energy \u2014 performing takes everything" },
      { label: "My health \u2014 I\u2019m ignoring what my body says" },
      { label: "My identity \u2014 I\u2019ve lost who I am under the mask" },
    ],
    normalization: "Naming the cost makes it real.",
  },
};

// ─── Pain / Mirror (Screen 7) — answer-aware fragment assembly ──────────────
//
// The Pain screen stitches the user's ACTUAL selections (Q2 + Q3 + Q6) into a
// short reflection. Each branch defines copy FRAGMENTS keyed to each possible
// answer. assemblePainCopy() picks the fragments that match the user's
// answers and falls back to a per-branch line when a fragment is missing.
//
// q2 fragments are ported from the shipped v4 mirror copy (real copy).
// q3 + q6 fragment banks are TODO placeholders — the mechanism is wired so
// per-branch copy can be filled without touching component logic.

export interface PainFragments {
  /** Keyed by exact Q2 option label → sharpest pain reflection (beat 1). */
  q2: Record<string, string>;
  /** TODO(copy): keyed by exact Q3 option label → optional amplifier. */
  q3: Record<string, string>;
  /** TODO(copy): keyed by exact Q6 option label → cost-specific line. */
  q6: Record<string, string>;
  /** Real per-branch fallback for beat 1 when no Q2 fragment matches. */
  fallback: string;
  /** Real per-branch closer (beat 2) when no Q3/Q6 fragment is available. */
  closer: string;
}

export const PAIN_FRAGMENTS: Record<Branch, PainFragments> = {
  overload: {
    q2: {
      "Autopilot \u2014 I don\u2019t remember half of it":
        "Your days run on autopilot. You get to the end of the week and can\u2019t name a single moment that mattered.",
      "Busy but empty":
        "Full calendar. Nothing to show for it. That\u2019s what you told us.",
      "Fine on the surface, foggy underneath":
        "Fine on the surface. Foggy underneath. Your answers suggest it\u2019s been building for a while.",
      "Like I\u2019m watching someone else live my life":
        "Going through the motions. Present but not there. And nobody around you sees it.",
    },
    q3: {}, // TODO(copy): per-Q3 amplifier fragments
    q6: {}, // TODO(copy): per-Q6 cost fragments
    fallback: "Your days blur together, and nothing sticks.",
    closer: "The pattern isn\u2019t the fog. It\u2019s what\u2019s hiding inside it.",
  },
  patterns: {
    q2: {
      "The same argument with my partner":
        "You already know how the fight ends. The words change but the feeling is exactly the same.",
      "The same frustration at work":
        "Different meeting, different day, same feeling in your chest.",
      "The same cycle with family":
        "The family dynamic has been running longer than you\u2019d like to admit. You thought you\u2019d outgrow it.",
      "The same dynamic in every relationship":
        "It\u2019s not one relationship. It\u2019s the pattern underneath all of them.",
    },
    q3: {},
    q6: {},
    fallback: "The same cycle keeps running, and you can\u2019t quite see it from inside it.",
    closer: "The pattern isn\u2019t the fight. It\u2019s what builds up before it.",
  },
  rumination: {
    q2: {
      "The moment I lie down":
        "The second your head hits the pillow, your brain turns on. Conversations replay. Decisions get second-guessed.",
      "During any quiet moment":
        "Silence isn\u2019t peaceful for you. It\u2019s when the noise starts.",
      "When I\u2019m driving or showering":
        "You do your deepest thinking behind the wheel \u2014 not because you choose to, but because that\u2019s when your brain can ambush you.",
      "It never fully stops":
        "It\u2019s not that your brain gets loud sometimes. It\u2019s that it never fully stops.",
    },
    q3: {},
    q6: {},
    fallback: "Your brain won\u2019t stop, and there\u2019s nowhere to put it all.",
    closer: "The loop isn\u2019t random. It\u2019s processing something your day didn\u2019t give you space to finish.",
  },
  stuck: {
    q2: {
      "A journaling app":
        "Maybe you downloaded a journaling app. You stopped \u2014 not because it was bad, but because staring at a blank screen felt like one more thing to fail at.",
      "Therapy or coaching":
        "Maybe therapy helped while you were in the room. The insights faded between sessions.",
      "A productivity system":
        "Maybe you built a system. You spent more time maintaining it than actually living.",
      "Meditation or mindfulness":
        "Maybe someone told you to meditate. Sitting alone with your thoughts wasn\u2019t the relief they promised.",
      "A self-help book":
        "Something shifted for about three days. Then it faded. And you went back to exactly where you were.",
    },
    q3: {},
    q6: {},
    fallback: "You\u2019ve tried the right things. They just weren\u2019t built for how your mind works.",
    closer: "It\u2019s not discipline you\u2019re missing. It\u2019s that nobody\u2019s helped you see the moment you stop.",
  },
  mask: {
    q2: {
      "My partner":
        "Your partner thinks you\u2019re fine because you\u2019ve made sure they think you\u2019re fine. So you carry it.",
      "My kids":
        "Your kids see someone who has it all handled. What they don\u2019t see is what it takes to hold that together every single day.",
      "My team at work":
        "At work, you\u2019re the reliable one. Nobody asks how you\u2019re doing because you\u2019ve made it so nobody needs to.",
      "Everyone":
        "You\u2019re holding it together for everyone. The one person you\u2019re not holding it together for is yourself.",
      "Honestly, just myself":
        "You\u2019re performing for yourself \u2014 maintaining the fiction that you\u2019re fine.",
    },
    q3: {},
    q6: {},
    fallback: "You\u2019re holding it together for everyone but you.",
    closer: "The pattern isn\u2019t generosity. It\u2019s erasure.",
  },
};

/**
 * Assemble the Pain screen reflection from the user's actual answers.
 * Returns an array of "beats" (short paragraphs) the component reveals in
 * sequence. beat 1 = Q2 pain reflection; beat 2 = stitched Q3/Q6 fragments
 * when available, else the per-branch closer.
 *
 * TODO(copy): once the q3/q6 fragment banks are filled, beat 2 will read as
 * an assembled cost-aware line; until then it uses the per-branch closer.
 */
export function assemblePainCopy(
  branch: Branch,
  answers: Record<string, string | string[]>,
): string[] {
  const frag = PAIN_FRAGMENTS[branch];
  const q2 = String(answers.branch_q2 ?? "");
  const q3 = String(answers.branch_q3 ?? "");
  const q6 = String(answers.branch_q6 ?? "");

  const beat1 = frag.q2[q2] ?? frag.fallback;
  const q3Frag = frag.q3[q3];
  const q6Frag = frag.q6[q6];
  const beat2 = [q3Frag, q6Frag].filter(Boolean).join(" ") || frag.closer;

  return [beat1, beat2];
  // Beat 3 ("You don't have to keep living like this.") is rendered by the
  // PainScreen component as a static settle line.
}

// ─── Relief Flip (Screen 8, NEW) ────────────────────────────────────────────
//
// "Imagine [the pain] wasn't there anymore… how would you feel?" — branched
// prompt + emotional-payoff options. Single-select, tap-to-advance. Selection
// is stored under answers.relief_flip.
//
// TODO(copy): option set is currently shared across branches; per-branch
// tuning follows. "All of the above" is intentionally the last option.

export interface ReliefFlipConfig {
  prompt: string;
  options: { id: string; label: string }[];
}

const RELIEF_FLIP_OPTIONS: { id: string; label: string }[] = [
  { id: "lighter", label: "Lighter \u2014 like I put something heavy down" },
  { id: "clear", label: "Clear \u2014 I\u2019d finally hear myself think" },
  { id: "present", label: "Present \u2014 actually here with the people I love" },
  { id: "hopeful", label: "Hopeful \u2014 like things could actually change" },
  { id: "all", label: "All of the above" },
];

export const RELIEF_FLIP: Record<Branch, ReliefFlipConfig> = {
  overload: {
    prompt: "Imagine the fog lifted \u2014 the days stopped blurring. How would you feel?",
    options: RELIEF_FLIP_OPTIONS,
  },
  patterns: {
    prompt: "Imagine the cycle finally broke. How would you feel?",
    options: RELIEF_FLIP_OPTIONS,
  },
  rumination: {
    prompt: "Imagine your mind finally went quiet. How would you feel?",
    options: RELIEF_FLIP_OPTIONS,
  },
  stuck: {
    prompt: "Imagine something finally stuck. How would you feel?",
    options: RELIEF_FLIP_OPTIONS,
  },
  mask: {
    prompt: "Imagine you could set the mask down. How would you feel?",
    options: RELIEF_FLIP_OPTIONS,
  },
};

// ─── Current You vs Future You (Screen 9, NEW) — answer-aware ───────────────
//
// Two-state contrast: LEFT ("you right now") echoes the Q2 pain; RIGHT
// ("you, a few weeks in") echoes the Q6 relief. The component animates the two
// states (drab/heavy left → warm/lively right) and respects
// prefers-reduced-motion. This config supplies the item lists.
//
// q2Current + q6Future are answer-aware override banks: when the user's
// selection has a matching fragment, it replaces the first item in the
// respective column. Defaults are real copy so the screen always renders.
//
// TODO(copy): q6Future banks are placeholders; per-branch relief phrasing
// follows in the branch-content pass.

export interface CurrentFutureContent {
  currentLabel: string;
  futureLabel: string;
  current: string[];
  future: string[];
}

interface CurrentFutureBank {
  currentDefault: string[];
  futureDefault: string[];
  /** Keyed by exact Q2 label → replaces current[0] when matched. */
  q2Current: Record<string, string>;
  /** TODO(copy): keyed by exact Q6 label → replaces future[0] when matched. */
  q6Future: Record<string, string>;
}

const CURRENT_FUTURE: Record<Branch, CurrentFutureBank> = {
  overload: {
    currentDefault: ["Days blur together", "Running on autopilot", "Nothing sticks"],
    futureDefault: ["You can name what mattered", "Present for your own life", "The week actually lands"],
    q2Current: {
      "Autopilot \u2014 I don\u2019t remember half of it": "Half the day just vanishes",
      "Busy but empty": "Busy but empty",
      "Fine on the surface, foggy underneath": "Foggy underneath the surface",
      "Like I\u2019m watching someone else live my life": "Watching your own life go by",
    },
    q6Future: {},
  },
  patterns: {
    currentDefault: ["The same fight, on repeat", "Bracing for the next round", "Reacting before you see it"],
    futureDefault: ["You see the trigger coming", "You respond instead of react", "The cycle loses its grip"],
    q2Current: {
      "The same argument with my partner": "The same argument, again",
      "The same frustration at work": "The same frustration at work",
      "The same cycle with family": "The same cycle with family",
      "The same dynamic in every relationship": "The same dynamic everywhere",
    },
    q6Future: {},
  },
  rumination: {
    currentDefault: ["A mind that won\u2019t shut off", "Replaying it at 2am", "Never fully at rest"],
    futureDefault: ["The noise has somewhere to go", "You hear yourself think", "Nights get quieter"],
    q2Current: {
      "The moment I lie down": "It starts the moment you lie down",
      "During any quiet moment": "Every quiet moment fills with noise",
      "When I\u2019m driving or showering": "It ambushes you when you\u2019re alone",
      "It never fully stops": "It never fully stops",
    },
    q6Future: {},
  },
  stuck: {
    currentDefault: ["Another tool half-abandoned", "Sure you\u2019ll quit again", "Nothing ever stuck"],
    futureDefault: ["Something that finally holds", "Past the point you usually quit", "Proof you can stick with it"],
    q2Current: {
      "A journaling app": "Another app you stopped opening",
      "Therapy or coaching": "Insights that faded between sessions",
      "A productivity system": "A system you spent more time maintaining",
      "Meditation or mindfulness": "Sitting alone that never brought relief",
      "A self-help book": "A book that faded after three days",
    },
    q6Future: {},
  },
  mask: {
    currentDefault: ["Holding it together for everyone", "Nobody sees the real you", "Last on your own list"],
    futureDefault: ["A place to be honest", "Seen \u2014 finally", "You, back on the list"],
    q2Current: {
      "My partner": "Holding it together for your partner",
      "My kids": "Holding it together for your kids",
      "My team at work": "The reliable one, always",
      "Everyone": "Holding it together for everyone",
      "Honestly, just myself": "Performing even for yourself",
    },
    q6Future: {},
  },
};

/**
 * Assemble the Current-vs-Future contrast from the user's answers.
 * LEFT column echoes Q2 (pain); RIGHT column echoes Q6 (relief). Both columns
 * always return a full item list (defaults are real copy) so the animated
 * screen renders even before the override banks are filled.
 */
export function assembleCurrentFuture(
  branch: Branch,
  answers: Record<string, string | string[]>,
): CurrentFutureContent {
  const bank = CURRENT_FUTURE[branch];
  const q2 = String(answers.branch_q2 ?? "");
  const q6 = String(answers.branch_q6 ?? "");

  const current = [...bank.currentDefault];
  const future = [...bank.futureDefault];

  const cOverride = bank.q2Current[q2];
  if (cOverride) current[0] = cOverride;
  const fOverride = bank.q6Future[q6]; // TODO(copy): placeholder bank
  if (fOverride) future[0] = fOverride;

  return {
    currentLabel: "You right now",
    futureLabel: "You, a few weeks in",
    current,
    future,
  };
}

// ─── Pattern Labels (Screen 14) — deterministic mapping ────────────────────
//
// v6: secondary pattern used to come from shared_q9 (removed). It now comes
// ONLY from the duration override ("Stuck Deep" for long durations); otherwise
// there is no secondary. Area is derived from branch_q6 (was shared_q6) with a
// per-branch fallback. The interface is unchanged so PatternResultScreen (and
// its tracking event) keeps reading the same fields.

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
  overload: "Mental Overload",
  patterns: "Relational Looping",
  rumination: "Racing Mind",
  stuck: "System Fatigue",
  mask: "Invisible Load",
};

const LOOP_LINES: Record<Branch, string> = {
  overload: "Your days run together without registering \u2014 not because nothing happens, but because nothing lands.",
  patterns: "The same conversations keep cycling without resolving \u2014 different words, same feeling.",
  rumination: "Your brain keeps processing a backlog it never gets to clear \u2014 so it replays instead.",
  stuck: "You\u2019ve tried the right things \u2014 they just weren\u2019t built for how your mind actually works.",
  mask: "You\u2019re carrying everything for everyone \u2014 and nobody sees the cost because you\u2019ve made sure they don\u2019t.",
};

const BODY_COPY: Record<Branch, string> = {
  overload: "You\u2019re not lacking memory \u2014 you\u2019re lacking a surface for your days to land on. When nothing captures what happened, everything flattens into noise.",
  patterns: "You\u2019re not lacking communication skills \u2014 you\u2019re missing the 48-hour view. The trigger isn\u2019t the fight. It\u2019s what built up in the days before it.",
  rumination: "You\u2019re not lacking calm \u2014 you\u2019re carrying a processing backlog. Your brain replays at night because your day never gave it space to finish.",
  stuck: "You\u2019re not lacking discipline \u2014 you\u2019ve been using tools that ask too much. Blank pages, daily prompts, meditation timers \u2014 none of them met you where you actually are.",
  mask: "You\u2019re not lacking strength \u2014 you\u2019re spending all of it on everyone else. The mask works so well that nobody thinks to ask what\u2019s underneath.",
};

// Per-branch default area (used when branch_q6 has no explicit area mapping).
const AREA_DEFAULT: Record<Branch, string> = {
  overload: "Energy",
  patterns: "Relationships",
  rumination: "Peace of mind",
  stuck: "Momentum",
  mask: "Identity",
};

// TODO(copy): map branch_q6 option labels → area names as the branched Q6 copy
// firms up. Until then, area falls back to the per-branch default.
const AREA_MAP: Record<string, string> = {};

export function getPatternLabels(branch: Branch, answers: Record<string, string | string[]>): PatternLabels {
  const primary = PRIMARY_PATTERN[branch];
  const loopLine = LOOP_LINES[branch];
  const bodyCopy = BODY_COPY[branch];

  // Area — from branched Q6, with a per-branch default fallback.
  const costAnswer = String(answers.branch_q6 ?? "");
  const mapped = AREA_MAP[costAnswer];
  const areaFallback = !mapped;
  const area = mapped ?? AREA_DEFAULT[branch];

  // Secondary — v6 has no Q9 source. Only the long-duration override applies.
  const duration = String(answers.shared_q5 ?? "");
  const isLongDuration = duration === "Over a year" || duration === "I can\u2019t remember when it started";
  let secondary: string | null = null;
  let stuckDeepOverride = false;
  let secondaryVisible = false;

  if (isLongDuration) {
    stuckDeepOverride = true;
    secondary = "Stuck Deep";
    secondaryVisible = true;
  }

  // collisionSuppressed retained for interface stability; no collision source
  // remains now that the Q9 secondary is gone.
  const collisionSuppressed = false;

  return { primary, secondary, area, areaFallback, bodyCopy, loopLine, secondaryVisible, stuckDeepOverride, collisionSuppressed };
}

// ─── Snapshot: Bottom Line (Screen 14, Section 3) ───────────────────────────

export const SNAPSHOT_BOTTOM: Record<Branch, string> = {
  overload: "Your days have a pattern. You just can\u2019t see it from inside them. One week of Acuity and you will.",
  patterns: "The cycle has a trigger. You\u2019ve been looking at the explosion. Acuity shows you the fuse.",
  rumination: "Your brain isn\u2019t broken. It\u2019s processing a backlog you\u2019ve never cleared. 60 seconds a day starts clearing it.",
  stuck: "You didn\u2019t fail at journaling. Journaling failed you. This is what it should have been all along.",
  mask: "You\u2019ve been performing for too long. One minute a day of honesty and the mask starts to crack \u2014 in a good way.",
};

// ─── Timeline Templates (Screen 15) ─────────────────────────────────────────
//
// v6: the "what one week actually looks like" preview block was removed from
// the Timeline screen. Only the three escalating milestones (Week 1 / Month 1
// / Year 1) remain. Branch-aware voice preserved.

export interface TimelineWeek {
  week: string;
  text: string;
  badge?: string;
}

const TIMELINE_WEEKS: Record<Branch, TimelineWeek[]> = {
  patterns: [
    {
      week: "Week 1",
      badge: "Starting now",
      text: "The cycle gets named. Not fixed yet \u2014 named. The same argument, the same shutdown, the same Sunday-night dread \u2014 Acuity catches it in the first few debriefs. That\u2019s the part you could never quite see from inside it.",
    },
    {
      week: "Month 1",
      text: "The pattern becomes undeniable. Your weekly reports start connecting the dots \u2014 the trigger that shows up days before the fight, the Life Matrix taking shape across your six domains. You stop reacting and start seeing the shape of it coming.",
    },
    {
      week: "Year 1",
      text: "You have a record of yourself nobody else could write. A year of the patterns, the turning points, the quiet wins. You can see the cycle on paper, show it to someone who matters, and choose differently \u2014 not because it\u2019s gone, but because you finally see it whole.",
    },
  ],
  overload: [
    {
      week: "Week 1",
      badge: "Starting now",
      text: "The fog gets a name. Your days stop blurring into one long autopilot \u2014 Acuity catches what actually happened, the moments that slipped past you, in the first few debriefs.",
    },
    {
      week: "Month 1",
      text: "The blur starts to lift. Your weekly reports show you the week you actually lived \u2014 not the one that dissolved. The Life Matrix takes shape across your six domains, and for the first time you can see where your days are going instead of wondering where they went.",
    },
    {
      week: "Year 1",
      text: "You have a record of a year you\u2019d otherwise have lost. The days that ran together are now a story you can actually read. You can see where your life is going, show it to someone, and start steering it \u2014 instead of waking up wondering how it\u2019s already been a year.",
    },
  ],
  rumination: [
    {
      week: "Week 1",
      badge: "Starting now",
      text: "The noise gets somewhere to go. The thoughts that loop at 2am \u2014 Acuity catches them in the first few debriefs, so your mind isn\u2019t the only place they live.",
    },
    {
      week: "Month 1",
      text: "The replay starts to quiet. Your weekly reports show you what your mind keeps circling back to \u2014 and the Life Matrix takes shape across your six domains. You stop carrying the whole backlog at once, because it\u2019s finally written down somewhere outside your head.",
    },
    {
      week: "Year 1",
      text: "You have a record of a mind that finally got to rest. A year of the worries that mattered and the ones that never came true. You can see what your brain was really protecting you from, show it to someone, and let go of what it\u2019s safe to let go of.",
    },
  ],
  stuck: [
    {
      week: "Week 1",
      badge: "Starting now",
      text: "Something finally sticks. The journals, the apps, the therapy that didn\u2019t quite hold \u2014 this one asks for 60 seconds, and in the first few debriefs it\u2019s already catching what the others missed.",
    },
    {
      week: "Month 1",
      text: "You realize it\u2019s still going. Past the point everything else fizzled out. Your weekly reports connect dots across weeks and the Life Matrix takes shape across your six domains \u2014 not because you forced it, but because it finally met you where you actually are.",
    },
    {
      week: "Year 1",
      text: "You have a year of proof that you stuck with something. The thing you were sure you\u2019d quit by February. A full record of yourself \u2014 patterns, turning points, quiet wins \u2014 and the evidence that you were never the problem. The tools were.",
    },
  ],
  mask: [
    {
      week: "Week 1",
      badge: "Starting now",
      text: "What\u2019s underneath gets seen. The \u2018I\u2019m fine\u2019 you say on autopilot \u2014 Acuity hears what\u2019s actually under it in the first few debriefs. Somewhere, finally, the real version is on the record.",
    },
    {
      week: "Month 1",
      text: "The weight gets measured. Your weekly reports show how much you\u2019ve been carrying for everyone else, and the Life Matrix takes shape across your six domains \u2014 including the ones you\u2019ve been quietly running on empty. You see the cost nobody else thinks to ask about.",
    },
    {
      week: "Year 1",
      text: "You have a record of everything you held that nobody saw. A year of the load you carried alone \u2014 now visible, on paper, undeniable. You can see what it actually cost, show it to someone you trust, and start setting it down \u2014 instead of holding it until you break.",
    },
  ],
};

export function getTimelineWeeks(branch: Branch, _answers: Record<string, string | string[]>): TimelineWeek[] {
  return TIMELINE_WEEKS[branch] ?? TIMELINE_WEEKS.patterns;
}

// ─── Paywall Hooks (Screen 16) ──────────────────────────────────────────────

export const PAYWALL_HOOKS: Record<Branch, string> = {
  overload: "Your days don\u2019t have to disappear.",
  patterns: "The cycle breaks when you see it.",
  rumination: "Your brain deserves somewhere to put it all.",
  stuck: "This one sticks. Because it only asks for 60 seconds.",
  mask: "You don\u2019t have to hold it together here.",
};

export const PRICING_COPY: Record<Branch, string> = {
  overload: "Get your days back for less than a coffee a week.",
  patterns: "Break the cycle for less than a coffee a week.",
  rumination: "Quiet your brain for less than a coffee a week.",
  stuck: "The tool that finally sticks \u2014 for less than a coffee a week.",
  mask: "A place to be honest with yourself \u2014 for less than a coffee a week.",
};

// ─── Processing Theater Text (Screen 13) ────────────────────────────────────

export const PROCESSING_STAGES: { text: string; endSec: number }[] = [
  { text: "Analyzing your patterns\u2026", endSec: 3 },
  { text: "Mapping your blind spots\u2026", endSec: 5 },
  { text: "Identifying what to track first\u2026", endSec: 7 },
  { text: "Preparing your personalized plan\u2026", endSec: 9 },
  { text: "Your profile is ready.", endSec: 10 },
];

// ─── Paywall Dynamic Headlines (Screen 16, Section 1) ───────────────────────

/** Map raw Q5 answer to a natural-language duration phrase per branch context. */
function durPhrase(raw: string, style: "losing" | "running" | "carrying"): string {
  const v = raw.trim();
  switch (v) {
    case "A few weeks": return style === "losing" ? "weeks of lost days" : "weeks";
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
    case "overload":
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
    case "stuck":
      return noMemory
        ? "You\u2019ve been trying to fix this for longer than you can remember. Here\u2019s the thing that\u2019s different."
        : `You\u2019ve been trying to fix this for ${durPhrase(raw, "carrying")}. Here\u2019s the thing that\u2019s different.`;
    case "mask":
      return noMemory
        ? "You\u2019ve been carrying this for so long it feels normal. Here\u2019s what it looks like when something actually sees it."
        : `You\u2019ve been carrying this for ${durPhrase(raw, "carrying")}. Here\u2019s what it looks like when something actually sees it.`;
  }
}

// ─── Paywall Cost of Inaction (Screen 16, Section 2) ────────────────────────

export function getCostOfInaction(branch: Branch, answers: Record<string, string | string[]>): string {
  const raw = String(answers.shared_q5 ?? "");
  const dur = durPhrase(raw, "running");
  switch (branch) {
    case "overload":
      return "Without something catching it, the next 6 months look like the last 6. Same overwhelm. Same forgetting. Same feeling like the days blur together.";
    case "patterns":
      return `The cycle you described has been running for ${dur}. It ran last month. It\u2019ll run next month. Nothing changes until something sees it.`;
    case "rumination":
      return "The thoughts that kept you up last night will keep you up tonight. And tomorrow night. That\u2019s what no visibility looks like.";
    case "stuck":
      return "The goals you mentioned \u2014 they\u2019ll still be sitting there in 6 months. Not because you don\u2019t care, but because nothing is tracking them.";
    case "mask":
      return "You told us things look fine on the outside. Six months from now, they\u2019ll still look fine on the outside. The gap between what people see and what you carry just gets wider.";
  }
}

// ─── Create Account Screen (Screen 17) ──────────────────────────────────────

export function getCreateAccountHeadline(branch: Branch): string {
  switch (branch) {
    case "overload": return "Your patterns are already forming. Create your free account to see them.";
    case "patterns": return "Your cycles are already mapped. Create your free account to see them.";
    case "rumination": return "Your thought patterns are taking shape. Create your free account to see them.";
    case "stuck": return "Your goals are already tracked. Create your free account to see them.";
    case "mask": return "Your real story is already being written. Create your free account to see it.";
  }
}

// ─── Paywall Testimonials (outcome-specific) ────────────────────────────────

export const PAYWALL_TESTIMONIALS_V2 = [
  { quote: "I found out I mention quitting my job every Monday. I never noticed until the weekly report showed me. That one pattern changed everything.", name: "Sarah M." },
  { quote: "My therapist asked what changed. I showed her my Acuity report. She said \u2018this is what I try to do in sessions.\u2019", name: "James K." },
  { quote: "Week 3, Acuity told me I bring up my mom every time I\u2019m stressed about work. I\u2019ve been in therapy for a year and never connected those.", name: "Priya R." },
];

// Branch-matched paywall testimonial (real quotes only — no fabrication).
// TODO(copy): only patterns has a purpose-matched quote (Priya R., recurring
// relational trigger). overload maps to Sarah M. (pattern-discovery). The rest
// fall back to James K.'s universal therapist-validation quote until matched
// testimonials are sourced per branch.
const PAYWALL_TESTIMONIAL_INDEX: Record<Branch, number> = {
  overload: 0,
  patterns: 2,
  rumination: 1,
  stuck: 1,
  mask: 1,
};

export function getPaywallTestimonial(branch: Branch | null): { quote: string; name: string } {
  if (!branch) return PAYWALL_TESTIMONIALS_V2[1];
  return PAYWALL_TESTIMONIALS_V2[PAYWALL_TESTIMONIAL_INDEX[branch]];
}
