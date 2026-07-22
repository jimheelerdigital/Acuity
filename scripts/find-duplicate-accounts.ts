/**
 * Finds potential duplicate user accounts created during the OAuth-broken
 * window (2026-07-16 domain migration → present).
 *
 * After the getacuity.io → goripple.io domain flip, Google OAuth returned
 * redirect_uri_mismatch. Users falling back to Apple Sign In (with "Hide
 * My Email") or email/password could get new accounts because their private
 * relay email or typed email didn't match their original Google-authed row.
 *
 * Detection criteria:
 *   (a) Same name as an existing older account
 *   (b) privaterelay.appleid.com emails created post-flip with a non-relay
 *       account sharing the same first name
 *   (c) Same devicePlatform + creation within the broken window
 *   (d) TrySession anonDeviceId claims on multiple userId values
 *
 * Known case: elise.cyr90@gmail.com (userId cmqyl34ms000otx4jkizqu0tp)
 *
 * Usage:
 *   set -a && source apps/web/.env.local && set +a && \
 *     npx tsx scripts/find-duplicate-accounts.ts
 *
 * Output-only — no writes, no merges. Review the output, then decide.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// The domain migration landed Jul 16; widen to Jul 15 for timezone safety.
const WINDOW_START = new Date("2026-07-15T00:00:00Z");

// Elise's known original account
const ELISE_ORIGINAL_ID = "cmqyl34ms000otx4jkizqu0tp";

interface UserRow {
  id: string;
  email: string | null;
  name: string | null;
  signupMethod: string | null;
  devicePlatform: string | null;
  subscriptionStatus: string;
  stripeCustomerId: string | null;
  appleSubject: string | null;
  createdAt: Date;
  totalRecordings: number;
  firstRecordingAt: Date | null;
  lastSeenAt: Date | null;
}

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  signupMethod: true,
  devicePlatform: true,
  subscriptionStatus: true,
  stripeCustomerId: true,
  appleSubject: true,
  createdAt: true,
  totalRecordings: true,
  firstRecordingAt: true,
  lastSeenAt: true,
} as const;

function firstName(name: string | null): string | null {
  if (!name) return null;
  return name.trim().split(/\s+/)[0].toLowerCase();
}

function isPrivateRelay(email: string | null): boolean {
  return !!email && email.endsWith("@privaterelay.appleid.com");
}

function fmt(u: UserRow): string {
  return [
    `  id: ${u.id}`,
    `  email: ${u.email}`,
    `  name: ${u.name}`,
    `  signupMethod: ${u.signupMethod}`,
    `  devicePlatform: ${u.devicePlatform}`,
    `  subscriptionStatus: ${u.subscriptionStatus}`,
    `  stripeCustomerId: ${u.stripeCustomerId || "(none)"}`,
    `  appleSubject: ${u.appleSubject ? u.appleSubject.slice(0, 12) + "…" : "(none)"}`,
    `  created: ${u.createdAt.toISOString()}`,
    `  entries: ${u.totalRecordings}`,
    `  firstRecording: ${u.firstRecordingAt?.toISOString() ?? "(none)"}`,
    `  lastSeen: ${u.lastSeenAt?.toISOString() ?? "(never)"}`,
  ].join("\n");
}

async function main() {
  console.log("=== DUPLICATE ACCOUNT DIAGNOSTIC ===");
  console.log(`Window start: ${WINDOW_START.toISOString()}\n`);

  // ── 1. Elise specifically ──────────────────────────────────────────────
  console.log("━━━ SECTION 1: Elise Cyr (known case) ━━━\n");

  const eliseOriginal = await prisma.user.findUnique({
    where: { id: ELISE_ORIGINAL_ID },
    select: USER_SELECT,
  });

  if (eliseOriginal) {
    console.log("Original account:");
    console.log(fmt(eliseOriginal));

    // Find her linked auth providers
    const eliseAccounts = await prisma.account.findMany({
      where: { userId: ELISE_ORIGINAL_ID },
      select: { provider: true, providerAccountId: true },
    });
    console.log(
      `  providers: ${eliseAccounts.map((a) => a.provider).join(", ") || "(none)"}`
    );
  } else {
    console.log(`⚠ Original account ${ELISE_ORIGINAL_ID} not found!`);
  }

  // Find ALL accounts created post-window with "elise" or "cyr" in the name
  const eliseCandidates = await prisma.user.findMany({
    where: {
      createdAt: { gte: WINDOW_START },
      id: { not: ELISE_ORIGINAL_ID },
      OR: [
        { name: { contains: "Elise", mode: "insensitive" } },
        { name: { contains: "Cyr", mode: "insensitive" } },
        { email: { contains: "elise", mode: "insensitive" } },
      ],
    },
    select: USER_SELECT,
  });

  if (eliseCandidates.length > 0) {
    console.log(`\nPotential duplicates for Elise (${eliseCandidates.length}):`);
    for (const c of eliseCandidates) {
      console.log("\n" + fmt(c));
      const accounts = await prisma.account.findMany({
        where: { userId: c.id },
        select: { provider: true, providerAccountId: true },
      });
      console.log(
        `  providers: ${accounts.map((a) => a.provider).join(", ") || "(none)"}`
      );
      // Check sessions
      const sessions = await prisma.session.findMany({
        where: { userId: c.id },
        select: { expires: true },
        orderBy: { expires: "desc" },
        take: 1,
      });
      if (sessions.length > 0) {
        console.log(`  active session expires: ${sessions[0].expires.toISOString()}`);
      }
    }
  } else {
    console.log("\nNo obvious name/email matches for Elise in post-window accounts.");
    console.log("Checking ALL accounts created today (Jul 21)...");

    const today = new Date("2026-07-21T00:00:00Z");
    const tomorrow = new Date("2026-07-22T00:00:00Z");
    const todayAccounts = await prisma.user.findMany({
      where: {
        createdAt: { gte: today, lt: tomorrow },
        id: { not: ELISE_ORIGINAL_ID },
      },
      select: USER_SELECT,
      orderBy: { createdAt: "asc" },
    });

    console.log(`\nAll users created Jul 21 (${todayAccounts.length}):`);
    for (const u of todayAccounts) {
      console.log("\n" + fmt(u));
      const accounts = await prisma.account.findMany({
        where: { userId: u.id },
        select: { provider: true, providerAccountId: true },
      });
      console.log(
        `  providers: ${accounts.map((a) => a.provider).join(", ") || "(none)"}`
      );
    }
  }

  // ── 2. Broad duplicate sweep ───────────────────────────────────────────
  console.log("\n\n━━━ SECTION 2: Broad duplicate sweep ━━━\n");

  // All users created after the domain migration
  const newUsers = await prisma.user.findMany({
    where: { createdAt: { gte: WINDOW_START } },
    select: USER_SELECT,
    orderBy: { createdAt: "asc" },
  });

  // All older users (potential originals)
  const oldUsers = await prisma.user.findMany({
    where: { createdAt: { lt: WINDOW_START } },
    select: USER_SELECT,
  });

  console.log(
    `New accounts (post ${WINDOW_START.toISOString().slice(0, 10)}): ${newUsers.length}`
  );
  console.log(`Older accounts: ${oldUsers.length}\n`);

  // Build indexes
  const oldByFirstName = new Map<string, UserRow[]>();
  const oldByName = new Map<string, UserRow[]>();
  for (const u of oldUsers) {
    if (u.name) {
      const fn = firstName(u.name);
      if (fn) {
        const list = oldByFirstName.get(fn) || [];
        list.push(u);
        oldByFirstName.set(fn, list);
      }
      const full = u.name.toLowerCase().trim();
      const list2 = oldByName.get(full) || [];
      list2.push(u);
      oldByName.set(full, list2);
    }
  }

  type DupCandidate = {
    newUser: UserRow;
    oldUser: UserRow;
    reason: string;
  };
  const candidates: DupCandidate[] = [];
  const seen = new Set<string>();

  for (const nu of newUsers) {
    // (a) Exact full name match
    if (nu.name) {
      const full = nu.name.toLowerCase().trim();
      const matches = oldByName.get(full) || [];
      for (const old of matches) {
        const key = `${nu.id}:${old.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          candidates.push({
            newUser: nu,
            oldUser: old,
            reason: `exact name match: "${nu.name}"`,
          });
        }
      }
    }

    // (b) privaterelay.appleid.com + first-name match
    if (isPrivateRelay(nu.email) && nu.name) {
      const fn = firstName(nu.name);
      if (fn) {
        const matches = oldByFirstName.get(fn) || [];
        for (const old of matches) {
          if (!isPrivateRelay(old.email)) {
            const key = `${nu.id}:${old.id}`;
            if (!seen.has(key)) {
              seen.add(key);
              candidates.push({
                newUser: nu,
                oldUser: old,
                reason: `Apple private relay + first name match: "${fn}"`,
              });
            }
          }
        }
      }
    }

    // (c) Same devicePlatform + no entries on new account
    if (nu.devicePlatform && nu.totalRecordings === 0) {
      for (const old of oldUsers) {
        if (
          old.devicePlatform === nu.devicePlatform &&
          old.totalRecordings > 0
        ) {
          // Only flag if names also partially match (first name)
          const nfn = firstName(nu.name);
          const ofn = firstName(old.name);
          if (nfn && ofn && nfn === ofn) {
            const key = `${nu.id}:${old.id}`;
            if (!seen.has(key)) {
              seen.add(key);
              candidates.push({
                newUser: nu,
                oldUser: old,
                reason: `same platform (${nu.devicePlatform}) + first name + new has 0 entries`,
              });
            }
          }
        }
      }
    }
  }

  // (d) TrySession anonDeviceId claims on multiple userIds
  console.log("Checking TrySession anonDeviceId for cross-user claims...");
  const crossDeviceClaims = await prisma.$queryRaw<
    Array<{
      anonDeviceId: string;
      userIds: string;
      claimCount: number;
    }>
  >`
    SELECT
      "anonDeviceId",
      string_agg(DISTINCT "claimedByUserId", ', ') AS "userIds",
      COUNT(DISTINCT "claimedByUserId")::int AS "claimCount"
    FROM "TrySession"
    WHERE "claimed" = true
      AND "anonDeviceId" IS NOT NULL
      AND "claimedByUserId" IS NOT NULL
    GROUP BY "anonDeviceId"
    HAVING COUNT(DISTINCT "claimedByUserId") > 1
  `;

  if (crossDeviceClaims.length > 0) {
    console.log(
      `Found ${crossDeviceClaims.length} device(s) claiming sessions under multiple users:`
    );
    for (const c of crossDeviceClaims) {
      console.log(
        `  deviceId: ${c.anonDeviceId.slice(0, 16)}… → userIds: ${c.userIds}`
      );
      // Look up both users
      const userIds = c.userIds.split(", ");
      for (const uid of userIds) {
        const u = await prisma.user.findUnique({
          where: { id: uid.trim() },
          select: USER_SELECT,
        });
        if (u) {
          const existing = candidates.find(
            (cd) =>
              (cd.newUser.id === u.id || cd.oldUser.id === u.id) &&
              userIds.some(
                (id) =>
                  id.trim() !== u.id &&
                  (cd.newUser.id === id.trim() || cd.oldUser.id === id.trim())
              )
          );
          if (!existing) {
            // Find the other user in this pair
            const otherId = userIds.find((id) => id.trim() !== u.id);
            if (otherId) {
              const other = await prisma.user.findUnique({
                where: { id: otherId.trim() },
                select: USER_SELECT,
              });
              if (other) {
                const [older, newer] =
                  u.createdAt < other.createdAt ? [u, other] : [other, u];
                const key = `${newer.id}:${older.id}`;
                if (!seen.has(key)) {
                  seen.add(key);
                  candidates.push({
                    newUser: newer,
                    oldUser: older,
                    reason: `same anonDeviceId claimed by both accounts`,
                  });
                }
              }
            }
          }
        }
      }
    }
  } else {
    console.log("No cross-user anonDeviceId claims found.");
  }

  // ── 3. Report ──────────────────────────────────────────────────────────
  console.log(`\n\n━━━ SECTION 3: Candidate duplicate pairs (${candidates.length}) ━━━\n`);

  if (candidates.length === 0) {
    console.log("No duplicate candidates found.");
  } else {
    // Sort: most likely first (0-entry new accounts matched to active old accounts)
    candidates.sort((a, b) => {
      const aScore =
        (a.newUser.totalRecordings === 0 ? 10 : 0) +
        (a.oldUser.totalRecordings > 0 ? 5 : 0) +
        (isPrivateRelay(a.newUser.email) ? 3 : 0);
      const bScore =
        (b.newUser.totalRecordings === 0 ? 10 : 0) +
        (b.oldUser.totalRecordings > 0 ? 5 : 0) +
        (isPrivateRelay(b.newUser.email) ? 3 : 0);
      return bScore - aScore;
    });

    for (let i = 0; i < candidates.length; i++) {
      const { newUser, oldUser, reason } = candidates[i];
      console.log(`── Pair ${i + 1}: ${reason} ──`);
      console.log(
        `\nOLD (original, ${oldUser.totalRecordings} entries, ${oldUser.subscriptionStatus}):`
      );
      console.log(fmt(oldUser));
      console.log(
        `\nNEW (potential dup, ${newUser.totalRecordings} entries, ${newUser.subscriptionStatus}):`
      );
      console.log(fmt(newUser));
      console.log("");
    }
  }

  // ── 4. Auth provider breakdown for all new accounts ────────────────────
  console.log("\n━━━ SECTION 4: All post-window accounts with auth providers ━━━\n");

  for (const nu of newUsers) {
    const accounts = await prisma.account.findMany({
      where: { userId: nu.id },
      select: { provider: true },
    });
    const providers = accounts.map((a) => a.provider).join(", ") || "(credentials only)";
    const flag =
      isPrivateRelay(nu.email) ? " ⚠ PRIVATE RELAY" :
      nu.totalRecordings === 0 ? " ⚠ ZERO ENTRIES" :
      "";
    console.log(
      `${nu.createdAt.toISOString().slice(0, 16)} | ${(nu.email ?? "").padEnd(45)} | ${nu.totalRecordings} entries | ${providers}${flag}`
    );
  }

  console.log("\n=== END ===");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
