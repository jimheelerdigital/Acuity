/**
 * Planners funnel: new (/start-journal) vs old (/start-test) (2026-11-01,
 * per Keenan: "build a planner new vs old funnel tracker in admin").
 *
 * Fair comparison = the 50/50 split only (lib/journal-split.ts). A visitor
 * is placed by the split when her session logs funnel_split_arm =
 * "journal-journal" (new) or "journal-control" (old, redirected to
 * /start-test in the same tab, so the same session token). Visitors who
 * went straight to either page aren't counted here.
 *
 * Per arm: sessions, then how many reached each step (furthest-reached, so a
 * later step implies the earlier ones), paid trials, app sign-in and a first
 * debrief. Rates are against landed, with a two-proportion p-value for the
 * steps worth calling.
 */
import { prisma } from "@/lib/prisma";
import { isInternalEmail } from "@/lib/internal-traffic";

/** The split was switched on 2026-11-01 ~18:36 UTC; nothing before counts. */
export const PLANNERS_SPLIT_FROM = new Date("2026-11-01T18:00:00Z");

type Arm = "new" | "old";
const ARM_VALUE: Record<string, Arm> = { "journal-journal": "new", "journal-control": "old" };

const STEPS: { key: string; label: string; events: string[]; test?: boolean }[] = [
  { key: "landed", label: "Landed", events: [] },
  { key: "answered", label: "Answered screen 1", events: ["funnel_entry_selected"], test: true },
  { key: "gate", label: "Reached email", events: ["funnel_v9_email_viewed", "funnel_email_gate_viewed"] },
  { key: "signup", label: "Signed up", events: ["funnel_account_created", "funnel_email_submitted"], test: true },
  { key: "paywall", label: "Saw paywall", events: ["funnel_v9_paywall_viewed", "funnel_paywall_s1_viewed"] },
  { key: "checkout", label: "Started checkout", events: ["funnel_checkout_started"] },
  { key: "trial", label: "Paid trial", events: ["funnel_payment_completed"], test: true },
];

export interface ArmStats {
  arm: Arm;
  label: string;
  sessions: number;
  steps: { key: string; label: string; count: number; pctOfLanded: number | null; pctOfPrev: number | null }[];
  app: number;
  debrief: number;
  yearlyTrials: number;
  paywallPages: { s1: number; s2: number; s3: number } | null;
  exitOffer: { viewed: number; accepted: number } | null;
}

export interface PlannersCompare {
  from: string;
  to: string;
  splitOn: boolean;
  arms: ArmStats[];
  tests: { key: string; label: string; newRate: number | null; oldRate: number | null; pValue: number | null; significant: boolean }[];
  targetPerArm: number;
  unsplitNewSessions: number;
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);

function twoProportionP(x1: number, n1: number, x2: number, n2: number): number | null {
  if (n1 <= 0 || n2 <= 0) return null;
  const pp = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(pp * (1 - pp) * (1 / n1 + 1 / n2));
  if (!(se > 0)) return null;
  const z = Math.abs(x1 / n1 - x2 / n2) / se;
  const t = 1 / (1 + 0.3275911 * (z / Math.SQRT2));
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return Math.max(0, Math.min(1, 1 - erf));
}

