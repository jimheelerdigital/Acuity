/**
 * Diagnostic: compare recent user signups against FounderNotificationLog
 * to see whether signup notification emails were attempted / succeeded.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const users = await prisma.user.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, name: true, createdAt: true },
  });

  const logs = await prisma.founderNotificationLog.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
  });

  console.log(`Users created since ${since.toISOString()}: ${users.length}`);
  console.log(`FounderNotificationLog rows since then: ${logs.length}\n`);

  const logByUser = new Map(logs.map((l) => [l.userId, l]));

  for (const u of users) {
    const log = logByUser.get(u.id);
    const status = log
      ? log.success
        ? "SENT"
        : `FAILED: ${log.errorMessage}`
      : "NO LOG ROW (notify never ran or log write failed)";
    console.log(
      `${u.createdAt.toISOString()}  ${u.email}  →  ${status}`
    );
  }

  // Any log rows not matching a recent user (shouldn't happen, but check)
  const userIds = new Set(users.map((u) => u.id));
  const orphans = logs.filter((l) => !userIds.has(l.userId));
  if (orphans.length) {
    console.log(`\nLog rows for non-recent users: ${orphans.length}`);
  }

  // Last successful notification ever, to bracket when it broke
  const lastSuccess = await prisma.founderNotificationLog.findFirst({
    where: { success: true },
    orderBy: { createdAt: "desc" },
  });
  const lastFailure = await prisma.founderNotificationLog.findFirst({
    where: { success: false },
    orderBy: { createdAt: "desc" },
  });
  console.log(
    `\nLast SUCCESS log: ${lastSuccess?.createdAt.toISOString() ?? "none"}`
  );
  console.log(
    `Last FAILURE log: ${lastFailure?.createdAt.toISOString() ?? "none"}${
      lastFailure ? ` (${lastFailure.errorMessage})` : ""
    }`
  );
}

main().finally(() => prisma.$disconnect());
