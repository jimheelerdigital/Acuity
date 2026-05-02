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
  {
    key: "v1_1_dispositional_themes",
    name: "v1.1 dispositional themes (V5 prompt)",
    description:
      "Replaces the legacy event-level theme prompt with the V5 dispositional-pattern prompt. Phase 2 bench (docs/v1-1/theme-extraction-phase2.md) showed 6 patterns recurring 2-3× across 20 sample entries vs 0 for the legacy prompt. Off at seed; ramp via rolloutPercentage.",
    enabled: false,
    rolloutPercentage: 0,
    requiredTier: null,
  },
  {
    key: "free_recording_cap",
    name: "v1.1 FREE recording soft cap (30/month)",
    description:
      "When ON, FREE post-trial users get 30 free recordings per UTC month. The 30th is a grace recording with paywall copy; the 31st is blocked. PRO/TRIAL/PAST_DUE never affected. Auto-flipped by the free-cap-evaluator Inngest cron when all three conditions hold for 7 consecutive Sundays (FREE_USER_COUNT > 25k, median cadence ≥ 0.7/user/day over 14d, FREE→PRO conversion < 1% over 30d). Sticky once flipped — manual disable only. See docs/v1-1/free-tier-phase2-plan.md §C.4.",
    enabled: false,
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
