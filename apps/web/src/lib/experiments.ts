/**
 * A/B experiment variant assignment.
 *
 * Deterministically assigns users/sessions to experiment variants
 * based on a hash of their ID + flag key. Records assignments in
 * ExperimentAssignment table. Fires PostHog events on first assignment.
 */

/**
 * FNV-1a 32-bit hash — same algorithm used by feature-flags.ts
 * for rollout bucketing. Deterministic across requests.
 */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash;
}

interface TrafficSplit {
  [variant: string]: number; // percentage, must sum to 100
}

/**
 * Get the experiment variant for a user or session.
 *
 * Returns null if the flag doesn't exist, isn't enabled, or has no variants.
 * Creates an ExperimentAssignment row on first call (idempotent via unique constraint).
 */
export async function getExperimentVariant(
  flagKey: string,
  userId?: string | null,
  sessionId?: string | null
): Promise<string | null> {
  if (!userId && !sessionId) return null;

  const { prisma } = await import("@/lib/prisma");

  // Look up the flag
  const flag = await prisma.featureFlag.findUnique({
    where: { key: flagKey },
    select: {
      enabled: true,
      experimentVariants: true,
      experimentTrafficSplit: true,
    },
  });

  if (!flag || !flag.enabled || flag.experimentVariants.length === 0) {
    return null;
  }

  const variants = flag.experimentVariants;
  const split = (flag.experimentTrafficSplit as TrafficSplit | null) ?? {};

  // Check for existing assignment
  const existing = await prisma.experimentAssignment.findFirst({
    where: userId
      ? { userId, flagKey }
      : { sessionId: sessionId!, flagKey },
  });

  if (existing) return existing.variant;

  // Deterministic bucket assignment
  const hashInput = `${userId ?? sessionId}:${flagKey}`;
  const bucket = fnv1a(hashInput) % 100;

  let cumulative = 0;
  let assignedVariant = variants[0]; // fallback to first variant
  for (const v of variants) {
    cumulative += split[v] ?? Math.floor(100 / variants.length);
    if (bucket < cumulative) {
      assignedVariant = v;
      break;
    }
  }

  // Record assignment (idempotent — unique constraint prevents duplicates)
  try {
    await prisma.experimentAssignment.create({
      data: {
        userId: userId ?? null,
        sessionId: sessionId ?? null,
        flagKey,
        variant: assignedVariant,
      },
    });
  } catch {
    // Unique constraint violation — another request won the race.
    // Re-read to get the canonical assignment.
    const canonical = await prisma.experimentAssignment.findFirst({
      where: userId
        ? { userId, flagKey }
        : { sessionId: sessionId!, flagKey },
    });
    if (canonical) return canonical.variant;
  }

  // Fire PostHog event
  try {
    const { track } = await import("@/lib/posthog");
    await track(userId ?? null, "experiment_variant_assigned", {
      flagKey,
      variant: assignedVariant,
      sessionId: sessionId ?? undefined,
    });
  } catch {
    // PostHog may not be configured — degrade gracefully
  }

  return assignedVariant;
}
