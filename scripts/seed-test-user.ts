/**
 * Creates a test user with configurable trial + onboarding state.
 *
 * Intended for manual QA of the paywall flow, onboarding redirect, and
 * /upgrade page states against the real prod DB without having to sign
 * up + wait for real time to elapse.
 *
 * SAFETY GATE: email must match one of the ALLOWED_EMAIL_PATTERNS below.
 * Refuses to run against real-looking domains so a typo can't seed a
 * fake account into a real user's inbox (magic-link hijacking risk).
 *
 * Usage:
 *   set -a && source apps/web/.env.local && set +a && \
 *     npx tsx scripts/seed-test-user.ts \
 *       --email qa-paywall-01@test.getacuity.io \
 *       --name "QA Paywall 01" \
 *       --days-into-trial 13 \
 *       --subscription-status TRIAL \
 *       --with-onboarding-complete \
 *       --with-entries 3
 *
 * Flags:
 *   --email (required)              Target email. Must match an allowed pattern.
 *   --name                          Display name. Defaults to the email's local-part.
 *   --days-into-trial N             0 = fresh (14d remaining), 14 = expiring today,
 *                                   15 = expired yesterday. Computes trialEndsAt.
 *                                   Defaults to 0.
 *   --subscription-status STATUS    TRIAL | PRO | FREE | PAST_DUE. Defaults to TRIAL.
 *   --with-onboarding-complete      If set, creates a UserOnboarding row with
 *                                   completedAt = now so the dashboard doesn't
 *                                   redirect into /onboarding. Defaults to absent
 *                                   (user will land in onboarding on first load).
 *   --with-entries N                Create N sample Entry rows with dummy transcripts.
 *                                   Defaults to 0. Entries get status=COMPLETE and
 *                                   spread over the last N days (one per day, 21:00
 *                                   user-time).
 *   --force                         Overwrite an existing user with matching email
 *                                   (deletes + recreates via prisma cascade).
 *                                   Without this, an existing email aborts.
 *
 * Exits 0 on success with the created userId printed. Exits 1 on any error.
 */

import { PrismaClient } from "@prisma/client";

const ALLOWED_EMAIL_PATTERNS = [
  /@test\.getacuity\.io$/i,
  /@example\.com$/i,
  /\+test[0-9]*@getacuity\.io$/i, // plus-addressed on our own domain
];

type Args = {
  email: string;
  name?: string;
  daysIntoTrial: number;
  subscriptionStatus: string;
  withOnboardingComplete: boolean;
  withEntries: number;
  force: boolean;
};

function parseArgs(argv: string[]): Args {
  const a: Partial<Args> = {
    daysIntoTrial: 0,
    subscriptionStatus: "TRIAL",
    withOnboardingComplete: false,
    withEntries: 0,
    force: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--email":
        a.email = argv[++i];
        break;
      case "--name":
        a.name = argv[++i];
        break;
      case "--days-into-trial":
        a.daysIntoTrial = Number(argv[++i]);
        break;
      case "--subscription-status":
        a.subscriptionStatus = argv[++i];
        break;
      case "--with-onboarding-complete":
        a.withOnboardingComplete = true;
        break;
      case "--with-entries":
        a.withEntries = Number(argv[++i]);
        break;
      case "--force":
        a.force = true;
        break;
      default:
        throw new Error(`Unknown arg: ${arg}`);
    }
  }
  if (!a.email) throw new Error("Missing required --email");
  if (!Number.isFinite(a.daysIntoTrial)) {
    throw new Error("--days-into-trial must be a number");
  }
  if (!Number.isFinite(a.withEntries) || a.withEntries! < 0) {
    throw new Error("--with-entries must be a non-negative integer");
  }
  return a as Args;
}

