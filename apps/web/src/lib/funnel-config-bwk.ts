// ─── /start-bwk — men's (BWK-lane) funnel copy variant ──────────────────────
//
// Full copy variant of the /start funnel for the men's / BWK audience.
// Voice: direct, grounded, zero hype (mirrors the BWK content-lane voice).
// Core angle: the knowing-doing gap, the load men carry silently, and the
// "I'm good" front — reflected back, never coached.
//
// STRUCTURE RULES (same mechanics as funnel-config.ts — do not diverge,
// except STEP_ORDER, which is picked per audience):
// - Same 5 Branch keys, remapped to men's meanings:
//     overload   = too much coming at him (work / money / family logistics)
//     patterns   = same arguments, habits, moods on repeat
//     rumination = can't shut his brain off at night
//     stuck      = knowing-doing gap (knows the plan, isn't executing)
//     mask       = "I'm good" — looks fine, carrying it alone
// - Fragment maps (pain, current/future, timeline, area) are keyed by the
//   EXACT option labels defined in THIS file. If you edit a label, update
//   every map that keys off it.
// - Testimonials are REAL quotes only, reused verbatim from the shipped
//   PAYWALL_TESTIMONIALS_V2 pool (gender-neutral subset). No fabrication.
// - Brand rules: "debrief" not "brain dump"; no fixed time-of-day framing for
//   the recording habit; no recording-duration claims.

import {
  type Branch,
  type Question,
  type PainFragments,
  type ReliefFlipConfig,
  type CurrentFutureContent,
  type PatternLabels,
  type TimelineWeek,
  type FunnelVariantConfig,
  type FunnelStep,
  PAYWALL_TESTIMONIALS_V2 as DEFAULT_TESTIMONIALS,
} from "./funnel-config";

// ─── Step order (v8, 11 steps) ──────────────────────────────────────────────
//
// Men respond to a diagnosis and a plan more than to an emotional before/after.
// So this funnel drops the current-future "shift" screen that /start keeps, and
// ends the story on the Week 1 / Month 1 / Year 1 timeline right after the
// pattern result: here's what's going on, here's what changes.
const BWK_STEP_ORDER: FunnelStep[] = [
  "entry", "branch-q2", "branch-q3", "branch-q6",
  "pain", "mechanism",
  "processing", "pattern-result", "timeline",
  "create-account", "savings",
];

// ─── Entry Question (Screen 1) ──────────────────────────────────────────────

export const BWK_ENTRY_QUESTION: Question = {
  id: "entry",
  text: "What’s been eating at you lately?",
  options: [
    { label: "Too much coming at me — work, money, family, all of it", branch: "overload" },
    { label: "I keep repeating the same mistakes and arguments", branch: "patterns" },
    { label: "I can’t shut my brain off at night", branch: "rumination" },
    { label: "I know what I should be doing. I’m just not doing it.", branch: "stuck" },
    { label: "Everyone thinks I’m good. I’m not.", branch: "mask" },
  ],
};

// ─── Branch Questions (Screens 2-4) ─────────────────────────────────────────

const BWK_BRANCH_QUESTIONS: Record<Branch, [Question, Question, Question]> = {
  overload: [
    {
      id: "branch_q2",
      text: "When it’s all coming at you, what happens?",
      options: [
        { label: "I drop things I said I’d handle" },
        { label: "I lie awake going through all of it" },
        { label: "I can’t focus — I bounce between ten things" },
        { label: "I get short with the people around me" },
      ],
    },
    {
      id: "branch_q3",
      text: "What’s taking up the most space right now?",
      options: [
        { label: "Work — it never actually stops" },
        { label: "Money and everything riding on me" },
        { label: "Family logistics — I’m the one keeping track" },
        { label: "All of it — everything runs through me" },
      ],
    },
    {
      id: "branch_q4",
      text: "When something slips, what happens?",
      options: [
        { label: "Someone was counting on me and I let them down" },
        { label: "I scramble and fix it last minute" },
        { label: "It goes back on the pile for later" },
        { label: "All of the above" },
      ],
    },
  ],
  patterns: [
    {
      id: "branch_q2",
      text: "When it repeats, what does it look like?",
      options: [
        { label: "The same argument with the same person" },
        { label: "The same bad habit I keep going back to" },
        { label: "The same mood that flattens my whole week" },
        { label: "All of the above" },
      ],
    },
    {
      id: "branch_q3",
      text: "Where does it hit hardest?",
      options: [
        { label: "At home, with my partner" },
        { label: "With my kids or family" },
        { label: "At work" },
        { label: "In my own head" },
      ],
    },
    {
      id: "branch_q4",
      text: "When it starts, what do you usually do?",
      options: [
        { label: "React first, think later" },
        { label: "Go quiet and let it build" },
        { label: "Tell myself it’s fine and move on" },
      ],
    },
  ],
  rumination: [
    {
      id: "branch_q2",
      text: "When your brain won’t shut off, what’s it doing?",
      options: [
        { label: "Replaying conversations and mistakes" },
        { label: "Running through everything I haven’t done" },
        { label: "Stressing about money and what’s next" },
        { label: "All of the above" },
      ],
    },
    {
      id: "branch_q3",
      text: "When is it worst?",
      options: [
        { label: "The second I lie down" },
        { label: "Middle of the night, wide awake" },
        { label: "First thing in the morning" },
        { label: "Any time it goes quiet" },
      ],
    },
    {
      id: "branch_q4",
      text: "What do you usually do about it?",
      options: [
        { label: "Lie there and let it run" },
        { label: "Grab my phone and scroll" },
        { label: "Get up — no point lying there" },
        { label: "Try to force it down" },
      ],
    },
  ],
  stuck: [
    {
      id: "branch_q2",
      text: "What does the gap look like for you?",
      options: [
        { label: "I know the plan. I don’t execute it." },
        { label: "I start strong, then fall off in a week or two" },
        { label: "I’m grinding every day but the needle doesn’t move" },
        { label: "All of the above" },
      ],
    },
    {
      id: "branch_q3",
      text: "Where does your effort actually go?",
      options: [
        { label: "Putting out fires that aren’t mine" },
        { label: "Work that takes every hour it’s given" },
        { label: "Distractions I reach for when it’s hard" },
        { label: "Honestly, I couldn’t tell you — that’s the problem" },
      ],
    },
    {
      id: "branch_q4",
      text: "When you feel the gap, what do you do?",
      options: [
        { label: "Promise myself Monday will be different" },
        { label: "Push harder without changing anything" },
        { label: "Beat myself up about it" },
        { label: "Shrug it off — no time to stop and look" },
      ],
    },
  ],
  mask: [
    {
      id: "branch_q2",
      text: "What does it look like from the inside?",
      options: [
        { label: "Running on fumes, but nobody can tell" },
        { label: "Solid all day, wrecked when I’m alone" },
        { label: "I say ‘I’m good’ automatically now" },
        { label: "All of the above" },
      ],
    },
    {
      id: "branch_q3",
      text: "Who are you holding it together for?",
      options: [
        { label: "My partner and kids" },
        { label: "The people who count on me at work" },
        { label: "My parents — I’m the one who’s fine" },
        { label: "Everyone — I’m the guy people lean on" },
      ],
    },
    {
      id: "branch_q4",
      text: "When it gets heavy, what do you do?",
      options: [
        { label: "Push it down and get back to work" },
        { label: "Tell myself other people have it worse" },
        { label: "Numb out — screens, food, whatever works" },
        { label: "Nothing. I just carry it." },
      ],
    },
  ],
};

