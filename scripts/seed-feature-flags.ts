/**
 * Idempotent seed for FeatureFlag rows. Run once after the schema
 * lands; safe to re-run (upserts by `key`, updates nothing).
 *
 * Usage:
 *   set -a && source apps/web/.env.local && set +a && \
 *     npx tsx scripts/seed-feature-flags.ts
 *
 * To force-reset every flag to seed defaults (useful only in dev):
 *   npx tsx scripts/seed-feature-flags.ts --reset
 */

import { PrismaClient } from "@prisma/client";

type Seed = {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  rolloutPercentage: number;
  requiredTier: "FREE" | "PRO" | null;
};

const SEEDS: Seed[] = [
  {
    key: "apple_health_integration",
    name: "Apple Health integration",
    description:
      "iOS HealthKit sleep/step/HRV correlations. Off at launch — mobile client deferred.",
    enabled: false,
    rolloutPercentage: 100,
    requiredTier: null,
  },
  {
    key: "ask_your_past_self",
    name: "Ask Your Past Self",
    description:
      "Semantic search + Claude answer over user's own journal history.",
    enabled: true,
    rolloutPercentage: 100,
    requiredTier: null,
  },
  {
    key: "state_of_me_report",
    name: "State of Me quarterly report",
    description:
      "90-day long-form retrospective. PRO-tier only at launch.",
    enabled: true,
    rolloutPercentage: 100,
    requiredTier: "PRO",
  },
  {
    key: "configurable_life_matrix",
    name: "Configurable Life Matrix labels",
    description:
      "Lets users rename/hide the 6 Life Matrix dimensions per preset.",
    enabled: true,
    rolloutPercentage: 100,
    requiredTier: null,
  },
  {
    key: "calendar_integrations",
    name: "Calendar integrations",
    description:
      "Google / Outlook / Apple calendar sync. Stubs only — real flows post-beta.",
    enabled: false,
    rolloutPercentage: 100,
    requiredTier: null,
  },
  {
    key: "theme_evolution_map",
    name: "Theme Evolution Map",
    description: "Force-graph visualization of recurring themes over time.",
    enabled: true,
    rolloutPercentage: 100,
    requiredTier: null,
  },
  {
    key: "goal_progression_tree",
    name: "Goal progression tree",
    description:
      "Parent/sub-goal hierarchy with Claude-suggested sub-goals.",
    enabled: true,
    rolloutPercentage: 100,
    requiredTier: null,
  },
  {
    key: "referral_rewards",
    name: "Referral rewards",
    description:
      "+30 days for referrer + referred when the conversion fires.",
    enabled: true,
    rolloutPercentage: 100,
    requiredTier: null,
  },
  {
    key: "claude_ai_observations",
    name: "Claude-generated weekly observations",
    description:
      "Replaces heuristic strings on insights with Claude observations.",
    enabled: true,
    rolloutPercentage: 100,
    requiredTier: null,
  },
  {
    key: "weekly_email_digest",
    name: "Weekly email digest",
    description: "Sunday 9am local digest email.",
    enabled: true,
    rolloutPercentage: 100,
    requiredTier: null,
  },
  {
    key: "monthly_email_digest",
    name: "Monthly email digest",
    description: "First-of-month 9am local digest email.",
    enabled: true,
    rolloutPercentage: 100,
    requiredTier: null,
  },
  {
    key: "data_export",
    name: "Data export (GDPR zip)",
    description: "Self-serve data export — /account → Download my data.",
    enabled: true,
    rolloutPercentage: 100,
    requiredTier: null,
  },
  {
    key: "public_share_links",
    name: "Public share links",
    description:
      "Public read-only URLs for weekly reports + State of Me reports.",
    enabled: true,
    rolloutPercentage: 100,
    requiredTier: null,
  },
];

async function main() {
  const reset = process.argv.includes("--reset");
  const prisma = new PrismaClient();

  console.log(
    `[seed-feature-flags] ${SEEDS.length} flags. reset=${reset}…`
  );

  for (const seed of SEEDS) {
    if (reset) {
      await prisma.featureFlag.upsert({
        where: { key: seed.key },
        create: seed,
        update: seed,
      });
      console.log(`  reset: ${seed.key} → enabled=${seed.enabled}`);
    } else {
      const existing = await prisma.featureFlag.findUnique({
        where: { key: seed.key },
      });
      if (existing) {
        console.log(`  skip: ${seed.key} (exists)`);
        continue;
      }
      await prisma.featureFlag.create({ data: seed });
      console.log(`  create: ${seed.key} → enabled=${seed.enabled}`);
    }
  }

  console.log("[seed-feature-flags] done.");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[seed-feature-flags] FAILED", err);
  process.exit(1);
});
