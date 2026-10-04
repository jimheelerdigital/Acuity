/**
 * Trial quality per lane and per ad (2026-10-04, weekly audit prompt 3).
 * A "paid trial" isn't revenue until the day-7 charge, and the first card
 * cohort went 0 for 3 because the buyers never recorded. So next to spend and
 * paid trials, this shows:
 *   recorded   trialists with ≥1 COMPLETE entry within 7 days of paying
 *   ended      trials past day 7
 *   converted  ended trials still paying (PRO, no billing failure)
 *   $/recorder spend ÷ recorded;  $/payer spend ÷ converted
 * Under 5 ended trials a row is marked too early. Read-only: no Meta change,
 * and no entry text, mood or theme leaves the database.
 */
import { prisma } from "@/lib/prisma";

const TRIAL_MS = 7 * 24 * 3600_000;
export const TOO_EARLY_ENDED = 5;

export interface QualityRow {
  key: string;
  label: string;
  spendCents: number;
  paidTrials: number;
  recorded: number;
  ended: number;
  converted: number;
  costPerRecorderCents: number | null;
  costPerPayerCents: number | null;
  tooEarly: boolean;
}

function row(key: string, label: string, spendCents: number, users: { recorded: boolean; ended: boolean; converted: boolean }[]): QualityRow {
  const recorded = users.filter((u) => u.recorded).length;
  const ended = users.filter((u) => u.ended).length;
  const converted = users.filter((u) => u.converted).length;
  return {
    key,
    label,
    spendCents,
    paidTrials: users.length,
    recorded,
    ended,
    converted,
    costPerRecorderCents: recorded ? Math.round(spendCents / recorded) : null,
    costPerPayerCents: converted ? Math.round(spendCents / converted) : null,
    tooEarly: ended < TOO_EARLY_ENDED,
  };
}

export async function trialQuality(since: Date): Promise<{ lanes: QualityRow[]; ads: QualityRow[] }> {
  const now = Date.now();
  const pays = await prisma.onboardingEvent.findMany({
    where: { event: "funnel_payment_completed", value: { contains: "first_payment" }, createdAt: { gte: since }, userId: { not: null } },
    select: { userId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const paidAt = new Map<string, Date>();
  for (const p of pays) if (!paidAt.has(p.userId!)) paidAt.set(p.userId!, p.createdAt);
  const ids = [...paidAt.keys()];

  const users = ids.length
    ? await prisma.user.findMany({
        where: { id: { in: ids }, isAdmin: false },
        select: { id: true, email: true, signupLandingPath: true, signupUtmContent: true, subscriptionStatus: true, stripeFirstFailureAt: true },
      })
    : [];
  const entries = ids.length
    ? await prisma.entry.findMany({ where: { userId: { in: ids }, status: "COMPLETE" }, select: { userId: true, createdAt: true } })
    : [];

  const facts = users
    .filter((u) => !/heelerdigital/i.test(u.email))
    .map((u) => {
      const t0 = paidAt.get(u.id)!.getTime();
      const recorded = entries.some((e) => e.userId === u.id && e.createdAt.getTime() <= t0 + TRIAL_MS);
      const ended = now > t0 + TRIAL_MS;
      const converted = ended && u.subscriptionStatus === "PRO" && !u.stripeFirstFailureAt;
      return { lane: /bwk/i.test(u.signupLandingPath ?? "") ? "men" : "women", ad: u.signupUtmContent, recorded, ended, converted };
    });

  // Spend since `since`, per creative, and the lane each creative belongs to.
  const metrics = await prisma.adLabDailyMetric.findMany({
    where: { date: { gte: since } },
    select: { spendCents: true, ad: { select: { creativeId: true, creative: { select: { headline: true, angle: { select: { experiment: { select: { campaignTags: true } } } } } } } } },
  });
  const spendByAd = new Map<string, { cents: number; headline: string; lane: string }>();
  for (const m of metrics) {
    const id = m.ad.creativeId;
    const tags = m.ad.creative.angle.experiment.campaignTags;
    const cur = spendByAd.get(id) ?? { cents: 0, headline: m.ad.creative.headline, lane: tags.includes("men") ? "men" : "women" };
    cur.cents += m.spendCents;
    spendByAd.set(id, cur);
  }

  const lanes = ["women", "men"].map((lane) =>
    row(
      lane,
      lane === "men" ? "Men (BWK)" : "Women (Ripple)",
      [...spendByAd.values()].filter((s) => s.lane === lane).reduce((n, s) => n + s.cents, 0),
      facts.filter((f) => f.lane === lane)
    )
  );
  const adIds = new Set([...spendByAd.keys(), ...facts.map((f) => f.ad).filter((x): x is string => !!x)]);
  const ads = [...adIds]
    .map((id) => {
      const s = spendByAd.get(id);
      return row(id, s?.headline ?? id, s?.cents ?? 0, facts.filter((f) => f.ad === id));
    })
    .filter((r) => r.paidTrials > 0 || r.spendCents >= 1000)
    .sort((a, b) => b.paidTrials - a.paidTrials || b.spendCents - a.spendCents);
  return { lanes, ads };
}

const $ = (c: number | null) => (c === null ? "—" : `$${(c / 100).toFixed(0)}`);

/** Plain-text block for the daily AdLab email. */
export function formatTrialQuality(q: { lanes: QualityRow[]; ads: QualityRow[] }, sinceLabel: string): string[] {
  const line = (r: QualityRow) =>
    `${r.label} | spend ${$(r.spendCents)} | paid trials ${r.paidTrials} | recorded ${r.recorded} | ended ${r.ended} | converted ${r.converted} | $/recorder ${$(r.costPerRecorderCents)} | $/payer ${r.tooEarly ? "too early" : $(r.costPerPayerCents)}`;
  return [
    `\n## 🎯 Trial quality since ${sinceLabel} (recorded = debrief within 7 days of paying)`,
    ...q.lanes.map((r) => `- ${line(r)}`),
    `Top ads:`,
    ...q.ads.slice(0, 8).map((r) => `- ${line(r)}`),
  ];
}
