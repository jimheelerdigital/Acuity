/**
 * Real Meta spend per campaign (2026-10-27, weekly audit 10-24 "One Big Move").
 *
 * AdLab's own metrics only cover ads that have an AdLabAd row, so UGC ads, the
 * iOS app-install campaigns and retargeting were invisible and cost per trial
 * read 3-4x too good. This reads the WHOLE ad account from Meta's insights API
 * (level=adset, so every web signup can be joined by its utm_term = ad set id)
 * and prices each campaign by charged payer, not just by trial.
 *
 *   Web campaigns: signups / paid trials / payers joined per user via
 *     User.signupUtmTerm (the Meta ad set id our ad links carry).
 *   App-install campaigns: SKAdNetwork gives no per-user match, so App Store
 *     trials that started in the window are set against all app-campaign spend
 *     ("blended").
 *
 * "Payer" uses the same rule as lib/adlab/trial-quality.ts: trial ended
 * (7 days after it started) and the account is still PRO with no billing
 * failure. Under TOO_EARLY_ENDED ended trials a campaign is "too early".
 * Read-only: changes nothing on Meta.
 */
import { prisma } from "@/lib/prisma";

import { TOO_EARLY_ENDED } from "./trial-quality";

const TRIAL_MS = 7 * 24 * 3600_000;
/** Keep a campaign only if a charged payer costs at most this (~8 months of revenue). */
export const COST_PER_PAYER_TARGET_CENTS = 6000;

export type Verdict = "keep" | "cut" | "too early" | "no spend";

export interface CampaignRow {
  campaignId: string;
  name: string;
  objective: string;
  kind: "web" | "app";
  spendCents: number;
  signups: number;
  paidTrials: number;
  ended: number;
  payers: number;
  costPerTrialCents: number | null;
  costPerPayerCents: number | null;
  verdict: Verdict;
}

export interface AccountSpend {
  since: string;
  until: string;
  totalSpendCents: number;
  campaigns: CampaignRow[];
  /** App Store trials started in the window (blended across app campaigns). */
  appStore: { trials: number; ended: number; payers: number };
  /** Web paid trials that came from no Meta ad set (organic, creators' own posts, etc). */
  webNotFromMeta: { paidTrials: number; payers: number };
}

interface InsightRow {
  campaign_id: string;
  campaign_name: string;
  adset_id: string;
  objective?: string;
  spend?: string;
}

async function fetchInsights(since: string, until: string): Promise<InsightRow[]> {
  const meta = await import("./meta");
  const acct = meta.adAccountPath();
  const rows: InsightRow[] = [];
  let after: string | undefined;
  for (let page = 0; page < 20; page++) {
    const res = (await meta.metaGraph(`${acct}/insights`, "GET", {
      level: "adset",
      fields: "campaign_id,campaign_name,adset_id,objective,spend",
      time_range: { since, until },
      limit: "500",
      ...(after ? { after } : {}),
    })) as { data?: InsightRow[]; paging?: { cursors?: { after?: string }; next?: string } };
    rows.push(...(res.data ?? []));
    if (!res.paging?.next || !res.paging.cursors?.after) break;
    after = res.paging.cursors.after;
  }
  return rows;
}

const isApp = (objective: string) => /APP/i.test(objective);

function verdict(spendCents: number, ended: number, costPerPayerCents: number | null): Verdict {
  if (spendCents === 0) return "no spend";
  if (ended < TOO_EARLY_ENDED) return "too early";
  return costPerPayerCents !== null && costPerPayerCents <= COST_PER_PAYER_TARGET_CENTS ? "keep" : "cut";
}

const per = (cents: number, n: number) => (n ? Math.round(cents / n) : null);

