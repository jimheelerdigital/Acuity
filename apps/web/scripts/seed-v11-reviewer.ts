/**
 * v1.1 Apple App Store reviewer account seed — FREE post-trial.
 *
 * This account exercises the FREE-tier locked-state UX added in
 * v1.1. The v1.0 reviewer (`scripts/seed-app-store-reviewer.ts`,
 * PRO tier) covers the active-Pro experience and stays seeded.
 *
 * Strict allowlist — only literal addresses listed in
 * ALLOWED_REVIEWER_EMAILS are accepted. Refuses to run against any
 * other address even with --force, so a typo can't clobber a real
 * user (the existing seed-test-user.ts blocks gmail.com patterns;
 * this one explicitly allows ONE specific reviewer alias).
 *
 * Usage:
 *   set -a && source apps/web/.env.local && set +a && \
 *     npx tsx apps/web/scripts/seed-v11-reviewer.ts \
 *       --email jim+applereview-v11@heelerdigital.com \
 *       --password 'm6d&s9DWdVn%fLKU'
 *
 * What it creates:
 *   - User row (subscriptionStatus=FREE, trialEndsAt=7 days ago,
 *     no stripeCustomerId, freeRecordingsThisMonth=0)
 *   - UserOnboarding (completedAt = now → no onboarding redirect)
 *   - 8 Entry rows spanning the prior 30 days. extracted=false,
 *     rawAnalysis=null — mimics entries recorded during the FREE
 *     recording loop, so the slice 5 backfill banner has data
 *     behind it AND so the locked extraction surfaces have entries
 *     to gate against.
 *   - Theme + ThemeMention rows so the locked Theme Map preview
 *     has data behind the blur.
 *   - 6 LifeMapArea rows (all six canonical areas) so the locked
 *     Life Matrix radar has all axes.
 *   - 2 Goal rows + 3 Task rows so the locked Goals + Tasks
 *     previews have cards to render.
 *   - 1 WeeklyReport row (most recent week, status=COMPLETE) so
 *     the locked Insights preview shows a header.
 *
 * What it deliberately OMITS:
 *   - No LifeAudit (Day-14 audit is locked behind canExtractEntries).
 *   - No `extracted = true` on any Entry — the FREE state is
 *     "recorded but not extracted". This is what the locked-state
 *     UI is designed to gate against.
 *   - No freeCapState pre-load — counter is 0, cap UX dormant.
 *
 * --force: deletes the existing user row first (cascades clean).
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const ALLOWED_REVIEWER_EMAILS = new Set<string>([
  "jim+applereview-v11@heelerdigital.com",
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
      `[seed-v11-reviewer] REFUSED: "${email}" is not in the v1.1 reviewer allowlist.`
    );
    console.error(`Allowed emails (literal):`);
    for (const e of ALLOWED_REVIEWER_EMAILS) console.error(`  ${e}`);
    process.exit(1);
  }
}

// ───────────────────────────────────────────────────────────────────
// Realistic content. 8 entries spread across 30 days — mirrors the
// pacing of a real FREE-tier user (recording occasionally, not
// nightly). Mood arc trends mildly upward to give the locked Theme
// Map / Life Matrix preview surfaces something coherent to gate.
// ───────────────────────────────────────────────────────────────────

type EntrySpec = {
  daysAgo: number;
  hour: number;
  mood: "GREAT" | "GOOD" | "NEUTRAL" | "LOW" | "ROUGH";
  moodScore: number;
  energy: number;
  themes: string[];
  summary: string;
  transcript: string;
};

const ENTRY_SPECS: EntrySpec[] = [
  {
    daysAgo: 1,
    hour: 21,
    mood: "GOOD",
    moodScore: 7,
    energy: 4,
    themes: ["work", "writing"],
    summary:
      "Quiet day at the desk. Got the doc to a place I'm not embarrassed to share.",
    transcript:
      "Quiet day. Got the design doc to a place I'm actually willing to share. Took longer than I'd planned but the bones are right. Going to bed early — I'm noticing the days I don't push past 9pm always end better.",
  },
  {
    daysAgo: 3,
    hour: 22,
    mood: "GOOD",
    moodScore: 7,
    energy: 4,
    themes: ["family", "evening"],
    summary:
      "Cooked with the kids. The kind of normal night I want more of.",
    transcript:
      "Made dinner with the kids tonight. They set the table without being asked which is a first. Phones away. We talked about their week. The right kind of tired.",
  },
  {
    daysAgo: 6,
    hour: 21,
    mood: "NEUTRAL",
    moodScore: 5,
    energy: 3,
    themes: ["sleep", "work"],
    summary:
      "Restless night. The phone-in-the-bedroom rule keeps slipping.",
    transcript:
      "Couldn't sleep until almost midnight. Phone was in the bedroom which I keep saying I won't do. Tomorrow I'll be dragging. Putting the phone in the kitchen tonight — for real this time.",
  },
  {
    daysAgo: 10,
    hour: 22,
    mood: "LOW",
    moodScore: 4,
    energy: 2,
    themes: ["work", "stress"],
    summary:
      "Customer escalation ate three hours. Need a real triage process.",
    transcript:
      "Customer escalation took the whole afternoon. I'm not built for the immediate-fire context-switching and it killed my writing time. I need a real triage flow with the team so it doesn't always land on me.",
  },
  {
    daysAgo: 14,
    hour: 21,
    mood: "GOOD",
    moodScore: 7,
    energy: 4,
    themes: ["family", "weekend"],
    summary: "Took the kids to the park. No phone, two hours, no agenda.",
    transcript:
      "Took the kids to the park for two hours. Phone in the car. They wanted to do the climbing wall over and over. The days I feel best end with a couple of unplugged hours like that.",
  },
  {
    daysAgo: 18,
    hour: 22,
    mood: "GREAT",
    moodScore: 9,
    energy: 5,
    themes: ["personal", "weekend"],
    summary:
      "Walked 18 alone. Came back with my head in a different place.",
    transcript:
      "Walked 18 holes alone today. Three hours, phone in the bag. Came back with my head in a different place. I should do this every weekend, even if I shoot 95.",
  },
  {
    daysAgo: 24,
    hour: 21,
    mood: "NEUTRAL",
    moodScore: 5,
    energy: 3,
    themes: ["work", "decision"],
    summary:
      "Said no to a meeting that didn't need me. Felt strange. Will do it again.",
    transcript:
      "Said no to a meeting that didn't need me. Replied with two sentences pointing them at the right person. It felt strange — like I was getting away with something — but the afternoon was free and I used it well.",
  },
  {
    daysAgo: 28,
    hour: 22,
    mood: "ROUGH",
    moodScore: 3,
    energy: 2,
    themes: ["work", "burnout"],
    summary:
      "Fourteen-hour day. Stared at the screen with nothing left in the tank.",
    transcript:
      "Fourteen-hour day. Stared at the screen at 11pm with nothing left. This is the day that reminds me why I started recording — I keep doing this to myself and being surprised when I'm exhausted. The pattern is the pattern.",
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
        `[seed-v11-reviewer] User ${args.email} already exists (id=${existing.id}). Pass --force to delete + recreate.`
      );
      process.exit(1);
    }
    if (existing && args.force) {
      console.log(
        `[seed-v11-reviewer] --force: deleting existing ${args.email}…`
      );
      // Use deleteMany to avoid Prisma's RETURNING column drift on
      // schema-vs-DB lag — same defensive pattern as /api/user/delete.
      await prisma.user.deleteMany({ where: { id: existing.id } });
    }

    const now = new Date();
    const trialEndsAt = new Date(now.getTime() - 7 * 86400000); // 7 days ago

    const passwordHash = await bcrypt.hash(args.password, 12);

    const user = await prisma.user.create({
      data: {
        email: args.email,
        name: "Apple Reviewer (v1.1 / FREE)",
        emailVerified: now,
        passwordHash,
        // FREE post-trial — the canonical state v1.1's locked-state
        // UX is designed for. canExtractEntries=false at the
        // entitlement layer; canRecord=true; canSyncCalendar=false.
        subscriptionStatus: "FREE",
        trialEndsAt,
        stripeCustomerId: null,
        timezone: "America/Chicago",
        currentStreak: 0,
        longestStreak: 3,
        notificationTime: "21:00",
        notificationDays: [0, 1, 2, 3, 4, 5, 6],
        notificationsEnabled: true,
        totalRecordings: ENTRY_SPECS.length,
        // Slice 6 cap fields — explicitly zeroed/null so the
        // reviewer's first recording starts a fresh window.
        freeRecordingsThisMonth: 0,
        freeRecordingsResetAt: null,
        // Slice 5 backfill banner — null means the prompt will
        // appear on /home so the reviewer sees + dismisses it as
        // part of testing the upgrade affordance UX.
        backfillPromptDismissedAt: null,
      },
      select: { id: true, email: true },
    });

    await prisma.userOnboarding.create({
      data: {
        userId: user.id,
        currentStep: 10,
        completedAt: now,
        moodBaseline: "GOOD",
        moodBaselineNumeric: 6,
        lifeAreaPriorities: {
          CAREER: 1,
          HEALTH: 2,
          RELATIONSHIPS: 3,
        },
        microphoneGranted: true,
        referralSource: "App Store reviewer (v1.1)",
        expectedUsageFrequency: "weekly",
      },
    });

    // ─── Entries ────────────────────────────────────────────────────
    // extracted=false + rawAnalysis=null means these mirror the
    // FREE-tier recording-only experience. The locked-state UI on
    // /entries/[id] gates against this exact shape.
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
          wins: [],
          blockers: [],
          duration: 60 + Math.floor(Math.random() * 120),
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
    // Modest scores reflecting a real FREE user 30 days into recording.
    const lifeMapAreas = [
      {
        area: "CAREER",
        name: "Career",
        color: "#3B82F6",
        score: 6,
        topThemes: ["work", "writing", "decision"],
      },
      {
        area: "HEALTH",
        name: "Health",
        color: "#14B8A6",
        score: 5,
        topThemes: ["sleep", "exercise"],
      },
      {
        area: "RELATIONSHIPS",
        name: "Relationships",
        color: "#F43F5E",
        score: 7,
        topThemes: ["family", "evening"],
      },
      {
        area: "FINANCES",
        name: "Finances",
        color: "#F59E0B",
        score: 5,
        topThemes: ["budget"],
      },
      {
        area: "PERSONAL",
        name: "Personal Growth",
        color: "#A855F7",
        score: 6,
        topThemes: ["weekend", "personal"],
      },
      {
        area: "OTHER",
        name: "Other",
        color: "#71717A",
        score: 4,
        topThemes: ["misc"],
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
          summary: `${a.name} — placeholder for the locked-state Life Matrix preview. Scores 0-10 with realistic variance.`,
          activeGoals: i < 2 ? 1 : 0,
          lastMentioned: now,
          trend: "stable",
          weeklyDelta: 0,
          monthlyDelta: 0,
          mentionCount: 3 + i,
          topThemes: a.topThemes,
          insightSummary: null,
          historicalHigh: Math.min(10, a.score + 1),
          historicalLow: Math.max(0, a.score - 2),
          baselineScore: 5,
        },
      });
    }

    // ─── Goals ──────────────────────────────────────────────────────
    const goalSpecs = [
      {
        title: "Sleep 7+ hours every weeknight",
        description:
          "Phone in the kitchen by 10pm, lights off by 10:30. Habit stack from the existing evening routine.",
        lifeArea: "HEALTH",
        status: "IN_PROGRESS",
        progress: 40,
      },
      {
        title: "Defend the calendar — max 3 meetings/day",
        description:
          "Block deep-work mornings; push lunchtime + late-afternoon meetings to specific days.",
        lifeArea: "CAREER",
        status: "NOT_STARTED",
        progress: 10,
      },
    ];
    for (const g of goalSpecs) {
      await prisma.goal.create({
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
      });
    }

    // ─── Tasks ──────────────────────────────────────────────────────
    const taskSpecs = [
      {
        title: "Set up meeting triage with the team",
        status: "OPEN",
        priority: "HIGH",
      },
      {
        title: "Schedule weekly date night",
        status: "OPEN",
        priority: "MEDIUM",
      },
      {
        title: "Walked 18 alone — calendar weekly",
        status: "DONE",
        priority: "LOW",
        completedDaysAgo: 18,
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

    // ─── Weekly Report (most recent only) ──────────────────────────
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 6);
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
        narrative:
          "Locked-state placeholder narrative for the v1.1 FREE reviewer experience. Real narratives are generated on the active-trial / Pro path; FREE post-trial users see the locked card surface instead.",
        insightBullets: [
          "Mood trended mildly upward across the week",
          "2 of 8 recent entries mention family time",
          "Sleep showed up as the most-mentioned blocker",
        ],
        moodArc:
          "Steady; no extreme lows or highs. Typical of a quiet recording week.",
        topThemes: ["work", "family", "sleep"],
        tasksOpened: 2,
        tasksClosed: 1,
        goalsProgressed: [],
        entryCount: ENTRY_SPECS.length,
        status: "COMPLETE",
        createdAt: weekEnd,
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
    };

    console.log(`[seed-v11-reviewer] OK`);
    console.log(`  userId:                  ${user.id}`);
    console.log(`  email:                   ${user.email}`);
    console.log(`  name:                    Apple Reviewer (v1.1 / FREE)`);
    console.log(`  subscriptionStatus:      FREE`);
    console.log(`  trialEndsAt:             ${trialEndsAt.toISOString()} (7d ago)`);
    console.log(`  stripeCustomerId:        null`);
    console.log(`  freeRecordingsThisMonth: 0`);
    console.log(`  passwordHash set:        yes (bcrypt cost=12)`);
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
  console.error("[seed-v11-reviewer] threw:", err);
  process.exit(1);
});
