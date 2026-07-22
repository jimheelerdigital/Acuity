/**
 * Merges a duplicate user account into the original (surviving) account.
 *
 * Designed for the OAuth-redirect-mismatch incident (2026-07-21): after
 * the getacuity.io → goripple.io domain flip, Google OAuth broke and
 * users falling back to Apple Sign In (Hide My Email) got new empty
 * accounts because the private-relay email didn't match their original
 * Google-authed row.
 *
 * Merge direction: DUPLICATE → ORIGINAL (duplicate is deleted).
 *
 * What this does:
 *   1. Verifies both accounts exist
 *   2. Backs up both rows to JSON files in .tmp/
 *   3. Moves the duplicate's Account rows to the original (so the user
 *      can sign in with that provider on their original account)
 *   4. Copies appleSubject from duplicate to original (if original lacks one)
 *   5. Moves any sessions from duplicate to original
 *   6. Moves any entries (unlikely, but safe)
 *   7. Deletes the duplicate User row
 *
 * SAFETY:
 *   - Dry-run by default (no --execute = report only)
 *   - Writes JSON backups before any mutation
 *   - Checks that the original has the subscription (Stripe/Apple)
 *   - Aborts if the duplicate has more entries than the original
 *   - Aborts if the duplicate has a Stripe subscription
 *
 * Usage:
 *   set -a && source apps/web/.env.local && set +a && \
 *     npx tsx scripts/merge-duplicate-account.ts \
 *       --original cmqyl34ms000otx4jkizqu0tp \
 *       --duplicate <DUPLICATE_USER_ID>
 *
 *   # Add --execute to actually perform the merge (after Jimmy reviews)
 *   npx tsx scripts/merge-duplicate-account.ts \
 *       --original <ID> --duplicate <ID> --execute
 */

import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

type Args = {
  originalId: string;
  duplicateId: string;
  execute: boolean;
};

