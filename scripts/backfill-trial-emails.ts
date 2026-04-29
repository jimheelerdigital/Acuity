/**
 * One-time backfill for trial emails that were never sent because the
 * orchestrator wasn't running in Inngest Cloud.
 *
 * DRY RUN by default — shows what WOULD be sent without sending.
 * Pass --send to actually dispatch emails.
 *
 * Usage:
 *   npx tsx scripts/backfill-trial-emails.ts          # dry run
 *   npx tsx scripts/backfill-trial-emails.ts --send   # actually send
 *
 * Rules:
 * - Only sends emails for the user's CURRENT stage (no backfilling
 *   stages they've already passed)
 * - Skips welcome_day0 (already sent inline at signup)
 * - Skips any emailKey that already has a TrialEmailLog row
 * - Skips unsubscribed users
 * - Skips users whose trial has expired
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Track = "STANDARD" | "REACTIVATION" | "POWER_USER";

function hoursSince(d: Date, now: Date): number {
  return Math.floor((now.getTime() - d.getTime()) / (60 * 60 * 1000));
}

function classifyTrack(
  firstRecordingAt: Date | null,
  totalRecordings: number,
  hoursSinceSignup: number
): Track {
  if (firstRecordingAt == null && hoursSinceSignup >= 48) return "REACTIVATION";
  if (totalRecordings >= 5 && hoursSinceSignup >= 96) return "POWER_USER";
  return "STANDARD";
}

// Only send the CURRENT due email, not past ones the user has already
// graduated beyond. This prevents spamming Day 2 emails to Day 10 users.
function currentEmailForUser(
  track: Track,
  h: number,
  sentKeys: Set<string>,
  firstRecordingAt: Date | null,
  trialEndsAt: Date | null,
  firstWeeklyReportAt: Date | null,
  now: Date
): string | null {
  if (track === "REACTIVATION") {
    // Only send the latest applicable reactivation email
    if (h >= 24 * 7 && !sentKeys.has("reactivation_final")) return "reactivation_final";
    if (h >= 24 * 4 && !sentKeys.has("reactivation_social")) return "reactivation_social";
    if (h >= 48 && !sentKeys.has("reactivation_friction")) return "reactivation_friction";
    return null;
  }

  // Trial ending takes priority
  if (!sentKeys.has("trial_ending_day13") && trialEndsAt) {
    const msUntilEnd = trialEndsAt.getTime() - now.getTime();
    if (msUntilEnd <= 24 * 60 * 60 * 1000 && msUntilEnd > -6 * 60 * 60 * 1000) {
      return "trial_ending_day13";
    }
  }

  if (track === "POWER_USER") {
    if (!sentKeys.has("value_recap") && h >= 24 * 12) return "value_recap";
    if (!sentKeys.has("power_referral_tease") && h >= 24 * 8) return "power_referral_tease";
    if (!sentKeys.has("power_deepen")) return "power_deepen";
    return null;
  }

  // STANDARD — return the LATEST applicable email only
  if (!sentKeys.has("life_matrix_reveal") && h >= 24 * 10) return "life_matrix_reveal";
  if (
    !sentKeys.has("weekly_report_checkin") &&
    firstWeeklyReportAt &&
    hoursSince(firstWeeklyReportAt, now) >= 24
  ) return "weekly_report_checkin";
  if (!sentKeys.has("user_story") && h >= 24 * 5) return "user_story";
  if (!sentKeys.has("pattern_tease") && h >= 72) return "pattern_tease";
  if (!sentKeys.has("objection_60sec") && h >= 48) return "objection_60sec";
  if (
    !sentKeys.has("first_debrief_replay") &&
    firstRecordingAt &&
    hoursSince(firstRecordingAt, now) >= 24
  ) return "first_debrief_replay";

  return null;
}

async function main() {
  const shouldSend = process.argv.includes("--send");
  const now = new Date();

  console.log(`[backfill-trial-emails] Mode: ${shouldSend ? "SEND" : "DRY RUN"}`);
  console.log(`[backfill-trial-emails] Time: ${now.toISOString()}`);

  const users = await prisma.user.findMany({
    where: {
      subscriptionStatus: "TRIAL",
      onboardingUnsubscribed: false,
      OR: [{ trialEndsAt: null }, { trialEndsAt: { gt: now } }],
    },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      trialEndsAt: true,
      firstRecordingAt: true,
      totalRecordings: true,
      foundingMemberNumber: true,
      onboardingTrack: true,
      onboardingUnsubscribed: true,
    },
  });

  console.log(`[backfill-trial-emails] Found ${users.length} active trial users`);

  let wouldSend = 0;
  let actuallySent = 0;
  let skipped = 0;

  for (const u of users) {
    const h = hoursSince(u.createdAt, now);
    const track = classifyTrack(u.firstRecordingAt, u.totalRecordings, h);

    const logs = await prisma.trialEmailLog.findMany({
      where: { userId: u.id },
      select: { emailKey: true },
    });
    const sentKeys = new Set(logs.map((l) => l.emailKey));

    const firstReport = await prisma.weeklyReport.findFirst({
      where: { userId: u.id, status: "COMPLETE" },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });

    const emailKey = currentEmailForUser(
      track,
      h,
      sentKeys,
      u.firstRecordingAt,
      u.trialEndsAt,
      firstReport?.createdAt ?? null,
      now
    );

    if (!emailKey) {
      skipped++;
      continue;
    }

    console.log(
      `  ${u.email} — track=${track}, h=${h}, would send: ${emailKey}` +
      (sentKeys.size > 0 ? ` (already sent: ${[...sentKeys].join(", ")})` : "")
    );
    wouldSend++;

    if (shouldSend) {
      try {
        // Dynamic import to avoid loading Resend in dry-run mode
        const { sendTrialEmail } = await import("../apps/web/src/lib/trial-emails");
        const result = await sendTrialEmail(u.id, emailKey as never);
        if (result.sent) {
          actuallySent++;
          console.log(`    ✓ SENT ${emailKey} to ${u.email}`);
        } else {
          console.log(`    ✗ SKIPPED: ${result.reason}`);
        }
      } catch (err) {
        console.error(`    ✗ ERROR: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  console.log(`\n[backfill-trial-emails] Summary:`);
  console.log(`  Total users: ${users.length}`);
  console.log(`  Skipped (up to date): ${skipped}`);
  console.log(`  Would send: ${wouldSend}`);
  if (shouldSend) {
    console.log(`  Actually sent: ${actuallySent}`);
  } else {
    console.log(`  (Dry run — pass --send to actually dispatch)`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