// ─── Shared Questions (Screen 5) ────────────────────────────────────────────

const BWK_SHARED_QUESTIONS: Question[] = [
  {
    id: "shared_q5",
    text: "How long has it been like this?",
    options: [
      // Labels "Years" / "As long as I can remember" are load-bearing:
      // getPatternLabels keys the Stuck Deep override off these exact strings.
      { label: "Days" },
      { label: "Months" },
      { label: "Years" },
      { label: "As long as I can remember" },
    ],
    normalization: "Most men sit with this for over a year before they do anything about it.",
  },
];

// ─── Branched Q6 — cost question (Screen 6) ─────────────────────────────────

const BWK_BRANCH_Q6: Record<Branch, Question> = {
  overload: {
    id: "branch_q6",
    text: "What is carrying all of it costing you most?",
    options: [
      { label: "People’s trust that I’ll handle it" },
      { label: "My edge — I used to be sharper than this" },
      { label: "Any sense of being off the clock" },
      { label: "All of the above" },
    ],
    normalization: "Naming the cost makes it real.",
  },
  patterns: {
    id: "branch_q6",
    text: "What is the repeat costing you most?",
    options: [
      { label: "My closest relationships" },
      { label: "Respect for myself" },
      { label: "My focus at work" },
      { label: "Peace — I’m always braced for the next round" },
    ],
    normalization: "Naming the cost makes it real.",
  },
  rumination: {
    id: "branch_q6",
    text: "What is the noise costing you most?",
    options: [
      { label: "My sleep" },
      { label: "My energy and focus the next day" },
      { label: "My patience with the people I care about" },
      { label: "My health" },
    ],
    normalization: "Naming the cost makes it real.",
  },
  stuck: {
    id: "branch_q6",
    text: "What is the gap costing you most?",
    options: [
      { label: "The goals I said I’d hit by now" },
      { label: "Trust in my own word" },
      { label: "Years I don’t get back" },
      { label: "All of the above" },
    ],
    normalization: "Naming the cost makes it real.",
  },
  mask: {
    id: "branch_q6",
    text: "What is holding it in costing you most?",
    options: [
      { label: "Real connection — nobody actually knows me" },
      { label: "The energy it takes to keep it up" },
      { label: "My temper — it leaks out sideways" },
      { label: "All of the above" },
    ],
    normalization: "Naming the cost makes it real.",
  },
};

// ─── Pain / Mirror (Screen 7) — answer-aware fragments ──────────────────────

const BWK_PAIN_FRAGMENTS: Record<Branch, PainFragments> = {
  overload: {
    opener: "Everything runs through you. And there’s nowhere to put any of it down.",
    q2: {
      "I drop things I said I’d handle":
        "So things get dropped — stuff you said you’d handle, gone the second the next fire starts.",
      "I lie awake going through all of it":
        "So you lie awake going through it, because letting go feels like dropping the ball.",
      "I can’t focus — I bounce between ten things":
        "So you bounce between ten things and finish none of them.",
      "I get short with the people around me":
        "So it comes out sideways — short answers, thin patience. Not because you’re angry. Because you’re full.",
    },
    q3: {
      "Work — it never actually stops":
        "Work doesn’t clock out when you do. It rides home with you.",
      "Money and everything riding on me":
        "Money, and the weight of everything riding on you — that one never goes quiet.",
      "Family logistics — I’m the one keeping track":
        "You’re the calendar, the driver, the fixer. All of it lives in your head.",
      "All of it — everything runs through me":
        "All of it, all at once — and no one to hand any of it to.",
    },
    q6: {
      "People’s trust that I’ll handle it":
        "And it’s costing you the thing that’s hardest to win back — people trusting you’ll handle it.",
      "My edge — I used to be sharper than this":
        "And it’s costing you your edge. You used to be sharper than this, and you know it.",
      "Any sense of being off the clock":
        "And it’s costing you any sense of being off the clock. You’re never actually done.",
      "All of the above":
        "And it’s costing you all of it — the trust, the edge, and any real off-switch.",
    },
    fallback: "Your head is full, and there’s nowhere to set any of it down.",
    closer: "This isn’t a discipline problem. It’s a capacity problem. Nobody can hold this much in their head. Let’s get it out of yours.",
  },
  patterns: {
    opener: "You’ve seen this one before. You know exactly how it ends — and it keeps ending that way.",
    q2: {
      "The same argument with the same person":
        "Same argument, same person, same script. Different day.",
      "The same bad habit I keep going back to":
        "Same habit you swore off, pulling you back like it never left.",
      "The same mood that flattens my whole week":
        "Same mood rolling in, flattening the week before it starts.",
      "All of the above":
        "All of it on rotation — the arguments, the habits, the moods.",
    },
    q3: {
      "At home, with my partner":
        "And it lands hardest at home — with the person you least want it to.",
      "With my kids or family":
        "And it plays out in front of your kids and family — the place you most want to get right.",
      "At work":
        "And it follows you into work. Same friction, same people.",
      "In my own head":
        "And it runs in your own head, where no one else even sees it.",
    },
    q6: {
      "My closest relationships":
        "It’s costing you the people closest to you.",
      "Respect for myself":
        "It’s costing you respect for yourself — you keep watching yourself do it again.",
      "My focus at work":
        "It’s costing you focus you can’t afford to lose.",
      "Peace — I’m always braced for the next round":
        "It’s costing you peace. You’re always braced for the next round.",
    },
    fallback: "The same cycle keeps running, and you can’t see it from inside it.",
    closer: "Here’s the thing — the blowup isn’t the pattern. The buildup is. You can’t fix what you can’t see. Let’s make it visible.",
  },
  rumination: {
    opener: "The day finally goes quiet. Your head doesn’t.",
    q2: {
      "Replaying conversations and mistakes":
        "You replay it — what you said, what you should’ve said, the version where you handled it right.",
      "Running through everything I haven’t done":
        "You run the list — everything undone, everything due, everything that’s on you.",
      "Stressing about money and what’s next":
        "You run the numbers and the what-ifs, and they never come out settled.",
      "All of the above":
        "All of it at once — the replays, the list, the what-ifs. No exit.",
    },
    q3: {
      "The second I lie down":
        "It starts the second you lie down, like it was waiting for you.",
      "Middle of the night, wide awake":
        "It wakes you in the dark and won’t let go.",
      "First thing in the morning":
        "It’s there before your alarm — the day starts heavy.",
      "Any time it goes quiet":
        "It fills every quiet moment. Silence is when it gets loud.",
    },
    q6: {
      "My sleep":
        "It’s costing you sleep. And you feel it everywhere.",
      "My energy and focus the next day":
        "It’s costing you the next day — you show up already drained.",
      "My patience with the people I care about":
        "It’s costing you patience with the people you actually care about.",
      "My health":
        "And it’s starting to cost you your health. A body that never fully rests breaks down.",
    },
    fallback: "Your brain won’t shut off, and there’s nowhere to put it all down.",
    closer: "You don’t have to solve it all tonight. You need somewhere to unload it. Let’s give your head a place to dump the day.",
  },
  stuck: {
    opener: "You already know what to do. That’s the worst part. Knowing hasn’t been the problem for a long time.",
    q2: {
      "I know the plan. I don’t execute it.":
        "The plan’s been written for months. Written isn’t the problem. Done is.",
      "I start strong, then fall off in a week or two":
        "You start strong, every time. Week two, it’s gone — and you’re back to zero.",
      "I’m grinding every day but the needle doesn’t move":
        "You’re grinding every day, and the needle doesn’t move. Effort was never the issue.",
      "All of the above":
        "You know the plan, you start it, you grind — and somehow you’re still in the same place.",
    },
    q3: {
      "Putting out fires that aren’t mine":
        "Your energy goes to putting out fires that were never yours.",
      "Work that takes every hour it’s given":
        "Your energy goes to work — and work takes every hour it’s given.",
      "Distractions I reach for when it’s hard":
        "Your energy leaks into the easy stuff — the scroll, the screen, whatever’s not the hard thing.",
      "Honestly, I couldn’t tell you — that’s the problem":
        "And honestly, you can’t even say where it goes. That’s the part that gets you.",
    },
    q6: {
      "The goals I said I’d hit by now":
        "It’s costing you the goals you said you’d hit by now.",
      "Trust in my own word":
        "It’s costing you trust in your own word. You’ve broken too many deals with yourself.",
      "Years I don’t get back":
        "It’s costing you years. They don’t come back.",
      "All of the above":
        "It’s costing you the goals, the self-trust, and the years. All three.",
    },
    fallback: "You’re moving all day and going nowhere. That gap is the problem.",
    closer: "You don’t need more discipline. You need to see where the effort’s actually going. Once you can see it, you can aim it. That’s the whole game.",
  },
  mask: {
    opener: "Everyone thinks you’re good — because you made sure of it. Nobody checks on the guy who’s got it handled.",
    q2: {
      "Running on fumes, but nobody can tell":
        "You’re running on fumes, and you’ve hidden it so well no one would guess.",
      "Solid all day, wrecked when I’m alone":
        "You’re solid all day. Then the door closes, and there’s nothing left.",
      "I say ‘I’m good’ automatically now":
        "‘I’m good’ comes out automatic now. You barely hear yourself say it.",
      "All of the above":
        "The fumes, the crash when you’re alone, ‘I’m good’ on autopilot — all of it.",
    },
    q3: {
      "My partner and kids":
        "You hold it up for your partner and kids, because they need you steady.",
      "The people who count on me at work":
        "You hold it up at work, because that’s where cracks cost the most.",
      "My parents — I’m the one who’s fine":
        "You hold it up for your parents — you’re the one who turned out fine.",
      "Everyone — I’m the guy people lean on":
        "You hold it up for everyone. You’re the guy people lean on. So who do you lean on?",
    },
    q6: {
      "Real connection — nobody actually knows me":
        "It’s costing you real connection. Nobody actually knows how you’re doing — and that’s by design. Yours.",
      "The energy it takes to keep it up":
        "It’s costing you energy. Keeping ‘I’m good’ running is a full-time job.",
      "My temper — it leaks out sideways":
        "It’s costing you your temper. What gets pushed down leaks out sideways.",
      "All of the above":
        "It’s costing you connection, energy, and your fuse. All of it.",
    },
    fallback: "You’re carrying it alone, and nobody sees what it takes.",
    closer: "You don’t have to perform here. No one’s watching. No one needs reassuring. Say the real thing once a day and see what happens.",
  },
};

