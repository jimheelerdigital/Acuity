/**
 * Backfill DeletedUser.email from plaintext to HMAC digests.
 *
 * ⚠️ ONE-WAY AND IRREVERSIBLE. Once a row is hashed the address is gone —
 * that is the point (the privacy policy promises a hash is retained, not the
 * email), but it means a mistake cannot be undone. Hence: dry run by
 * default, and a printed plan you must read before passing --apply.
 *
 * Semantics are preserved exactly. `trialDaysForEmail` hashes each candidate
 * (canonical + literal) with the same function and looks up by digest, so
 * hashing the CURRENT stored value as-is keeps every existing row matching
 * whatever it matched before.
 *
 * Idempotent: rows already 64-hex are skipped, so a re-run after an
 * interruption is safe and cannot double-hash.
 *
 * Usage:
 *   export DELETED_USER_EMAIL_HMAC_KEY=...      # never as an argument
 *   npx tsx apps/web/scripts/backfill-deleted-user-hash.ts
 *   npx tsx apps/web/scripts/backfill-deleted-user-hash.ts --apply
 */

import "./load-env";

/**
 * `lib/deleted-user-hash` starts with `import "server-only"`, which throws
 * outside a Next.js server context — including here, under tsx.
 *
 * We neutralize it by priming the module cache with empty exports BEFORE the
 * import, rather than deleting the guard from the module. That guard is worth
 * keeping: this file handles the HMAC pepper, and `server-only` is what stops
 * it being pulled into a client bundle where the secret would ship to
 * browsers. Same trick as vitest.config.ts, which aliases it to a shim.
 *
 * The alternative — reimplementing the HMAC here — is exactly the divergence
 * risk that would silently produce digests the app can't match.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createRequire } = require("node:module") as typeof import("node:module");
const cliRequire = createRequire(__filename);
cliRequire.cache[cliRequire.resolve("server-only")] = {
  id: "server-only",
  filename: "server-only",
  loaded: true,
  exports: {},
} as unknown as NodeModule;

// NOTE: imported dynamically inside main(), NOT as a static import. tsx
// hoists ES imports above the cache-priming code above, so a static import
// would resolve `server-only` before it is stubbed — the same hoisting trap
// documented in scripts/load-env.ts.
type HashModule = typeof import("../src/lib/deleted-user-hash");

const APPLY = process.argv.includes("--apply");

/**
 * Mask so the log proves which rows moved without reprinting addresses.
 * `isHashed` is injected because the hash module is imported dynamically
 * inside main() (see the hoisting note above).
 */
function mask(email: string, isHashed: (v: string) => boolean): string {
  if (isHashed(email)) return `${email.slice(0, 8)}…(already hashed)`;
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  return `${email.slice(0, 2)}***${email.slice(at)}`;
}

async function main(): Promise<void> {
  const { hashDeletedUserEmail, hasDeletedUserHmacKey, looksHashed }: HashModule =
    await import("../src/lib/deleted-user-hash");

  console.log("\nDeletedUser email → HMAC backfill");
  console.log(`  mode : ${APPLY ? "APPLY (writes)" : "DRY RUN (no writes)"}`);

  if (!hasDeletedUserHmacKey()) {
    console.error(
      "\n✗ DELETED_USER_EMAIL_HMAC_KEY is not set.\n" +
        "  Export it before running. It must be the SAME key the app uses,\n" +
        "  and it must never change afterwards — rotating it makes every\n" +
        "  digest unmatchable and silently disables the trial-farming guard.\n"
    );
    process.exit(1);
  }

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();

  try {
    const rows = await prisma.deletedUser.findMany({
      // DeletedUser.email IS the @id — there is no separate id column.
      select: { email: true, deletedAt: true },
      orderBy: { deletedAt: "asc" },
    });

    console.log(`  rows : ${rows.length}\n`);

    const toHash = rows.filter((r) => !looksHashed(r.email));
    const already = rows.length - toHash.length;

    if (already > 0) console.log(`  ${already} row(s) already hashed — skipping.`);
    if (toHash.length === 0) {
      console.log("\n  Nothing to do.\n");
      return;
    }

    // Detect collisions BEFORE writing: two plaintext rows could canonicalize
    // to the same digest (e.g. gmail dot/plus variants). The column is
    // @unique, so a blind update would fail partway through and leave the
    // table half-converted.
    const digests = new Map<string, string[]>();
    for (const r of toHash) {
      const d = hashDeletedUserEmail(r.email);
      digests.set(d, [...(digests.get(d) ?? []), mask(r.email, looksHashed)]);
    }
    const collisions = [...digests.entries()].filter(([, rows]) => rows.length > 1);
    if (collisions.length > 0) {
      console.error(`\n✗ ${collisions.length} digest collision(s) — rows that would clash on the @unique column:`);
      for (const [d, ids] of collisions) {
        console.error(`    ${d.slice(0, 12)}… ← ${ids.join(", ")}`);
      }
      console.error(
        "\n  Resolve by deleting the older duplicate tombstone(s) — the newest\n" +
          "  row is the one the guard should match. Not doing this automatically:\n" +
          "  it destroys a row, and that is your call.\n"
      );
      process.exit(1);
    }

    let done = 0;
    for (const r of toHash) {
      const digest = hashDeletedUserEmail(r.email);
      if (APPLY) {
        // email is the primary key, so this rewrites the PK itself.
        // Located by the OLD value; safe because collisions were ruled out
        // above and the column is unique.
        await prisma.deletedUser.update({
          where: { email: r.email },
          data: { email: digest },
        });
        done++;
        console.log(`  ✓ ${mask(r.email, looksHashed)} → ${digest.slice(0, 12)}…`);
      } else {
        console.log(`  · [dry-run] ${mask(r.email, looksHashed)} → ${digest.slice(0, 12)}…`);
      }
    }

    console.log("\n─── Summary ───────────────────────────────");
    console.log(`  mode           : ${APPLY ? "APPLY" : "DRY RUN"}`);
    console.log(`  already hashed : ${already}`);
    console.log(`  ${APPLY ? "hashed" : "would hash"}         : ${APPLY ? done : toHash.length}`);
    if (!APPLY) {
      console.log("\n  No writes were made. Re-run with --apply to convert.\n");
    } else {
      console.log("\n  Done. The plaintext addresses are now unrecoverable.\n");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("\n✗ backfill failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