export async function plannersCompare(from: Date = PLANNERS_SPLIT_FROM, to: Date = new Date()): Promise<PlannersCompare> {
  const flag = await prisma.featureFlag
    .findUnique({ where: { key: "funnel_journal_split" }, select: { enabled: true } })
    .catch(() => null);

  const armRows = await prisma.onboardingEvent.findMany({
    where: { event: "funnel_split_arm", value: { in: Object.keys(ARM_VALUE) }, createdAt: { gte: from, lte: to }, isBot: false, sessionToken: { not: null } },
    select: { sessionToken: true, value: true },
  });
  const armOf = new Map<string, Arm>();
  for (const r of armRows) if (!armOf.has(r.sessionToken!)) armOf.set(r.sessionToken!, ARM_VALUE[r.value!]);
  const tokens = [...armOf.keys()];

  const events = tokens.length
    ? await prisma.onboardingEvent.findMany({
        where: { sessionToken: { in: tokens }, createdAt: { gte: from, lte: to }, isBot: false },
        select: { sessionToken: true, event: true, value: true, userId: true },
        take: 200000,
      })
    : [];

  type Sess = { arm: Arm; names: Set<string>; users: Set<string>; yearly: boolean };
  const sessions = new Map<string, Sess>();
  for (const t of tokens) sessions.set(t, { arm: armOf.get(t)!, names: new Set(), users: new Set(), yearly: false });
  for (const e of events) {
    const s = sessions.get(e.sessionToken!);
    if (!s) continue;
    if (e.userId) s.users.add(e.userId);
    if (e.event === "funnel_payment_completed") {
      if (e.value?.endsWith(":renewal")) continue;
      if (/year|annual/i.test(e.value ?? "")) s.yearly = true;
    }
    s.names.add(e.event);
  }

  // Internal accounts never count (lib/internal-traffic.ts).
  const userIds = [...new Set([...sessions.values()].flatMap((s) => [...s.users]))];
  const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true, isAdmin: true } }) : [];
  const internal = new Set(users.filter((u) => u.isAdmin || isInternalEmail(u.email)).map((u) => u.id));
  for (const [t, s] of sessions) if ([...s.users].some((u) => internal.has(u))) sessions.delete(t);

  const [appRows, entryRows] = userIds.length
    ? await Promise.all([
        prisma.onboardingEvent.findMany({ where: { userId: { in: userIds }, event: "app_signed_in" }, select: { userId: true }, distinct: ["userId"] }),
        prisma.entry.findMany({ where: { userId: { in: userIds } }, select: { userId: true }, distinct: ["userId"] }),
      ])
    : [[], []];
  const inApp = new Set(appRows.map((r) => r.userId));
  const debriefed = new Set(entryRows.map((r) => r.userId));

  const build = (arm: Arm): ArmStats => {
    const mine = [...sessions.values()].filter((s) => s.arm === arm);
    const counts = Object.fromEntries(STEPS.map((s) => [s.key, 0])) as Record<string, number>;
    let app = 0, debrief = 0, yearly = 0;
    const pages = { s1: 0, s2: 0, s3: 0 };
    const offer = { viewed: 0, accepted: 0 };
    for (const s of mine) {
      let furthest = 0;
      STEPS.forEach((st, i) => { if (i > 0 && st.events.some((n) => s.names.has(n))) furthest = i; });
      for (let i = 0; i <= furthest; i++) counts[STEPS[i].key]++;
      const trial = s.names.has("funnel_payment_completed");
      if (trial && s.yearly) yearly++;
      const us = [...s.users];
      if (us.some((u) => inApp.has(u))) app++;
      if (us.some((u) => debriefed.has(u))) debrief++;
      if (s.names.has("funnel_paywall_s1_viewed")) pages.s1++;
      if (s.names.has("funnel_paywall_s2_viewed")) pages.s2++;
      if (s.names.has("funnel_paywall_s3_viewed")) pages.s3++;
      if (s.names.has("exit_offer_viewed")) offer.viewed++;
      if (s.names.has("exit_offer_accepted")) offer.accepted++;
    }
    const landed = counts.landed;
    return {
      arm,
      label: arm === "new" ? "New: /start-journal" : "Old: /start-test",
      sessions: mine.length,
      steps: STEPS.map((st, i) => ({
        key: st.key,
        label: st.label,
        count: counts[st.key],
        pctOfLanded: pct(counts[st.key], landed),
        pctOfPrev: i > 0 ? pct(counts[st.key], counts[STEPS[i - 1].key]) : null,
      })),
      app,
      debrief,
      yearlyTrials: yearly,
      paywallPages: arm === "new" ? pages : null,
      exitOffer: arm === "new" ? offer : null,
    };
  };
  const arms = [build("new"), build("old")];
  const [n, o] = arms;
  const tests = STEPS.filter((s) => s.test).map((s) => {
    const xn = n.steps.find((x) => x.key === s.key)!.count;
    const xo = o.steps.find((x) => x.key === s.key)!.count;
    const p = twoProportionP(xn, n.sessions, xo, o.sessions);
    return { key: s.key, label: s.label, newRate: pct(xn, n.sessions), oldRate: pct(xo, o.sessions), pValue: p, significant: p !== null && p < 0.05 };
  });

  // New-funnel visits that didn't come through the split (direct links,
  // previews). Shown so the totals elsewhere in admin reconcile.
  const unsplit = await prisma.onboardingEvent.findMany({
    where: { flowVersion: "v9-journal", event: "funnel_entry_rendered", createdAt: { gte: from, lte: to }, isBot: false, sessionToken: { notIn: tokens.length ? tokens : ["-"] } },
    select: { sessionToken: true },
    distinct: ["sessionToken"],
  });

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    splitOn: !!flag?.enabled,
    arms,
    tests,
    targetPerArm: 350,
    unsplitNewSessions: unsplit.length,
  };
}