// ─── Pain-screen emphasis phrases ───────────────────────────────────────────
// Must appear EXACTLY inside the assembled beats above (substring match).

const BWK_PAIN_EMPHASIS: Record<Branch, string[]> = {
  overload: [
    "nowhere to put any of it down", "gone the second the next fire starts",
    "letting go feels like dropping the ball", "finish none of them",
    "Because you’re full", "rides home with you", "never goes quiet",
    "All of it lives in your head", "no one to hand any of it to",
    "trusting you’ll handle it", "sharper than this", "never actually done",
    "a capacity problem", "out of yours",
  ],
  patterns: [
    "it keeps ending that way", "same script", "like it never left",
    "flattening the week", "on rotation", "the person you least want it to",
    "the place you most want to get right", "Same friction, same people",
    "no one else even sees it", "watching yourself do it again",
    "focus you can’t afford to lose", "braced for the next round",
    "The buildup is", "make it visible",
  ],
  rumination: [
    "Your head doesn’t", "the version where you handled it right",
    "everything that’s on you", "never come out settled", "No exit",
    "waiting for you", "won’t let go", "the day starts heavy",
    "Silence is when it gets loud", "you feel it everywhere",
    "already drained", "people you actually care about", "never fully rests",
    "dump the day",
  ],
  stuck: [
    "Knowing hasn’t been the problem", "Done is", "back to zero",
    "the needle doesn’t move", "never yours", "every hour it’s given",
    "whatever’s not the hard thing", "the part that gets you",
    "said you’d hit by now", "deals with yourself", "They don’t come back",
    "you can aim it", "the whole game",
  ],
  mask: [
    "you made sure of it", "got it handled", "no one would guess",
    "nothing left", "barely hear yourself say it", "on autopilot",
    "need you steady", "cracks cost the most", "turned out fine",
    "who do you lean on?", "by design", "a full-time job",
    "leaks out sideways", "the real thing",
  ],
};

function bwkAssemblePainCopy(
  branch: Branch,
  answers: Record<string, string | string[]>,
): string[] {
  const frag = BWK_PAIN_FRAGMENTS[branch];
  const q2 = String(answers.branch_q2 ?? "");
  const q3 = String(answers.branch_q3 ?? "");
  const q6 = String(answers.branch_q6 ?? "");
  const q2Beat = frag.q2[q2] ?? frag.fallback;
  const q3Beat = frag.q3[q3] ?? "";
  const q6Beat = frag.q6[q6] ?? "";
  return [frag.opener, q2Beat, q3Beat, q6Beat, frag.closer].filter(Boolean);
}

// ─── Relief Flip (Screen 8) ─────────────────────────────────────────────────

const BWK_RELIEF_FLIP: Record<Branch, ReliefFlipConfig> = {
  overload: {
    prompt: "Imagine it was all tracked — out of your head, nothing slipping… how would you feel?",
    options: [
      { id: "lighter", label: "Lighter — room to actually think" },
      { id: "sharp", label: "Sharp — back on my game" },
      { id: "calm", label: "Calm — not braced for the next drop" },
      { id: "present", label: "Present — actually there when I’m there" },
      { id: "all", label: "All of the above" },
    ],
  },
  patterns: {
    prompt: "Imagine the loop actually broke… how would you feel?",
    options: [
      { id: "free", label: "Free — done repeating it" },
      { id: "closer", label: "Closer — to the people it keeps costing me" },
      { id: "clear", label: "Clear — I’d finally know why it happens" },
      { id: "solid", label: "Solid — like I trust myself again" },
      { id: "all", label: "All of the above" },
    ],
  },
  rumination: {
    prompt: "Imagine your head went quiet when you wanted it to… how would you feel?",
    options: [
      { id: "rested", label: "Rested — actually sleeping again" },
      { id: "lighter", label: "Lighter — the day put down, not carried" },
      { id: "calm", label: "Calm — nothing spinning in the background" },
      { id: "sharp", label: "Sharp — running on a full tank" },
      { id: "all", label: "All of the above" },
    ],
  },
  stuck: {
    prompt: "Imagine you were actually executing — not just planning… how would you feel?",
    options: [
      { id: "momentum", label: "Momentum — my effort finally counts" },
      { id: "clear", label: "Clear — I’d know exactly where to point it" },
      { id: "proud", label: "Proud — keeping my word to myself" },
      { id: "free", label: "Free — off the treadmill for good" },
      { id: "all", label: "All of the above" },
    ],
  },
  mask: {
    prompt: "Imagine one place you didn’t have to hold it up… how would you feel?",
    options: [
      { id: "relieved", label: "Relieved — like finally exhaling" },
      { id: "honest", label: "Honest — with myself, at least" },
      { id: "lighter", label: "Lighter — not carrying it solo" },
      { id: "steady", label: "Steadier — less leaking out sideways" },
      { id: "all", label: "All of the above" },
    ],
  },
};

