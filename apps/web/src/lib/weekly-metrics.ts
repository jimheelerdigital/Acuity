/**
 * Weekly founder metrics (2026-10-07, per Keenan: "send me an email breaking
 * these numbers down every sunday... how many signups, how many entered
 * card, how many record, active recorders that week, etc. metrics that
 * actually matter").
 *
 * Everything is computed from our own DB (no live Stripe call), with the
 * same inference the admin Users tab uses: a Stripe card trial is "charged"
 * once a :renewal event exists or its billing period runs past the 7-day
 * trial; Apple/Google trials come from the latest receipt. Internal and comp
 * accounts are excluded.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isInternalEmail } from "@/lib/internal-traffic";

const DAY = 864e5;

type State = "paid" | "card_trial" | "card_cancelled" | "nocard_trial" | "free";

interface Classified {
  id: string;
  createdAt: Date;
  state: State;
  /** When the card was entered (Stripe first_payment event). */
  cardStart: Date | null;
  freeFirst: boolean;
  source: "meta" | "appstore" | "other";
}

async function classify(where: Prisma.UserWhereInput, now: Date): Promise<Classified[]> {
  const users = await prisma.user.findMany({
    where,
    select: {
      id: true, email: true, createdAt: true, subscriptionStatus: true, subscriptionSource: true,
      stripeCurrentPeriodEnd: true, appleLatestReceiptInfo: true, googleLatestReceiptInfo: true,
      signupUtmSource: true, signupLandingPath: true,
    },
  });
  const real = users.filter((u) => !isInternalEmail(u.email) && !/example\.com$/i.test(u.email ?? "") && u.subscriptionSource !== "comp");
  const ev = await prisma.onboardingEvent.findMany({
    where: {
      userId: { in: real.map((u) => u.id) },
      OR: [{ value: { endsWith: ":first_payment" } }, { value: { endsWith: ":renewal" } }, { event: "funnel_paywall_skip_selected" }],
    },
    select: { userId: true, event: true, value: true, createdAt: true },
  });
  const byUser = new Map<string, typeof ev>();
  for (const e of ev) byUser.set(e.userId!, [...(byUser.get(e.userId!) ?? []), e]);

  return real.map((u) => {
    const e = byUser.get(u.id) ?? [];
    const first = e.find((x) => x.value?.endsWith(":first_payment"));
    const renewed = e.some((x) => x.value?.endsWith(":renewal"));
    const skippedAt = e.find((x) => x.event === "funnel_paywall_skip_selected")?.createdAt ?? null;
    let state: State = "free";
    if (u.subscriptionSource === "stripe" || first) {
      if (u.subscriptionStatus === "PRO" || u.subscriptionStatus === "PAST_DUE" || u.subscriptionStatus === "TRIAL") {
        const span = first && u.stripeCurrentPeriodEnd ? (+u.stripeCurrentPeriodEnd - +first.createdAt) / DAY : 99;
        state = renewed || span > 10 ? "paid" : "card_trial";
      } else state = "card_cancelled";
    } else if (u.subscriptionSource === "apple" || u.subscriptionSource === "google") {
      const r = (u.subscriptionSource === "apple" ? u.appleLatestReceiptInfo : u.googleLatestReceiptInfo) as Record<string, unknown> | null;
      const expRaw = r?.expiresDate ?? r?.expires_date;
      const exp = expRaw ? new Date(String(expRaw)) : null;
      const freeTrial = String(r?.offerDiscountType ?? "") === "FREE_TRIAL";
      if (u.subscriptionStatus === "PRO") state = freeTrial && exp && exp > now ? "card_trial" : "paid";
      else if (u.subscriptionStatus === "TRIAL") state = "nocard_trial";
      else state = r ? "card_cancelled" : "free";
    } else if (u.subscriptionStatus === "TRIAL") state = "nocard_trial";
    else if (u.subscriptionStatus === "PRO") state = "paid";
    const cardStart = first?.createdAt ?? null;
    const freeFirst = !!cardStart && ((!!skippedAt && cardStart > skippedAt) || +cardStart - +u.createdAt > 6 * 3600e3);
    const meta = /meta|facebook|fb|ig|instagram/i.test(u.signupUtmSource ?? "") || /^\/start/.test(u.signupLandingPath ?? "");
    const source = meta ? "meta" : !u.signupUtmSource && !u.signupLandingPath ? "appstore" : "other";
    return { id: u.id, createdAt: u.createdAt, state, cardStart, freeFirst, source };
  });
}