function assertSafeEmail(email: string): void {
  const ok = ALLOWED_EMAIL_PATTERNS.some((re) => re.test(email));
  if (!ok) {
    console.error(
      `[seed-test-user] REFUSED: "${email}" does not match an allowed test-email pattern.`
    );
    console.error(`Allowed patterns:`);
    for (const re of ALLOWED_EMAIL_PATTERNS) console.error(`  ${re}`);
    console.error(
      `\nIf you need to seed a new pattern, edit ALLOWED_EMAIL_PATTERNS in this script.`
    );
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  assertSafeEmail(args.email);

  const prisma = new PrismaClient();
  try {
    const existing = await prisma.user.findUnique({
      where: { email: args.email },
      select: { id: true },
    });
    if (existing && !args.force) {
      console.error(
        `[seed-test-user] User ${args.email} already exists (id=${existing.id}). Pass --force to delete + recreate.`
      );
      process.exit(1);
    }
    if (existing && args.force) {
      console.log(`[seed-test-user] --force: deleting existing ${args.email}...`);
      await prisma.user.delete({ where: { id: existing.id } });
    }

    const now = new Date();
    const trialEndsAt = new Date(now);
    trialEndsAt.setDate(trialEndsAt.getDate() + (14 - args.daysIntoTrial));

    const displayName = args.name ?? args.email.split("@")[0];

    const user = await prisma.user.create({
      data: {
        email: args.email,
        name: displayName,
        emailVerified: now,
        subscriptionStatus: args.subscriptionStatus,
        trialEndsAt,
      },
      select: { id: true, email: true, trialEndsAt: true },
    });

    if (args.withOnboardingComplete) {
      await prisma.userOnboarding.create({
        data: {
          userId: user.id,
          currentStep: 8,
          completedAt: now,
          moodBaseline: "GOOD",
          lifeAreaPriorities: {
            CAREER: 4,
            HEALTH: 5,
            RELATIONSHIPS: 4,
            FINANCES: 3,
            PERSONAL: 4,
            OTHER: 2,
          },
          referralSource: "seed-script",
          expectedUsageFrequency: "DAILY",
          microphoneGranted: true,
        },
      });
    }

    if (args.withEntries > 0) {
      const sampleTranscripts = [
        "Shipped the paywall PR today. Nervous about the 14-day trial cutoff but the unit tests gave me confidence. Goal: keep momentum tomorrow.",
        "Slept poorly. Focus was off for the first hour. Hit the gym at lunch and the afternoon saved the day.",
        "Had a good conversation with Keenan about pricing — leaning toward $12.99 to stay below the psychological $15 threshold.",
        "Rough day. Customer support escalation ate three hours. Need to delegate this or add a triage step.",
        "Quiet deep-work morning. Wrote the Life Audit generator. Feels like a real product inflection.",
      ];
      for (let i = 0; i < args.withEntries; i++) {
        const entryDate = new Date(now);
        entryDate.setDate(entryDate.getDate() - i);
        entryDate.setHours(21, 0, 0, 0);
        await prisma.entry.create({
          data: {
            userId: user.id,
            transcript: sampleTranscripts[i % sampleTranscripts.length],
            summary: "Test entry from seed-test-user.ts",
            mood: i % 2 === 0 ? "GOOD" : "NEUTRAL",
            moodScore: i % 2 === 0 ? 4 : 3,
            energy: 3,
            themes: ["work", "momentum"],
            wins: ["Shipped something"],
            blockers: [],
            status: "COMPLETE",
            entryDate,
          },
        });
      }
    }

    console.log(`[seed-test-user] OK`);
    console.log(`  userId:             ${user.id}`);
    console.log(`  email:              ${user.email}`);
    console.log(`  name:               ${displayName}`);
    console.log(`  subscriptionStatus: ${args.subscriptionStatus}`);
    console.log(`  trialEndsAt:        ${user.trialEndsAt?.toISOString()} (${args.daysIntoTrial}d into trial)`);
    console.log(`  onboarding:         ${args.withOnboardingComplete ? "complete" : "pending"}`);
    console.log(`  entries:            ${args.withEntries}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[seed-test-user] threw:", err);
  process.exit(1);
});