// ─── Current You vs Future You (Screen 9) ───────────────────────────────────

const BWK_PANEL_SUBTEXT: Record<Branch, { current: string; future: string }> = {
  overload: { current: "Everything running through you", future: "Handled, without the weight" },
  patterns: { current: "Stuck on repeat", future: "Out of the loop" },
  rumination: { current: "A head that won’t shut off", future: "Rested and clear" },
  stuck: { current: "Planning, not executing", future: "Actually moving" },
  mask: { current: "Carrying it alone", future: "One place it comes down" },
};

interface BwkCurrentFutureBank {
  header: string;
  footer: string;
  currentDefault: string[];
  futureDefault: string[];
  q2Current: Record<string, string>;
  q2Future: Record<string, string>;
  q6Current: Record<string, string>;
  q6Future: Record<string, string>;
}

const BWK_CURRENT_FUTURE: Record<Branch, BwkCurrentFutureBank> = {
  overload: {
    header: "Here’s the shift.",
    footer: "Same load. Same life. Just no longer stored in your head.",
    currentDefault: ["Things slipping through the cracks", "Never actually off the clock"],
    futureDefault: ["Nothing slips anymore", "Actually done at the end of the day"],
    q2Current: {
      "I drop things I said I’d handle": "Dropping things you said you’d handle",
      "I lie awake going through all of it": "Awake at night, running through it all",
      "I can’t focus — I bounce between ten things": "Bouncing between ten things, finishing none",
      "I get short with the people around me": "Short fuse, thin patience",
    },
    q2Future: {
      "I drop things I said I’d handle": "Nothing slips anymore",
      "I lie awake going through all of it": "It’s written down. You’re asleep.",
      "I can’t focus — I bounce between ten things": "Locked in, one thing at a time",
      "I get short with the people around me": "Steady, because there’s room again",
    },
    q6Current: {
      "People’s trust that I’ll handle it": "People double-checking your follow-through",
      "My edge — I used to be sharper than this": "Feeling duller than you used to be",
      "Any sense of being off the clock": "Never actually off the clock",
      "All of the above": "Trust, edge, and downtime all eroding",
    },
    q6Future: {
      "People’s trust that I’ll handle it": "The guy who handles it — again",
      "My edge — I used to be sharper than this": "Sharp again, on top of it",
      "Any sense of being off the clock": "Actually done at the end of the day",
      "All of the above": "Trusted, sharp, and off the clock",
    },
  },
  patterns: {
    header: "Here’s the shift.",
    footer: "Same you. Same people. Just no longer running the same script.",
    currentDefault: ["The same loops on repeat", "Braced for the next round"],
    futureDefault: ["You see it coming — and step out", "The loop finally quiet"],
    q2Current: {
      "The same argument with the same person": "Same fight, different day",
      "The same bad habit I keep going back to": "Back in the habit you swore off",
      "The same mood that flattens my whole week": "Watching the mood take the week",
      "All of the above": "The same loops on repeat",
    },
    q2Future: {
      "The same argument with the same person": "You see it coming — and step out",
      "The same bad habit I keep going back to": "You catch the pull before it takes you",
      "The same mood that flattens my whole week": "You spot the slide before it starts",
      "All of the above": "In control, not on autopilot",
    },
    q6Current: {
      "My closest relationships": "Costing the people closest to you",
      "Respect for myself": "Watching yourself do it again",
      "My focus at work": "The loop pulling focus at work",
      "Peace — I’m always braced for the next round": "Braced for the next round",
    },
    q6Future: {
      "My closest relationships": "Closer to the people who matter",
      "Respect for myself": "It was a pattern — not who you are",
      "My focus at work": "Clear-headed and present at work",
      "Peace — I’m always braced for the next round": "The loop finally quiet",
    },
  },
  rumination: {
    header: "Here’s the shift.",
    footer: "Same head. Same nights. Just nothing left to spin on.",
    currentDefault: ["The replays, the list, the what-ifs — all at once", "A head that never goes quiet"],
    futureDefault: ["The day unloaded before it can spin", "Quiet, when you want it"],
    q2Current: {
      "Replaying conversations and mistakes": "Replaying the day on a loop",
      "Running through everything I haven’t done": "Running the list in the dark",
      "Stressing about money and what’s next": "Running numbers that never settle",
      "All of the above": "The replays, the list, the what-ifs — all at once",
    },
    q2Future: {
      "Replaying conversations and mistakes": "The day put down, not replayed",
      "Running through everything I haven’t done": "The list out of your head, on record",
      "Stressing about money and what’s next": "The what-ifs named, not spinning",
      "All of the above": "The day unloaded before it can spin",
    },
    q6Current: {
      "My sleep": "Lying awake, sleep out of reach",
      "My energy and focus the next day": "Dragging through the day on empty",
      "My patience with the people I care about": "Patience running thin at home",
      "My health": "A body that never fully rests",
    },
    q6Future: {
      "My sleep": "Asleep — your head finally still",
      "My energy and focus the next day": "Running on a full tank again",
      "My patience with the people I care about": "Steady with the people who matter",
      "My health": "Rest your body actually gets",
    },
  },
  stuck: {
    header: "Here’s the shift.",
    footer: "Same effort. Same hours. Finally pointed at what counts.",
    currentDefault: ["Grinding, but the needle isn’t moving", "Goals, self-trust, and years slipping"],
    futureDefault: ["Effort landing where it counts", "Moving — on purpose"],
    q2Current: {
      "I know the plan. I don’t execute it.": "The plan sitting there, untouched",
      "I start strong, then fall off in a week or two": "Strong starts, week-two fades",
      "I’m grinding every day but the needle doesn’t move": "Grinding, but the needle isn’t moving",
      "All of the above": "Knowing, starting, grinding — still stuck",
    },
    q2Future: {
      "I know the plan. I don’t execute it.": "The plan finally in motion",
      "I start strong, then fall off in a week or two": "Still going in week six",
      "I’m grinding every day but the needle doesn’t move": "Effort landing where it counts",
      "All of the above": "Executing — not just planning",
    },
    q6Current: {
      "The goals I said I’d hit by now": "Goals stuck on ‘someday’",
      "Trust in my own word": "Breaking deals with yourself",
      "Years I don’t get back": "Years blurring past, gone",
      "All of the above": "Goals, self-trust, and years slipping",
    },
    q6Future: {
      "The goals I said I’d hit by now": "Goals you’re finally closing on",
      "Trust in my own word": "Keeping your word — and feeling it",
      "Years I don’t get back": "Time going where you’ll be glad it went",
      "All of the above": "Moving — on purpose",
    },
  },
  mask: {
    header: "Here’s the shift.",
    footer: "Same you. Same day. Just one place you don’t have to hold it up.",
    currentDefault: ["‘I’m good’ on autopilot", "Carrying all of it alone"],
    futureDefault: ["One place you tell the truth", "Lighter — nothing left to hide"],
    q2Current: {
      "Running on fumes, but nobody can tell": "On fumes, looking fine",
      "Solid all day, wrecked when I’m alone": "Solid all day, wrecked alone",
      "I say ‘I’m good’ automatically now": "‘I’m good’ on autopilot",
      "All of the above": "The full performance, every day",
    },
    q2Future: {
      "Running on fumes, but nobody can tell": "A place where the tank reads true",
      "Solid all day, wrecked when I’m alone": "Unloaded before it builds up",
      "I say ‘I’m good’ automatically now": "One place you tell the truth",
      "All of the above": "The mask down, at least somewhere",
    },
    q6Current: {
      "Real connection — nobody actually knows me": "Nobody actually knows how you’re doing",
      "The energy it takes to keep it up": "Drained from keeping it up",
      "My temper — it leaks out sideways": "It leaks out sideways",
      "All of the above": "Connection, energy, and fuse all burning",
    },
    q6Future: {
      "Real connection — nobody actually knows me": "At least one place that knows the truth",
      "The energy it takes to keep it up": "Energy back — nothing to maintain",
      "My temper — it leaks out sideways": "A longer fuse, a lighter load",
      "All of the above": "Honest, steadier, less alone",
    },
  },
};

