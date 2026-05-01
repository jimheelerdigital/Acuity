/**
 * Seed three test accounts for slice-2 end-to-end recording verification:
 * one PRO, one active TRIAL (14d remaining), one FREE post-trial (7d
 * expired). Strict allowlist on the three exact emails — refuses any
 * other input even with --force, mirroring the seed-app-store-reviewer
 * pattern. Idempotent: re-running updates state to match the spec
 * rather than failing.
 *
 * Usage:
 *   set -a && source apps/web/.env.local && set +a && \
 *     npx tsx apps/web/scripts/seed-slice2-test-users.ts
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const ALLOWED_EMAILS = new Set<string>([
  "jim+slice2pro@heelerdigital.com",
  "jim+slice2trial@heelerdigital.com",
  "jim+slice2free@heelerdigital.com",
]);

type Tier = "PRO" | "TRIAL" | "FREE";

interface Spec {
  email: string;
  password: string;
  name: string;
  tier: Tier;
  trialEndsAt: Date | null;
}

function buildSpecs(now: Date): Spec[] {
  const day = 24 * 60 * 60 * 1000;
  return [
    {
      email: "jim+slice2pro@heelerdigital.com",
      password: "TestSlice2Pro!2026",
      name: "Slice 2 PRO Test",
      tier: "PRO",
      trialEndsAt: null,
    },
    {
      email: "jim+slice2trial@heelerdigital.com",
      password: "TestSlice2Trial!2026",
      name: "Slice 2 TRIAL Test",
      tier: "TRIAL",
      trialEndsAt: new Date(now.getTime() + 14 * day),
    },
    {
      email: "jim+slice2free@heelerdigital.com",
      password: "TestSlice2Free!2026",
      name: "Slice 2 FREE Test",
      tier: "FREE",
      trialEndsAt: new Date(now.getTime() - 7 * day),
    },
  ];
}

async function upsertUser(prisma: PrismaClient, spec: Spec, now: Date) {
  if (!ALLOWED_EMAILS.has(spec.email)) {
    throw new Error(`Refusing: ${spec.email} not in slice-2 allowlist`);
  }
  const passwordHash = await bcrypt.hash(spec.password, 12);

  const existing = await prisma.user.findUnique({
    where: { email: spec.email },
    select: { id: true },
  });

  if (!existing) {
    await prisma.user.create({
      data: {
        email: spec.email,
        name: spec.name,
        emailVerified: now,
        passwordHash,
        subscriptionStatus: spec.tier,
        trialEndsAt: spec.trialEndsAt,
        stripeCustomerId: null,
        timezone: "America/Chicago",
        onboarding: {
          create: {
            currentStep: 10,
            completedAt: now,
            moodBaseline: "GOOD",
            moodBaselineNumeric: 7,
            microphoneGranted: true,
            referralSource: "Slice 2 verification",
            expectedUsageFrequency: "daily",
          },
        },
      },
    });
    return { action: "created" as const, email: spec.email };
  }

  // Idempotent: align state to spec on re-run.
  await prisma.user.update({
    where: { id: existing.id },
    data: {
      passwordHash,
      emailVerified: now,
      subscriptionStatus: spec.tier,
      trialEndsAt: spec.trialEndsAt,
      stripeCustomerId: null,
    },
  });
  await prisma.userOnboarding.upsert({
    where: { userId: existing.id },
    create: {
      userId: existing.id,
      currentStep: 10,
      completedAt: now,
      moodBaseline: "GOOD",
      moodBaselineNumeric: 7,
      microphoneGranted: true,
      referralSource: "Slice 2 verification",
      expectedUsageFrequency: "daily",
    },
    update: {
      completedAt: now,
    },
  });
  return { action: "updated" as const, email: spec.email };
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const now = new Date();
    const specs = buildSpecs(now);
    for (const spec of specs) {
      const result = await upsertUser(prisma, spec, now);
      console.log(`[seed] ${result.action.padEnd(7)} ${result.email}`);
    }

    // Verify entitlements via the live function.
    const { entitlementsFor } = await import("../src/lib/entitlements");
    console.log("\n[verify] entitlement state:");
    for (const spec of specs) {
      const u = await prisma.user.findUniqueOrThrow({
        where: { email: spec.email },
        select: { id: true, subscriptionStatus: true, trialEndsAt: true },
      });
      const e = entitlementsFor(u);
      console.log(
        `  ${spec.email.padEnd(40)} status=${u.subscriptionStatus.padEnd(6)} canRecord=${e.canRecord} canExtractEntries=${e.canExtractEntries}`
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
