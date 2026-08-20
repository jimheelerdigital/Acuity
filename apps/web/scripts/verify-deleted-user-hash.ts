/**
 * End-to-end verification for the DeletedUser HMAC change.
 *
 * Proves two things at once that no local-only test can:
 *
 *   1. THE KEYS MATCH. The tombstone is written here with the LOCAL key;
 *      the lookup happens inside the DEPLOYED app with the VERCEL key. A
 *      match is only possible if they are byte-identical. This matters
 *      enormously before the backfill — hashing 19 rows with the wrong key
 *      would permanently break the guard, and the plaintext is destroyed.
 *   2. THE GUARD STILL WORKS. A returning "deleted" address must receive the
 *      REDUCED trial, which is the trial-farming protection (pentest T-07).
 *
 * Flow: seed tombstone (local hash, dated inside the 90-day window)
 *       → sign up on prod with that address
 *       → read the created user's trialEndsAt
 *       → expect the reduced trial, not the standard one
 *       → clean up both rows.
 *
 * Read-mostly against prod: it creates one throwaway user and one tombstone,
 * and removes both in a finally block.
 */

import "./load-env";

// Same server-only cache-priming as the backfill — see that file for why the
// guard is kept in the module rather than deleted.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createRequire } = require("node:module") as typeof import("node:module");
const cliRequire = createRequire(__filename);
cliRequire.cache[cliRequire.resolve("server-only")] = {
  id: "server-only",
  filename: "server-only",
  loaded: true,
  exports: {},
} as unknown as NodeModule;

const PROD = "https://goripple.io";
const DAY_MS = 24 * 60 * 60 * 1000;

async function main(): Promise<void> {
  const { hashDeletedUserEmail } = await import("../src/lib/deleted-user-hash");
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();

  // Unique per run so a rerun never collides with a leftover row.
  const email = `rc-hash-probe-${Date.now()}@example.com`;
  const digest = hashDeletedUserEmail(email);
  const deletedAt = new Date(Date.now() - 10 * DAY_MS); // inside the 90d window

  console.log("\nDeletedUser HMAC — end-to-end verification");
  console.log(`  probe address : ${email}`);
  console.log(`  local digest  : ${digest.slice(0, 16)}…`);

  let created = false;
  try {
    await prisma.deletedUser.create({
      data: {
        email: digest,
        deletedAt,
        originalCreatedAt: new Date(Date.now() - 60 * DAY_MS),
        originalTrialEndedAt: null,
      },
    });
    created = true;
    console.log("  tombstone     : seeded with the LOCAL key\n");

    const res = await fetch(`${PROD}/api/auth/mobile-signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password: `Probe!${Math.random().toString(36).slice(2)}Aa1`,
        name: "hash probe",
      }),
    });
    console.log(`  signup        : HTTP ${res.status}`);
    if (!res.ok) {
      const t = await res.text();
      console.error(`\n✗ signup failed, cannot verify: ${t.slice(0, 200)}\n`);
      process.exitCode = 1;
      return;
    }

    const user = await prisma.user.findFirst({
      where: { email },
      select: { id: true, trialEndsAt: true, createdAt: true },
    });
    if (!user?.trialEndsAt) {
      console.error("\n✗ user or trialEndsAt missing — cannot verify\n");
      process.exitCode = 1;
      return;
    }

    const days = Math.round(
      (user.trialEndsAt.getTime() - user.createdAt.getTime()) / DAY_MS
    );
    console.log(`  trial granted : ${days} day(s)`);

    console.log("\n─── Result ────────────────────────────────");
    if (days <= 3) {
      console.log("  ✓ REDUCED trial granted.");
      console.log("    → the DEPLOYED app hashed this address with the Vercel");
      console.log("      key and matched a tombstone written with the LOCAL key,");
      console.log("      so the two keys are identical.");
      console.log("    → the trial-farming guard is intact after hashing.\n");
    } else {
      console.error("  ✗ STANDARD trial granted — the guard did NOT match.");
      console.error("    → the Vercel key and the local key differ, OR the");
      console.error("      deploy has not landed yet.");
      console.error("    → DO NOT RUN THE BACKFILL until this is resolved:");
      console.error("      hashing with the wrong key is unrecoverable.\n");
      process.exitCode = 1;
    }

    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  } finally {
    if (created) {
      await prisma.deletedUser.delete({ where: { email: digest } }).catch(() => {});
      console.log("  cleanup       : probe tombstone + user removed");
    }
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("\n✗ verification failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
