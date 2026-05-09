/**
 * One-off backfill: for every User that has no UserReminder rows yet,
 * create one from their legacy `notificationTime` + `notificationDays`
 * + `notificationsEnabled` fields. Idempotent — safe to re-run.
 *
 * Schedule:
 *   1. Keenan runs `npx prisma db push` from home network (creates
 *      UserReminder table).
 *   2. Keenan runs this script:
 *        npx tsx apps/web/scripts/backfill-user-reminders.ts
 *   3. Verify:
 *        SELECT COUNT(*) FROM "UserReminder";
 *      Should be ≥ count of Users that had any non-default
 *      notification preference set.
 *
 * Why both an explicit script AND a lazy-backfill on first GET? Belt-
 * and-suspenders. The script handles the bulk in one shot so the
 * /api/account/reminders endpoint isn't doing migration work in the
 * hot path of every fresh user's first call. The lazy fallback in
 * the GET handler covers any user the script missed (e.g., a user
 * created between Keenan running prisma db push and running this
 * script — that User row wouldn't have been visible to the script
 * snapshot but would still need a reminder row on first read).
 *
 * Conservative: skips users whose `notificationsEnabled` is false
 * AND whose `notificationTime` is the default "21:00" — those users
 * never engaged with the reminders feature, so creating a row for
 * them adds noise. They'll get one created lazily when they first
 * visit the Reminders screen, which is the right moment to surface
 * the feature.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      notificationTime: true,
      notificationDays: true,
      notificationsEnabled: true,
      _count: { select: { reminders: true } },
    },
  });

  console.log(`Inspecting ${users.length} users...`);

  let backfilled = 0;
  let skipped = 0;
  let alreadyHadReminders = 0;

  for (const u of users) {
    if (u._count.reminders > 0) {
      alreadyHadReminders += 1;
      continue;
    }

    // Conservative skip: users who never engaged with the feature.
    const isDefaultUnengaged =
      !u.notificationsEnabled && u.notificationTime === "21:00";
    if (isDefaultUnengaged) {
      skipped += 1;
      continue;
    }

    await prisma.userReminder.create({
      data: {
        userId: u.id,
        time: u.notificationTime,
        daysActive: u.notificationDays,
        enabled: u.notificationsEnabled,
        sortOrder: 0,
      },
    });
    backfilled += 1;
  }

  console.log(
    `Done. backfilled=${backfilled} skipped=${skipped} alreadyHadReminders=${alreadyHadReminders}`
  );
}

main()
  .catch((err) => {
    console.error("backfill-user-reminders FAILED:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