/** Dates are YYYY-MM-DD, inclusive, in the ad account's time zone. */
export async function accountSpend(since: string, until: string): Promise<AccountSpend> {
  const insights = await fetchInsights(since, until);
  const start = new Date(`${since}T00:00:00Z`);
  const end = new Date(new Date(`${until}T00:00:00Z`).getTime() + 24 * 3600_000);
  const now = Date.now();

  // ad set → campaign, and spend per campaign.
  const adsetToCampaign = new Map<string, string>();
  const camps = new Map<string, { name: string; objective: string; spendCents: number }>();
  for (const r of insights) {
    adsetToCampaign.set(r.adset_id, r.campaign_id);
    const c = camps.get(r.campaign_id) ?? { name: r.campaign_name, objective: r.objective ?? "", spendCents: 0 };
    c.spendCents += Math.round(parseFloat(r.spend ?? "0") * 100);
    camps.set(r.campaign_id, c);
  }

  const notInternal = { isAdmin: false, NOT: { email: { contains: "heelerdigital" } } };

  // Web signups in the window, by ad set.
  const signups = await prisma.user.findMany({
    where: { createdAt: { gte: start, lt: end }, signupUtmTerm: { not: null }, ...notInternal },
    select: { signupUtmTerm: true },
  });

  // Web paid trials started in the window (first payment event), with outcome.
  const pays = await prisma.onboardingEvent.findMany({
    where: { event: "funnel_payment_completed", value: { contains: "first_payment" }, createdAt: { gte: start, lt: end }, userId: { not: null } },
    select: { userId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const paidAt = new Map<string, Date>();
  for (const p of pays) if (!paidAt.has(p.userId!)) paidAt.set(p.userId!, p.createdAt);
  const payUsers = paidAt.size
    ? await prisma.user.findMany({
        where: { id: { in: [...paidAt.keys()] }, ...notInternal },
        select: { id: true, signupUtmTerm: true, subscriptionStatus: true, stripeFirstFailureAt: true },
      })
    : [];
  const webTrials = payUsers.map((u) => {
    const ended = now > paidAt.get(u.id)!.getTime() + TRIAL_MS;
    return {
      campaignId: u.signupUtmTerm ? adsetToCampaign.get(u.signupUtmTerm) ?? null : null,
      ended,
      payer: ended && u.subscriptionStatus === "PRO" && !u.stripeFirstFailureAt,
    };
  });

  // App Store trials that started in the window (trial start = trialEndsAt - 7d).
  const appUsers = await prisma.user.findMany({
    where: {
      subscriptionSource: "apple",
      trialEndsAt: { gte: new Date(start.getTime() + TRIAL_MS), lt: new Date(end.getTime() + TRIAL_MS) },
      ...notInternal,
    },
    select: { trialEndsAt: true, subscriptionStatus: true },
  });
  const appStore = {
    trials: appUsers.length,
    ended: appUsers.filter((u) => u.trialEndsAt!.getTime() < now).length,
    payers: appUsers.filter((u) => u.trialEndsAt!.getTime() < now && u.subscriptionStatus === "PRO").length,
  };
  const appSpend = [...camps.values()].filter((c) => isApp(c.objective)).reduce((n, c) => n + c.spendCents, 0);

  const campaigns: CampaignRow[] = [...camps.entries()].map(([id, c]) => {
    if (isApp(c.objective)) {
      // Blended: this campaign's share of App Store outcomes, by spend.
      const share = appSpend ? c.spendCents / appSpend : 0;
      const trials = Math.round(appStore.trials * share * 10) / 10;
      const ended = Math.round(appStore.ended * share * 10) / 10;
      const payers = Math.round(appStore.payers * share * 10) / 10;
      const cpp = payers ? Math.round(c.spendCents / payers) : null;
      return {
        campaignId: id,
        name: c.name,
        objective: c.objective,
        kind: "app" as const,
        spendCents: c.spendCents,
        signups: 0,
        paidTrials: trials,
        ended,
        payers,
        costPerTrialCents: trials ? Math.round(c.spendCents / trials) : null,
        costPerPayerCents: cpp,
        verdict: verdict(c.spendCents, appStore.ended, cpp),
      };
    }
    const mine = webTrials.filter((t) => t.campaignId === id);
    const ended = mine.filter((t) => t.ended).length;
    const payers = mine.filter((t) => t.payer).length;
    const cpp = per(c.spendCents, payers);
    return {
      campaignId: id,
      name: c.name,
      objective: c.objective,
      kind: "web" as const,
      spendCents: c.spendCents,
      signups: signups.filter((s) => adsetToCampaign.get(s.signupUtmTerm!) === id).length,
      paidTrials: mine.length,
      ended,
      payers,
      costPerTrialCents: per(c.spendCents, mine.length),
      costPerPayerCents: cpp,
      verdict: verdict(c.spendCents, ended, cpp),
    };
  });
  campaigns.sort((a, b) => b.spendCents - a.spendCents);

  const orphan = webTrials.filter((t) => !t.campaignId);
  return {
    since,
    until,
    totalSpendCents: campaigns.reduce((n, c) => n + c.spendCents, 0),
    campaigns,
    appStore,
    webNotFromMeta: { paidTrials: orphan.length, payers: orphan.filter((t) => t.payer).length },
  };
}

const usd = (c: number | null) => (c === null ? "—" : `$${(c / 100).toFixed(0)}`);

/** Plain-text table, for the daily AdLab email and scripts. */
export function formatAccountSpend(a: AccountSpend): string[] {
  return [
    `\n## 💵 All Meta spend ${a.since} → ${a.until}: ${usd(a.totalSpendCents)} (every campaign, not just AdLab)`,
    ...a.campaigns
      .filter((c) => c.spendCents > 0)
      .map(
        (c) =>
          `- ${c.name} [${c.kind}${c.kind === "app" ? ", blended" : ""}] | spend ${usd(c.spendCents)} | signups ${c.signups} | paid trials ${c.paidTrials} | ended ${c.ended} | payers ${c.payers} | $/trial ${usd(c.costPerTrialCents)} | $/payer ${usd(c.costPerPayerCents)} | ${c.verdict}`
      ),
    `App Store trials started: ${a.appStore.trials} (ended ${a.appStore.ended}, paid ${a.appStore.payers}). Web paid trials not from a Meta ad: ${a.webNotFromMeta.paidTrials}.`,
  ];
}
