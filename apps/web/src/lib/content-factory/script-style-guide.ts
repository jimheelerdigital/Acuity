/**
 * Content Factory — the canonical VIRAL SCRIPT STYLE GUIDE for story and
 * calm video scripts (2026-08-21, provided verbatim-in-spirit by Keenan).
 *
 * This is audience-building content, NOT ads: no Ripple, no Acuity, no
 * app, no AI, no journaling, no selling — ever. The goal is that a woman
 * 35-55 carrying everyone's load watches and thinks "this account
 * understands me." Scripts follow HOOK → SCENE → TRUTH → REFRAME →
 * soft FOLLOWER CTA, rotate across five core pain branches, and aim to
 * sound uncomfortably accurate rather than beautiful.
 *
 * ambient-video.ts embeds SCRIPT_STYLE_GUIDE in its system prompt and
 * picks one PAIN_BRANCH per run for variety.
 */

export interface PainBranch {
  key: string;
  theme: string;
  truth: string;
}

/** The five core pain branches — one is assigned per script for variety. */
export const PAIN_BRANCHES: PainBranch[] = [
  {
    key: "mental overload",
    theme: "She is exhausted from thinking about everything and finishing nothing.",
    truth:
      "She is not tired because she did too little. She is tired because she is tracking too much.",
  },
  {
    key: "busy but not moving",
    theme:
      "She is always doing something but does not feel like she is moving forward.",
    truth:
      "She is confusing motion with progress because her life is filled with maintenance tasks.",
  },
  {
    key: "repeating patterns",
    theme: "She keeps having the same fights, same stress, same emotional loops.",
    truth:
      "The problem is not that she lacks awareness. Awareness without space becomes another thing to feel guilty about.",
  },
  {
    key: "knowing without acting",
    theme: "She knows what she should do, but cannot seem to do it.",
    truth:
      "She does not need more advice. She needs fewer invisible demands draining her ability to act.",
  },
  {
    key: "planning instead of progress",
    theme:
      "She keeps planning, organizing, rewriting lists, and starting systems.",
    truth:
      "Planning feels safe because action requires energy, clarity, and emotional room she does not currently have.",
  },
];

export function pickPainBranch(): PainBranch {
  return PAIN_BRANCHES[Math.floor(Math.random() * PAIN_BRANCHES.length)];
}

/**
 * The distilled style guide, ready to drop into a system prompt. Keep
 * edits faithful to Keenan's 2026-08-21 guide — it is the source of
 * truth for who she is, what stops her scroll, and what is banned.
 */
export const SCRIPT_STYLE_GUIDE = `WHO SHE IS: a woman in midlife (35-55) who looks capable on the outside but feels overwhelmed inside. She is carrying work, kids, partner, aging parents, health, friendships, money, household logistics, and everyone else's needs in her head. She is not lazy. She is not disorganized. She is OVERLOADED. She's become the person who remembers everything, notices everything, anticipates everything, and absorbs everyone else's needs. She says "I don't mind" so often she's started losing touch with what she actually wants. Somewhere along the way, she started disappearing from her own life.

EMOTIONAL TERRITORY — write from the private thoughts she rarely says out loud:
"I can't keep doing this." / "I'm doing everything all day, so why do I still feel behind?" / "There are too many tabs open in my brain." / "I look fine to everyone, but I'm barely holding on." / "I keep having the same week in different clothes." / "I don't even know what I want anymore." / "I'm tired of being the person who remembers." / "I'm not mad about the dishes. I'm mad that nobody notices the load." / "I used to have preferences." / "I keep saying I'm fine because explaining would take too much energy."

THE REACTION YOU'RE ENGINEERING: "I feel seen." / "This is exactly me." / "I'm sending this to my husband." / "How did you know?" / "I thought I was the only one." / "This made me cry." / "Following immediately." If the script wouldn't trigger one of those, rewrite it.

HOOKS — the first line names a private, SPECIFIC emotional truth. The register (create original ones, never copy):
- "At some point, being easygoing became another way to disappear."
- "You're not tired because you did too little. You're tired because you're tracking too much."
- "You're not mad about the dishes. You're mad that nobody noticed you were drowning."
- "One day you stopped having favorites because it was easier than needing anything."
- "You're not forgetful. Your brain is full."
- "The hardest part of being the reliable one is that nobody checks if you're okay."
- "Sometimes burnout looks like being very calm while slowly disappearing."
NEVER hooks like "Are you overwhelmed?", "Do you feel stressed?", "Self-care is important", "Women carry so much", "You deserve to put yourself first", "Life can be hard sometimes" — generic questions and platitudes are dead on arrival.

GROUND IT IN A REAL MOMENT — one concrete daily-life scene she recognizes, like: sitting in the car after snapping at someone; standing in the kitchen after everyone has gone to bed; lying awake replaying the day; saying "I don't mind" at a restaurant even though she used to have favorites; opening the fridge and forgetting why; crying over one small inconvenience because it was the final straw; realizing she only talks to her partner about logistics; getting annoyed when someone asks "what's wrong?" because the answer is too big; scrolling her phone because choosing something she actually wants feels impossible; being praised as "so strong" while privately wishing someone would help.

TONE: intimate, emotionally precise, grounded, quietly powerful, conversational, direct, specific, validating without being cheesy. It should feel like a private thought said out loud. NEVER sound like: a therapist giving advice, a wellness influencer, a productivity coach, a motivational speaker, a brand selling software, generic self-care content, or poetic Instagram fluff. Do not try to sound beautiful — try to sound UNCOMFORTABLY ACCURATE. The writing can be simple; the truth should be sharp.

HARD BANS: never mention Ripple, Acuity, any app, AI, journaling, or any product. No selling, no product CTA of any kind ("download", "try the app", "free trial", "click the link", "journal about it" — all banned). The trust comes before any product ever does.

THE CLOSING CTA: the script's LAST line is exactly ONE soft audience-building ask, in the same quiet voice — never a product CTA. The approved family (rotate and adapt, keep the register):
- "Follow for more reminders you didn't know you needed."
- "Send this to the woman who always says she's fine."
- "Save this for the next time you wonder why you're so tired."
- "If this felt familiar, you're not the only one."
- "Follow if you're tired of carrying everything quietly."`;

/**
 * Prompt block assigning this run's pain branch. Injected into the
 * system prompt so consecutive posts don't hammer the same ache.
 */
export function painBranchBlock(branch: PainBranch): string {
  return `TODAY'S PAIN BRANCH (write inside it): ${branch.key.toUpperCase()} — ${branch.theme} The emotional truth underneath: ${branch.truth}`;
}
