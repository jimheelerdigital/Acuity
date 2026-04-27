/**
 * Seeds an Apple App Store reviewer account with realistic, fabricated
 * usage data so reviewers see a populated app on first sign-in.
 *
 * Strict allowlist — only literal addresses listed in
 * ALLOWED_REVIEWER_EMAILS are accepted. NOT a pattern. Refuses to run
 * against any other address even with --force, so a typo can't clobber
 * a real user (the existing seed-test-user.ts blocks gmail.com
 * patterns; this one explicitly allows ONE specific reviewer alias).
 *
 * Usage:
 *   set -a && source apps/web/.env.local && set +a && \
 *     npx tsx scripts/seed-app-store-reviewer.ts \
 *       --email jim+applereview@heelerdigital.com \
 *       --password '<16-char generated password>'
 *
 * What it creates:
 *   - User row (PRO, 90-day stripeCurrentPeriodEnd, no stripeCustomerId)
 *   - UserOnboarding (completedAt = now → no onboarding redirect)
 *   - 33 Entry rows spanning the last 30 days, varied themes / mood
 *     (golf, family, work-stress, sleep, mood swings)
 *   - Theme + ThemeMention rows derived from those entries
 *   - 4 LifeMapArea rows (CAREER / HEALTH / RELATIONSHIPS / PERSONAL)
 *   - 3 Goal rows (mix of IN_PROGRESS / NOT_STARTED / COMPLETE)
 *   - 7 Task rows (mix of OPEN / DONE)
 *   - 4 WeeklyReport rows (one per recent week, status=COMPLETE)
 *   - 1 LifeAudit (kind=TRIAL_DAY_14, status=COMPLETE)
 *
 * --force: deletes the existing user row first (cascades clean).
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const ALLOWED_REVIEWER_EMAILS = new Set<string>([
  "jim+applereview@heelerdigital.com",
]);

type Args = {
  email: string;
  password: string;
  force: boolean;
};

function parseArgs(argv: string[]): Args {
  const a: Partial<Args> = { force: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--email":
        a.email = argv[++i];
        break;
      case "--password":
        a.password = argv[++i];
        break;
      case "--force":
        a.force = true;
        break;
      default:
        throw new Error(`Unknown arg: ${arg}`);
    }
  }
  if (!a.email) throw new Error("Missing --email");
  if (!a.password) throw new Error("Missing --password");
  if (a.password.length < 12)
    throw new Error("--password must be at least 12 chars");
  return a as Args;
}

function assertAllowedEmail(email: string): void {
  if (!ALLOWED_REVIEWER_EMAILS.has(email.toLowerCase())) {
    console.error(
      `[seed-app-store-reviewer] REFUSED: "${email}" is not in the reviewer allowlist.`
    );
    console.error(`Allowed emails (literal):`);
    for (const e of ALLOWED_REVIEWER_EMAILS) console.error(`  ${e}`);
    process.exit(1);
  }
}

// ───────────────────────────────────────────────────────────────────
// Realistic content. Spread across 30 days with intentional mood arcs:
//   - week 1 (oldest): rough start, sleep struggles, work stress
//   - week 2: stabilizing, family time, exercise
//   - week 3: golf flow, work momentum, but a setback mid-week
//   - week 4 (newest): ramping confidence, goal progress
// 33 entries (≥30 requirement) with skipped days here and there for realism.
// ───────────────────────────────────────────────────────────────────

type EntrySpec = {
  daysAgo: number;
  hour: number;
  mood: "GREAT" | "GOOD" | "NEUTRAL" | "LOW" | "ROUGH";
  moodScore: number;
  energy: number;
  themes: string[];
  wins: string[];
  blockers: string[];
  summary: string;
  transcript: string;
};

const ENTRY_SPECS: EntrySpec[] = [
  // ── Week 4 (most recent) — confidence building ────────────────────
  {
    daysAgo: 0,
    hour: 21,
    mood: "GOOD",
    moodScore: 8,
    energy: 4,
    themes: ["work", "momentum", "writing"],
    wins: ["Finished the Q2 plan draft", "Closed two open tasks"],
    blockers: [],
    summary:
      "Solid day. Got the Q2 plan draft to a state I'm not embarrassed to share. The afternoon block was the most productive in weeks.",
    transcript:
      "Today felt like a real day. I finished the Q2 plan draft after circling it for a week and the afternoon was the most productive I've had in maybe a month. I closed two tasks I'd been avoiding, the writing one and the inbox-zero one. Going to bed early. Tomorrow I want to keep this rhythm — same morning routine, no email until 10am.",
  },
  {
    daysAgo: 1,
    hour: 21,
    mood: "GOOD",
    moodScore: 7,
    energy: 4,
    themes: ["family", "kids", "evening"],
    wins: ["Cooked dinner with the kids"],
    blockers: [],
    summary:
      "Good evening with the family. Cooked together, no screens. The kind of normal night I want more of.",
    transcript:
      "Worked late but we still made dinner together. The kids set the table without being asked which is a first. Phones away. We just talked about their week. I'm tired but the right kind of tired. I want a lot more of these nights.",
  },
  {
    daysAgo: 2,
    hour: 22,
    mood: "GREAT",
    moodScore: 9,
    energy: 5,
    themes: ["golf", "flow", "weekend"],
    wins: ["Shot a 78 at Briarwood"],
    blockers: [],
    summary:
      "Best round of the year — 78 at Briarwood. Putter finally cooperating, and the weather was unreal.",
    transcript:
      "Shot a 78 today at Briarwood. Putter showed up, finally. The new grip is doing something. I had three pars in a row on the back nine and I genuinely felt like I belonged out there. Weather was perfect. I want to play next Saturday again, same group.",
  },
  {
    daysAgo: 3,
    hour: 21,
    mood: "GOOD",
    moodScore: 7,
    energy: 4,
    themes: ["work", "team", "decision"],
    wins: ["Made a call on the hire"],
    blockers: ["Still nervous about the budget"],
    summary:
      "Made the call to hire the senior engineer. Budget is tight but the team's runway without them is worse.",
    transcript:
      "Made the call to extend the offer to the senior engineer. Budget is tight and I keep going back to it but the truth is the team's runway without them is worse than the dollar cost. Keenan agrees. I'll sleep on it but I'm 90% sure.",
  },
  {
    daysAgo: 5,
    hour: 22,
    mood: "NEUTRAL",
    moodScore: 5,
    energy: 3,
    themes: ["sleep", "energy"],
    wins: [],
    blockers: ["Couldn't sleep until 1am"],
    summary:
      "Restless night again. Phone in the bedroom. Same lesson, same trap.",
    transcript:
      "Couldn't sleep until almost 1am. I had the phone in the bedroom which I keep saying I won't do. The day was fine but the night wrecked me and tomorrow's going to be hard. Putting the phone in the kitchen tonight, no exceptions.",
  },
  // ── Week 3 — golf flow, mid-week setback ──────────────────────────
  {
    daysAgo: 7,
    hour: 21,
    mood: "GREAT",
    moodScore: 9,
    energy: 5,
    themes: ["golf", "morning", "flow"],
    wins: ["Range session clicked"],
    blockers: [],
    summary:
      "Range session clicked. The new grip is doing something — first time in months I felt like the ball was actually going where I aimed.",
    transcript:
      "Hit the range at 7am before the heat. The new grip clicked. First time in maybe two months I felt like the ball was actually going where I aimed. Did 80 balls and I could've kept going. This is what I want my mornings to feel like.",
  },
  {
    daysAgo: 8,
    hour: 21,
    mood: "GOOD",
    moodScore: 7,
    energy: 4,
    themes: ["work", "writing"],
    wins: ["Wrote the launch post outline"],
    blockers: [],
    summary:
      "Wrote the launch announcement outline. Easier than I expected once I stopped trying to be clever.",
    transcript:
      "Wrote the launch post outline today. Once I stopped trying to be clever and just told the story plain it came together fast. I'll polish tomorrow but the bones are there. I should write more like this.",
  },
  {
    daysAgo: 9,
    hour: 22,
    mood: "LOW",
    moodScore: 3,
    energy: 2,
    themes: ["work", "stress", "setback"],
    wins: [],
    blockers: ["The migration broke prod for 40 minutes"],
    summary:
      "Migration broke prod. 40 minutes of total panic. We caught it but I'm rattled.",
    transcript:
      "The Postgres migration broke prod for about 40 minutes this morning. We rolled back. Nobody saw it because it was 6am but I'm rattled and tomorrow I have to write the postmortem. I keep replaying it. I should have run it on staging first. Lesson learned, again.",
  },
  {
    daysAgo: 10,
    hour: 21,
    mood: "NEUTRAL",
    moodScore: 5,
    energy: 3,
    themes: ["work", "recovery"],
    wins: ["Wrote the postmortem"],
    blockers: [],
    summary:
      "Wrote the postmortem. Felt better putting it on paper. Team was generous about it.",
    transcript:
      "Wrote the postmortem from yesterday. Felt a lot better once it was on paper — the failure mode was specific and I have three concrete fixes lined up. Team was generous about it. Keenan said 'this is just what builders do' which I needed to hear.",
  },
  {
    daysAgo: 11,
    hour: 21,
    mood: "GOOD",
    moodScore: 7,
    energy: 4,
    themes: ["family", "kids", "weekend"],
    wins: ["Took the kids to the park"],
    blockers: [],
    summary: "Took the kids to the park. No phone. Two hours, no agenda.",
    transcript:
      "Took the kids to the park for two hours. No phone, no agenda. They wanted to do the climbing wall over and over. I'm noticing that the days I feel best end with a couple of unplugged hours like that. Saving this somewhere I'll see it.",
  },
  {
    daysAgo: 13,
    hour: 21,
    mood: "GOOD",
    moodScore: 7,
    energy: 4,
    themes: ["golf", "weekend", "friends"],
    wins: ["Played 18 with the old crew"],
    blockers: [],
    summary:
      "Played 18 with the old crew. Lost three balls but the conversation was the point.",
    transcript:
      "Played 18 with the old crew this morning. I lost three balls and shot a fat 92 but honestly the round wasn't the point. Caught up with Mike about his career change. Good morning.",
  },
  // ── Week 2 — stabilizing ──────────────────────────────────────────
  {
    daysAgo: 14,
    hour: 22,
    mood: "NEUTRAL",
    moodScore: 5,
    energy: 3,
    themes: ["sleep", "habit"],
    wins: ["Phone stayed in the kitchen"],
    blockers: ["Still woke up at 5am"],
    summary:
      "Phone stayed in the kitchen but I still woke up at 5 with the spinning thoughts. Better, not great.",
    transcript:
      "Kept the phone in the kitchen overnight which is a small win but I still woke up at 5am with the spinning thoughts. Couldn't get back to sleep. This is better than scrolling but I'm clearly carrying something. Maybe the postmortem is sitting in my chest more than I admitted.",
  },
  {
    daysAgo: 15,
    hour: 21,
    mood: "GOOD",
    moodScore: 6,
    energy: 4,
    themes: ["health", "exercise"],
    wins: ["Lifted at lunch"],
    blockers: [],
    summary:
      "Lifted at lunch instead of pushing through. The afternoon was sharper for it.",
    transcript:
      "Skipped the lunch meeting and lifted instead. Squat felt strong. The afternoon was sharper than my mornings have been. The pattern is obvious: when I move at lunch the second half of the day works.",
  },
  {
    daysAgo: 16,
    hour: 21,
    mood: "NEUTRAL",
    moodScore: 5,
    energy: 3,
    themes: ["work", "meetings", "fatigue"],
    wins: [],
    blockers: ["Five back-to-back meetings"],
    summary:
      "Five meetings back-to-back. Got home with nothing left. Need to defend the calendar.",
    transcript:
      "Five meetings back to back. I got home and just sat in the car for ten minutes. There's nothing left. I need to defend the calendar harder — no more than three meetings a day, ever. Telling Keenan tomorrow.",
  },
  {
    daysAgo: 17,
    hour: 21,
    mood: "GOOD",
    moodScore: 6,
    energy: 4,
    themes: ["family", "evening"],
    wins: ["Read with the kids 30 minutes"],
    blockers: [],
    summary: "Read to the kids before bed. They asked for one more chapter.",
    transcript:
      "Read to the kids for half an hour before bed. They wanted another chapter. I'm noticing how rare these uninterrupted half-hours are now. I want to protect this one.",
  },
  {
    daysAgo: 18,
    hour: 22,
    mood: "GOOD",
    moodScore: 6,
    energy: 3,
    themes: ["work", "writing"],
    wins: ["Long-form rant out of my head"],
    blockers: [],
    summary:
      "Got the long-form rant out of my head onto paper. Felt better once it was somewhere.",
    transcript:
      "Wrote a long-form rant about the integration mess that's been bugging me. Most of it I'll never share but it stopped circling once I wrote it down. There's something to this for me.",
  },
  {
    daysAgo: 19,
    hour: 21,
    mood: "GREAT",
    moodScore: 8,
    energy: 4,
    themes: ["family", "weekend", "anniversary"],
    wins: ["Anniversary dinner"],
    blockers: [],
    summary:
      "Anniversary dinner. The same booth, eight years later. We laughed a lot.",
    transcript:
      "Took my wife out for our anniversary. Same booth as our first one eight years ago. We laughed for two hours. I keep saying I'll plan more nights like this and then I don't. Putting it on the calendar this week.",
  },
  {
    daysAgo: 20,
    hour: 21,
    mood: "GOOD",
    moodScore: 7,
    energy: 4,
    themes: ["golf", "weekend"],
    wins: ["18 holes alone"],
    blockers: [],
    summary: "Played 18 alone. Walked it. The cheapest therapy I know.",
    transcript:
      "Played 18 holes alone, walking. Took three hours and I came back with my head in a different place. Phone in the bag. I should do this once a week, even if I shoot 95.",
  },
  // ── Week 1 (oldest) — rough start ─────────────────────────────────
  {
    daysAgo: 22,
    hour: 23,
    mood: "ROUGH",
    moodScore: 2,
    energy: 1,
    themes: ["sleep", "stress", "work"],
    wins: [],
    blockers: ["Slept three hours", "Behind on everything"],
    summary:
      "Slept three hours. Behind on everything. Default panic mode all day.",
    transcript:
      "Three hours of sleep. I was behind from the moment I opened my eyes. Coffee, more coffee, then a 9am that I shouldn't have agreed to. The whole day was reactive. I keep telling myself I'll fix the sleep thing and then I don't. Tomorrow.",
  },
  {
    daysAgo: 23,
    hour: 22,
    mood: "LOW",
    moodScore: 3,
    energy: 2,
    themes: ["work", "stress"],
    wins: [],
    blockers: ["Customer escalation"],
    summary:
      "Customer escalation ate three hours. I'm not built for that — need a triage process.",
    transcript:
      "A customer escalation ate three hours of my afternoon. I'm not built for that kind of immediate-fire context-switching and it kills my writing time for the day. I need to set up a real triage flow with Keenan so it doesn't always land on me.",
  },
  {
    daysAgo: 24,
    hour: 22,
    mood: "LOW",
    moodScore: 4,
    energy: 2,
    themes: ["sleep", "exercise", "habit"],
    wins: ["Walked at lunch"],
    blockers: ["Skipped the gym again"],
    summary:
      "Skipped the gym for the third day running. Walked at lunch but I felt the difference.",
    transcript:
      "Third day in a row I skipped the gym. I went for a walk at lunch which is something but I can feel the difference in my body. Sleep is a wreck and the exercise habit is the first thing to go when sleep is bad. Vicious circle.",
  },
  {
    daysAgo: 25,
    hour: 21,
    mood: "NEUTRAL",
    moodScore: 5,
    energy: 3,
    themes: ["family", "kids"],
    wins: ["Helped with homework"],
    blockers: [],
    summary:
      "Helped my son with math homework. Surprised I remembered any of it.",
    transcript:
      "Helped my son with his math homework tonight. Pre-algebra. I was surprised I remembered any of it and he was patient with me when I had to think. We laughed about it. Nice.",
  },
  {
    daysAgo: 26,
    hour: 21,
    mood: "NEUTRAL",
    moodScore: 5,
    energy: 3,
    themes: ["work"],
    wins: [],
    blockers: ["Distracted all day"],
    summary: "Distracted all day. Couldn't tell you what I shipped.",
    transcript:
      "Couldn't tell you what I actually shipped today. I sat at the desk for nine hours and feel like I produced very little. The Slack notifications were on, the inbox was open, the phone was at hand. Tomorrow I close all three.",
  },
  {
    daysAgo: 27,
    hour: 22,
    mood: "GOOD",
    moodScore: 6,
    energy: 3,
    themes: ["work", "deep-work"],
    wins: ["Two-hour deep-work block"],
    blockers: [],
    summary:
      "Closed Slack and the inbox. Two-hour block on the spec. Productive.",
    transcript:
      "Closed Slack and the inbox. Two hours on the spec. The cost of context-switching is real and I'm finally paying attention to it. I want to make this the default, not the exception.",
  },
  {
    daysAgo: 28,
    hour: 22,
    mood: "ROUGH",
    moodScore: 3,
    energy: 2,
    themes: ["family", "argument"],
    wins: [],
    blockers: ["Argued with my wife"],
    summary:
      "Argued with my wife about my hours. She's right and I knew it walking in.",
    transcript:
      "Argued with my wife tonight about my hours. She's right. I've been working until 10pm three nights this week and I told her last month I'd stop. We talked it through, didn't resolve it. I'm going to lay out a better boundary tomorrow.",
  },
  {
    daysAgo: 29,
    hour: 21,
    mood: "LOW",
    moodScore: 4,
    energy: 2,
    themes: ["family", "boundary"],
    wins: ["Closed the laptop at 6"],
    blockers: [],
    summary:
      "Closed the laptop at 6. Wife noticed. Small thing but it mattered.",
    transcript:
      "Closed the laptop at 6 today. Just shut it. I sat at the table and read for an hour before dinner. My wife noticed and didn't make a big deal of it but I could tell. Going to try this every weekday next week.",
  },
  {
    daysAgo: 4,
    hour: 21,
    mood: "GOOD",
    moodScore: 7,
    energy: 4,
    themes: ["work", "team"],
    wins: ["1:1 went well"],
    blockers: [],
    summary:
      "Had a real 1:1 with Sarah. She's wrestling with the same things I am and we both felt better.",
    transcript:
      "1:1 with Sarah today and we actually talked about the underlying tension instead of working through tickets. She's wrestling with a lot of the same things I am — boundary stuff, sleep, the always-on feeling. We both left feeling lighter. I should have these conversations more often.",
  },
  {
    daysAgo: 6,
    hour: 22,
    mood: "GOOD",
    moodScore: 6,
    energy: 3,
    themes: ["health", "habit"],
    wins: ["Phone in the kitchen all night"],
    blockers: [],
    summary:
      "Phone in the kitchen, lights off by 10:30. Slept seven hours. Tracking it.",
    transcript:
      "Phone in the kitchen overnight. Lights off by 10:30. Slept seven hours. Tracking the streak. The morning was sharper. It's not magic, it's just the same boring thing that's always worked.",
  },
  {
    daysAgo: 12,
    hour: 21,
    mood: "GOOD",
    moodScore: 7,
    energy: 4,
    themes: ["work", "decision"],
    wins: ["Said no to a bad meeting"],
    blockers: [],
    summary:
      "Said no to a meeting that didn't need me. Felt strange. Will do it again.",
    transcript:
      "Said no to a meeting that didn't need me. Replied with two sentences pointing them at the right person. It felt strange to do — like I was getting away with something — but the afternoon was free and I used it well.",
  },
  {
    daysAgo: 21,
    hour: 22,
    mood: "NEUTRAL",
    moodScore: 5,
    energy: 3,
    themes: ["sleep"],
    wins: [],
    blockers: ["6 hours, choppy"],
    summary: "Six hours, choppy. Functional but flat.",
    transcript:
      "Six hours of choppy sleep. Functional today but flat. Nothing felt sharp. The week is going to be uphill if I don't fix this. Phone-in-kitchen rule starts again tonight.",
  },
  {
    daysAgo: 30,
    hour: 22,
    mood: "ROUGH",
    moodScore: 2,
    energy: 1,
    themes: ["work", "stress", "burnout"],
    wins: [],
    blockers: ["Worked 14 hours"],
    summary:
      "14-hour day. Found myself staring at the screen at 11pm with nothing left. Need to fix this.",
    transcript:
      "Fourteen-hour day. Stared at the screen at 11pm with absolutely nothing left in the tank. This is the day that reminds me why I started journaling — I keep doing this to myself and then being surprised when I'm exhausted. The pattern is the pattern.",
  },
];

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  assertAllowedEmail(args.email);

  const prisma = new PrismaClient();
  try {
    const existing = await prisma.user.findUnique({
      where: { email: args.email },
      select: { id: true },
    });
    if (existing && !args.force) {
      console.error(
        `[seed-reviewer] User ${args.email} already exists (id=${existing.id}). Pass --force to delete + recreate.`
      );
      process.exit(1);
    }
    if (existing && args.force) {
      console.log(`[seed-reviewer] --force: deleting existing ${args.email}...`);
      // Use deleteMany to avoid Prisma's RETURNING column drift on
      // schema-vs-DB lag — same defensive pattern as /api/user/delete.
      await prisma.user.deleteMany({ where: { id: existing.id } });
    }

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setDate(periodEnd.getDate() + 90);

    const passwordHash = await bcrypt.hash(args.password, 12);

    const user = await prisma.user.create({
      data: {
        email: args.email,
        name: "Apple Reviewer",
        emailVerified: now,
        passwordHash,
        subscriptionStatus: "PRO",
        // No real Stripe customer — the new mobile profile screen
        // hides "Manage subscription" when isPro && !hasStripeCustomer
        // so reviewers never hit the dead-end portal call.
        stripeCustomerId: null,
        stripeCurrentPeriodEnd: periodEnd,
        timezone: "America/Chicago",
        currentStreak: 7,
        longestStreak: 14,
        notificationTime: "21:00",
        notificationDays: [0, 1, 2, 3, 4, 5, 6],
        notificationsEnabled: true,
        totalRecordings: ENTRY_SPECS.length,
      },
      select: { id: true, email: true },
    });

    await prisma.userOnboarding.create({
      data: {
        userId: user.id,
        currentStep: 10,
        completedAt: now,
        moodBaseline: "GOOD",
        moodBaselineNumeric: 7,
        lifeAreaPriorities: {
          CAREER: 1,
          HEALTH: 2,
          RELATIONSHIPS: 3,
        },
        microphoneGranted: true,
        referralSource: "App Store reviewer",
        expectedUsageFrequency: "daily",
      },
    });

    // ─── Entries ────────────────────────────────────────────────────
    type EntryRow = { id: string; entryDate: Date; themes: string[] };
    const entryRows: EntryRow[] = [];
    for (const spec of ENTRY_SPECS) {
      const entryDate = new Date(now);
      entryDate.setDate(entryDate.getDate() - spec.daysAgo);
      entryDate.setHours(spec.hour, 0, 0, 0);
      const created = await prisma.entry.create({
        data: {
          userId: user.id,
          transcript: spec.transcript,
          summary: spec.summary,
          mood: spec.mood,
          moodScore: spec.moodScore,
          energy: spec.energy,
          themes: spec.themes,
          wins: spec.wins,
          blockers: spec.blockers,
          duration: 60 + Math.floor(Math.random() * 180),
          status: "COMPLETE",
          extractionCommittedAt: entryDate,
          entryDate,
          createdAt: entryDate,
        },
        select: { id: true, entryDate: true, themes: true },
      });
      entryRows.push({
        id: created.id,
        entryDate: created.entryDate,
        themes: created.themes,
      });
    }

    // ─── Themes + ThemeMentions ─────────────────────────────────────
    // Aggregate theme counts so we only create a Theme row per unique
    // tag, then mention it once per entry it appears in. Sentiment is
    // a coarse proxy from the entry's mood.
    const themeIds = new Map<string, string>();
    for (const row of entryRows) {
      for (const themeName of row.themes) {
        const lower = themeName.toLowerCase();
        if (!themeIds.has(lower)) {
          const t = await prisma.theme.create({
            data: { userId: user.id, name: lower },
            select: { id: true },
          });
          themeIds.set(lower, t.id);
        }
      }
    }
    for (const row of entryRows) {
      const spec = ENTRY_SPECS.find(
        (s) =>
          new Date(now.getTime() - s.daysAgo * 86400000).toDateString() ===
          row.entryDate.toDateString()
      );
      const sentiment =
        spec && spec.moodScore >= 7
          ? "POSITIVE"
          : spec && spec.moodScore <= 3
            ? "NEGATIVE"
            : "NEUTRAL";
      for (const themeName of row.themes) {
        const themeId = themeIds.get(themeName.toLowerCase())!;
        await prisma.themeMention
          .create({
            data: {
              themeId,
              entryId: row.id,
              sentiment,
              createdAt: row.entryDate,
            },
          })
          .catch(() => {
            // (themeId, entryId) is unique — silently skip duplicates.
          });
      }
    }

    // ─── Life Map Areas ─────────────────────────────────────────────
    const lifeMapAreas = [
      {
        area: "CAREER",
        name: "Career",
        color: "#7C3AED",
        score: 72,
        summary:
          "Strong week-over-week trajectory. Shipped the Q2 plan and started defending the calendar. The migration setback was a bump but the postmortem habit is sticking.",
        topThemes: ["work", "writing", "decision"],
        trend: "up",
      },
      {
        area: "HEALTH",
        name: "Health",
        color: "#10B981",
        score: 58,
        summary:
          "Sleep is the lever. Phone-in-kitchen rule is helping when held. Lifting at lunch reliably improves the afternoon — when it happens.",
        topThemes: ["sleep", "exercise", "habit"],
        trend: "up",
      },
      {
        area: "RELATIONSHIPS",
        name: "Relationships",
        color: "#F59E0B",
        score: 65,
        summary:
          "Anniversary dinner was the high point. Argument earlier this month surfaced a real boundary issue around evening hours. Family time happens when phone goes away.",
        topThemes: ["family", "kids", "evening"],
        trend: "up",
      },
      {
        area: "PERSONAL",
        name: "Personal",
        color: "#3B82F6",
        score: 70,
        summary:
          "Golf is the cleanest signal — every entry mentioning it correlates with a high mood score. Walking 18 alone has shown up as a reliable reset.",
        topThemes: ["golf", "weekend", "flow"],
        trend: "stable",
      },
    ];
    for (let i = 0; i < lifeMapAreas.length; i++) {
      const a = lifeMapAreas[i];
      await prisma.lifeMapArea.create({
        data: {
          userId: user.id,
          area: a.area,
          name: a.name,
          color: a.color,
          sortOrder: i,
          score: a.score,
          summary: a.summary,
          activeGoals: i < 3 ? 1 : 0,
          lastMentioned: now,
          trend: a.trend,
          weeklyDelta: a.trend === "up" ? 4 : 0,
          monthlyDelta: a.trend === "up" ? 8 : 1,
          mentionCount: 6 + i,
          topThemes: a.topThemes,
          insightSummary: a.summary,
          historicalHigh: a.score + 5,
          historicalLow: a.score - 12,
          baselineScore: 50,
        },
      });
    }

    // ─── Goals ──────────────────────────────────────────────────────
    const goalSpecs = [
      {
        title: "Sleep 7+ hours every weeknight",
        description:
          "Phone in the kitchen by 10pm, lights off by 10:30. Habit stack from the existing evening routine — read 15 minutes after closing the laptop.",
        lifeArea: "HEALTH",
        status: "IN_PROGRESS",
        progress: 55,
      },
      {
        title: "Break 80 at Briarwood",
        description:
          "New grip is helping. Range twice a week, putt drill on weekends. Track the score in the notes.",
        lifeArea: "PERSONAL",
        status: "IN_PROGRESS",
        progress: 40,
      },
      {
        title: "Defend the calendar — max 3 meetings/day",
        description:
          "Block deep-work mornings; push lunchtime + late-afternoon meetings to specific days. Talk to Keenan about routing.",
        lifeArea: "CAREER",
        status: "NOT_STARTED",
        progress: 10,
      },
    ];
    type GoalRow = { id: string; lifeArea: string };
    const goalRows: GoalRow[] = [];
    for (const g of goalSpecs) {
      const created = await prisma.goal.create({
        data: {
          userId: user.id,
          title: g.title,
          description: g.description,
          lifeArea: g.lifeArea,
          status: g.status,
          progress: g.progress,
          editedByUser: true,
          lastMentionedAt: now,
        },
        select: { id: true, lifeArea: true },
      });
      goalRows.push(created);
    }

    // ─── Tasks ──────────────────────────────────────────────────────
    const taskSpecs = [
      {
        title: "Talk to Keenan about meeting triage",
        status: "OPEN",
        priority: "HIGH",
      },
      {
        title: "Schedule weekly date night",
        status: "OPEN",
        priority: "MEDIUM",
      },
      {
        title: "Range session Tuesday + Thursday",
        status: "OPEN",
        priority: "MEDIUM",
      },
      {
        title: "Read 15 min before bed",
        status: "OPEN",
        priority: "LOW",
      },
      {
        title: "Write the postmortem",
        status: "DONE",
        priority: "HIGH",
        completedDaysAgo: 10,
      },
      {
        title: "Extend offer to senior engineer",
        status: "DONE",
        priority: "HIGH",
        completedDaysAgo: 3,
      },
      {
        title: "Plan anniversary dinner",
        status: "DONE",
        priority: "MEDIUM",
        completedDaysAgo: 19,
      },
    ];
    for (const t of taskSpecs) {
      const completedAt =
        t.status === "DONE" && t.completedDaysAgo !== undefined
          ? new Date(now.getTime() - t.completedDaysAgo * 86400000)
          : null;
      await prisma.task.create({
        data: {
          userId: user.id,
          title: t.title,
          text: t.title,
          status: t.status,
          priority: t.priority,
          completedAt,
        },
      });
    }

    // ─── Weekly Reports ─────────────────────────────────────────────
    const weeklyReports = [
      {
        weekOffset: 0,
        narrative:
          "A turnaround week. The Q2 plan landed, the senior engineer offer went out, and the sleep streak finally held for five nights in a row. The middle of the week was rough — the postmortem from the migration was still sitting in your chest — but you wrote about it instead of stewing, and the back half of the week reflected that. The clearest signal: every day you closed the laptop at 6pm ended in a mood ≥7. That's the single most reliable lever you have right now.",
        bullets: [
          "Mood improved across the week (avg 7.1 vs 5.8 last week)",
          "Closed laptop by 6pm 4 of 7 days — kept the family-time streak",
          "Two long deep-work blocks correlated with your two best entries",
          "Sleep streak: 5 nights ≥7 hours",
        ],
        moodArc:
          "Started anxious from the migration carryover. Stabilized mid-week after the postmortem. Ended the week with the strongest mood scores in 30 days.",
        topThemes: ["work", "sleep", "family"],
        tasksOpened: 4,
        tasksClosed: 2,
        entryCount: 7,
      },
      {
        weekOffset: 1,
        narrative:
          "The migration breaking prod was the headline event but the recovery was the story. You wrote the postmortem the next day, the team was generous about it, and you turned the failure into three concrete improvements rather than letting it spiral. The other thread was golf — three entries this week mentioning it, all paired with mood scores at 8 or 9. That's not a coincidence.",
        bullets: [
          "Migration incident → postmortem → 3 improvements queued",
          "Golf entries (3) all paired with mood ≥8",
          "Calendar got tighter — said no to 2 unnecessary meetings",
        ],
        moodArc:
          "High peaks (golf flow days) balanced by a sharp low at the migration incident. Net positive trajectory.",
        topThemes: ["golf", "work", "decision"],
        tasksOpened: 2,
        tasksClosed: 1,
        entryCount: 8,
      },
      {
        weekOffset: 2,
        narrative:
          "A stabilizing week after the rough start to the month. Sleep was inconsistent but trending the right direction. The anniversary dinner was the highest mood entry of the month — eight years on and the same booth. The argument with your wife earlier landed somewhere productive: closing the laptop at 6 became a thing she noticed, and you noticed she noticed.",
        bullets: [
          "Anniversary dinner — highest mood entry of the month",
          "Reading with the kids 30 min reappeared in 3 entries",
          "Lifting at lunch correlated 1:1 with sharper afternoons",
        ],
        moodArc:
          "Steady upward drift. No extreme lows, several solid 7s and 8s.",
        topThemes: ["family", "health", "habit"],
        tasksOpened: 3,
        tasksClosed: 0,
        entryCount: 9,
      },
      {
        weekOffset: 3,
        narrative:
          "The hardest week. A 14-hour day, a sleep-deprived stretch, an argument with your wife, and a customer escalation that ate three hours. The pattern across the week is unmistakable: when sleep falters, exercise falters, and when both falter the work stress amplifies. The good news is you wrote about it, every day. The bad news is the pattern is the pattern.",
        bullets: [
          "Sleep below 6 hours on 4 of 7 nights",
          "Skipped the gym 3 days running — felt the difference",
          "Argument with wife → boundary work the next day",
        ],
        moodArc:
          "Started rough, stayed rough, ended slightly less rough. The trough of the month.",
        topThemes: ["sleep", "stress", "work"],
        tasksOpened: 5,
        tasksClosed: 0,
        entryCount: 9,
      },
    ];
    for (const w of weeklyReports) {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - 7 * w.weekOffset - 6);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);
      await prisma.weeklyReport.create({
        data: {
          userId: user.id,
          weekStart,
          weekEnd,
          weekNumber: getWeekNumber(weekStart),
          year: weekStart.getFullYear(),
          narrative: w.narrative,
          insightBullets: w.bullets,
          moodArc: w.moodArc,
          topThemes: w.topThemes,
          tasksOpened: w.tasksOpened,
          tasksClosed: w.tasksClosed,
          goalsProgressed: [],
          entryCount: w.entryCount,
          status: "COMPLETE",
          createdAt: weekEnd,
        },
      });
    }

    // ─── Life Audit ─────────────────────────────────────────────────
    const auditPeriodStart = new Date(now);
    auditPeriodStart.setDate(auditPeriodStart.getDate() - 30);
    await prisma.lifeAudit.create({
      data: {
        userId: user.id,
        kind: "TRIAL_DAY_14",
        periodStart: auditPeriodStart,
        periodEnd: now,
        entryCount: ENTRY_SPECS.length,
        narrative: `Thirty days of recording. ${ENTRY_SPECS.length} entries. The patterns you couldn't see in the moment are clear now.

The first lever is sleep. Every week with a 5-night sleep streak ended with mood scores averaging above 6.5. Every week without one averaged below 5. The phone-in-the-kitchen rule is the simplest, most consistent, most-effective intervention you've documented — and you broke it every time you got tired enough to argue with yourself about it.

The second lever is golf. It's not really about golf; it's about the unbroken three hours you don't spend in front of a screen, around people who are not your team. Mood scores from golf entries averaged 8.0. The few times you walked 18 alone, you came back with the day's biggest insights.

The third lever is the laptop closing at 6. The four nights this month that you did it produced your three highest family entries — the kind of nights you keep saying you want more of. The five nights you didn't, you stayed awake fighting it.

There were two real lows: the migration incident and the argument with your wife. Both ended productively because you wrote about them the next day. That's the muscle the journaling is building — not avoiding the rough patches, but turning them around faster.

Going into Month 2: pick one lever and defend it. The one with the highest leverage is sleep. Phone in the kitchen is non-negotiable. The rest cascades.`,
        closingLetter: `You started this trial reactive — fourteen-hour days, three hours of sleep, panic mode by 9am. You're ending it with five-night sleep streaks, a 78 at Briarwood, an anniversary dinner you actually planned, and a Q2 plan that's not embarrassing. The pattern doesn't fix itself. You did this. Continue it.`,
        themesArc: {
          starting: ["sleep-deprivation", "stress", "burnout"],
          emerging: ["sleep-protocol", "deep-work", "family-time"],
          fading: ["always-on", "reactive-mode"],
        },
        lifeAreaDeltas: {
          CAREER: 4,
          HEALTH: 6,
          RELATIONSHIPS: 5,
          PERSONAL: 2,
        },
        moodArc:
          "Started rough, stabilized through week 2-3, ended at the strongest mood scores you've recorded.",
        status: "COMPLETE",
        createdAt: now,
      },
    });

    // ─── Verification ───────────────────────────────────────────────
    const counts = {
      User: 1,
      UserOnboarding: await prisma.userOnboarding.count({
        where: { userId: user.id },
      }),
      Entry: await prisma.entry.count({ where: { userId: user.id } }),
      Theme: await prisma.theme.count({ where: { userId: user.id } }),
      ThemeMention: await prisma.themeMention.count({
        where: { entry: { userId: user.id } },
      }),
      LifeMapArea: await prisma.lifeMapArea.count({
        where: { userId: user.id },
      }),
      Goal: await prisma.goal.count({ where: { userId: user.id } }),
      Task: await prisma.task.count({ where: { userId: user.id } }),
      WeeklyReport: await prisma.weeklyReport.count({
        where: { userId: user.id },
      }),
      LifeAudit: await prisma.lifeAudit.count({
        where: { userId: user.id },
      }),
    };

    console.log(`[seed-reviewer] OK`);
    console.log(`  userId:             ${user.id}`);
    console.log(`  email:              ${user.email}`);
    console.log(`  name:               Apple Reviewer`);
    console.log(`  subscriptionStatus: PRO`);
    console.log(
      `  stripeCurrentPeriodEnd: ${periodEnd.toISOString()} (90 days out)`
    );
    console.log(`  passwordHash set:   yes (bcrypt cost=12)`);
    console.log(`Row counts:`);
    for (const [model, count] of Object.entries(counts)) {
      console.log(`  ${model.padEnd(20)} ${count}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

function getWeekNumber(d: Date): number {
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  }
  return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
}

main().catch((err) => {
  console.error("[seed-reviewer] threw:", err);
  process.exit(1);
});