export interface WeekMetrics {
  start: Date;
  end: Date;
  signups: number;
  signupsMeta: number;
  signupsAppStore: number;
  enteredCard: number;
  freePlan: number;
  nocardTrial: number;
  recordedNew: number;
  trialsEnded: number;
  trialsConverted: number;
  trialsCancelled: number;
  freeToPaid: number;
  activeRecorders: number;
  recordings: number;
  habitRecorders: number;
  payingNow: number;
  cardTrialsOpen: number;
  spendCents: number;
}

export async function weekMetrics(start: Date, end: Date, now = end): Promise<WeekMetrics> {
  const cohort = await classify({ createdAt: { gte: start, lt: end } }, now);
  const cohortIds = cohort.map((c) => c.id);
  const recordedIds = new Set(
    (await prisma.entry.findMany({ where: { userId: { in: cohortIds } }, select: { userId: true }, distinct: ["userId"] })).map((r) => r.userId)
  );

  // Card trials whose 7 days ended inside the window.
  const trialStarters = await classify({ onboardingEvents: { some: { value: { endsWith: ":first_payment" }, createdAt: { gte: new Date(+start - 7 * DAY), lt: new Date(+end - 7 * DAY) } } } }, now);
  const ended = trialStarters.filter((t) => t.cardStart && +t.cardStart >= +start - 7 * DAY && +t.cardStart < +end - 7 * DAY);

  // Free -> paid: card entered this week after time on the free plan.
  const cardThisWeek = await classify({ onboardingEvents: { some: { value: { endsWith: ":first_payment" }, createdAt: { gte: start, lt: end } } } }, now);

  // Recording activity this week (all users, minus internal).
  const entries = await prisma.entry.findMany({
    where: { createdAt: { gte: start, lt: end } },
    select: { userId: true, createdAt: true, user: { select: { email: true } } },
  });
  const realEntries = entries.filter((e) => !isInternalEmail(e.user.email));
  const days = new Map<string, Set<string>>();
  for (const e of realEntries) {
    const d = new Date(+e.createdAt - 5 * 3600e3).toISOString().slice(0, 10); // ~Central day
    days.set(e.userId, (days.get(e.userId) ?? new Set()).add(d));
  }

  const everyone = await classify({ subscriptionStatus: { in: ["PRO", "PAST_DUE", "TRIAL"] } }, now);
  const spend = await prisma.adLabDailyMetric.aggregate({ where: { date: { gte: start, lt: end } }, _sum: { spendCents: true } });

  return {
    start, end,
    signups: cohort.length,
    signupsMeta: cohort.filter((c) => c.source === "meta").length,
    signupsAppStore: cohort.filter((c) => c.source === "appstore").length,
    enteredCard: cohort.filter((c) => c.state === "paid" || c.state === "card_trial" || c.state === "card_cancelled").length,
    freePlan: cohort.filter((c) => c.state === "free").length,
    nocardTrial: cohort.filter((c) => c.state === "nocard_trial").length,
    recordedNew: cohort.filter((c) => recordedIds.has(c.id)).length,
    trialsEnded: ended.length,
    trialsConverted: ended.filter((t) => t.state === "paid").length,
    trialsCancelled: ended.filter((t) => t.state === "card_cancelled").length,
    freeToPaid: cardThisWeek.filter((c) => c.freeFirst && c.cardStart && c.cardStart >= start && c.cardStart < end).length,
    activeRecorders: days.size,
    recordings: realEntries.length,
    habitRecorders: [...days.values()].filter((s) => s.size >= 3).length,
    payingNow: everyone.filter((c) => c.state === "paid").length,
    cardTrialsOpen: everyone.filter((c) => c.state === "card_trial").length,
    spendCents: spend._sum.spendCents ?? 0,
  };
}

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
const usd = (c: number) => `$${(c / 100).toFixed(0)}`;

