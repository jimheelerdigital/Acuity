/**
 * GET /api/insights/health-correlations
 *
 * Join the user's last 30 days of COMPLETE entries (mood + moodScore)
 * with HealthSnapshot rows by calendar day. Report simple pair-wise
 * correlations so the Insights card can say something like
 * "Your mood is ~1.2 points higher on days with 7+ hours sleep".
 *
 * Scope: intentionally simple. No Pearson r, no p-values. This is a
 * read-layer heuristic that tells the user "your numbers noticed
 * this" and trusts them to take it with the appropriate salt. Real
 * statistical rigor comes later or not at all — the value to the
 * user is directional.
 *
 * Returns an empty array when there are <7 overlapping days — not
 * enough signal to say anything useful.
 */

import { NextRequest, NextResponse } from "next/server";

import { gateFeatureFlag } from "@/lib/feature-flags";
import { getAnySessionUserId } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const WINDOW_DAYS = 30;
const MIN_PAIRED_DAYS = 7;

type Correlation = {
  kind: "sleep" | "steps" | "hrv" | "active";
  direction: "up" | "down" | "flat";
  observation: string; // user-facing sentence
  pairedDays: number;
};

export async function GET(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const gated = await gateFeatureFlag(userId, "apple_health_integration");
  if (gated) return gated;

  const { prisma } = await import("@/lib/prisma");

  const windowStart = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [entries, snapshots] = await Promise.all([
    prisma.entry.findMany({
      where: {
        userId,
        status: "COMPLETE",
        createdAt: { gte: windowStart },
        moodScore: { not: null },
      },
      select: { createdAt: true, moodScore: true },
    }),
    prisma.healthSnapshot.findMany({
      where: { userId, date: { gte: windowStart } },
    }),
  ]);

  if (snapshots.length === 0 || entries.length === 0) {
    return NextResponse.json({ correlations: [] });
  }

  // Group entry mood by calendar day (UTC); HealthSnapshot is already
  // per-day so join is a simple key-lookup.
  const moodByDay = new Map<string, { sum: number; count: number }>();
  for (const e of entries) {
    const key = e.createdAt.toISOString().slice(0, 10);
    const bucket = moodByDay.get(key) ?? { sum: 0, count: 0 };
    bucket.sum += e.moodScore ?? 0;
    bucket.count += 1;
    moodByDay.set(key, bucket);
  }

  // Build paired series per metric.
  type Pair = { mood: number; metric: number };
  const buckets: Record<Correlation["kind"], Pair[]> = {
    sleep: [],
    steps: [],
    hrv: [],
    active: [],
  };

  for (const s of snapshots) {
    const key = s.date.toISOString().slice(0, 10);
    const m = moodByDay.get(key);
    if (!m || m.count === 0) continue;
    const avgMood = m.sum / m.count;
    if (typeof s.sleepHours === "number") buckets.sleep.push({ mood: avgMood, metric: s.sleepHours });
    if (typeof s.steps === "number") buckets.steps.push({ mood: avgMood, metric: s.steps });
    if (typeof s.avgHRV === "number") buckets.hrv.push({ mood: avgMood, metric: s.avgHRV });
    if (typeof s.activeMinutes === "number")
      buckets.active.push({ mood: avgMood, metric: s.activeMinutes });
  }

  const correlations: Correlation[] = [];
  for (const kind of Object.keys(buckets) as Correlation["kind"][]) {
    const pairs = buckets[kind];
    if (pairs.length < MIN_PAIRED_DAYS) continue;
    const obs = describeCorrelation(kind, pairs);
    if (obs) correlations.push({ ...obs, pairedDays: pairs.length });
  }

  return NextResponse.json({ correlations });
}

/**
 * Simple above/below median split + mean-mood delta. Not Pearson —
 * sample sizes are small enough (7-30 paired days) that a full
 * correlation would over-index on outliers. Median split + delta is
 * honest about the level of inference we can make.
 */
function describeCorrelation(
  kind: Correlation["kind"],
  pairs: Array<{ mood: number; metric: number }>
): Omit<Correlation, "pairedDays"> | null {
  const sorted = [...pairs].sort((a, b) => a.metric - b.metric);
  const midIdx = Math.floor(sorted.length / 2);
  const low = sorted.slice(0, midIdx);
  const high = sorted.slice(sorted.length - midIdx);
  if (low.length === 0 || high.length === 0) return null;

  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const lowMood = mean(low.map((p) => p.mood));
  const highMood = mean(high.map((p) => p.mood));
  const delta = highMood - lowMood;

  // Threshold on a 1-10 mood scale. Below 0.5 points isn't worth
  // surfacing; users don't need to read noise.
  if (Math.abs(delta) < 0.5) {
    return null;
  }

  const direction: "up" | "down" = delta > 0 ? "up" : "down";

  // Compute a human-readable threshold from the metric distribution
  // so the copy references a real number from this user.
  const medianMetric = sorted[midIdx].metric;

  const observation = buildObservation(kind, direction, delta, medianMetric);
  return { kind, direction, observation };
}

function buildObservation(
  kind: Correlation["kind"],
  direction: "up" | "down",
  delta: number,
  medianMetric: number
): string {
  const pts = Math.abs(delta).toFixed(1);
  const arrow = direction === "up" ? "higher" : "lower";
  switch (kind) {
    case "sleep": {
      const hrs = Math.round(medianMetric * 10) / 10;
      return direction === "up"
        ? `Your mood is ~${pts} points ${arrow} on days with ${hrs}+ hours of sleep.`
        : `Your mood is ~${pts} points ${arrow} on nights you got less than ${hrs} hours of sleep.`;
    }
    case "steps": {
      const steps = Math.round(medianMetric);
      return direction === "up"
        ? `Your mood is ~${pts} points ${arrow} on days you walked ${steps.toLocaleString()}+ steps.`
        : `Your mood drops ~${pts} points on lower-activity days (under ${steps.toLocaleString()} steps).`;
    }
    case "hrv": {
      return direction === "up"
        ? `Your mood is ~${pts} points ${arrow} on days with higher heart-rate variability.`
        : `Your mood dips ~${pts} points when HRV runs low.`;
    }
    case "active": {
      const mins = Math.round(medianMetric);
      return direction === "up"
        ? `Your mood climbs ~${pts} points on days with ${mins}+ active minutes.`
        : `Your mood is ~${pts} points ${arrow} on days with less exercise.`;
    }
  }
}