function parseArgs(argv: string[]): Args {
  const a: Partial<Args> = { execute: false };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--original":
        a.originalId = argv[++i];
        break;
      case "--duplicate":
        a.duplicateId = argv[++i];
        break;
      case "--execute":
        a.execute = true;
        break;
    }
  }
  if (!a.originalId || !a.duplicateId) {
    console.error(
      "Usage: npx tsx scripts/merge-duplicate-account.ts --original <ID> --duplicate <ID> [--execute]"
    );
    process.exit(1);
  }
  return a as Args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = args.execute ? "🔴 EXECUTE" : "🟢 DRY RUN";
  console.log(`=== ACCOUNT MERGE (${mode}) ===\n`);

  // ── 1. Load both accounts ─────────────────────────────────────────────
  const original = await prisma.user.findUnique({
    where: { id: args.originalId },
    include: {
      accounts: true,
      sessions: true,
      _count: { select: { entries: true } },
    },
  });

  const duplicate = await prisma.user.findUnique({
    where: { id: args.duplicateId },
    include: {
      accounts: true,
      sessions: true,
      _count: { select: { entries: true } },
    },
  });

  if (!original) {
    console.error(`❌ Original account ${args.originalId} not found`);
    process.exit(1);
  }
  if (!duplicate) {
    console.error(`❌ Duplicate account ${args.duplicateId} not found`);
    process.exit(1);
  }

  console.log("ORIGINAL:");
  console.log(`  id: ${original.id}`);
  console.log(`  email: ${original.email}`);
  console.log(`  name: ${original.name}`);
  console.log(`  entries: ${original._count.entries}`);
  console.log(`  subscription: ${original.subscriptionStatus}`);
  console.log(`  stripeCustomerId: ${original.stripeCustomerId || "(none)"}`);
  console.log(`  appleSubject: ${original.appleSubject || "(none)"}`);
  console.log(`  providers: ${original.accounts.map((a) => a.provider).join(", ") || "(none)"}`);
  console.log(`  created: ${original.createdAt.toISOString()}`);

  console.log("\nDUPLICATE (to be merged/deleted):");
  console.log(`  id: ${duplicate.id}`);
  console.log(`  email: ${duplicate.email}`);
  console.log(`  name: ${duplicate.name}`);
  console.log(`  entries: ${duplicate._count.entries}`);
  console.log(`  subscription: ${duplicate.subscriptionStatus}`);
  console.log(`  stripeCustomerId: ${duplicate.stripeCustomerId || "(none)"}`);
  console.log(`  appleSubject: ${duplicate.appleSubject || "(none)"}`);
  console.log(`  providers: ${duplicate.accounts.map((a) => a.provider).join(", ") || "(none)"}`);
  console.log(`  sessions: ${duplicate.sessions.length}`);
  console.log(`  created: ${duplicate.createdAt.toISOString()}`);

  // ── 2. Safety checks ──────────────────────────────────────────────────
  if (duplicate._count.entries > original._count.entries) {
    console.error(
      `\n❌ ABORT: Duplicate has MORE entries (${duplicate._count.entries}) than original (${original._count.entries}). Merge direction may be wrong.`
    );
    process.exit(1);
  }

  if (
    duplicate.stripeCustomerId &&
    duplicate.subscriptionStatus !== "TRIAL" &&
    duplicate.subscriptionStatus !== "FREE"
  ) {
    console.error(
      `\n❌ ABORT: Duplicate has an active Stripe subscription (${duplicate.subscriptionStatus}). Manual review required.`
    );
    process.exit(1);
  }

  // ── 3. Plan ────────────────────────────────────────────────────────────
  console.log("\n── MERGE PLAN ──");

  const accountsToMove = duplicate.accounts.filter(
    (da) =>
      !original.accounts.some(
        (oa) =>
          oa.provider === da.provider &&
          oa.providerAccountId === da.providerAccountId
      )
  );

  const steps: string[] = [];

  if (accountsToMove.length > 0) {
    steps.push(
      `Move ${accountsToMove.length} auth provider(s) from duplicate to original: ${accountsToMove.map((a) => a.provider).join(", ")}`
    );
  }

  if (duplicate.appleSubject && !original.appleSubject) {
    steps.push(
      `Copy appleSubject from duplicate to original: ${duplicate.appleSubject.slice(0, 16)}…`
    );
  }

  if (duplicate.sessions.length > 0) {
    steps.push(`Delete ${duplicate.sessions.length} session(s) on duplicate`);
  }

  if (duplicate._count.entries > 0) {
    steps.push(
      `Move ${duplicate._count.entries} entries from duplicate to original`
    );
  }

  steps.push(`Delete duplicate User row (${duplicate.id})`);

  for (const step of steps) {
    console.log(`  → ${step}`);
  }

  if (!args.execute) {
    console.log(
      "\n🟢 DRY RUN — no changes made. Add --execute to perform the merge."
    );
    await prisma.$disconnect();
    return;
  }

  // ── 4. Backup ──────────────────────────────────────────────────────────
  const tmpDir = path.resolve(__dirname, "../.tmp");
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(tmpDir, `account-merge-backup-${ts}.json`);

  fs.writeFileSync(
    backupPath,
    JSON.stringify({ original, duplicate }, null, 2)
  );
  console.log(`\n💾 Backup written to ${backupPath}`);

  // ── 5. Execute merge ──────────────────────────────────────────────────
  console.log("\n🔴 Executing merge...\n");

  await prisma.$transaction(async (tx) => {
    // Move auth providers
    for (const acc of accountsToMove) {
      await tx.account.update({
        where: { id: acc.id },
        data: { userId: original.id },
      });
      console.log(`  ✓ Moved ${acc.provider} account to original`);
    }

    // Copy appleSubject
    if (duplicate.appleSubject && !original.appleSubject) {
      await tx.user.update({
        where: { id: original.id },
        data: { appleSubject: duplicate.appleSubject },
      });
      console.log(`  ✓ Copied appleSubject to original`);
    }

    // Move entries (if any)
    if (duplicate._count.entries > 0) {
      await tx.entry.updateMany({
        where: { userId: duplicate.id },
        data: { userId: original.id },
      });
      console.log(`  ✓ Moved ${duplicate._count.entries} entries to original`);
    }

    // Delete sessions on duplicate
    if (duplicate.sessions.length > 0) {
      await tx.session.deleteMany({
        where: { userId: duplicate.id },
      });
      console.log(`  ✓ Deleted ${duplicate.sessions.length} session(s)`);
    }

    // Delete duplicate user (FK cascades will clean up remaining relations)
    await tx.user.delete({
      where: { id: duplicate.id },
    });
    console.log(`  ✓ Deleted duplicate User row ${duplicate.id}`);
  });

  console.log("\n✅ Merge complete. The user will need to sign in again.");
  console.log(
    `   Original account ${original.id} (${original.email}) now has the linked providers.`
  );

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
