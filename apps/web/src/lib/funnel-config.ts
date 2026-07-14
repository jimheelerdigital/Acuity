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
    { label: "My head\u2019s too full and I keep forgetting things", branch: "overload" },
    { label: "I keep having the same fights and patterns and I don\u2019t know why", branch: "patterns" },
    { label: "My brain won\u2019t stop racing at night", branch: "rumination" },
    { label: "I\u2019m busy nonstop but I never actually get anywhere", branch: "stuck" },
    { label: "I look fine to everyone but I\u2019m barely holding on", branch: "mask" },
  ],
};

// ─── Branch Questions (Screens 2-4) ─────────────────────────────────────────

export const BRANCH_QUESTIONS: Record<Branch, [Question, Question, Question]> = {
  overload: [
    {
      id: "branch_q2",
      text: "When your head\u2019s at its fullest, what happens?",
      options: [
        { label: "I forget things I meant to do" },
        { label: "I lie awake running through my list" },
        { label: "I feel scattered and can\u2019t focus on one thing" },
        { label: "I snap or shut down from the sheer volume" },
      ],
    },
    {
      id: "branch_q3",
      text: "What\u2019s taking up the most space up there right now?",
      options: [
        { label: "Everyone else\u2019s schedules and needs" },
        { label: "Work tasks and deadlines" },
        { label: "All of the different things I need to be doing" },
        { label: "All the above \u2014 I\u2019m the one who\u2019s supposed to remember everything" },
      ],
    },
    {
      id: "branch_q4",
      text: "When something slips, what happens?",
      options: [
        { label: "I let the people around me down by forgetting" },
        { label: "I have to scramble to fix it last minute" },
        { label: "I add it back to the pile and try to get to it later" },
        { label: "All of the above" },
      ],
    },
  ],
  patterns: [
    {
      id: "branch_q2",
      text: "When you\u2019re stuck in it, what does it look like?",
      options: [
        { label: "The same argument, over and over" },
        { label: "The same mood or spiral, on repeat" },
        { label: "The same situations blowing up the same way" },
        { label: "All the above" },
      ],
    },
    {
      id: "branch_q3",
      text: "Where does the cycle hit hardest?",
      options: [
        { label: "With my partner" },
        { label: "With my family" },
        { label: "With my coworkers" },
        { label: "With my friends" },
        { label: "In my own head" },
      ],
    },
    {
      id: "branch_q4",
      text: "When it starts, what do you usually do?",
      options: [
        { label: "I react before I even think" },
        { label: "I go quiet and let it build" },
        { label: "I try to forget about it" },
      ],
    },
  ],
  rumination: [
    {
      id: "branch_q2",
      text: "When your mind won\u2019t quiet down, what\u2019s it doing?",
      options: [
        { label: "Replaying things I said or did" },
        { label: "Running through everything I still have to do" },
        { label: "Worrying about things I can\u2019t control" },
        { label: "All the above" },
      ],
    },
    {
      id: "branch_q3",
      text: "When is it the worst?",
      options: [
        { label: "The second my head hits the pillow" },
        { label: "The middle of the night, wide awake" },
        { label: "Early morning, before I even get up" },
        { label: "Any quiet moment \u2014 it fills the silence" },
      ],
    },
    {
      id: "branch_q4",
      text: "When your brain won\u2019t stop, what do you do?",
      options: [
        { label: "Lie there and let it spin" },
        { label: "Scroll my phone to drown it out" },
        { label: "Get up because I can\u2019t rest anyway" },
        { label: "Try to push it down and force sleep" },
      ],
    },
  ],
  stuck: [
    {
      id: "branch_q2",
      text: "When you say you\u2019re not getting anywhere, what do you mean?",
      options: [
        { label: "I\u2019m always busy but nothing feels like progress" },
        { label: "I end every week exhausted with nothing to show for it" },
        { label: "I keep doing everything for everyone but me" },
        { label: "All the above" },
      ],
    },
    {
      id: "branch_q3",
      text: "Where does most of your energy actually go?",
      options: [
        { label: "Everyone else\u2019s needs and schedules" },
        { label: "Work that never really ends" },
        { label: "Just keeping everything from falling apart" },
        { label: "I honestly don\u2019t know \u2014 that\u2019s the problem" },
      ],
    },
    {
      id: "branch_q4",
      text: "When you feel stuck, what do you do?",
      options: [
        { label: "Push harder and hope it changes" },
        { label: "Tell myself I\u2019ll fix it once things calm down" },
        { label: "Just keep going \u2014 there\u2019s no time to stop and think" },
        { label: "Feel bad for myself without changing anything" },
      ],
    },
  ],
  mask: [
    {
      id: "branch_q2",
      text: "What does \u2018barely holding on\u2019 look like from the inside?",
      options: [
        { label: "I\u2019m running on empty but no one can tell" },
        { label: "I keep it together all day, then fall apart alone" },
        { label: "I say \u2018I\u2019m fine\u2019 when I\u2019m really not" },
        { label: "All the above" },
      ],
    },
    {
      id: "branch_q3",
      text: "Who are you holding it together for?",
      options: [
        { label: "Myself" },
        { label: "My kids / family" },
        { label: "Everyone at work" },
        { label: "Everyone \u2014 I\u2019m the one people lean on" },
      ],
    },
    {
      id: "branch_q4",
      text: "When it gets heavy, what do you do?",
      options: [
        { label: "Push it down and keep going" },
        { label: "Tell myself others have it worse" },
        { label: "Wait until I\u2019m alone to let it out" },
        { label: "Nothing \u2014 I just carry it" },
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
      { label: "Days" },
      { label: "Months" },
      { label: "Years" },
      { label: "As long as I can remember" },
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
    text: "What is carrying all of it costing you most?",
    options: [
      { label: "People\u2019s trust in me" },
      { label: "My confidence in myself" },
      { label: "My sense of peace and calm" },
      { label: "All the above" },
    ],
    normalization: "Naming the cost makes it real.",
  },
  patterns: {
    id: "branch_q6",
    text: "What is the cycle costing you most?",
    options: [
      { label: "My closest relationships" },
      { label: "My peace of mind" },
      { label: "The way I see myself" },
      { label: "My work performance" },
    ],
    normalization: "Naming the cost makes it real.",
  },
  rumination: {
    id: "branch_q6",
    text: "What is the racing mind costing you most?",
    options: [
      { label: "My sleep" },
      { label: "My energy the next day" },
      { label: "My peace of mind" },
      { label: "My health" },
    ],
    normalization: "Naming the cost makes it real.",
  },
  stuck: {
    id: "branch_q6",
    text: "What is running in place costing you most?",
    options: [
      { label: "The goals I keep putting off" },
      { label: "My sense of purpose" },
      { label: "Time I\u2019ll never get back" },
      { label: "All the above" },
    ],
    normalization: "Naming the cost makes it real.",
  },
  mask: {
    id: "branch_q6",
    text: "What is holding it all together costing you most?",
    options: [
      { label: "My own sense of who I am" },
      { label: "The energy it takes to keep pretending I\u2019m fine" },
      { label: "My sanity" },
      { label: "All of the above" },
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
  /** Per-branch opening frame (beat 0) — sets the scene before the Q2 echo. */
  opener: string;
  /** Keyed by exact Q2 option label → sharpest pain reflection. */
  q2: Record<string, string>;
  /** Keyed by exact Q3 option label → "where it lives" amplifier. */
  q3: Record<string, string>;
  /** Keyed by exact Q6 option label → cost-specific line. */
  q6: Record<string, string>;
  /** Per-branch fallback for the Q2 beat when no Q2 fragment matches. */
  fallback: string;
  /** Per-branch closing frame — the last beat, always shown. */
  closer: string;
}

export const PAIN_FRAGMENTS: Record<Branch, PainFragments> = {
  overload: {
    opener: "You\u2019re the one who remembers. And there\u2019s no room left up there.",
    q2: {
      "I forget things I meant to do":
        "So things slip \u2014 the ones you meant to do, gone the second something louder needs you.",
      "I lie awake running through my list":
        "So you lie awake running the list, because the moment you stop is the moment you\u2019ll forget the thing that mattered.",
      "I feel scattered and can\u2019t focus on one thing":
        "So you\u2019re scattered \u2014 starting five things, finishing none, your attention spread across everything at once.",
      "I snap or shut down from the sheer volume":
        "So it comes out sideways \u2014 you snap, or go quiet, not because you\u2019re angry, but because there\u2019s simply too much to hold.",
    },
    q3: {
      "Everyone else\u2019s schedules and needs":
        "You\u2019re holding everyone else\u2019s lives \u2014 their schedules, their needs, the things only you remember.",
      "Work tasks and deadlines":
        "You\u2019re holding every deadline and open loop at once, with no off switch.",
      "All of the different things I need to be doing":
        "You\u2019re holding all of it at once \u2014 every separate thing you\u2019re supposed to be doing, stacked in one head.",
      "All the above \u2014 I\u2019m the one who\u2019s supposed to remember everything":
        "You\u2019re the one who\u2019s supposed to remember everything. So all of it lives in you \u2014 and there\u2019s no one to hand it to.",
    },
    q6: {
      "People\u2019s trust in me":
        "And it\u2019s costing you something that\u2019s hard to win back \u2014 people\u2019s trust that you\u2019ll remember.",
      "My confidence in myself":
        "And it\u2019s costing you your confidence in yourself \u2014 you used to be the one who had it handled.",
      "My sense of peace and calm":
        "And it\u2019s costing you your peace \u2014 you\u2019re always braced for the next thing to slip.",
      "All the above":
        "And it\u2019s costing you all of it \u2014 trust, confidence, and any sense of calm.",
    },
    fallback: "Your head is too full, and there\u2019s nowhere to set any of it down.",
    closer: "This isn\u2019t a discipline problem. You\u2019re holding more than any one mind was built to hold. Let\u2019s take some of it off your shoulders.",
  },
  patterns: {
    opener: "You already know how it ends. You\u2019ve watched it happen enough times to see it coming \u2014 and it happens anyway.",
    q2: {
      "The same argument, over and over":
        "It\u2019s the same argument wearing a different face. Different night, same fight.",
      "The same mood or spiral, on repeat":
        "It\u2019s the same spiral \u2014 you can feel it starting, and knowing doesn\u2019t stop it.",
      "The same situations blowing up the same way":
        "It\u2019s the same situations detonating the same way, like you\u2019re reading from a script no one gave you.",
      "All the above":
        "It\u2019s all of it \u2014 the same arguments, the same spirals, the same situations, all on repeat.",
    },
    q3: {
      "With my partner":
        "And it lands hardest with the person you most want it to be easy with.",
      "With my family":
        "And it plays out with the family you thought you\u2019d have outgrown this with.",
      "With my coworkers":
        "And it follows you into work, the same friction with the same people.",
      "With my friends":
        "And it shows up with the friends who are supposed to be the easy part.",
      "In my own head":
        "And it runs inside your own head, where there\u2019s no one else to blame for it.",
    },
    q6: {
      "My closest relationships":
        "It\u2019s costing you the closeness you actually want.",
      "My peace of mind":
        "It\u2019s costing you your peace \u2014 you\u2019re never fully at rest, waiting for the next round.",
      "The way I see myself":
        "And quietly, it\u2019s costing you the way you see yourself \u2014 like something\u2019s wrong with you.",
      "My work performance":
        "And it\u2019s bleeding into your work \u2014 the same loop pulling focus you can\u2019t afford to lose.",
    },
    fallback: "The same cycle keeps running, and you can\u2019t quite see it from inside it.",
    closer: "Here\u2019s the thing: the fight isn\u2019t the pattern. The pattern is what builds up before it. And you can\u2019t change what you can\u2019t see. Let\u2019s make it visible.",
  },
  rumination: {
    opener: "Your head hits the pillow, and your brain turns on. The day\u2019s finally quiet \u2014 so everything you didn\u2019t have time to feel shows up at once.",
    q2: {
      "Replaying things I said or did":
        "You replay it \u2014 the thing you said, the look on their face, the version where you handled it better.",
      "Running through everything I still have to do":
        "You run the list \u2014 everything undone, everything due, everything you can\u2019t afford to forget by morning.",
      "Worrying about things I can\u2019t control":
        "You circle the things you can\u2019t control, turning them over and over, getting nowhere.",
      "All the above":
        "It\u2019s all of it at once \u2014 the replays, the list, the worries \u2014 a pile-up with no exit.",
    },
    q3: {
      "The second my head hits the pillow":
        "And it starts the moment you lie down, like your mind was waiting for the lights to go out.",
      "The middle of the night, wide awake":
        "And it wakes you in the dark, wide awake with no reason and no off switch.",
      "Early morning, before I even get up":
        "And it\u2019s there before you\u2019re even up, greeting you before the day starts.",
      "Any quiet moment \u2014 it fills the silence":
        "And it floods every quiet moment, because silence is when it gets loud.",
    },
    q6: {
      "My sleep":
        "It\u2019s costing you sleep you can\u2019t get back.",
      "My energy the next day":
        "It\u2019s costing you tomorrow \u2014 you\u2019re running on empty before the day begins.",
      "My peace of mind":
        "It\u2019s costing you your peace \u2014 you can\u2019t remember the last time your mind was actually quiet.",
      "My health":
        "And it\u2019s starting to cost you your health \u2014 a body that never gets to fully rest.",
    },
    fallback: "Your mind won\u2019t stop, and there\u2019s nowhere to put it all down.",
    closer: "You don\u2019t need to solve all of it tonight. You just need somewhere to put it down. Let\u2019s give your mind a place to empty out.",
  },
  stuck: {
    opener: "You\u2019re moving all day. Busy from the moment you wake up. And somehow, you end up in the exact same place you started.",
    q2: {
      "I\u2019m always busy but nothing feels like progress":
        "You\u2019re always busy \u2014 but busy isn\u2019t the same as forward, and somewhere you started confusing the two.",
      "I end every week exhausted with nothing to show for it":
        "You end every week wrung out, and if someone asked what you actually moved forward, you\u2019d struggle to answer.",
      "I keep doing everything for everyone but me":
        "You pour it all into everyone else, and there\u2019s nothing left over to build the life you actually want.",
      "All the above":
        "You\u2019re busy, you\u2019re exhausted, and it all goes to everyone but you \u2014 every single week.",
    },
    q3: {
      "Everyone else\u2019s needs and schedules":
        "Your energy goes to everyone else\u2019s needs, on everyone else\u2019s schedule.",
      "Work that never really ends":
        "Your energy goes into work that refills the second you empty it.",
      "Just keeping everything from falling apart":
        "Your energy goes to keeping everything from falling apart \u2014 which leaves nothing for moving it forward.",
      "I honestly don\u2019t know \u2014 that\u2019s the problem":
        "And the honest truth is you\u2019re not even sure where it all goes. That\u2019s the part that scares you.",
    },
    q6: {
      "The goals I keep putting off":
        "It\u2019s costing you the goals you keep pushing to \u2018someday.\u2019",
      "My sense of purpose":
        "It\u2019s costing you your sense of purpose \u2014 the feeling that any of this is going somewhere.",
      "Time I\u2019ll never get back":
        "It\u2019s costing you time you don\u2019t get back \u2014 weeks that blur into months into years.",
      "All the above":
        "It\u2019s costing you all of it \u2014 your goals, your purpose, and time you can\u2019t get back.",
    },
    fallback: "You\u2019re busy nonstop, and none of it feels like getting anywhere.",
    closer: "You\u2019re not stuck because you\u2019re not trying. You\u2019re stuck because you can\u2019t see where all that effort is actually going. Once you can see it, you can finally point it somewhere that matters.",
  },
  mask: {
    opener: "Everyone thinks you\u2019re fine \u2014 because you made sure of it. You\u2019re the steady one, the reliable one, the one who\u2019s got it handled. And no one knows how much that\u2019s costing you.",
    q2: {
      "I\u2019m running on empty but no one can tell":
        "You\u2019re running on empty, and you\u2019ve gotten so good at hiding it that no one would ever guess.",
      "I keep it together all day, then fall apart alone":
        "You hold it together all day, and then, when the door finally closes, it all comes down.",
      "I say \u2018I\u2019m fine\u2019 when I\u2019m really not":
        "You say \u2018I\u2019m fine\u2019 so automatically you almost believe it \u2014 right up until you\u2019re alone.",
      "All the above":
        "You run on empty, keep it together all day, say you\u2019re fine \u2014 and fall apart where no one can see.",
    },
    q3: {
      "Myself":
        "You hold it together even when you\u2019re alone \u2014 you can\u2019t fully let go even with yourself.",
      "My kids / family":
        "You hold it together for your family, because they need you to be okay.",
      "Everyone at work":
        "You hold it together at work, because that\u2019s where you can\u2019t afford to crack.",
      "Everyone \u2014 I\u2019m the one people lean on":
        "You hold it together for everyone \u2014 you\u2019re the one people lean on, so who do you get to lean on?",
    },
    q6: {
      "My own sense of who I am":
        "And it\u2019s costing you the thread to who you actually are underneath the performance.",
      "The energy it takes to keep pretending I\u2019m fine":
        "And it\u2019s costing you an exhausting amount of energy \u2014 keeping up \u2018I\u2019m fine\u2019 is its own full-time job.",
      "My sanity":
        "And it\u2019s starting to cost you your sanity \u2014 you can only hold this much for so long before something gives.",
      "All of the above":
        "And it\u2019s costing you all of it \u2014 your sense of self, your energy, and your sanity.",
    },
    fallback: "You\u2019re holding it together for everyone, and no one sees what it takes.",
    closer: "You don\u2019t have to perform here. This is the one place you can set the mask down and just say the thing underneath \u2014 no one watching, no one to reassure. Let\u2019s give you somewhere to be honest.",
  },
};

// ─── Pain-screen emphasis phrases ───────────────────────────────────────────
//
// Per-branch bank of the KEY emotional phrases that appear inside the assembled
// beats. The Pain screen highlights (coral, medium weight) the single longest
// phrase from this bank that appears in each beat — one hit per line max, never
// a whole sentence. This is presentation metadata only: it does NOT alter the
// fragment copy. Centralized here so emphasis is pulled by branch key, not
// hard-coded per screen. A beat with no match simply renders un-emphasized.
export const PAIN_EMPHASIS: Record<Branch, string[]> = {
  overload: [
    "no room left up there", "something louder needs you", "the thing that mattered",
    "starting five things, finishing none", "too much to hold",
    "the things only you remember", "no off switch", "stacked in one head",
    "no one to hand it to", "people\u2019s trust", "your confidence in yourself",
    "your peace", "all of it", "more than any one mind was built to hold",
    "off your shoulders",
  ],
  patterns: [
    "and it happens anyway", "same fight", "knowing doesn\u2019t stop it",
    "a script no one gave you", "all on repeat",
    "the person you most want it to be easy with", "outgrown this with",
    "the same friction with the same people", "the easy part",
    "no one else to blame", "the closeness you actually want", "your peace",
    "something\u2019s wrong with you", "focus you can\u2019t afford to lose",
    "what builds up before it", "make it visible",
  ],
  rumination: [
    "everything you didn\u2019t have time to feel",
    "the version where you handled it better", "by morning", "getting nowhere",
    "a pile-up with no exit", "waiting for the lights to go out",
    "wide awake with no reason", "before the day starts",
    "silence is when it gets loud", "sleep you can\u2019t get back",
    "running on empty", "your peace", "your health", "a place to empty out",
  ],
  stuck: [
    "the exact same place you started", "busy isn\u2019t the same as forward",
    "nothing left over", "every single week", "everyone else\u2019s schedule",
    "refills the second you empty it", "nothing for moving it forward",
    "the part that scares you", "your sense of purpose",
    "time you don\u2019t get back", "all of it", "\u2018someday.\u2019",
    "point it somewhere that matters",
  ],
  mask: [
    "how much that\u2019s costing you", "no one would ever guess",
    "it all comes down", "right up until you\u2019re alone",
    "fall apart where no one can see", "even with yourself",
    "need you to be okay", "can\u2019t afford to crack",
    "who do you get to lean on?", "who you actually are",
    "its own full-time job", "your sanity", "your sense of self",
    "set the mask down", "somewhere to be honest",
  ],
};

/**
 * Assemble the Pain screen reflection from the user's actual answers.
 * Returns an ordered array of "beats" (short paragraphs) the component reveals
 * in sequence:
 *   [opener, Q2 echo, Q3 amplifier, Q6 cost, closer]
 * Any missing fragment is dropped (empty strings filtered), so the screen still
 * renders coherently if a branch hasn't defined a given fragment. The closer is
 * always the final, emphasized beat.
 */
export function assemblePainCopy(
  branch: Branch,
  answers: Record<string, string | string[]>,
): string[] {
  const frag = PAIN_FRAGMENTS[branch];
  const q2 = String(answers.branch_q2 ?? "");
  const q3 = String(answers.branch_q3 ?? "");
  const q6 = String(answers.branch_q6 ?? "");

  const q2Beat = frag.q2[q2] ?? frag.fallback;
  const q3Beat = frag.q3[q3] ?? "";
  const q6Beat = frag.q6[q6] ?? "";

  return [frag.opener, q2Beat, q3Beat, q6Beat, frag.closer].filter(Boolean);
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

export const RELIEF_FLIP: Record<Branch, ReliefFlipConfig> = {
  overload: {
    prompt: "Imagine your head wasn\u2019t full anymore\u2026 how would you feel?",
    options: [
      { id: "lighter", label: "Lighter \u2014 like I could finally breathe" },
      { id: "calm", label: "Calm \u2014 not braced for the next thing to drop" },
      { id: "present", label: "Present \u2014 actually here, instead of half-somewhere-else" },
      { id: "relieved", label: "Relieved \u2014 the weight finally off my shoulders" },
      { id: "all", label: "All of the above" },
    ],
  },
  patterns: {
    prompt: "Imagine the cycle finally broke\u2026 how would you feel?",
    options: [
      { id: "free", label: "Free \u2014 like the loop finally let go" },
      { id: "closer", label: "Closer \u2014 to the people it keeps pushing away" },
      { id: "clear", label: "Clear \u2014 I\u2019d finally understand why it happens" },
      { id: "at_peace", label: "At peace with myself \u2014 instead of blaming myself" },
      { id: "all", label: "All of the above" },
    ],
  },
  rumination: {
    prompt: "Imagine your mind went quiet at night\u2026 how would you feel?",
    options: [
      { id: "rested", label: "Rested \u2014 actually sleeping again" },
      { id: "lighter", label: "Lighter \u2014 like I set the day down before bed" },
      { id: "calm", label: "Calm \u2014 no spiral waiting for me in the dark" },
      { id: "clear", label: "Clear \u2014 instead of tangled up in my own head" },
      { id: "all", label: "All of the above" },
    ],
  },
  stuck: {
    prompt: "Imagine you were actually moving forward again\u2026 how would you feel?",
    options: [
      { id: "motivated", label: "Motivated \u2014 like my effort finally counts" },
      { id: "clear", label: "Clear \u2014 I\u2019d know exactly what to focus on" },
      { id: "proud", label: "Proud \u2014 actually making progress on what matters" },
      { id: "free", label: "Free \u2014 off the treadmill for good" },
      { id: "all", label: "All of the above" },
    ],
  },
  mask: {
    prompt: "Imagine you could finally take the mask off\u2026 how would you feel?",
    options: [
      { id: "relieved", label: "Relieved \u2014 like I could exhale for the first time" },
      { id: "honest", label: "Honest \u2014 with myself, for once" },
      { id: "lighter", label: "Lighter \u2014 not carrying it all alone" },
      { id: "seen", label: "Seen \u2014 even if only by me" },
      { id: "all", label: "All of the above" },
    ],
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
  header: string;
  footer: string;
  currentLabel: string;
  futureLabel: string;
  /** Short framing subtitle under each panel header (grey left / coral right). */
  currentSub: string;
  futureSub: string;
  current: string[];
  future: string[];
}

// Short framing line shown under each panel header on screen 9 — branch-specific
// so the "before/after" tone is set before the rows animate in. Left = pain
// framing (grey), right = relief framing (coral).
const PANEL_SUBTEXT: Record<Branch, { current: string; future: string }> = {
  overload: { current: "Holding it all, alone", future: "Lighter, clear, in control" },
  patterns: { current: "Stuck in the same loop", future: "Free of the cycle" },
  rumination: { current: "A mind that won\u2019t quiet", future: "Rested and clear" },
  stuck: { current: "Busy, but going nowhere", future: "Moving forward, on purpose" },
  mask: { current: "Holding it together for everyone", future: "Honest, and less alone" },
};

interface CurrentFutureBank {
  header: string;
  footer: string;
  currentLabel?: string;
  futureLabel?: string;
  /** Two-item fallback: [Q2-dimension line, Q6-dimension line]. */
  currentDefault: string[];
  futureDefault: string[];
  /** Keyed by exact Q2 label → replaces current[0] (left, pain). */
  q2Current: Record<string, string>;
  /** Keyed by exact Q2 label → replaces future[0] (right, relief). */
  q2Future: Record<string, string>;
  /** Keyed by exact Q6 label → replaces current[1] (left, pain). */
  q6Current: Record<string, string>;
  /** Keyed by exact Q6 label → replaces future[1] (right, relief). */
  q6Future: Record<string, string>;
}

const CURRENT_FUTURE: Record<Branch, CurrentFutureBank> = {
  overload: {
    header: "Here\u2019s the shift.",
    footer: "Same you. Same life. Just no longer carrying all of it alone.",
    currentDefault: ["Things keep slipping through", "Braced for the next thing to slip"],
    futureDefault: ["Nothing falls through anymore", "Calm \u2014 nothing waiting to fall"],
    q2Current: {
      "I forget things I meant to do": "Things keep slipping through",
      "I lie awake running through my list": "Awake at 2 a.m., running the list",
      "I feel scattered and can\u2019t focus on one thing": "Scattered, finishing nothing",
      "I snap or shut down from the sheer volume": "Snapping from the sheer volume",
    },
    q2Future: {
      "I forget things I meant to do": "Nothing falls through anymore",
      "I lie awake running through my list": "Resting \u2014 it\u2019s written where you trust it",
      "I feel scattered and can\u2019t focus on one thing": "Focused, one thing at a time",
      "I snap or shut down from the sheer volume": "Steady, because the pressure\u2019s off",
    },
    q6Current: {
      "People\u2019s trust in me": "People starting to doubt you\u2019ll remember",
      "My confidence in myself": "Feeling like you\u2019ve lost your grip",
      "My sense of peace and calm": "Braced for the next thing to slip",
      "All the above": "Trust, confidence, calm \u2014 all fraying",
    },
    q6Future: {
      "People\u2019s trust in me": "Someone they can count on again",
      "My confidence in myself": "Back on top of your life",
      "My sense of peace and calm": "Calm \u2014 nothing waiting to fall",
      "All the above": "Steady, trusted, and clear again",
    },
  },
  patterns: {
    header: "Here\u2019s the shift.",
    footer: "Same you. Same people. Just no longer stuck in the same loop.",
    currentDefault: ["The same loops running on repeat", "Never at rest, braced for the next round"],
    futureDefault: ["In control, not on autopilot", "At rest, the loop finally quiet"],
    q2Current: {
      "The same argument, over and over": "Same fight, different night",
      "The same mood or spiral, on repeat": "Feeling the spiral start, unable to stop",
      "The same situations blowing up the same way": "Watching it blow up the same way",
      "All the above": "The same loops running on repeat",
    },
    q2Future: {
      "The same argument, over and over": "You see it coming \u2014 and step out of it",
      "The same mood or spiral, on repeat": "You catch the spiral before it takes you",
      "The same situations blowing up the same way": "The same trigger, a different outcome",
      "All the above": "In control, not on autopilot",
    },
    q6Current: {
      "My closest relationships": "Pushing away the people you want close",
      "My peace of mind": "Never at rest, braced for the next round",
      "The way I see myself": "Wondering what\u2019s wrong with you",
      "My work performance": "The loop pulling focus from your work",
    },
    q6Future: {
      "My closest relationships": "Closer to the people who matter",
      "My peace of mind": "At rest, the loop finally quiet",
      "The way I see myself": "Kinder to yourself \u2014 it was a pattern, not a flaw",
      "My work performance": "Clear-headed, present at work again",
    },
  },
  rumination: {
    header: "Here\u2019s the shift.",
    footer: "Same mind. Same nights. Just no longer taking all of it to bed with you.",
    currentDefault: ["The replays, the list, the worries \u2014 all at once", "A mind that never goes quiet"],
    futureDefault: ["The noise let out before it piles up", "Quiet, when you want it"],
    q2Current: {
      "Replaying things I said or did": "Replaying the day on a loop",
      "Running through everything I still have to do": "Running the list in the dark",
      "Worrying about things I can\u2019t control": "Circling what you can\u2019t control",
      "All the above": "The replays, the list, the worries \u2014 all at once",
    },
    q2Future: {
      "Replaying things I said or did": "The day set down, not replayed",
      "Running through everything I still have to do": "The list out of your head, onto something you trust",
      "Worrying about things I can\u2019t control": "The worries named, not spinning",
      "All the above": "The noise let out before it piles up",
    },
    q6Current: {
      "My sleep": "Lying awake, sleep out of reach",
      "My energy the next day": "Dragging through tomorrow on empty",
      "My peace of mind": "A mind that never goes quiet",
      "My health": "A body that never fully rests",
    },
    q6Future: {
      "My sleep": "Sleeping \u2014 your mind finally still",
      "My energy the next day": "Waking up with energy again",
      "My peace of mind": "Quiet, when you want it",
      "My health": "Rest your body actually gets",
    },
  },
  stuck: {
    header: "Here\u2019s the shift.",
    footer: "Same effort. Same hours. Just finally pointed somewhere that counts.",
    currentDefault: ["Busy, drained, and stuck in place", "Goals, purpose, and time all slipping"],
    futureDefault: ["Off the treadmill, actually going somewhere", "Moving forward, on purpose"],
    q2Current: {
      "I\u2019m always busy but nothing feels like progress": "Busy all day, moving nowhere",
      "I end every week exhausted with nothing to show for it": "Wrung out, nothing to show for it",
      "I keep doing everything for everyone but me": "Pouring it all into everyone else",
      "All the above": "Busy, drained, and stuck in place",
    },
    q2Future: {
      "I\u2019m always busy but nothing feels like progress": "Busy with things that actually move you",
      "I end every week exhausted with nothing to show for it": "Ending the week with something real to show",
      "I keep doing everything for everyone but me": "Energy going to your life too",
      "All the above": "Off the treadmill, actually going somewhere",
    },
    q6Current: {
      "The goals I keep putting off": "Goals stuck on \u2018someday\u2019",
      "My sense of purpose": "Wondering what any of it is for",
      "Time I\u2019ll never get back": "Weeks blurring into months, gone",
      "All the above": "Goals, purpose, and time all slipping",
    },
    q6Future: {
      "The goals I keep putting off": "Goals you\u2019re finally moving on",
      "My sense of purpose": "A clear sense of where it\u2019s all headed",
      "Time I\u2019ll never get back": "Time going toward what matters",
      "All the above": "Moving forward, on purpose",
    },
  },
  mask: {
    header: "Here\u2019s the shift.",
    footer: "Same you. Same day. Just no longer holding all of it behind the mask.",
    currentDefault: ["Performing okay, falling apart alone", "Feeling like you\u2019re at your limit"],
    futureDefault: ["The mask down, at least somewhere", "Steadier, with room to breathe"],
    q2Current: {
      "I\u2019m running on empty but no one can tell": "Empty inside, fine on the outside",
      "I keep it together all day, then fall apart alone": "Holding it together until the door closes",
      "I say \u2018I\u2019m fine\u2019 when I\u2019m really not": "Saying \u2018I\u2019m fine\u2019 when you\u2019re not",
      "All the above": "Performing okay, falling apart alone",
    },
    q2Future: {
      "I\u2019m running on empty but no one can tell": "A place where you don\u2019t have to pretend",
      "I keep it together all day, then fall apart alone": "Somewhere to let it out before it builds",
      "I say \u2018I\u2019m fine\u2019 when I\u2019m really not": "Honest with yourself, for once",
      "All the above": "The mask down, at least somewhere",
    },
    q6Current: {
      "My own sense of who I am": "Losing the thread of who you are",
      "The energy it takes to keep pretending I\u2019m fine": "Exhausted from keeping \u2018I\u2019m fine\u2019 up",
      "My sanity": "Feeling like you\u2019re at your limit",
      "All of the above": "Self, energy, and sanity all draining",
    },
    q6Future: {
      "My own sense of who I am": "Reconnected to who you actually are",
      "The energy it takes to keep pretending I\u2019m fine": "Lighter \u2014 not spending energy hiding",
      "My sanity": "Steadier, with room to breathe",
      "All of the above": "Honest, steadier, and less alone",
    },
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

  // Row 0 echoes the Q2 tap; row 1 echoes the Q6 tap. Left = pain, right =
  // relief. Defaults are real copy, so the screen renders even if a tap has no
  // matching fragment.
  const current = [...bank.currentDefault];
  const future = [...bank.futureDefault];

  if (bank.q2Current[q2]) current[0] = bank.q2Current[q2];
  if (bank.q2Future[q2]) future[0] = bank.q2Future[q2];
  if (bank.q6Current[q6]) current[1] = bank.q6Current[q6];
  if (bank.q6Future[q6]) future[1] = bank.q6Future[q6];

  return {
    header: bank.header,
    footer: bank.footer,
    currentLabel: bank.currentLabel ?? "You right now",
    futureLabel: bank.futureLabel ?? "You, a few weeks in",
    currentSub: PANEL_SUBTEXT[branch].current,
    futureSub: PANEL_SUBTEXT[branch].future,
    current,
    future,
  };
}

// ─── Transformation rows (Screen 9 vertical split) ──────────────────────────
//
// Exactly four [drab "you now" → coral "you, a few weeks in"] pairs per branch.
// Fixed per branch so the split ALWAYS renders four rows regardless of the
// user's taps. Pulled by branch key; the screen reads left→right across each
// row so the eye watches the change happen. Left = muted grey, right = coral.
export const TRANSFORMATION_ROWS: Record<Branch, [string, string][]> = {
  overload: [
    ["Holding it all in your head", "Your head finally clear"],
    ["Lying awake running the list", "Resting, nothing lost"],
    ["Dropping things, apologizing", "Nothing falls through"],
    ["Braced for the next drop", "Calm, on top of it"],
  ],
  patterns: [
    ["Same fight, different night", "You see it coming \u2014 and step out"],
    ["Blaming yourself after", "Kinder to yourself \u2014 it\u2019s a pattern, not a flaw"],
    ["Pushing people away", "Closer to the ones who matter"],
    ["Never at rest", "The loop finally quiet"],
  ],
  rumination: [
    ["Replaying the day at 2am", "The day set down, not replayed"],
    ["Running the list in the dark", "It\u2019s out of your head, onto something you trust"],
    ["Lying awake, spinning", "Sleeping \u2014 your mind finally still"],
    ["Starting tomorrow exhausted", "Waking up with energy again"],
  ],
  stuck: [
    ["Busy all day, moving nowhere", "Busy with what actually moves you"],
    ["Wrung out, nothing to show", "Ending the week with something real"],
    ["Goals stuck on \u201csomeday\u201d", "Goals you\u2019re finally moving on"],
    ["Running in place", "Off the treadmill, going somewhere"],
  ],
  mask: [
    ["Performing okay, falling apart alone", "The mask finally down"],
    ["Saying \u201cI\u2019m fine\u201d on repeat", "Honest, for once"],
    ["Exhausted from holding it up", "Lighter, nothing to hide"],
    ["Carrying all of it alone", "Less alone, more you"],
  ],
};

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
  overload: "Cognitive Overload",
  patterns: "The Cycle",
  rumination: "The Loop",
  stuck: "The Treadmill",
  mask: "The Mask",
};

const LOOP_LINES: Record<Branch, string> = {
  overload: "You\u2019re holding more than any one mind was built to hold \u2014 so things slip, and it isn\u2019t your fault.",
  patterns: "The fight isn\u2019t the pattern \u2014 the pattern is everything that quietly builds up before it.",
  rumination: "Your mind replays at night because the day never gave it anywhere to set things down.",
  stuck: "You\u2019re not doing too little \u2014 you\u2019re spending all of it just staying in place.",
  mask: "You\u2019ve gotten so good at \u2018I\u2019m fine\u2019 that no one sees the weight you\u2019re actually carrying.",
};

// bodyCopy carries the Screen-14 snapshot — the concrete "here's what Ripple
// caught" moment that makes the pattern feel specific rather than generic.
const BODY_COPY: Record<Branch, string> = {
  overload: "In a single debrief, you mentioned 7 things you needed to remember. Ripple caught all of them \u2014 and flagged 3 you\u2019d already mentioned before and still hadn\u2019t done. This is the load you\u2019ve been carrying in your head.",
  patterns: "Across your debriefs, the tension started Sunday \u2014 and the argument landed Tuesday, the same way it did the week before. Ripple spotted the fuse, not just the explosion. This is the pattern you\u2019ve been living inside.",
  rumination: "You recorded this debrief at 10:47pm \u2014 but the thing keeping you up actually started at 2:15 that afternoon. Ripple traced the worry back to where it began. The loop has a source, and now you can see it.",
  stuck: "Across your debriefs, almost all your energy went to maintenance \u2014 keeping things running \u2014 and almost none to the goals you actually mentioned wanting. You\u2019re not doing too little. You\u2019re spending it all on staying in place.",
  mask: "You said \u2018I\u2019m fine\u2019 in three separate debriefs this week \u2014 and each of those days, your mood was among your lowest. Ripple noticed the gap between what you say and what you carry. You\u2019ve been holding more than you let on.",
};

// Per-branch default area (used when branch_q6 has no explicit area mapping).
const AREA_DEFAULT: Record<Branch, string> = {
  overload: "Peace of mind",
  patterns: "Relationships",
  rumination: "Peace of mind",
  stuck: "Momentum",
  mask: "Identity",
};

// Map each branch's Q6 option label → the "most affected area" shown on the
// pattern-result screen. Nested by branch so shared labels ("All the above",
// "My peace of mind") don't collide across branches.
const AREA_MAP: Record<Branch, Record<string, string>> = {
  overload: {
    "People\u2019s trust in me": "Trust",
    "My confidence in myself": "Confidence",
    "My sense of peace and calm": "Peace of mind",
    "All the above": "Everything",
  },
  patterns: {
    "My closest relationships": "Relationships",
    "My peace of mind": "Peace of mind",
    "The way I see myself": "Self-image",
    "My work performance": "Work",
  },
  rumination: {
    "My sleep": "Sleep",
    "My energy the next day": "Energy",
    "My peace of mind": "Peace of mind",
    "My health": "Rest",
  },
  stuck: {
    "The goals I keep putting off": "Goals",
    "My sense of purpose": "Purpose",
    "Time I\u2019ll never get back": "Time",
    "All the above": "Everything",
  },
  mask: {
    "My own sense of who I am": "Identity",
    "The energy it takes to keep pretending I\u2019m fine": "Energy",
    "My sanity": "Peace of mind",
    "All of the above": "Everything",
  },
};

export function getPatternLabels(branch: Branch, answers: Record<string, string | string[]>): PatternLabels {
  const primary = PRIMARY_PATTERN[branch];
  const loopLine = LOOP_LINES[branch];
  const bodyCopy = BODY_COPY[branch];

  // Area — from branched Q6, with a per-branch default fallback.
  const costAnswer = String(answers.branch_q6 ?? "");
  const mapped = AREA_MAP[branch]?.[costAnswer];
  const areaFallback = !mapped;
  const area = mapped ?? AREA_DEFAULT[branch];

  // Secondary — v6 has no Q9 source. Only the long-duration override applies.
  const duration = String(answers.shared_q5 ?? "");
  const isLongDuration = duration === "Years" || duration === "As long as I can remember";
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
  overload: "You\u2019ve been holding all of it in your head. Ripple is where you finally set it down.",
  patterns: "The cycle has a trigger you\u2019ve never been able to see. This is where it becomes visible.",
  rumination: "You don\u2019t have to carry it into the night. Ripple is somewhere to set it down first.",
  stuck: "Your effort was never the problem. It just never had anywhere to land. Now it does.",
  mask: "You\u2019ve held it together for everyone else. This is the one place you don\u2019t have to.",
};

// ─── Timeline Templates (Screen 15) ─────────────────────────────────────────
//
// v7: an aspirational Week 1 / Month 1 / Year 1 arc, made answer-aware with the
// SAME base + keyed-insert mechanism as the Pain (7) and Current-vs-Future (9)
// screens. Each node = a per-branch base line + an insert keyed to the user's
// Q2 (shape-of-pain) + an insert keyed to their Q6 (cost), joined into one
// natural, rising line: Week 1 = first relief, Month 1 = visible change + habit,
// Year 1 = who they've become. Inserts are self-contained sentences so any
// combination (including "all the above") reads cleanly. Avoids the removed Life
// Matrix, recording-duration claims, medical claims, and bedtime-ritual framing.

export interface TimelineWeek {
  week: string;
  text: string;
  badge?: string;
}

interface TimelineNode {
  week: string;
  badge?: string;
  base: string;
  /** Keyed by exact Q2 option label → shape-of-pain insert for this node. */
  q2: Record<string, string>;
  /** Keyed by exact Q6 option label → cost insert for this node. */
  q6: Record<string, string>;
}

const TIMELINE_NODES: Record<Branch, TimelineNode[]> = {
  overload: [
    {
      week: "Week 1", badge: "Starting now",
      base: "The load starts leaving your head \u2014 you say it, Ripple holds it.",
      q2: {
        "I forget things I meant to do": "The things you meant to do stop vanishing the second something louder shows up.",
        "I lie awake running through my list": "You\u2019re not lying awake running the list \u2014 it\u2019s written where you trust it.",
        "I feel scattered and can\u2019t focus on one thing": "The scatter settles enough to hold one thing at a time.",
        "I snap or shut down from the sheer volume": "The pressure eases, so you\u2019re not snapping from the sheer volume of it.",
      },
      q6: {
        "People\u2019s trust in me": "And the small things people count on you for stop slipping.",
        "My confidence in myself": "And you start to feel like you\u2019ve got a grip again.",
        "My sense of peace and calm": "And there\u2019s a first flicker of calm.",
        "All the above": "And trust, confidence, and calm all start to steady.",
      },
    },
    {
      week: "Month 1",
      base: "You\u2019ve stopped white-knuckling your own life.",
      q2: {
        "I forget things I meant to do": "The things that used to slip now get caught before they fall.",
        "I lie awake running through my list": "The 2am list-running is fading, and your head\u2019s quiet enough to rest.",
        "I feel scattered and can\u2019t focus on one thing": "You move through the day focused instead of frayed.",
        "I snap or shut down from the sheer volume": "You\u2019ve got margin again, so you respond instead of react.",
      },
      q6: {
        "People\u2019s trust in me": "People have noticed you\u2019re back to being the one they can count on.",
        "My confidence in myself": "You feel capable again, not like you\u2019re barely keeping up.",
        "My sense of peace and calm": "Bracing for the next dropped ball isn\u2019t your default anymore.",
        "All the above": "Trust, confidence, and calm are visibly coming back.",
      },
    },
    {
      week: "Year 1",
      base: "You\u2019re the person who has it handled \u2014 without carrying all of it in your head.",
      q2: {
        "I forget things I meant to do": "The dropped balls are just\u2026 gone.",
        "I lie awake running through my list": "The 2am panic is something you used to do.",
        "I feel scattered and can\u2019t focus on one thing": "Scattered isn\u2019t who you are anymore.",
        "I snap or shut down from the sheer volume": "You stay steady, even when the volume spikes.",
      },
      q6: {
        "People\u2019s trust in me": "You\u2019re the one people trust to remember \u2014 and you do.",
        "My confidence in myself": "You trust yourself again.",
        "My sense of peace and calm": "Calm is your baseline now, not a rare good day.",
        "All the above": "Trusted, sure of yourself, and genuinely calm.",
      },
    },
  ],
  patterns: [
    {
      week: "Week 1", badge: "Starting now",
      base: "You start naming the cycle instead of just living it.",
      q2: {
        "The same argument, over and over": "That same fight starts to look like a pattern, not just a bad night.",
        "The same mood or spiral, on repeat": "You catch the spiral starting instead of only noticing once you\u2019re in it.",
        "The same situations blowing up the same way": "You see the setup before the same situation blows up again.",
        "All the above": "The arguments, the spirals, the blow-ups \u2014 they start to show their shape.",
      },
      q6: {
        "My closest relationships": "And the people closest to you feel the difference first.",
        "My peace of mind": "And the constant bracing for the next round begins to ease.",
        "The way I see myself": "And you stop reading it as something wrong with you.",
        "My work performance": "And it stops quietly pulling focus from your work.",
      },
    },
    {
      week: "Month 1",
      base: "You catch the buildup before the blowup.",
      q2: {
        "The same argument, over and over": "The same fight stops landing the same way.",
        "The same mood or spiral, on repeat": "You step out of the spiral before it takes the whole evening.",
        "The same situations blowing up the same way": "The same trigger starts leading somewhere different.",
        "All the above": "The loops that used to run you start breaking, one by one.",
      },
      q6: {
        "My closest relationships": "You\u2019re closer to the people you kept pushing away.",
        "My peace of mind": "You\u2019re actually at rest between rounds \u2014 because the rounds are fewer.",
        "The way I see myself": "You\u2019re kinder to yourself; it was a pattern, not a flaw.",
        "My work performance": "You\u2019re present at work again instead of stuck replaying it.",
      },
    },
    {
      week: "Year 1",
      base: "You\u2019re the person who sees the pattern coming \u2014 and chooses differently.",
      q2: {
        "The same argument, over and over": "That old fight doesn\u2019t own your nights anymore.",
        "The same mood or spiral, on repeat": "The spiral doesn\u2019t get to decide how you feel.",
        "The same situations blowing up the same way": "Same triggers, new outcomes \u2014 every time.",
        "All the above": "The cycle that ran your life just\u2026 doesn\u2019t run it anymore.",
      },
      q6: {
        "My closest relationships": "The people who matter are close, and they stay close.",
        "My peace of mind": "You live at rest, not braced for the next round.",
        "The way I see myself": "You see yourself clearly \u2014 no flaw, just a pattern you outgrew.",
        "My work performance": "You show up clear-headed and fully present.",
      },
    },
  ],
  rumination: [
    {
      week: "Week 1", badge: "Starting now",
      base: "You start getting it out of your head instead of letting it pile up.",
      q2: {
        "Replaying things I said or did": "The replays lose their grip once you\u2019ve actually said the thing out loud.",
        "Running through everything I still have to do": "The list stops running in the dark \u2014 it\u2019s out of your head and somewhere you trust.",
        "Worrying about things I can\u2019t control": "The what-ifs get named instead of spinning.",
        "All the above": "The replays, the list, the worries \u2014 they stop piling up all at once.",
      },
      q6: {
        "My sleep": "And your mind isn\u2019t fighting you when you finally get to rest.",
        "My energy the next day": "And you\u2019re not starting the day already drained.",
        "My peace of mind": "And there\u2019s a first stretch of quiet.",
        "My health": "And your body gets a break it hasn\u2019t had in a while.",
      },
    },
    {
      week: "Month 1",
      base: "The loop gets shorter \u2014 you\u2019ve already set it down, so it stops repeating.",
      q2: {
        "Replaying things I said or did": "You replay things far less; they don\u2019t follow you around.",
        "Running through everything I still have to do": "The undone list stays out of your head, where you put it.",
        "Worrying about things I can\u2019t control": "The worries you can\u2019t control take up less and less room.",
        "All the above": "The whole pile-up loses its power to take over.",
      },
      q6: {
        "My sleep": "Your mind lets go more easily, and rest comes easier.",
        "My energy the next day": "You\u2019ve got more in the tank the next day.",
        "My peace of mind": "Quiet stops being rare.",
        "My health": "Your body\u2019s getting the rest it was missing.",
      },
    },
    {
      week: "Year 1",
      base: "You\u2019re the person whose mind can actually settle.",
      q2: {
        "Replaying things I said or did": "The endless replays just aren\u2019t how your mind works anymore.",
        "Running through everything I still have to do": "The list lives somewhere you trust, not on a loop in your head.",
        "Worrying about things I can\u2019t control": "You\u2019ve made peace with what you can\u2019t control.",
        "All the above": "The pile-up that ran on repeat is quiet now.",
      },
      q6: {
        "My sleep": "Rest comes without a fight.",
        "My energy the next day": "You wake up with energy that\u2019s actually yours.",
        "My peace of mind": "A quiet mind is your normal now.",
        "My health": "You feel it in your body \u2014 steadier, more rested.",
      },
    },
  ],
  stuck: [
    {
      week: "Week 1", badge: "Starting now",
      base: "You start seeing where your energy actually goes.",
      q2: {
        "I\u2019m always busy but nothing feels like progress": "The gap between \u2018busy\u2019 and \u2018forward\u2019 finally becomes visible.",
        "I end every week exhausted with nothing to show for it": "You can see why the week left you empty-handed.",
        "I keep doing everything for everyone but me": "You notice how little of it ever came back to your own life.",
        "All the above": "The busy, the burnout, the everyone-but-you \u2014 it all comes into view.",
      },
      q6: {
        "The goals I keep putting off": "And the goals you keep parking stop disappearing.",
        "My sense of purpose": "And there\u2019s a first sense that this is going somewhere.",
        "Time I\u2019ll never get back": "And you stop losing whole weeks without noticing.",
        "All the above": "And your goals, your purpose, and your time stop slipping unseen.",
      },
    },
    {
      week: "Month 1",
      base: "You feel the difference between being busy and moving forward.",
      q2: {
        "I\u2019m always busy but nothing feels like progress": "Your effort starts landing on things that actually move you.",
        "I end every week exhausted with nothing to show for it": "The week ends with something real to show for it.",
        "I keep doing everything for everyone but me": "Some of your energy finally goes to your own life.",
        "All the above": "You\u2019re busy with what matters, not just what\u2019s loud.",
      },
      q6: {
        "The goals I keep putting off": "The goals you kept putting off are actually moving.",
        "My sense of purpose": "There\u2019s a clear sense of what it\u2019s all for.",
        "Time I\u2019ll never get back": "Your time goes toward what you\u2019ll be glad you did.",
        "All the above": "Goals moving, purpose clear, time well spent.",
      },
    },
    {
      week: "Year 1",
      base: "You\u2019re the person who\u2019s off the treadmill and actually going somewhere.",
      q2: {
        "I\u2019m always busy but nothing feels like progress": "Busy finally means forward for you.",
        "I end every week exhausted with nothing to show for it": "You end weeks with something built, not just survived.",
        "I keep doing everything for everyone but me": "Your own life gets your energy too.",
        "All the above": "You\u2019re moving, on purpose, on your terms.",
      },
      q6: {
        "The goals I keep putting off": "The goals that sat on \u2018someday\u2019 are behind you or underway.",
        "My sense of purpose": "You know exactly where all this is headed.",
        "Time I\u2019ll never get back": "Your time goes to what counts, and you can feel it.",
        "All the above": "Real progress, real purpose, and time you\u2019re proud of.",
      },
    },
  ],
  mask: [
    {
      week: "Week 1", badge: "Starting now",
      base: "You start telling the truth in one place, without editing it.",
      q2: {
        "I\u2019m running on empty but no one can tell": "You finally have somewhere the \u2018running on empty\u2019 can be said out loud.",
        "I keep it together all day, then fall apart alone": "You\u2019ve got a place to let it out before the door closes on you alone.",
        "I say \u2018I\u2019m fine\u2019 when I\u2019m really not": "You stop having to say \u2018I\u2019m fine\u2019 in at least one place.",
        "All the above": "The performing, the holding it together, the \u2018I\u2019m fine\u2019 \u2014 one place where you don\u2019t have to.",
      },
      q6: {
        "My own sense of who I am": "And you start to hear your own voice under the performance again.",
        "The energy it takes to keep pretending I\u2019m fine": "And keeping up \u2018I\u2019m fine\u2019 stops taking quite so much out of you.",
        "My sanity": "And you get a little room to breathe.",
        "All of the above": "And there\u2019s a first bit of room to just be yourself.",
      },
    },
    {
      week: "Month 1",
      base: "The gap between \u2018I\u2019m fine\u2019 and how you actually feel gets smaller.",
      q2: {
        "I\u2019m running on empty but no one can tell": "You\u2019re not running on empty in secret anymore.",
        "I keep it together all day, then fall apart alone": "You don\u2019t have to wait until you\u2019re alone to let it out.",
        "I say \u2018I\u2019m fine\u2019 when I\u2019m really not": "\u2018I\u2019m fine\u2019 stops being the automatic answer.",
        "All the above": "The mask spends more time down than up.",
      },
      q6: {
        "My own sense of who I am": "You feel more like yourself and less like a performance.",
        "The energy it takes to keep pretending I\u2019m fine": "You\u2019ve got energy back that the pretending used to eat.",
        "My sanity": "You feel steadier, with more room to breathe.",
        "All of the above": "You feel more yourself, with energy and room to breathe.",
      },
    },
    {
      week: "Year 1",
      base: "You\u2019re the person who doesn\u2019t have to hold it all together alone.",
      q2: {
        "I\u2019m running on empty but no one can tell": "Running on empty behind a smile isn\u2019t your life anymore.",
        "I keep it together all day, then fall apart alone": "You\u2019re not falling apart alone in the dark.",
        "I say \u2018I\u2019m fine\u2019 when I\u2019m really not": "You say how you actually are \u2014 and it\u2019s usually true.",
        "All the above": "The performance is over; you just get to be you.",
      },
      q6: {
        "My own sense of who I am": "You know who you are underneath \u2014 and you like her.",
        "The energy it takes to keep pretending I\u2019m fine": "The energy that went into hiding is yours again.",
        "My sanity": "You feel like yourself, steady and clear.",
        "All of the above": "Honest, steadier, and no longer carrying it alone.",
      },
    },
  ],
};

/**
 * Assemble the answer-aware timeline. Same mechanism as assemblePainCopy /
 * assembleCurrentFuture: each node is a branch base line + an insert keyed to
 * the user's Q2 tap + an insert keyed to their Q6 tap, joined into one line.
 * Defaults gracefully to just the base if a tap has no matching insert, so
 * every node always renders a complete, natural line.
 */
export function getTimelineWeeks(branch: Branch, answers: Record<string, string | string[]>): TimelineWeek[] {
  const nodes = TIMELINE_NODES[branch] ?? TIMELINE_NODES.patterns;
  const q2 = String(answers.branch_q2 ?? "");
  const q6 = String(answers.branch_q6 ?? "");

  return nodes.map((n) => {
    const parts = [n.base];
    if (n.q2[q2]) parts.push(n.q2[q2]);
    if (n.q6[q6]) parts.push(n.q6[q6]);
    return { week: n.week, badge: n.badge, text: parts.join(" ") };
  });
}

// ─── Paywall Hooks (Screen 16) ──────────────────────────────────────────────

// Eyebrow line above the paywall headline (small, sets the thread).
export const PAYWALL_HOOKS: Record<Branch, string> = {
  overload: "The load finally has somewhere to go.",
  patterns: "The cycle breaks when you can see it.",
  rumination: "Your mind deserves somewhere to set it down.",
  stuck: "Busy and forward aren\u2019t the same thing.",
  mask: "One place you don\u2019t have to perform.",
};

// Subhead directly under the paywall headline (spec copy, per branch).
export const PAYWALL_SUBHEAD: Record<Branch, string> = {
  overload: "Put the list down. Ripple remembers so you don\u2019t have to.",
  patterns: "See what keeps setting it off \u2014 and finally break the cycle.",
  rumination: "Give it somewhere to put everything down \u2014 and finally rest.",
  stuck: "See where your effort actually goes \u2014 and point it somewhere that matters.",
  mask: "A private place to set the mask down and finally be honest.",
};

export const PRICING_COPY: Record<Branch, string> = {
  overload: "Stop white-knuckling your mental to-do list \u2014 for less than a coffee a month.",
  patterns: "Break the cycle for less than a coffee a week.",
  rumination: "A quiet mind at night \u2014 for less than a coffee a month.",
  stuck: "Stop running in place \u2014 for less than a coffee a month.",
  mask: "A place to be honest \u2014 for less than a coffee a month.",
};

// ─── Processing Theater Text (Screen 13) ────────────────────────────────────

export const PROCESSING_STAGES: { text: string; endSec: number }[] = [
  { text: "Analyzing your patterns\u2026", endSec: 3 },
  { text: "Mapping your blind spots\u2026", endSec: 5 },
  { text: "Identifying what to track first\u2026", endSec: 7 },
  { text: "Preparing your personalized plan\u2026", endSec: 9 },
  { text: "Your profile is ready.", endSec: 10 },
];

// ─── Paywall Headline (Screen 16, Section 1) ────────────────────────────────
//
// Fixed per-branch headlines (spec). Kept as a function returning by branch so
// callers don't change; the answers arg is retained for signature stability.

export function getPaywallHeadline(branch: Branch, _answers: Record<string, string | string[]>): string {
  switch (branch) {
    case "overload": return "Your head was never built to hold all of this.";
    case "patterns": return "The pattern isn\u2019t you. It\u2019s just a loop you couldn\u2019t see.";
    case "rumination": return "Your mind won\u2019t stop because it\u2019s afraid to let go.";
    case "stuck": return "Busy isn\u2019t the same as forward. Let\u2019s find the difference.";
    case "mask": return "You don\u2019t have to hold it together here.";
  }
}

// ─── Paywall Cost of Inaction (Screen 16, Section 2) ────────────────────────

export function getCostOfInaction(branch: Branch, _answers: Record<string, string | string[]>): string {
  switch (branch) {
    case "overload": return "Every day you carry it all is another day something slips through.";
    case "patterns": return "Left alone, cycles don\u2019t fade. They dig deeper.";
    case "rumination": return "Every night it spins is another day you start already tired.";
    case "stuck": return "Every week on the treadmill is a week you don\u2019t get back.";
    case "mask": return "The longer you hold it in, the heavier the mask gets.";
  }
}

// ─── Create Account Screen (Screen 17) ──────────────────────────────────────

export function getCreateAccountHeadline(branch: Branch): string {
  switch (branch) {
    case "overload": return "Let\u2019s get it out of your head.";
    case "patterns": return "Let\u2019s name the cycle.";
    case "rumination": return "Let\u2019s quiet the noise.";
    case "stuck": return "Let\u2019s get you moving forward.";
    case "mask": return "Let\u2019s set the mask down.";
  }
}

// ─── Paywall Testimonials (outcome-specific) ────────────────────────────────

export const PAYWALL_TESTIMONIALS_V2 = [
  // 0-2: original pool. MechanismScreen renders index [0] — do NOT reorder.
  { quote: "I found out I mention quitting my job every Monday. I never noticed until the weekly report showed me. That one pattern changed everything.", name: "Sarah M." },
  { quote: "My therapist asked what changed. I showed her my Ripple report. She said \u2018this is what I try to do in sessions.\u2019", name: "James K." },
  { quote: "Week 3, Ripple told me I bring up my mom every time I\u2019m stressed about work. I\u2019ve been in therapy for a year and never connected those.", name: "Priya R." },
  // 3-7: branch-matched quotes (spec, one per branch).
  { quote: "It felt like I had 47 tabs open in my brain at all times. Work stuff, kid stuff, my mom\u2019s appointment, bills, groceries. Ripple gave me a place to dump it all without organizing first. That alone felt like breathing again.", name: "Monica R." },
  { quote: "I thought my partner and I were fighting about different things every week. Ripple helped me see it was actually the same pattern repeating: I was overloaded, didn\u2019t ask for help, then exploded when he didn\u2019t notice. That insight changed the conversation.", name: "Jennifer H." },
  { quote: "At night, my brain used to replay everything: what I forgot, what I said wrong, what I still needed to do. Ripple gave me a way to get it out before bed. I didn\u2019t need to solve everything. I just needed somewhere to put it.", name: "Megan R." },
  { quote: "I was constantly busy but never felt like I was moving forward. Ripple helped me see that most of my energy was going to maintenance, not progress. That insight was uncomfortable, but it was exactly what I needed.", name: "Stephanie K." },
  { quote: "Everyone thinks I have it together because I\u2019m the reliable one. Ripple is the one place where I don\u2019t have to perform. I can say the thing underneath the thing.", name: "Sarah J." },
];

// Branch-matched paywall testimonial (real quotes only — no fabrication).
const PAYWALL_TESTIMONIAL_INDEX: Record<Branch, number> = {
  overload: 3, // Monica R.
  patterns: 4, // Jennifer H.
  rumination: 5, // Megan R.
  stuck: 6, // Stephanie K.
  mask: 7, // Sarah J.
};

export function getPaywallTestimonial(branch: Branch | null): { quote: string; name: string } {
  if (!branch) return PAYWALL_TESTIMONIALS_V2[1];
  return PAYWALL_TESTIMONIALS_V2[PAYWALL_TESTIMONIAL_INDEX[branch]];
}

// Popup "What our users say" pool: 3 REAL quotes per branch (no fabrication).
// Leads with the branch-matched quote, then two of the strongest generic reals.
// Index 2 (Priya R.) and index 1 (James K.) are the two social-proof-strongest
// of the original pool; every trio starts with the branch's own voice.
export function getPaywallTestimonialPool(branch: Branch | null): { quote: string; name: string }[] {
  const lead = getPaywallTestimonial(branch);
  const support = [PAYWALL_TESTIMONIALS_V2[2], PAYWALL_TESTIMONIALS_V2[1]];
  // De-dupe in case a branch ever maps onto a generic index.
  return [lead, ...support].filter(
    (t, i, arr) => arr.findIndex((x) => x.name === t.name) === i,
  ).slice(0, 3);
}