function bwkAssembleCurrentFuture(
  branch: Branch,
  answers: Record<string, string | string[]>,
): CurrentFutureContent {
  const bank = BWK_CURRENT_FUTURE[branch];
  const q2 = String(answers.branch_q2 ?? "");
  const q6 = String(answers.branch_q6 ?? "");
  const current = [...bank.currentDefault];
  const future = [...bank.futureDefault];
  if (bank.q2Current[q2]) current[0] = bank.q2Current[q2];
  if (bank.q2Future[q2]) future[0] = bank.q2Future[q2];
  if (bank.q6Current[q6]) current[1] = bank.q6Current[q6];
  if (bank.q6Future[q6]) future[1] = bank.q6Future[q6];
  return {
    header: bank.header,
    footer: bank.footer,
    currentLabel: "You right now",
    futureLabel: "You, a few weeks in",
    currentSub: BWK_PANEL_SUBTEXT[branch].current,
    futureSub: BWK_PANEL_SUBTEXT[branch].future,
    current,
    future,
  };
}

// ─── Transformation rows (Screen 9 vertical split) ──────────────────────────

const BWK_TRANSFORMATION_ROWS: Record<Branch, [string, string][]> = {
  overload: [
    ["Everything lives in your head", "It’s tracked — your head is clear"],
    ["Dropping things, apologizing", "Nothing slips anymore"],
    ["Awake at night running the list", "It’s written down. You’re asleep."],
    ["Short fuse, thin patience", "Steady, because there’s room"],
  ],
  patterns: [
    ["Same fight, different day", "You see it coming — and step out"],
    ["Beating yourself up after", "It was a pattern. Now it’s visible."],
    ["Costing the people closest to you", "Closer to who matters"],
    ["Braced for the next round", "The loop finally quiet"],
  ],
  rumination: [
    ["Replaying the day in the dark", "Unloaded before it can spin"],
    ["Running the list all night", "Out of your head, on record"],
    ["Waking up already tired", "Waking up with a full tank"],
    ["Patience running thin", "Steady with the people who matter"],
  ],
  stuck: [
    ["The plan sits in your head", "The plan is finally in motion"],
    ["Strong starts, week-two fades", "Still going in week six"],
    ["Grinding, needle not moving", "Effort landing where it counts"],
    ["Breaking deals with yourself", "Keeping your word — and feeling it"],
  ],
  mask: [
    ["‘I’m good’ on autopilot", "One place you tell the truth"],
    ["Solid all day, wrecked alone", "Unloaded before it builds"],
    ["Nobody knows what it takes", "At least you do — on record"],
    ["It leaks out sideways", "A longer fuse, a lighter load"],
  ],
};

// ─── Pattern Labels (Screen 14) ─────────────────────────────────────────────

const BWK_PRIMARY_PATTERN: Record<Branch, string> = {
  overload: "The Overload",
  patterns: "The Loop",
  rumination: "The Night Shift",
  stuck: "The Gap",
  mask: "The Front",
};

const BWK_LOOP_LINES: Record<Branch, string> = {
  overload: "You’re holding more than one head can hold — so things slip. That’s capacity, not character.",
  patterns: "The blowup isn’t the pattern. The buildup is — and it starts earlier than you think.",
  rumination: "Your head runs at night because the day never gave it anywhere to unload.",
  stuck: "You don’t have a knowledge problem. You have a visibility problem — you can’t see where the effort goes.",
  mask: "You’ve run ‘I’m good’ so long that nobody checks anymore. That’s the cost of being the steady one.",
};

const BWK_BODY_COPY: Record<Branch, string> = {
  overload: "In a single debrief, you mentioned 7 things you were supposed to be on top of. Ripple caught all of them — and flagged 3 you’d mentioned before and still hadn’t closed. That’s the load you’ve been holding in your head.",
  patterns: "Across your debriefs, the tension started building Thursday — and the blowup landed Sunday, same as the week before. Ripple spotted the fuse, not just the explosion. That’s the loop you’ve been living in.",
  rumination: "You recorded a debrief late at night — but the thing keeping you up actually started mid-afternoon. Ripple traced it back to where it began. The noise has a source. Now you can see it.",
  stuck: "Across your debriefs, nearly all your energy went to maintenance — keeping things running — and almost none to the goals you said mattered. You’re not lazy. Your effort just never had a scoreboard.",
  mask: "You said ‘I’m good’ in three separate debriefs this week — and each of those days ranked among your lowest. Ripple caught the gap between what you say and what you’re carrying. You’ve been holding more than you let on.",
};

const BWK_AREA_DEFAULT: Record<Branch, string> = {
  overload: "Bandwidth",
  patterns: "Relationships",
  rumination: "Sleep",
  stuck: "Momentum",
  mask: "Connection",
};

const BWK_AREA_MAP: Record<Branch, Record<string, string>> = {
  overload: {
    "People’s trust that I’ll handle it": "Trust",
    "My edge — I used to be sharper than this": "Focus",
    "Any sense of being off the clock": "Recovery",
    "All of the above": "Everything",
  },
  patterns: {
    "My closest relationships": "Relationships",
    "Respect for myself": "Self-respect",
    "My focus at work": "Work",
    "Peace — I’m always braced for the next round": "Peace of mind",
  },
  rumination: {
    "My sleep": "Sleep",
    "My energy and focus the next day": "Energy",
    "My patience with the people I care about": "Relationships",
    "My health": "Health",
  },
  stuck: {
    "The goals I said I’d hit by now": "Goals",
    "Trust in my own word": "Self-trust",
    "Years I don’t get back": "Time",
    "All of the above": "Everything",
  },
  mask: {
    "Real connection — nobody actually knows me": "Connection",
    "The energy it takes to keep it up": "Energy",
    "My temper — it leaks out sideways": "Patience",
    "All of the above": "Everything",
  },
};

