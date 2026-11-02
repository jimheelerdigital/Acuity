/**
 * Sunday audience report (2026-11-02, per Keenan: "WHO is actually clicking
 * and converting ... pull that information every sunday and send me the
 * report"). Two sources, because Meta's purchase counts run ~2x real trials
 * (lib/adlab/trial-quality.ts):
 *
 *   1. Meta: spend / clicks / signups / purchases by gender, age and both,
 *      for Ripple campaigns. App-install campaigns are reported on their own:
 *      their "clicks" are mostly App Store taps, heavy with 65+ accidental
 *      taps, and would swamp the web numbers.
 *   2. Our funnel: the age range she picks on screen "age", joined to whether
 *      that session signed up and started a paid (card) trial. Self-reported,
 *      and the only source that sees real Stripe trials.
 */
import { prisma } from "@/lib/prisma";
import { adAccountPath, metaGraph } from "@/lib/adlab/meta";

type Row = { campaign_name?: string; age?: string; gender?: string; spend?: string; impressions?: string; inline_link_clicks?: string; actions?: unknown };
export interface Seg { key: string; spend: number; impr: number; clicks: number; signups: number; purchases: number; installs: number }

const NOT_RIPPLE = /mythic|bwk|build with|page like/i;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

function actionCount(actions: unknown, type: string): number {
  if (Array.isArray(actions)) {
    return actions.filter((a) => a?.action_type === type).reduce((n, a) => n + Number(a.value || 0), 0);
  }
  if (actions && typeof actions === "object") return Number((actions as Record<string, unknown>)[type] || 0);
  return 0;
}

async function metaRows(since: Date, until: Date): Promise<Row[]> {
  const rows: Row[] = [];
  let after: string | undefined;
  for (let page = 0; page < 20; page++) {
    const params: Record<string, unknown> = {
      level: "campaign",
      time_range: { since: ymd(since), until: ymd(until) },
      breakdowns: "age,gender",
      fields: "campaign_name,spend,impressions,inline_link_clicks,actions",
      limit: 500,
    };
    if (after) params.after = after;
    const r = (await metaGraph(`${adAccountPath()}/insights`, "GET", params)) as { data?: Row[]; paging?: { cursors?: { after?: string }; next?: string } };
    rows.push(...(r.data ?? []));
    if (!r.paging?.next) break;
    after = r.paging.cursors?.after;
  }
  return rows.filter((r) => !NOT_RIPPLE.test(r.campaign_name ?? ""));
}

function group(rows: Row[], key: (r: Row) => string): Seg[] {
  const m = new Map<string, Seg>();
  for (const r of rows) {
    const k = key(r);
    const s = m.get(k) ?? { key: k, spend: 0, impr: 0, clicks: 0, signups: 0, purchases: 0, installs: 0 };
    s.spend += Number(r.spend || 0);
    s.impr += Number(r.impressions || 0);
    s.clicks += Number(r.inline_link_clicks || 0);
    s.signups += actionCount(r.actions, "complete_registration");
    s.purchases += actionCount(r.actions, "purchase");
    s.installs += actionCount(r.actions, "mobile_app_install");
    m.set(k, s);
  }
  return [...m.values()].sort((a, b) => b.spend - a.spend);
}

export interface FunnelAge { key: string; answered: number; signedUp: number; trials: number; payingNow: number }

