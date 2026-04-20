/**
 * Deletes test users by email pattern. Cascades via User FK constraints.
 *
 * SAFETY GATES (all three required):
 *   1. --pattern must contain one of `@test.`, `@example.`, or `+test`
 *      to prevent a typo from sweeping real users.
 *   2. Without --yes the script is dry-run only: lists matches, makes no
 *      changes, exits 0.
 *   3. --max caps how many rows a single run can delete. Defaults to 20.
 *      Runs that would exceed --max abort; raise the cap deliberately.
 *
 * Usage:
 *   # Dry run (default — lists matches, deletes nothing):
 *   set -a && source apps/web/.env.local && set +a && \
 *     npx tsx scripts/cleanup-test-users.ts --pattern "@test.getacuity.io"
 *
 *   # Execute:
 *   set -a && source apps/web/.env.local && set +a && \
 *     npx tsx scripts/cleanup-test-users.ts --pattern "@test.getacuity.io" --yes
 *
 * Also cleans the Supabase Storage prefix `voice-entries/${userId}/` for
 * each deleted user (best-effort — storage failures don't undo the DB
 * delete).
 *
 * Flags:
 *   --pattern PATTERN  Substring match against User.email (case-insensitive).
 *                      Must contain @test., @example., or +test.
 *   --yes              Execute the delete. Without this, dry-run only.
 *   --max N            Max rows to delete in one run. Defaults to 20.
 */

import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";

const REQUIRED_PATTERN_SUBSTRINGS = ["@test.", "@example.", "+test"];
const STORAGE_BUCKET = "voice-entries";

type Args = {
  pattern: string;
  yes: boolean;
  max: number;
};

function parseArgs(argv: string[]): Args {
  const a: Partial<Args> = { yes: false, max: 20 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--pattern":
        a.pattern = argv[++i];
        break;
      case "--yes":
        a.yes = true;
        break;
      case "--max":
        a.max = Number(argv[++i]);
        break;
      default:
        throw new Error(`Unknown arg: ${arg}`);
    }
  }
  if (!a.pattern) throw new Error("Missing required --pattern");
  if (!Number.isFinite(a.max) || a.max! < 1) {
    throw new Error("--max must be a positive integer");
  }
  return a as Args;
}

function assertSafePattern(pattern: string): void {
  const lower = pattern.toLowerCase();
  const ok = REQUIRED_PATTERN_SUBSTRINGS.some((s) => lower.includes(s));
  if (!ok) {
    console.error(
      `[cleanup-test-users] REFUSED: pattern "${pattern}" does not contain any of:`
    );
    for (const s of REQUIRED_PATTERN_SUBSTRINGS) console.error(`  ${s}`);
    console.error(
      `\nThis gate exists so a typo like "--pattern .com" cannot sweep real users.`
    );
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  assertSafePattern(args.pattern);

  const prisma = new PrismaClient();
  try {
    const matches = await prisma.user.findMany({
      where: {
        email: { contains: args.pattern, mode: "insensitive" },
      },
      select: {
        id: true,
        email: true,
        createdAt: true,
        subscriptionStatus: true,
      },
      orderBy: { createdAt: "desc" },
    });

    console.log(
      `[cleanup-test-users] Found ${matches.length} user(s) matching "${args.pattern}":`
    );
    for (const m of matches) {
      console.log(
        `  - ${m.email}  id=${m.id}  status=${m.subscriptionStatus}  created=${m.createdAt.toISOString()}`
      );
    }

    if (matches.length === 0) {
      console.log(`[cleanup-test-users] Nothing to do.`);
      return;
    }

    if (matches.length > args.max) {
      console.error(
        `[cleanup-test-users] ABORT: ${matches.length} matches exceeds --max=${args.max}. Raise the cap deliberately if this is intended.`
      );
      process.exit(1);
    }

    if (!args.yes) {
      console.log(
        `\n[cleanup-test-users] DRY RUN — no changes made. Pass --yes to execute.`
      );
      return;
    }

    // Execute: per-user deletion so one failure doesn't block the batch.
    // Cascades drop Entry/Task/Goal/WeeklyReport/LifeMapArea/UserMemory/
    // UserOnboarding/Account/Session via the schema's onDelete: Cascade
    // FKs. VerificationToken has no FK to User — hand-clean by email.
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const sb = supabaseUrl && serviceRole
      ? createClient(supabaseUrl, serviceRole)
      : null;
    if (!sb) {
      console.warn(
        `[cleanup-test-users] Supabase env vars unset — storage cleanup will be skipped.`
      );
    }

    let deleted = 0;
    for (const m of matches) {
      try {
        await prisma.$transaction(async (tx) => {
          await tx.verificationToken.deleteMany({
            where: { identifier: m.email },
          });
          await tx.user.delete({ where: { id: m.id } });
        });
        deleted++;
        console.log(`  ✓ deleted ${m.email} (${m.id})`);

        if (sb) {
          const { data: objects, error: listErr } = await sb.storage
            .from(STORAGE_BUCKET)
            .list(m.id, { limit: 100 });
          if (listErr) {
            console.warn(`    storage list failed for ${m.id}:`, listErr.message);
          } else if (objects && objects.length > 0) {
            const paths = objects.map((o) => `${m.id}/${o.name}`);
            const { error: rmErr } = await sb.storage
              .from(STORAGE_BUCKET)
              .remove(paths);
            if (rmErr) {
              console.warn(`    storage remove failed for ${m.id}:`, rmErr.message);
            } else {
              console.log(`    cleared ${paths.length} storage object(s)`);
            }
          }
        }
      } catch (err) {
        console.error(`  ✗ failed ${m.email}:`, err);
      }
    }

    console.log(
      `\n[cleanup-test-users] Deleted ${deleted}/${matches.length} user(s).`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[cleanup-test-users] threw:", err);
  process.exit(1);
});