function bwkGetPatternLabels(branch: Branch, answers: Record<string, string | string[]>): PatternLabels {
  const primary = BWK_PRIMARY_PATTERN[branch];
  const loopLine = BWK_LOOP_LINES[branch];
  const bodyCopy = BWK_BODY_COPY[branch];
  const costAnswer = String(answers.branch_q6 ?? "");
  const mapped = BWK_AREA_MAP[branch]?.[costAnswer];
  const areaFallback = !mapped;
  const area = mapped ?? BWK_AREA_DEFAULT[branch];
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
  return { primary, secondary, area, areaFallback, bodyCopy, loopLine, secondaryVisible, stuckDeepOverride, collisionSuppressed: false };
}

// ─── Snapshot: Bottom Line (Screen 14, Section 3) ───────────────────────────

const BWK_SNAPSHOT_BOTTOM: Record<Branch, string> = {
  overload: "You’ve been the system holding everything. Ripple is where you finally offload it.",
  patterns: "The loop has a trigger you’ve never been able to see. This is where it shows itself.",
  rumination: "You don’t have to take it to bed with you. Unload it first.",
  stuck: "Your effort was never the problem. It just had nowhere to land. Now it does.",
  mask: "You’ve held it up for everyone else. This is the one place you don’t have to.",
};

// ─── Timeline (Screen 15) ───────────────────────────────────────────────────

interface BwkTimelineNode {
  week: string;
  badge?: string;
  base: string;
  q2: Record<string, string>;
  q6: Record<string, string>;
}

