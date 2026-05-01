/**
 * Verify a single Entry's persisted shape matches the FREE-vs-PRO
 * branch contract from v1.1 slice 2.
 *
 * Reusable across slices 3+ — keeps in the repo so future verifications
 * can drop in the same shape check rather than re-write it.
 *
 * Usage:
 *   set -a && source apps/web/.env.local && set +a && \
 *     npx tsx apps/web/scripts/verify-slice2-recording.ts \
 *       [--entry <entryId> | --user <userId> | --email <email>]
 *
 * If --entry is given, fetches that specific entry. Otherwise resolves
 * a user (via --user or --email) and pulls their most recent entry.
 *
 * Branch contract:
 *   PRO/TRIAL — status=COMPLETE, transcript+summary populated, themes
 *               non-empty, rawAnalysis non-null, embedding non-null,
 *               at least one Theme/ThemeMention persisted.
 *   FREE     — status=COMPLETE, transcript+summary populated, themes
 *              empty, rawAnalysis null, embedding null, zero Theme/
 *              ThemeMention rows tied to this entry.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

interface Args {
  entryId?: string;
  userId?: string;
  email?: string;
}

function parseArgs(argv: string[]): Args {
  const out: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--entry") out.entryId = argv[++i];
    else if (arg === "--user") out.userId = argv[++i];
    else if (arg === "--email") out.email = argv[++i];
    else throw new Error(`Unknown arg: ${arg}`);
  }
  return out;
}

async function resolveEntryId(
  prisma: PrismaClient,
  args: Args
): Promise<string> {
  if (args.entryId) return args.entryId;

  let userId = args.userId;
  if (!userId && args.email) {
    const u = await prisma.user.findUnique({
      where: { email: args.email },
      select: { id: true },
    });
    if (!u) throw new Error(`No user with email ${args.email}`);
    userId = u.id;
  }
  if (!userId) {
    throw new Error("Pass one of --entry, --user, or --email");
  }

  const recent = await prisma.entry.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!recent) {
    throw new Error(`User ${userId} has no entries`);
  }
  return recent.id;
}

function ynShort(b: boolean): string {
  return b ? "Y" : "N";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  try {
    const entryId = await resolveEntryId(prisma, args);

    const entry = await prisma.entry.findUnique({
      where: { id: entryId },
      select: {
        id: true,
        userId: true,
        status: true,
        transcript: true,
        summary: true,
        themes: true,
        wins: true,
        blockers: true,
        rawAnalysis: true,
        embedding: true,
        createdAt: true,
        partialReason: true,
      },
    });
    if (!entry) {
      console.error(`Entry ${entryId} not found.`);
      process.exit(1);
    }

    const user = await prisma.user.findUnique({
      where: { id: entry.userId },
      select: { email: true, subscriptionStatus: true, trialEndsAt: true },
    });

    const themeMentionCount = await prisma.themeMention.count({
      where: { entryId },
    });
    const taskCount = await prisma.task.count({ where: { entryId } });

    // Goals/lifeAreaMentions don't have a direct entryId FK on the goal
    // row, but Goal.entryRefs[] tracks which entries mentioned the
    // goal. Count goals that reference this entry via that array.
    const goalsTouched = await prisma.goal.count({
      where: { userId: entry.userId, entryRefs: { has: entryId } },
    });

    // Lifearea mentions live on UserMemory + LifeMapArea — not directly
    // queryable per-entry. We verify via the rawAnalysis JSON instead,
    // which carries the extraction result inline.
    const ra = entry.rawAnalysis as
      | { lifeAreaMentions?: Record<string, unknown> }
      | null;
    const lifeAreaMentionsCount =
      ra && ra.lifeAreaMentions
        ? Object.values(ra.lifeAreaMentions).filter(
            (v) =>
              v &&
              typeof v === "object" &&
              "mentioned" in v &&
              (v as { mentioned: unknown }).mentioned === true
          ).length
        : 0;

    const expected = (() => {
      if (!user) return "unknown user";
      const tier = user.subscriptionStatus;
      const trialActive =
        tier === "TRIAL" &&
        (user.trialEndsAt === null || user.trialEndsAt > new Date());
      if (tier === "PRO" || tier === "PAST_DUE" || trialActive) {
        return "PRO/TRIAL — full extraction expected";
      }
      return "FREE — Haiku summary only expected";
    })();

    console.log("─".repeat(60));
    console.log(`Entry: ${entry.id}`);
    console.log(`User:  ${user?.email ?? "(unknown)"}  (${user?.subscriptionStatus})`);
    console.log(`Created: ${entry.createdAt.toISOString()}`);
    console.log(`Expected branch: ${expected}`);
    console.log("─".repeat(60));
    console.log(`status:                 ${entry.status}`);
    if (entry.partialReason) console.log(`partialReason:          ${entry.partialReason}`);
    console.log(`transcript present:     ${ynShort(!!entry.transcript && entry.transcript.length > 0)}`);
    console.log(`summary present:        ${ynShort(!!entry.summary && entry.summary.length > 0)}`);
    console.log(`themes count:           ${entry.themes.length}`);
    console.log(`wins count:             ${entry.wins.length}`);
    console.log(`blockers count:         ${entry.blockers.length}`);
    console.log(`rawAnalysis present:    ${ynShort(entry.rawAnalysis !== null)}`);
    console.log(`embedding present:      ${ynShort(entry.embedding !== null)}`);
    console.log(`themeMention rows:      ${themeMentionCount}`);
    console.log(`tasks created:          ${taskCount}`);
    console.log(`goals touched (refs):   ${goalsTouched}`);
    console.log(`lifeAreaMentions hit:   ${lifeAreaMentionsCount}`);
    console.log("─".repeat(60));

    // Pass/fail summary against the branch contract.
    const isFreeBranch = expected.startsWith("FREE");
    const transcriptOk = !!entry.transcript && entry.transcript.length > 0;
    const summaryOk = !!entry.summary && entry.summary.length > 0;
    const completeOk = entry.status === "COMPLETE";

    const checks: Array<{ name: string; pass: boolean }> = [];
    checks.push({ name: "status === COMPLETE", pass: completeOk });
    checks.push({ name: "transcript populated", pass: transcriptOk });
    checks.push({ name: "summary populated", pass: summaryOk });

    if (isFreeBranch) {
      checks.push({ name: "themes empty", pass: entry.themes.length === 0 });
      checks.push({ name: "rawAnalysis null", pass: entry.rawAnalysis === null });
      checks.push({ name: "embedding null", pass: entry.embedding === null });
      checks.push({ name: "zero themeMention rows", pass: themeMentionCount === 0 });
      checks.push({ name: "zero tasks created", pass: taskCount === 0 });
      checks.push({ name: "zero goals touched", pass: goalsTouched === 0 });
    } else {
      checks.push({ name: "themes non-empty", pass: entry.themes.length > 0 });
      checks.push({ name: "rawAnalysis non-null", pass: entry.rawAnalysis !== null });
      checks.push({ name: "embedding non-null", pass: entry.embedding !== null });
      checks.push({ name: "≥1 themeMention row", pass: themeMentionCount > 0 });
    }

    let failed = 0;
    for (const c of checks) {
      console.log(`${c.pass ? "✓" : "✗"} ${c.name}`);
      if (!c.pass) failed++;
    }
    console.log("─".repeat(60));
    if (failed === 0) {
      console.log(`PASS — ${checks.length}/${checks.length} checks (${isFreeBranch ? "FREE" : "PRO/TRIAL"} branch)`);
    } else {
      console.log(`FAIL — ${failed}/${checks.length} checks failed`);
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