/** Screen "age" answers in the web funnels, joined to signup and card trial. */
async function funnelAges(since: Date, until: Date): Promise<FunnelAge[]> {
  const ages = await prisma.onboardingEvent.findMany({
    where: { event: "funnel_v9_age_answered", createdAt: { gte: since, lt: until }, isBot: false, sessionToken: { not: null } },
    select: { sessionToken: true, value: true, flowVersion: true },
  });
  const toks = [...new Set(ages.map((a) => a.sessionToken!))];
  if (!toks.length) return [];
  const ev = await prisma.onboardingEvent.findMany({
    where: { sessionToken: { in: toks }, event: { in: ["funnel_account_created", "funnel_email_submitted", "funnel_payment_completed"] } },
    select: { sessionToken: true, event: true, userId: true },
  });
  const userOf = new Map<string, string>();
  const signed = new Set<string>();
  const paidTok = new Set<string>();
  for (const e of ev) {
    if (e.userId) userOf.set(e.sessionToken!, e.userId);
    if (e.event === "funnel_payment_completed") paidTok.add(e.sessionToken!);
    else signed.add(e.sessionToken!);
  }
  const subs = await prisma.user.findMany({
    where: { id: { in: [...new Set(userOf.values())] }, stripeSubscriptionId: { not: null } },
    select: { id: true, subscriptionStatus: true },
  });
  const sub = new Map(subs.map((s) => [s.id, s.subscriptionStatus]));
  const LABEL: Record<string, string> = { u35: "Under 35", "35": "35–44", "45": "45–54", "55": "55+", u25: "Under 25", "25": "25–34" };
  const out = new Map<string, FunnelAge>();
  const seen = new Set<string>();
  for (const a of ages) {
    const t = a.sessionToken!;
    if (seen.has(t)) continue;
    seen.add(t);
    const men = (a.flowVersion ?? "").includes("bwk");
    const label = men && a.value === "45" ? "45+" : LABEL[a.value ?? ""] ?? a.value ?? "?";
    const key = `${men ? "Men’s funnel" : "Ripple funnels"} · ${label}`;
    const f = out.get(key) ?? { key, answered: 0, signedUp: 0, trials: 0, payingNow: 0 };
    f.answered++;
    if (signed.has(t)) f.signedUp++;
    const uid = userOf.get(t);
    if (paidTok.has(t) || (uid && sub.has(uid))) f.trials++;
    if (uid && sub.get(uid) === "PRO") f.payingNow++;
    out.set(key, f);
  }
  return [...out.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export interface AudienceReport {
  since: Date;
  until: Date;
  web: { total: Seg; gender: Seg[]; age: Seg[]; both: Seg[] };
  app: { total: Seg; age: Seg[] } | null;
  funnel: FunnelAge[];
  flags: string[];
}

export async function audienceReport(days = 28, until = new Date()): Promise<AudienceReport> {
  const since = new Date(+until - days * 864e5);
  const rows = await metaRows(since, until);
  const isApp = (r: Row) => /app install/i.test(r.campaign_name ?? "");
  const web = rows.filter((r) => !isApp(r));
  const app = rows.filter(isApp);
  const total = (rs: Row[]) => group(rs, () => "All")[0] ?? { key: "All", spend: 0, impr: 0, clicks: 0, signups: 0, purchases: 0, installs: 0 };
  const rep: AudienceReport = {
    since,
    until,
    web: { total: total(web), gender: group(web, (r) => r.gender ?? "unknown"), age: group(web, (r) => r.age ?? "?"), both: group(web, (r) => `${r.gender ?? "unknown"} ${r.age ?? "?"}`) },
    app: app.length ? { total: total(app), age: group(app, (r) => r.age ?? "?") } : null,
    funnel: await funnelAges(since, until),
    flags: [],
  };
  // Plain-English flags: segments that spent and returned nothing, and junk-click signs.
  for (const s of rep.web.both) {
    if (s.spend >= 75 && s.purchases === 0) rep.flags.push(`${cap(s.key)}: $${Math.round(s.spend)} spent, no purchases.`);
  }
  const old = rep.web.age.find((s) => s.key === "65+");
  if (old && rep.web.total.spend > 0 && old.spend / rep.web.total.spend >= 0.05) {
    rep.flags.push(`65+ took ${pct(old.spend, rep.web.total.spend)} of web ad spend ($${Math.round(old.spend)}) for ${old.purchases} purchase${old.purchases === 1 ? "" : "s"}.`);
  }
  if (rep.app && rep.app.total.impr > 0 && rep.app.total.clicks / rep.app.total.impr > 0.15) {
    const o = rep.app.age.find((s) => s.key === "65+");
    rep.flags.push(`App-install ads show a ${pct(rep.app.total.clicks, rep.app.total.impr)} click rate${o ? `, ${pct(o.clicks, rep.app.total.clicks)} of clicks from 65+` : ""}: mostly accidental taps, not people choosing the app.`);
  }
  return rep;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "–");
const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const per = (spend: number, n: number) => (n ? money(spend / n) : "–");

export function audienceReportHtml(r: AudienceReport): { subject: string; html: string } {
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" });
  const td = (v: string | number, right = true, bold = false) => `<td style="padding:6px 8px;border-bottom:1px solid #eee;${right ? "text-align:right;" : ""}${bold ? "font-weight:600;" : ""}">${v}</td>`;
  const th = (v: string, right = true) => `<td style="padding:4px 8px;color:#888;font-size:12px;${right ? "text-align:right;" : ""}">${v}</td>`;
  const segTable = (title: string, segs: Seg[], tot: Seg, min = 15) => `
<h3 style="margin:18px 0 6px;font-size:15px">${title}</h3>
<table style="border-collapse:collapse;width:100%;font-size:13.5px">
<tr>${th("", false)}${th("Spend")}${th("Share")}${th("Clicks")}${th("Signups")}${th("$/signup")}${th("Purchases")}${th("$/purchase")}</tr>
${segs.filter((s) => s.spend >= min).map((s) => `<tr>${td(cap(s.key), false, true)}${td(money(s.spend))}${td(pct(s.spend, tot.spend))}${td(s.clicks)}${td(s.signups)}${td(per(s.spend, s.signups))}${td(s.purchases)}${td(per(s.spend, s.purchases), true, true)}</tr>`).join("")}
</table>`;
  const w = r.web;
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:680px;color:#111">
<h2 style="margin:0 0 4px">Who’s clicking and converting</h2>
<div style="color:#666;margin-bottom:10px">Meta ads, ${fmt(r.since)} – ${fmt(new Date(+r.until - 1))} (last 28 days). Ripple campaigns only.</div>
<div style="padding:10px 12px;background:#FFF4EC;border-radius:8px;font-size:14px;margin-bottom:6px">
<b>Web ads:</b> ${money(w.total.spend)} spent, ${w.total.clicks} clicks, ${w.total.signups} signups, ${w.total.purchases} purchases (${per(w.total.spend, w.total.purchases)} each, as Meta counts them).
${r.app ? `<br><b>App-install ads:</b> ${money(r.app.total.spend)} spent, ${r.app.total.installs} installs (${per(r.app.total.spend, r.app.total.installs)} each), ${r.app.total.clicks} taps.` : ""}
</div>
${r.flags.length ? `<h3 style="margin:16px 0 6px;font-size:15px">Worth a look</h3><ul style="margin:0;padding-left:18px;font-size:14px">${r.flags.map((f) => `<li style="margin:4px 0">${f}</li>`).join("")}</ul>` : ""}
${segTable("By gender", w.gender, w.total, 5)}
${segTable("By age", w.age, w.total, 5)}
${segTable("By age and gender (best first by spend)", w.both, w.total)}
${r.app ? segTable("App-install ads by age (taps, not visits)", r.app.age.map((s) => ({ ...s, purchases: s.installs })), r.app.total, 5).replace(">Purchases<", ">Installs<").replace(">$/purchase<", ">$/install<") : ""}
<h3 style="margin:18px 0 6px;font-size:15px">Who actually pays (our funnel, real Stripe trials)</h3>
<div style="color:#666;font-size:12.5px;margin-bottom:6px">The age she picks in the funnel, then whether she signed up and started a card trial. Meta’s purchase counts run about 2x real trials, so this is the truer read.</div>
<table style="border-collapse:collapse;width:100%;font-size:13.5px">
<tr>${th("", false)}${th("Answered age")}${th("Signed up")}${th("Card trials")}${th("Trial rate")}${th("Paying now")}</tr>
${r.funnel.map((f) => `<tr>${td(f.key, false, true)}${td(f.answered)}${td(f.signedUp)}${td(f.trials)}${td(pct(f.trials, f.answered), true, true)}${td(f.payingNow)}</tr>`).join("")}
</table>
<div style="color:#888;font-size:12px;margin-top:14px">Sent every Sunday at 9am Central. Purchases and signups are Meta-attributed; small segments swing week to week, so judge on the 28-day view.</div>
</div>`;
  const best = w.both.filter((s) => s.purchases >= 2).sort((a, b) => a.spend / a.purchases - b.spend / b.purchases)[0];
  const subject = `Who’s converting: ${best ? `${cap(best.key)} best at ${per(best.spend, best.purchases)}/purchase` : `${w.total.purchases} purchases from ${money(w.total.spend)}`}`;
  return { subject, html };
}