const BWK_TIMELINE_NODES: Record<Branch, BwkTimelineNode[]> = {
  overload: [
    {
      week: "Week 1", badge: "Starting now",
      base: "The load starts leaving your head — you say it, Ripple holds it.",
      q2: {
        "I drop things I said I’d handle": "The things you said you’d handle stop vanishing when the next fire starts.",
        "I lie awake going through all of it": "You’re not lying awake running through it — it’s written where you trust it.",
        "I can’t focus — I bounce between ten things": "The bouncing settles enough to hold one thing at a time.",
        "I get short with the people around me": "The pressure drops, and the short answers come less often.",
      },
      q6: {
        "People’s trust that I’ll handle it": "And the things people count on you for stop slipping.",
        "My edge — I used to be sharper than this": "And you start feeling sharp again.",
        "Any sense of being off the clock": "And for the first time in a while, done actually means done.",
        "All of the above": "And the trust, the edge, and the off-switch all start coming back.",
      },
    },
    {
      week: "Month 1",
      base: "You’ve stopped white-knuckling your own life.",
      q2: {
        "I drop things I said I’d handle": "The stuff that used to slip gets caught before it falls.",
        "I lie awake going through all of it": "The late-night list-running is fading — your head’s quiet enough to rest.",
        "I can’t focus — I bounce between ten things": "You move through the day locked in instead of scattered.",
        "I get short with the people around me": "You’ve got margin again, so you respond instead of snap.",
      },
      q6: {
        "People’s trust that I’ll handle it": "People have noticed you’re back to being the one who handles it.",
        "My edge — I used to be sharper than this": "You feel sharp again — not like you’re barely keeping up.",
        "Any sense of being off the clock": "Off the clock actually feels off the clock.",
        "All of the above": "Trust, edge, and real downtime — all visibly back.",
      },
    },
    {
      week: "Year 1",
      base: "You’re the guy who has it handled — without carrying all of it in your head.",
      q2: {
        "I drop things I said I’d handle": "The dropped balls are just… gone.",
        "I lie awake going through all of it": "The late-night spiral is something you used to do.",
        "I can’t focus — I bounce between ten things": "Scattered isn’t who you are anymore.",
        "I get short with the people around me": "You stay steady, even when the volume spikes.",
      },
      q6: {
        "People’s trust that I’ll handle it": "You’re the one people trust to handle it — and you do.",
        "My edge — I used to be sharper than this": "The edge is back, and it stayed.",
        "Any sense of being off the clock": "You know how to be done. That’s new.",
        "All of the above": "Trusted, sharp, and actually off the clock.",
      },
    },
  ],
  patterns: [
    {
      week: "Week 1", badge: "Starting now",
      base: "You start naming the loop instead of just living it.",
      q2: {
        "The same argument with the same person": "That same argument starts looking like a pattern, not just a bad night.",
        "The same bad habit I keep going back to": "You catch the pull toward the habit before it has you.",
        "The same mood that flattens my whole week": "You spot the mood rolling in before it takes the week.",
        "All of the above": "The arguments, the habits, the moods — they start showing their shape.",
      },
      q6: {
        "My closest relationships": "And the people closest to you feel the difference first.",
        "Respect for myself": "And you stop reading it as something wrong with you.",
        "My focus at work": "And it stops quietly pulling focus from your work.",
        "Peace — I’m always braced for the next round": "And the constant bracing starts to ease.",
      },
    },
    {
      week: "Month 1",
      base: "You catch the buildup before the blowup.",
      q2: {
        "The same argument with the same person": "The same fight stops landing the same way.",
        "The same bad habit I keep going back to": "The habit loses its automatic grip.",
        "The same mood that flattens my whole week": "The slide gets caught early — the week stays yours.",
        "All of the above": "The loops that used to run you start breaking, one by one.",
      },
      q6: {
        "My closest relationships": "You’re closer to the people it kept costing you.",
        "Respect for myself": "You’re watching yourself handle it — and that changes how you see yourself.",
        "My focus at work": "You’re present at work instead of stuck replaying it.",
        "Peace — I’m always braced for the next round": "You’re actually at rest between rounds — because there are fewer rounds.",
      },
    },
    {
      week: "Year 1",
      base: "You’re the guy who sees the pattern coming — and chooses differently.",
      q2: {
        "The same argument with the same person": "That old fight doesn’t own your nights anymore.",
        "The same bad habit I keep going back to": "The habit is something you outgrew, not something you fight.",
        "The same mood that flattens my whole week": "The mood doesn’t get to decide your week.",
        "All of the above": "The loop that ran your life just… doesn’t run it anymore.",
      },
      q6: {
        "My closest relationships": "The people who matter are close, and they stay close.",
        "Respect for myself": "You respect the guy in the mirror again.",
        "My focus at work": "You show up clear-headed and fully there.",
        "Peace — I’m always braced for the next round": "You live at ease, not braced.",
      },
    },
  ],
  rumination: [
    {
      week: "Week 1", badge: "Starting now",
      base: "You start unloading it instead of letting it pile up.",
      q2: {
        "Replaying conversations and mistakes": "The replays lose their grip once you’ve actually said the thing out loud.",
        "Running through everything I haven’t done": "The list stops running in the dark — it’s out of your head, on record.",
        "Stressing about money and what’s next": "The what-ifs get named instead of spinning.",
        "All of the above": "The replays, the list, the what-ifs — they stop piling up at once.",
      },
      q6: {
        "My sleep": "And your head isn’t fighting you when you finally get to rest.",
        "My energy and focus the next day": "And you stop starting the day already drained.",
        "My patience with the people I care about": "And there’s more patience left for the people who matter.",
        "My health": "And your body gets a break it hasn’t had in a while.",
      },
    },
    {
      week: "Month 1",
      base: "The spin gets shorter — you’ve already put it down, so it stops repeating.",
      q2: {
        "Replaying conversations and mistakes": "You replay things far less; they don’t follow you around.",
        "Running through everything I haven’t done": "The undone list stays where you put it — out of your head.",
        "Stressing about money and what’s next": "The money noise takes up less and less room.",
        "All of the above": "The whole pile-up loses its power to take over.",
      },
      q6: {
        "My sleep": "Your head lets go easier, and rest comes easier.",
        "My energy and focus the next day": "You’ve got more in the tank the next day.",
        "My patience with the people I care about": "The people around you get the better version of you.",
        "My health": "Your body’s getting the rest it was missing.",
      },
    },
    {
      week: "Year 1",
      base: "You’re the guy whose head can actually settle.",
      q2: {
        "Replaying conversations and mistakes": "The endless replays just aren’t how your head works anymore.",
        "Running through everything I haven’t done": "The list lives on record, not on a loop in your head.",
        "Stressing about money and what’s next": "You deal with what’s next in daylight — not at 3am.",
        "All of the above": "The pile-up that ran on repeat is quiet now.",
      },
      q6: {
        "My sleep": "Rest comes without a fight.",
        "My energy and focus the next day": "You wake up with energy that’s actually yours.",
        "My patience with the people I care about": "The people you care about get the full tank, not the fumes.",
        "My health": "You feel it in your body — steadier, more rested.",
      },
    },
  ],
  stuck: [
    {
      week: "Week 1", badge: "Starting now",
      base: "You start seeing where your effort actually goes.",
      q2: {
        "I know the plan. I don’t execute it.": "The gap between the plan and the follow-through finally becomes visible.",
        "I start strong, then fall off in a week or two": "You can see exactly where the fall-off happens — and what triggers it.",
        "I’m grinding every day but the needle doesn’t move": "The gap between ‘busy’ and ‘forward’ shows up in black and white.",
        "All of the above": "The knowing, the starting, the grinding — where it all leaks becomes visible.",
      },
      q6: {
        "The goals I said I’d hit by now": "And the goals you keep parking stop disappearing.",
        "Trust in my own word": "And keeping one small promise to yourself starts rebuilding the trust.",
        "Years I don’t get back": "And you stop losing whole weeks without noticing.",
        "All of the above": "And the goals, the self-trust, and the time stop slipping unseen.",
      },
    },
    {
      week: "Month 1",
      base: "You feel the difference between being busy and moving forward.",
      q2: {
        "I know the plan. I don’t execute it.": "The plan isn’t just written anymore — pieces of it are done.",
        "I start strong, then fall off in a week or two": "Week two came and went — and you’re still going.",
        "I’m grinding every day but the needle doesn’t move": "Your effort starts landing on things that actually move you.",
        "All of the above": "You’re executing on what matters, not just what’s loud.",
      },
      q6: {
        "The goals I said I’d hit by now": "The goals you kept pushing off are actually moving.",
        "Trust in my own word": "Your word to yourself is starting to mean something again.",
        "Years I don’t get back": "Your time goes toward what you’ll be glad you did.",
        "All of the above": "Goals moving, word kept, time well spent.",
      },
    },
    {
      week: "Year 1",
      base: "You’re the guy who closes the gap — the plan and the follow-through are the same thing now.",
      q2: {
        "I know the plan. I don’t execute it.": "Knowing and doing aren’t two different things for you anymore.",
        "I start strong, then fall off in a week or two": "You finish what you start — and you’ve got the track record to prove it.",
        "I’m grinding every day but the needle doesn’t move": "The grind means something now. The needle moves.",
        "All of the above": "You execute. That’s just who you are now.",
      },
      q6: {
        "The goals I said I’d hit by now": "The goals that sat on ‘someday’ are behind you or underway.",
        "Trust in my own word": "When you tell yourself you’ll do something, it gets done.",
        "Years I don’t get back": "Your time goes to what counts, and you can feel it.",
        "All of the above": "Real progress, kept promises, and time you’re proud of.",
      },
    },
  ],
  mask: [
    {
      week: "Week 1", badge: "Starting now",
      base: "You start telling the truth in one place, without editing it.",
      q2: {
        "Running on fumes, but nobody can tell": "There’s finally somewhere ‘running on fumes’ can be said out loud.",
        "Solid all day, wrecked when I’m alone": "You’ve got a place to unload before the door closes on you alone.",
        "I say ‘I’m good’ automatically now": "You stop having to say ‘I’m good’ in at least one place.",
        "All of the above": "The performing, the holding it up, the ‘I’m good’ — one place where you don’t have to.",
      },
      q6: {
        "Real connection — nobody actually knows me": "And at least one record of how you’re actually doing exists.",
        "The energy it takes to keep it up": "And keeping it up stops taking quite so much out of you.",
        "My temper — it leaks out sideways": "And less gets pushed down — so less leaks out sideways.",
        "All of the above": "And there’s a first bit of room to just be where you’re at.",
      },
    },
    {
      week: "Month 1",
      base: "The gap between ‘I’m good’ and how you actually are gets smaller.",
      q2: {
        "Running on fumes, but nobody can tell": "You’re not running on fumes in secret anymore.",
        "Solid all day, wrecked when I’m alone": "You don’t have to wait until you’re alone to put it down.",
        "I say ‘I’m good’ automatically now": "‘I’m good’ stops being the automatic answer.",
        "All of the above": "The front spends more time down than up.",
      },
      q6: {
        "Real connection — nobody actually knows me": "You know exactly where you stand — and that’s a start.",
        "The energy it takes to keep it up": "You’ve got energy back that the front used to eat.",
        "My temper — it leaks out sideways": "The fuse is longer, because less is packed behind it.",
        "All of the above": "More energy, a longer fuse, and less to maintain.",
      },
    },
    {
      week: "Year 1",
      base: "You’re the guy who doesn’t have to carry it all alone.",
      q2: {
        "Running on fumes, but nobody can tell": "Running on empty behind a straight face isn’t your life anymore.",
        "Solid all day, wrecked when I’m alone": "You’re not falling apart alone in the dark.",
        "I say ‘I’m good’ automatically now": "When you say you’re good, it’s usually true.",
        "All of the above": "The performance is over. You just get to be you.",
      },
      q6: {
        "Real connection — nobody actually knows me": "You know yourself better than you ever have — on record.",
        "The energy it takes to keep it up": "The energy that went into the front is yours again.",
        "My temper — it leaks out sideways": "Steady is your default now, not an act.",
        "All of the above": "Honest, steadier, and no longer carrying it alone.",
      },
    },
  ],
};

function bwkGetTimelineWeeks(branch: Branch, answers: Record<string, string | string[]>): TimelineWeek[] {
  const nodes = BWK_TIMELINE_NODES[branch] ?? BWK_TIMELINE_NODES.stuck;
  const q2 = String(answers.branch_q2 ?? "");
  const q6 = String(answers.branch_q6 ?? "");
  return nodes.map((n) => {
    const parts = [n.base];
    if (n.q2[q2]) parts.push(n.q2[q2]);
    if (n.q6[q6]) parts.push(n.q6[q6]);
    return { week: n.week, badge: n.badge, text: parts.join(" ") };
  });
}