export function weeklyMetricsHtml(cur: WeekMetrics, prev: WeekMetrics): { subject: string; html: string } {
  const delta = (a: number, b: number) => {
    const d = a - b;
    return d === 0 ? `<span style="color:#888">same</span>` : `<span style="color:${d > 0 ? "#15803d" : "#b91c1c"}">${d > 0 ? "+" : ""}${d}</span>`;
  };
  const row = (label: string, a: string | number, b: string | number, d = "", note = "") =>
    `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${label}${note ? `<div style="color:#888;font-size:12px">${note}</div>` : ""}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:600">${a}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;color:#666">${b}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${d}</td></tr>`;
  const section = (t: string) => `<tr><td colspan="4" style="padding:14px 10px 4px;font-weight:700;font-size:14px">${t}</td></tr>`;
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" });
  const c = cur, p = prev;
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:640px;color:#111">
<h2 style="margin:0 0 4px">Ripple weekly numbers</h2>
<div style="color:#666;margin-bottom:12px">${fmt(c.start)} – ${fmt(new Date(+c.end - 1))} vs the week before. Internal and comp accounts excluded.</div>
<table style="border-collapse:collapse;width:100%;font-size:14px">
<tr style="color:#888;font-size:12px"><td style="padding:4px 10px"></td><td style="padding:4px 10px;text-align:right">This week</td><td style="padding:4px 10px;text-align:right">Last week</td><td style="padding:4px 10px;text-align:right">Change</td></tr>
${section("Signups")}
${row("Signups", c.signups, p.signups, delta(c.signups, p.signups))}
${row("From Meta ads (web funnel)", c.signupsMeta, p.signupsMeta, delta(c.signupsMeta, p.signupsMeta))}
${row("App Store direct (no ad tag)", c.signupsAppStore, p.signupsAppStore, delta(c.signupsAppStore, p.signupsAppStore))}
${section("Money")}
${row("Entered a card", `${c.enteredCard} (${pct(c.enteredCard, c.signups)})`, `${p.enteredCard} (${pct(p.enteredCard, p.signups)})`, delta(c.enteredCard, p.enteredCard), "of this week's signups")}
${row("No-card trial", c.nocardTrial, p.nocardTrial, delta(c.nocardTrial, p.nocardTrial), "app trials + free-week claims")}
${row("Free plan, no trial", c.freePlan, p.freePlan, delta(c.freePlan, p.freePlan))}
${row("Trial → paid", `${c.trialsConverted}/${c.trialsEnded} (${pct(c.trialsConverted, c.trialsEnded)})`, `${p.trialsConverted}/${p.trialsEnded} (${pct(p.trialsConverted, p.trialsEnded)})`, "", "card trials whose 7 days ended this week")}
${row("Free → paid", c.freeToPaid, p.freeToPaid, delta(c.freeToPaid, p.freeToPaid), "added a card after time on the free plan")}
${row("Paying subscribers now", c.payingNow, "", "", "charged at least once, still active")}
${row("Card trials open now", c.cardTrialsOpen, "", "", "will charge or cancel within 7 days")}
${section("Recording (the product)")}
${row("New signups who recorded", `${c.recordedNew} (${pct(c.recordedNew, c.signups)})`, `${p.recordedNew} (${pct(p.recordedNew, p.signups)})`, delta(c.recordedNew, p.recordedNew))}
${row("Active recorders", c.activeRecorders, p.activeRecorders, delta(c.activeRecorders, p.activeRecorders), "recorded at least once this week")}
${row("Recorded 3+ days", c.habitRecorders, p.habitRecorders, delta(c.habitRecorders, p.habitRecorders), "the habit signal")}
${row("Total recordings", c.recordings, p.recordings, delta(c.recordings, p.recordings))}
${section("Ads")}
${row("Meta spend (AdLab ads)", usd(c.spendCents), usd(p.spendCents))}
${row("Cost per signup", c.signupsMeta ? usd(c.spendCents / c.signupsMeta) : "—", p.signupsMeta ? usd(p.spendCents / p.signupsMeta) : "—", "", "spend ÷ Meta signups")}
${row("Cost per card entered", c.enteredCard ? usd(c.spendCents / c.enteredCard) : "—", p.enteredCard ? usd(p.spendCents / p.enteredCard) : "—", "", "spend ÷ all card entries")}
</table>
<p style="color:#888;font-size:12px;margin-top:14px">Card status is inferred from our own records (Stripe events and app receipts), not a live Stripe call; Stripe's dashboard is the final word on charges. "Paying subscribers now" and "card trials open" are snapshots taken when this email was built.</p>
</div>`;
  return { subject: `Ripple weekly: ${c.signups} signups, ${c.enteredCard} cards, ${c.activeRecorders} active recorders`, html };
}
