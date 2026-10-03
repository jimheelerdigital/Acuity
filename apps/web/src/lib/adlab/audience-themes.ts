/**
 * Standing audience themes for the weekly ad batch (2026-10-03, per Keenan:
 * "get rid of it and turn the weekly scrape off" — the Reddit audience pulse).
 *
 * Snapshot of the last four weekly Reddit digests per brand (through
 * 2026-09-21), deduped, with medical / medication / relationship-ending
 * themes removed (positioning: never medical). Audience language barely moves
 * week to week, so these stand in for the live pulse. The batch rotates which
 * themes lead each week. Refresh by hand from an occasional Reddit research
 * pass (the reddit-ad-angles skill), not a scraper.
 */

export interface AudienceTheme {
  theme: string;
  angle: string;
  phrases: string[];
}

export const AUDIENCE_THEMES_AS_OF = "2026-09-21";

export const AUDIENCE_THEMES: Record<"ripple" | "bwk", AudienceTheme[]> = {
  "ripple": [
    {
      "theme": "The invisible labor scorecard nobody else is keeping",
      "angle": "Name the specific texture of this exhaustion without tipping into lecture — she knows what it is, she just wants to feel seen.",
      "phrases": [
        "I'm the only one who notices",
        "I stopped asking",
        "carrying it all quietly",
        "too tired to explain again"
      ]
    },
    {
      "theme": "I just want to be left alone — and I feel guilty for it",
      "angle": "Normalize the hunger for alone time as a legitimate need, not a character flaw — this audience will exhale at the permission.",
      "phrases": [
        "needing space doesn't make me a bad mother",
        "I love them and I need a break",
        "touched out",
        "the guilt is louder than the want"
      ]
    },
    {
      "theme": "Asking women who've already been through it",
      "angle": "Position experience as the resource that clinical information can't replace — peer wisdom as the thing she's actually searching for.",
      "phrases": [
        "what did you do",
        "I just need to hear from someone who's been there",
        "tell me it gets better",
        "what do I wish someone had told me"
      ]
    },
    {
      "theme": "Emotional reactions that feel too big and hard to trust",
      "angle": "Gently separate the physiological from the emotional without dismissing either — she needs to know her feelings are real even if her hormones are loud.",
      "phrases": [
        "I don't know if this is me or my hormones",
        "feeling like a stranger to myself",
        "too much to hold",
        "crying and not knowing why"
      ]
    },
    {
      "theme": "The quiet realization that enough is already here",
      "angle": "Meet the moment of noticing — not as a productivity reframe, but as a genuine arrival after years of deferring her own life.",
      "phrases": [
        "I stopped waiting",
        "it was already here",
        "the small things turned out to be the things",
        "permission to stop chasing"
      ]
    },
    {
      "theme": "Grieving the self that quietly disappeared",
      "angle": "Name the specific flavor of loss: not dramatic, not a single moment, just a slow noticing that something is already gone.",
      "phrases": [
        "the youth I didn't see leaving",
        "grieving quietly",
        "time that just slipped",
        "mourning a version of me"
      ]
    },
    {
      "theme": "Wanting to be better but not knowing which self to aim for",
      "angle": "Reframe this not as laziness but as the particular paralysis of women at midlife who have spent so long adapting to others they've lost the map to themselves.",
      "phrases": [
        "I want to change but I don't know into what",
        "feeling behind everywhere",
        "can't find the motivation",
        "don't know what I actually want"
      ]
    },
    {
      "theme": "Being the one who shows up — even when there's nothing left",
      "angle": "Acknowledge the specific loneliness of being the capable one — the person others lean on who has no equivalent place to fall.",
      "phrases": [
        "I'm the one holding it together",
        "nobody's checking on me",
        "showing up when I'm empty",
        "invisible labor that never ends"
      ]
    },
    {
      "theme": "I want to change but I don't know which version of me to change into",
      "angle": "Speak to the difference between wanting change and knowing what to change toward — this audience is smart enough to know those aren't the same thing",
      "phrases": [
        "I know something has to shift",
        "lost the plot on myself",
        "where do you even start",
        "wanting better but for what"
      ]
    },
    {
      "theme": "Grief for the youth and time that slipped past quietly",
      "angle": "Hold the grief without rushing to reframe it — let the feeling land before offering any forward motion",
      "phrases": [
        "that decade went somewhere",
        "I kept waiting and waiting",
        "realizing it's already behind me",
        "mourning the time I had"
      ]
    },
    {
      "theme": "My emotional reactions feel too big and I don't fully trust them",
      "angle": "Validate that the question itself is exhausting — having to audit your own emotions on top of having them",
      "phrases": [
        "is this me or is this hormones",
        "feelings I can't quite claim",
        "too much and I know it",
        "the version of me I don't recognize"
      ]
    },
    {
      "theme": "Stopping things that used to be fun doesn't feel like loss anymore",
      "angle": "Reframe changed preferences as self-knowledge, not decline — this audience is done performing who they used to be",
      "phrases": [
        "I don't miss it like I thought I would",
        "my idea of a good night changed",
        "not who I was at 30 and fine with it",
        "quietly opting out"
      ]
    },
    {
      "theme": "Asking other women who've already been through it",
      "angle": "Position lived experience from slightly-ahead women as more valuable than expert advice for this audience",
      "phrases": [
        "tell me what you actually went through",
        "what would you do differently",
        "I need someone who's already on the other side",
        "real experience not the official version"
      ]
    }
  ],
  "bwk": [
    {
      "theme": "The Knowing-Doing Gap",
      "angle": "You already know what to do. The problem isn't information — it's the moment between knowing and moving. That gap is where men lose years.",
      "phrases": [
        "I'll start tomorrow",
        "I know what I should do",
        "just can't make myself do it",
        "watching others execute"
      ]
    },
    {
      "theme": "Phone and Distraction Destroying Real Output",
      "angle": "Your phone isn't a distraction from your life. It IS your life right now — and that's the problem you're not saying out loud.",
      "phrases": [
        "doomscrolling instead of working",
        "can't sit with silence",
        "the app is always open",
        "scrolling hours gone"
      ]
    },
    {
      "theme": "Escaping the Rut — Long Stalls and False Restarts",
      "angle": "The stall isn't a phase. For most men it becomes a personality. The restart has to be structural, not motivational.",
      "phrases": [
        "same patterns for years",
        "feel like I'm behind",
        "stuck and don't know why",
        "nothing is working"
      ]
    },
    {
      "theme": "Mood Dependency Killing Execution",
      "angle": "You're outsourcing your output to your emotional state. Discipline means the work happens whether the feeling shows up or not.",
      "phrases": [
        "wait until I feel like it",
        "need to be in the right headspace",
        "can't function when I feel off",
        "mood decides the day"
      ]
    },
    {
      "theme": "Identity Disgust — Not Liking Who You've Become",
      "angle": "Most men don't fear failure. They fear looking back and not recognizing themselves. That disgust is either fuel or poison — your call.",
      "phrases": [
        "not who I wanted to be",
        "don't recognize myself",
        "side character in my own story",
        "used to be different"
      ]
    },
    {
      "theme": "Building Accountability Structures and Lock-In Systems",
      "angle": "Stop betting on motivation. Build a system that makes the right move the only move — lock yourself in before the weak version of you shows up.",
      "phrases": [
        "need someone to answer to",
        "posting my plan publicly",
        "force the delay",
        "lock it in before I waver"
      ]
    },
    {
      "theme": "The Race Against Time at 20-Something",
      "angle": "The fear that your 20s are slipping isn't weakness — it's a signal. The men who act on it early are the ones who don't spend their 30s recovering.",
      "phrases": [
        "running out of time",
        "already behind at 23",
        "no light at the end",
        "can't afford to waste more years"
      ]
    },
    {
      "theme": "Solitude Tolerance — Learning to Operate Alone",
      "angle": "The man who can't be alone without distraction can't be trusted with silence — and silence is where all serious work happens.",
      "phrases": [
        "can't sit with myself",
        "alone feels unbearable",
        "need noise to function",
        "forgot how to be bored"
      ]
    },
    {
      "theme": "Stop Negotiating With Yourself",
      "angle": "Every time you bargain with yourself over whether to do the work, you lose. The negotiation IS the procrastination.",
      "phrases": [
        "I'll do it if I feel ready",
        "just one more day",
        "I need the right conditions",
        "always finding a reason"
      ]
    },
    {
      "theme": "Finishing Strong — Not Just Starting",
      "angle": "Every man here knows how to start. Almost none of them know how to finish — and that gap is where reputations, results, and self-respect are actually built.",
      "phrases": [
        "always strong at the start",
        "fade before the finish",
        "can't close it out",
        "Day 29 and still not done"
      ]
    },
    {
      "theme": "Fake Busy vs. Real Output",
      "angle": "A full schedule and a productive day are not the same thing. Count outputs, not hours.",
      "phrases": [
        "busy but building nothing",
        "satisfying grid, zero results",
        "interruptions eating the work",
        "losing the thread every session"
      ]
    },
    {
      "theme": "Starting From Zero After a Life Hit",
      "angle": "Starting over from nothing is still starting. The only unforgivable move is staying down.",
      "phrases": [
        "went from best to worst overnight",
        "trying to come back",
        "need to know I can rebuild",
        "recovery that actually sticks"
      ]
    },
    {
      "theme": "Mood Dependency Killing the Day",
      "angle": "Your output can't be hostage to how you feel when you wake up — that's a system failure, not a feelings problem.",
      "phrases": [
        "decided the day was ruined",
        "can't get out of bed",
        "no motivation to move",
        "feeling cursed"
      ]
    },
    {
      "theme": "Killing the Ego Before It Kills Your Progress",
      "angle": "The ego is the thing that needs the excuse, needs the credit, and flinches from hard feedback — it has to go.",
      "phrases": [
        "kill the ego",
        "stop needing approval",
        "drop the identity",
        "who are you without the mask"
      ]
    },
    {
      "theme": "Letting Go of External Validation",
      "angle": "The moment you need someone else to confirm you're on the right path, you've already handed them the wheel.",
      "phrases": [
        "stop seeking validation",
        "surprising peace of letting go",
        "no one watching",
        "building for yourself"
      ]
    },
    {
      "theme": "Building Lock-In Systems With Others",
      "angle": "Willpower is a depletable resource; a locked-in environment with locked-in people is an infrastructure play.",
      "phrases": [
        "locked in group",
        "accountability structure",
        "no escape clause",
        "environment over willpower"
      ]
    },
    {
      "theme": "The All-or-Nothing Restart Trap",
      "angle": "Perfection about the start time is just procrastination dressed up — motion beats the perfect moment every time.",
      "phrases": [
        "missed the start, wasted the day",
        "all-or-nothing thinking",
        "false restart",
        "just begin anyway"
      ]
    },
    {
      "theme": "Never Counting Your Own Wins",
      "angle": "If you never log the win, you train yourself to feel like you're always losing — that's a calibration error, not humility.",
      "phrases": [
        "never acknowledging wins",
        "always onto the next",
        "nothing feels like enough",
        "when was enough"
      ]
    },
    {
      "theme": "Can a Man Actually Redeem Himself",
      "angle": "Redemption isn't a feeling, it's a sequence of decisions made in the dark when no one is watching and nothing is guaranteed.",
      "phrases": [
        "can a terrible person redeem himself",
        "too far gone",
        "starting from who you were",
        "the man you have to become"
      ]
    },
    {
      "theme": "Solo Accountability — Discipline With No One Watching",
      "angle": "The man who can hold himself accountable in an empty room is the most dangerous man in any room.",
      "phrases": [
        "only myself to rely on",
        "no one checking on me",
        "self-imposed standards",
        "monk mode alone"
      ]
    },
    {
      "theme": "Phone and Doomscroll Destruction",
      "angle": "Your phone is the enemy inside the wire — treat it like one and build defenses accordingly.",
      "phrases": [
        "doomscrolling trap",
        "make the phone annoying",
        "digital discipline",
        "permanently block it"
      ]
    },
    {
      "theme": "The Habit That Actually Changed Everything",
      "angle": "Stop chasing the perfect system — find the one habit that breaks the pattern and repeat it until it's structural.",
      "phrases": [
        "one habit that changed it",
        "what actually worked",
        "daily life transformed",
        "built it brick by brick"
      ]
    }
  ]
};

/** This week's lead themes: a stable weekly rotation so batches don't repeat. */
export function themesForWeek(brand: "ripple" | "bwk", count = 12, now = new Date()): AudienceTheme[] {
  const all = AUDIENCE_THEMES[brand];
  if (all.length <= count) return all;
  const week = Math.floor(now.getTime() / (7 * 86_400_000));
  const start = (week * count) % all.length;
  return Array.from({ length: count }, (_, i) => all[(start + i) % all.length]);
}