// ─── Paywall + Create Account copy ──────────────────────────────────────────

const BWK_PAYWALL_HOOKS: Record<Branch, string> = {
  overload: "Your head was never meant to be the system.",
  patterns: "You can’t break what you can’t see.",
  rumination: "Unload the day. Then rest.",
  stuck: "Closing the gap starts with seeing it.",
  mask: "One place you don’t have to be the steady one.",
};

function bwkGetPaywallHeadline(branch: Branch, _answers: Record<string, string | string[]>): string {
  switch (branch) {
    case "overload": return "Your head was never built to be the whole system.";
    case "patterns": return "The loop isn’t you. It’s just a pattern you couldn’t see.";
    case "rumination": return "Your head runs at night because it has nowhere else to put it.";
    case "stuck": return "You don’t need more discipline. You need to see where the effort goes.";
    case "mask": return "You don’t have to hold it up here.";
  }
}

function bwkGetCreateAccountHeadline(branch: Branch): string {
  switch (branch) {
    case "overload": return "Let’s get it out of your head.";
    case "patterns": return "Let’s find the trigger.";
    case "rumination": return "Let’s shut the noise off.";
    case "stuck": return "Let’s close the gap.";
    case "mask": return "Let’s put it down.";
  }
}

// ─── Processing Theater (Screen 13) ─────────────────────────────────────────

const BWK_PROCESSING_STAGES: { text: string; endSec: number }[] = [
  { text: "Analyzing your answers…", endSec: 1.6 },
  { text: "Mapping where it repeats…", endSec: 3 },
  { text: "Finding what to track first…", endSec: 4.3 },
  { text: "Building your plan…", endSec: 5.4 },
  { text: "Your profile is ready.", endSec: 6 },
];

// ─── Testimonials — REAL quotes only ────────────────────────────────────────
//
// Reused verbatim from the shipped PAYWALL_TESTIMONIALS_V2 pool. The
// branch-matched quotes (indices 3-7) are women's voices with women-coded
// content, so the men's funnel uses only the gender-neutral originals:
// James K. leads (index 0 renders on MechanismScreen), then Sarah M. and
// Priya R. rotate/support. NO fabricated quotes — if we get real quotes from
// men, swap them in here.

const BWK_TESTIMONIALS = [
  DEFAULT_TESTIMONIALS[1], // James K.
  DEFAULT_TESTIMONIALS[0], // Sarah M.
  DEFAULT_TESTIMONIALS[2], // Priya R.
];

function bwkGetPaywallTestimonialPool(_branch: Branch | null): { quote: string; name: string }[] {
  return [...BWK_TESTIMONIALS];
}

// ─── Mechanism screen examples (Screen 6) ───────────────────────────────────
//
// /start's examples are women-coded ("Call the pharmacy about Mom's refill").
// Same five-card shape per branch as /start: a task, a goal, a habit
// checked off from the debrief, a mood shift, a pattern.
// Examples of what Ripple would pull out, never advice.

const BWK_MECHANISM_CONTENT: Record<Branch, { cards: string[]; insight: string }> = {
  overload: {
    cards: [
      "Send the invoice you said you\u2019d send Friday",
      "Get back to the project you keep pushing \u2014 Day 1",
      "Habit checked off: gym before work \u00B7 4 days running",
      "Stretched \u2192 Steady",
      "You mentioned 3 of these last week and still haven\u2019t closed them",
    ],
    insight: "In one debrief you named 7 things you were on the hook for. Ripple caught them all, and flagged 3 you\u2019d said before and still hadn\u2019t closed.",
  },
  patterns: {
    cards: [
      "Note what set it off before it turned into a fight",
      "Catch the buildup before the blowup \u2014 Day 1",
      "Habit checked off: walk away before it escalates \u00B7 3 days running",
      "Reactive \u2192 Aware",
      "The tension started 2 days before the argument, every time",
    ],
    insight: "The argument happened Tuesday. The tension started Sunday. Same pattern, 3 weeks in a row.",
  },
  rumination: {
    cards: [
      "Answer the email that\u2019s been sitting in your head",
      "Set the day down before it piles up \u2014 Day 1",
      "Habit checked off: phone out of the bedroom \u00B7 5 nights running",
      "Racing \u2192 Settled",
      "The late-night loop starts with something from 8 hours earlier",
    ],
    insight: "You were calmest on the days you got it out before the evening piled up.",
  },
  stuck: {
    cards: [
      "Make the one call that moves the plan forward",
      "Put an hour on the thing you keep saying you\u2019ll start \u2014 Day 1",
      "Habit checked off: first hour on the real work \u00B7 3 days running",
      "Knowing \u2192 Doing",
      "You said you\u2019d start it in 4 debriefs. Nothing on the calendar yet.",
    ],
    insight: "You mentioned the same plan in 4 debriefs this month. Every time, something else took the hour.",
  },
  mask: {
    cards: [
      "Tell one person how things actually are",
      "Check in with how you actually feel \u2014 Day 1",
      "Habit checked off: 20-minute run \u00B7 4 days running",
      "\u201CI\u2019m good\u201D \u2192 Honest",
      "You said \u2018I\u2019m good\u2019 on your lowest days. Every time.",
    ],
    insight: "In every debrief this week you got to everyone else\u2019s day before your own. Yours came last, and lowest.",
  },
};

// ─── Variant config bundle ──────────────────────────────────────────────────

export const BWK_FUNNEL_CONFIG: FunnelVariantConfig = {
  STEP_ORDER: BWK_STEP_ORDER,
  theme: "dusk",
  flowVersion: "v8-bwk",
  path: "/start-bwk",
  ENTRY_QUESTION: BWK_ENTRY_QUESTION,
  BRANCH_QUESTIONS: BWK_BRANCH_QUESTIONS,
  SHARED_QUESTIONS: BWK_SHARED_QUESTIONS,
  BRANCH_Q6: BWK_BRANCH_Q6,
  assemblePainCopy: bwkAssemblePainCopy,
  PAIN_EMPHASIS: BWK_PAIN_EMPHASIS,
  RELIEF_FLIP: BWK_RELIEF_FLIP,
  assembleCurrentFuture: bwkAssembleCurrentFuture,
  TRANSFORMATION_ROWS: BWK_TRANSFORMATION_ROWS,
  PROCESSING_STAGES: BWK_PROCESSING_STAGES,
  SNAPSHOT_BOTTOM: BWK_SNAPSHOT_BOTTOM,
  getTimelineWeeks: bwkGetTimelineWeeks,
  PAYWALL_HOOKS: BWK_PAYWALL_HOOKS,
  getPaywallHeadline: bwkGetPaywallHeadline,
  getCreateAccountHeadline: bwkGetCreateAccountHeadline,
  PAYWALL_TESTIMONIALS_V2: BWK_TESTIMONIALS,
  getPaywallTestimonialPool: bwkGetPaywallTestimonialPool,
  getPatternLabels: bwkGetPatternLabels,
  MECHANISM_CONTENT: BWK_MECHANISM_CONTENT,
};
