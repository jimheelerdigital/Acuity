/**
 * Finds potential duplicate user accounts created during the OAuth-broken
 * window (2026-07-16 domain migration → present).
 *
 * After the getacuity.io → goripple.io domain flip, Google OAuth returned
 * redirect_uri_mismatch. Users falling back to Apple Sign In (with "Hide
 * My Email") got new accounts because the privaterelay email didn't match.
 * Keenan (cofounder) is also affected — confirming this is systemic.
 *
 * Detection criteria:
 *   (a) Same full name as an existing older account
 *   (b) privaterelay.appleid.com emails created post-flip with a non-relay
 *       account sharing the same first name
 *   (c) Same devicePlatform + first name + 0 entries on new account
 *   (d) TrySession anonDeviceId claims on multiple userId values
 *   (e) Account table: new Apple Account row where user also has entries
 *       on a different userId
 *
 * Known cases:
 *   - Elise Cyr: original cmqyl34ms000otx4jkizqu0tp (elise.cyr90@gmail.com)
 *   - Keenan: original email keenan@heelerdigital.com
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

// Known originals
const KNOWN_ORIGINALS = {
  elise: { id: "cmqyl34ms000otx4jkizqu0tp", email: "elise.cyr90@gmail.com" },
  keenan: { email: "keenan@heelerdigital.com" },
};

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
  passwordHash: true, // just existence check
} as const;

type UserRow = {
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
  passwordHash: string | null;
};

function firstName(name: string | null): string | null {
  if (!name) return null;
  return name.trim().split(/\s+/)[0].toLowerCase();
}

function isPrivateRelay(email: string | null): boolean {
  return !!email && email.endsWith("@privaterelay.appleid.com");
}

function fmt(u: UserRow): string {
  return [
    `  id:            ${u.id}`,
    `  email:         ${u.email}`,
    `  name:          ${u.name}`,
    `  signupMethod:  ${u.signupMethod}`,
    `  devicePlatform:${u.devicePlatform ?? "(none)"}`,
    `  subscription:  ${u.subscriptionStatus}`,
    `  stripeId:      ${u.stripeCustomerId || "(none)"}`,
    `  appleSubject:  ${u.appleSubject ? u.appleSubject.slice(0, 16) + "…" : "(none)"}`,
    `  hasPassword:   ${u.passwordHash ? "yes" : "no"}`,
    `  created:       ${u.createdAt.toISOString()}`,
    `  entries:       ${u.totalRecordings}`,
    `  firstEntry:    ${u.firstRecordingAt?.toISOString() ?? "(none)"}`,
    `  lastSeen:      ${u.lastSeenAt?.toISOString() ?? "(never)"}`,
  ].join("\n");
}

async function getProviders(userId: string): Promise<string> {
  const accounts = await prisma.account.findMany({
    where: { userId },
    select: { provider: true, providerAccountId: true },
  });
  return accounts.map((a) => `${a.provider}(${a.providerAccountId.slice(0, 8)}…)`).join(", ") || "(none)";
}

async function getActiveSessions(userId: string): Promise<string> {
  const sessions = await prisma.session.findMany({
    where: { userId, expires: { gt: new Date() } },
    select: { expires: true },
    orderBy: { expires: "desc" },
    take: 1,
  });
  return sessions.length > 0 ? `active, expires ${sessions[0].expires.toISOString()}` : "no active sessions";
}

async function printUserDetail(u: UserRow) {
  console.log(fmt(u));
  console.log(`  providers:     ${await getProviders(u.id)}`);
  console.log(`  sessions:      ${await getActiveSessions(u.id)}`);
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║       DUPLICATE ACCOUNT DIAGNOSTIC — POST-DOMAIN-FLIP      ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log(`\nWindow start: ${WINDOW_START.toISOString()}\n`);

  // ── ENV CHECK ──────────────────────────────────────────────────────────
  console.log("━━━ ENV CHECK ━━━");
  console.log(`  NEXTAUTH_URL:           ${process.env.NEXTAUTH_URL ?? "(not set)"}`);
  console.log(`  APP_URL:                ${process.env.APP_URL ?? "(not set)"}`);
  console.log(`  NEXTAUTH_SECRET:        ${process.env.NEXTAUTH_SECRET ? "set (" + process.env.NEXTAUTH_SECRET.length + " chars)" : "(not set)"}`);
  console.log(`  GOOGLE_CLIENT_ID:       ${process.env.GOOGLE_CLIENT_ID ? "set" : "(not set)"}`);
  console.log(`  APPLE_CLIENT_ID:        ${process.env.APPLE_CLIENT_ID ? "set" : "(not set)"}`);
  console.log("");

  // ── SECTION 1: Known affected users ────────────────────────────────────
  console.log("━━━ SECTION 1: Known affected users ━━━\n");

  // Keenan
  console.log("── KEENAN (keenan@heelerdigital.com) ──\n");
  const keenanOriginal = await prisma.user.findUnique({
    where: { email: KNOWN_ORIGINALS.keenan.email },
    select: USER_SELECT,
  });
  if (keenanOriginal) {
    console.log("Original account:");
    await printUserDetail(keenanOriginal);
  } else {
    console.log("⚠ No account found for keenan@heelerdigital.com");
  }

  // Find any other account Keenan might be signed into
  const keenanCandidates = await prisma.user.findMany({
    where: {
      createdAt: { gte: WINDOW_START },
      id: { not: keenanOriginal?.id ?? "" },
      OR: [
        { name: { contains: "Keenan", mode: "insensitive" } },
        { email: { contains: "keenan", mode: "insensitive" } },
        { email: { contains: "heeler", mode: "insensitive" } },
      ],
    },
    select: USER_SELECT,
  });
  if (keenanCandidates.length > 0) {
    console.log(`\nPotential Keenan duplicates (${keenanCandidates.length}):`);
    for (const c of keenanCandidates) {
      console.log("");
      await printUserDetail(c);
    }
  } else {
    console.log("\nNo name/email matches for Keenan in post-window accounts.");
  }

  // Elise
  console.log("\n── ELISE (elise.cyr90@gmail.com) ──\n");
  const eliseOriginal = await prisma.user.findUnique({
    where: { id: KNOWN_ORIGINALS.elise.id },
    select: USER_SELECT,
  });
  if (eliseOriginal) {
    console.log("Original account:");
    await printUserDetail(eliseOriginal);
  } else {
    console.log(`⚠ Original account ${KNOWN_ORIGINALS.elise.id} not found!`);
  }

  const eliseCandidates = await prisma.user.findMany({
    where: {
      createdAt: { gte: WINDOW_START },
      id: { not: KNOWN_ORIGINALS.elise.id },
      OR: [
        { name: { contains: "Elise", mode: "insensitive" } },
        { name: { contains: "Cyr", mode: "insensitive" } },
        { email: { contains: "elise", mode: "insensitive" } },
        { email: { contains: "cyr", mode: "insensitive" } },
      ],
    },
    select: USER_SELECT,
  });
  if (eliseCandidates.length > 0) {
    console.log(`\nPotential Elise duplicates (${eliseCandidates.length}):`);
    for (const c of eliseCandidates) {
      console.log("");
      await printUserDetail(c);
    }
  } else {
    console.log("\nNo name/email matches for Elise in post-window accounts.");
  }

  // ── SECTION 2: ALL accounts created in the window ──────────────────────
  console.log("\n\n━━━ SECTION 2: Every account created since domain flip ━━━\n");

  const newUsers = await prisma.user.findMany({
    where: { createdAt: { gte: WINDOW_START } },
    select: USER_SELECT,
    orderBy: { createdAt: "desc" },
  });

  console.log(`Total new accounts: ${newUsers.length}\n`);

  console.log(
    "DATE                | ENTRIES | SUB    | METHOD          | EMAIL".padEnd(120) + "| PROVIDERS"
  );
  console.log("-".repeat(130));

  for (const u of newUsers) {
    const providers = await getProviders(u.id);
    const relay = isPrivateRelay(u.email) ? " ⚠RELAY" : "";
    const zero = u.totalRecordings === 0 ? " ⚠EMPTY" : "";
    console.log(
      `${u.createdAt.toISOString().slice(0, 16)} | ${String(u.totalRecordings).padStart(7)} | ${u.subscriptionStatus.padEnd(6)} | ${(u.signupMethod ?? "?").padEnd(15)} | ${(u.email ?? "").padEnd(45)}| ${providers}${relay}${zero}`
    );
  }

  // ── SECTION 3: Duplicate pair matching ─────────────────────────────────
  console.log("\n\n━━━ SECTION 3: Probable duplicate pairs ━━━\n");

  const oldUsers = await prisma.user.findMany({
    where: { createdAt: { lt: WINDOW_START } },
    select: USER_SELECT,
  });

  console.log(`Old accounts (pre-window): ${oldUsers.length}`);
  console.log(`New accounts (post-window): ${newUsers.length}\n`);

  // Build indexes
  const oldByEmail = new Map<string, UserRow>();
  const oldByFirstName = new Map<string, UserRow[]>();
  const oldByName = new Map<string, UserRow[]>();
  for (const u of oldUsers) {
    if (u.email) oldByEmail.set(u.email.toLowerCase(), u);
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
    reasons: string[];
    confidence: "HIGH" | "MEDIUM" | "LOW";
  };
  const candidates: DupCandidate[] = [];
  const seen = new Set<string>();

  for (const nu of newUsers) {
    const matchingOlds: Map<string, { user: UserRow; reasons: string[] }> = new Map();

    const addMatch = (oldUser: UserRow, reason: string) => {
      const existing = matchingOlds.get(oldUser.id);
      if (existing) {
        existing.reasons.push(reason);
      } else {
        matchingOlds.set(oldUser.id, { user: oldUser, reasons: [reason] });
      }
    };

    // (a) Exact email match (shouldn't happen due to unique constraint, but check)
    if (nu.email) {
      const match = oldByEmail.get(nu.email.toLowerCase());
      if (match) addMatch(match, "exact email match");
    }

    // (b) Exact full name match
    if (nu.name) {
      const full = nu.name.toLowerCase().trim();
      const matches = oldByName.get(full) || [];
      for (const old of matches) {
        addMatch(old, `exact name match: "${nu.name}"`);
      }
    }

    // (c) privaterelay + first-name match
    if (isPrivateRelay(nu.email) && nu.name) {
      const fn = firstName(nu.name);
      if (fn) {
        const matches = oldByFirstName.get(fn) || [];
        for (const old of matches) {
          if (!isPrivateRelay(old.email)) {
            addMatch(old, `Apple private relay + first name "${fn}"`);
          }
        }
      }
    }

    // (d) 0 entries on new + same platform + first name match
    if (nu.totalRecordings === 0 && nu.devicePlatform) {
      const fn = firstName(nu.name);
      if (fn) {
        const matches = oldByFirstName.get(fn) || [];
        for (const old of matches) {
          if (old.devicePlatform === nu.devicePlatform && old.totalRecordings > 0) {
            addMatch(old, `0 entries + same platform (${nu.devicePlatform}) + first name "${fn}"`);
          }
        }
      }
    }

    // Collect into candidates
    for (const [, { user: oldUser, reasons }] of matchingOlds) {
      const key = `${nu.id}:${oldUser.id}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // Score confidence
      let confidence: "HIGH" | "MEDIUM" | "LOW" = "LOW";
      if (reasons.some((r) => r.includes("exact email"))) {
        confidence = "HIGH";
      } else if (
        nu.totalRecordings === 0 &&
        oldUser.totalRecordings > 0 &&
        (reasons.some((r) => r.includes("exact name")) || reasons.some((r) => r.includes("private relay")))
      ) {
        confidence = "HIGH";
      } else if (reasons.length >= 2) {
        confidence = "MEDIUM";
      } else if (nu.totalRecordings === 0 && reasons.some((r) => r.includes("name"))) {
        confidence = "MEDIUM";
      }

      candidates.push({ newUser: nu, oldUser, reasons, confidence });
    }
  }

  // (e) TrySession anonDeviceId cross-user claims
  console.log("Checking TrySession anonDeviceId for cross-user claims...");
  try {
    const crossDeviceClaims = await prisma.$queryRaw<
      Array<{ anonDeviceId: string; userIds: string; claimCount: number }>
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
      console.log(`Found ${crossDeviceClaims.length} device(s) with multi-user claims.`);
      for (const c of crossDeviceClaims) {
        const userIds = c.userIds.split(", ").map((s) => s.trim());
        const users = await Promise.all(
          userIds.map((id) => prisma.user.findUnique({ where: { id }, select: USER_SELECT }))
        );
        const validUsers = users.filter(Boolean) as UserRow[];
        if (validUsers.length >= 2) {
          validUsers.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
          for (let i = 1; i < validUsers.length; i++) {
            const key = `${validUsers[i].id}:${validUsers[0].id}`;
            if (!seen.has(key)) {
              seen.add(key);
              candidates.push({
                newUser: validUsers[i],
                oldUser: validUsers[0],
                reasons: ["same anonDeviceId claimed by both"],
                confidence: "MEDIUM",
              });
            }
          }
        }
      }
    } else {
      console.log("No cross-user anonDeviceId claims found.");
    }
  } catch {
    console.log("(TrySession query skipped — table may not exist in this env)");
  }

  // Sort: HIGH first, then MEDIUM, then LOW
  const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  candidates.sort((a, b) => {
    const d = order[a.confidence] - order[b.confidence];
    if (d !== 0) return d;
    return b.oldUser.totalRecordings - a.oldUser.totalRecordings;
  });

  if (candidates.length === 0) {
    console.log("\n✅ No duplicate candidates found.");
  } else {
    console.log(`\nFound ${candidates.length} candidate pair(s):\n`);

    for (let i = 0; i < candidates.length; i++) {
      const { newUser, oldUser, reasons, confidence } = candidates[i];
      const tag =
        confidence === "HIGH" ? "🔴 HIGH" :
        confidence === "MEDIUM" ? "🟡 MEDIUM" :
        "⚪ LOW";

      console.log(`═══ Pair ${i + 1}/${candidates.length} [${tag}] ═══`);
      console.log(`Evidence: ${reasons.join(" + ")}`);

      console.log(`\nORIGINAL (${oldUser.totalRecordings} entries, ${oldUser.subscriptionStatus}):`);
      await printUserDetail(oldUser);

      console.log(`\nDUPLICATE (${newUser.totalRecordings} entries, ${newUser.subscriptionStatus}):`);
      await printUserDetail(newUser);

      console.log(
        `\nMERGE CMD (dry run): npx tsx scripts/merge-duplicate-account.ts --original ${oldUser.id} --duplicate ${newUser.id}`
      );
      console.log("");
    }

    // Summary table
    console.log("\n━━━ MERGE MAP SUMMARY ━━━\n");
    console.log(
      "CONF   | NEW_ID                    | ORIGINAL_ID               | NEW_ENTRIES | OLD_ENTRIES | OLD_SUB | EVIDENCE"
    );
    console.log("-".repeat(140));
    for (const { newUser, oldUser, reasons, confidence } of candidates) {
      console.log(
        `${confidence.padEnd(6)} | ${newUser.id.padEnd(25)} | ${oldUser.id.padEnd(25)} | ${String(newUser.totalRecordings).padStart(11)} | ${String(oldUser.totalRecordings).padStart(11)} | ${oldUser.subscriptionStatus.padEnd(7)} | ${reasons[0]}`
      );
    }
  }

  // ── SECTION 4: Private relay accounts ──────────────────────────────────
  console.log("\n\n━━━ SECTION 4: All privaterelay.appleid.com accounts ━━━\n");

  const relayUsers = await prisma.user.findMany({
    where: { email: { endsWith: "@privaterelay.appleid.com" } },
    select: USER_SELECT,
    orderBy: { createdAt: "desc" },
  });

  console.log(`Total private relay accounts: ${relayUsers.length}\n`);
  for (const u of relayUsers) {
    const postWindow = u.createdAt >= WINDOW_START ? " ⚠POST-FLIP" : "";
    console.log(
      `${u.createdAt.toISOString().slice(0, 16)} | ${u.name ?? "(no name)".padEnd(25)} | ${u.totalRecordings} entries | ${u.subscriptionStatus}${postWindow}`
    );
  }

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║                         END OF REPORT                       ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
