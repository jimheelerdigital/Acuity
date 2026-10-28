/**
 * End-of-day founder summary (2026-10-27, per Keenan: "instead of sending
 * emails every single time a signup comes in, send an email at the END of
 * the day - how many signups, how many paid trials started, how many funnel
 * conversions for each funnel with names").
 *
 * One email at 11:59pm Central to Keenan and Jim, covering that Central day:
 *   - totals: signups, paid trials started (web + App Store), trials that
 *     turned into a first real charge, app downloads
 *   - potential issues (web payers who never opened the app, failed charges,
 *     failed debriefs, downloads that don't become accounts, no trials)
 *   - per funnel: signups and paid trials, each with names
 * Internal / admin accounts are left out. Per-signup emails are off (see
 * notifyFoundersOfSignup); payment and download emails still send in real time.
 */
import { prisma } from "@/lib/prisma";
import { escapeHtml } from "@/lib/escape-html";
import { isInternalEmail } from "@/lib/internal-traffic";

const TZ = "America/Chicago";

/** [start, end) of the Central-time day containing `at`, plus its label. */
export function centralDayBounds(at: Date): { start: Date; end: Date; label: string } {
  const ymd = at.toLocaleDateString("en-CA", { timeZone: TZ });
  const offsetFor = (d: Date) => {
    const part = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "shortOffset" })
      .formatToParts(d)
      .find((p) => p.type === "timeZoneName")?.value; // e.g. "GMT-5"
    const m = part?.match(/GMT([+-]\d+)/);
    return m ? Number(m[1]) : -6;
  };
  const guess = new Date(`${ymd}T12:00:00Z`);
  const off = offsetFor(guess);
  const start = new Date(`${ymd}T00:00:00${off < 0 ? "-" : "+"}${String(Math.abs(off)).padStart(2, "0")}:00`);
  const nextYmd = new Date(start.getTime() + 36 * 3600_000).toLocaleDateString("en-CA", { timeZone: TZ });
  const offNext = offsetFor(new Date(`${nextYmd}T12:00:00Z`));
  const end = new Date(`${nextYmd}T00:00:00${offNext < 0 ? "-" : "+"}${String(Math.abs(offNext)).padStart(2, "0")}:00`);
  const label = start.toLocaleDateString("en-US", { timeZone: TZ, weekday: "long", month: "short", day: "numeric" });
  return { start, end, label };
}

type U = {
  id: string;
  name: string | null;
  email: string;
  signupMethod: string | null;
  signupUtmSource: string | null;
  signupUtmMedium: string | null;
  signupUtmCampaign: string | null;
  signupLandingPath: string | null;
};

/** Which funnel a person came through, in plain words. */
export function funnelOf(u: U, planners: Set<string>): string {
  if (planners.has(u.id)) return "Planners campaign (early bird price)";
  if ((u.signupMethod ?? "").startsWith("mobile")) return "App (downloaded, signed up in the app)";
  const src = (u.signupUtmSource ?? "").toLowerCase();
  const med = (u.signupUtmMedium ?? "").toLowerCase();
  const bwk = /bwk/.test(u.signupLandingPath ?? "");
  if (src === "creator" && med === "referral") return `Creator link (${(u.signupUtmCampaign ?? "").replace(/^creator-/, "") || "unknown"})`;
  if (["meta", "ugc", "facebook", "fb", "ig", "instagram"].includes(src)) return bwk ? "Men: Meta ads → web funnel" : "Women: Meta ads → web funnel";
  if (src === "apple" || src === "asa") return "Apple Search Ads";
  return bwk ? "Men: web funnel (no ad tag)" : "Web: organic / direct";
}

let affiliateEmails = new Map<string, { handle: string | null }>();
const who = (u: { name: string | null; email: string }) => {
  const aff = affiliateEmails.get(u.email.toLowerCase());
  return `${escapeHtml((u.name ?? "").trim() || "(no name)")} <span style="color:#888">· ${escapeHtml(u.email)}</span>${
    aff ? ` <span style="color:#B7791F;font-weight:600">· affiliate creator${aff.handle ? ` @${escapeHtml(aff.handle)}` : ""}</span>` : ""
  }`;
};

/**
 * Summary for the Central-time day containing `at` (days=1), or for the
 * `days` Central days ending that day (weekly: days=7, Sun → Sat).
 */
export async function buildDailySummary(at: Date = new Date(), days = 1, opts: { compare?: boolean; spend?: boolean } = {}) {
  const today = centralDayBounds(at);
  const first = centralDayBounds(new Date(at.getTime() - (days - 1) * 86400_000));
  const start = first.start;
  const end = today.end;
  const weekly = days > 1;
  const label = weekly ? `${first.label} – ${today.label}` : today.label;
  const when = weekly ? "this week" : "today";
  const userSel = {
    id: true, name: true, email: true, signupMethod: true, signupUtmSource: true,
    signupUtmMedium: true, signupUtmCampaign: true, signupLandingPath: true,
  } as const;
  const real = (u: { email: string | null; isAdmin?: boolean }) => !!u.email && !u.isAdmin && !isInternalEmail(u.email);

  const signups = (
    await prisma.user.findMany({
      where: { createdAt: { gte: start, lt: end } },
      select: { ...userSel, isAdmin: true },
      orderBy: { createdAt: "asc" },
    })
  ).filter(real) as (U & { isAdmin: boolean })[];

  // Web paid trials: first payment events in the day.
  const pays = await prisma.onboardingEvent.findMany({
    where: { event: "funnel_payment_completed", value: { contains: "first_payment" }, createdAt: { gte: start, lt: end }, userId: { not: null } },
    select: { userId: true, value: true },
  });
  const payPlan = new Map<string, string>();
  for (const p of pays) if (!payPlan.has(p.userId!)) payPlan.set(p.userId!, /^(annual|yearly)/.test(p.value ?? "") ? "yearly" : "monthly");
  const webTrialUsers = (
    payPlan.size ? await prisma.user.findMany({ where: { id: { in: [...payPlan.keys()] } }, select: { ...userSel, isAdmin: true } }) : []
  ).filter(real) as (U & { isAdmin: boolean })[];

  // App Store / Play paid trials that started today (trial ends 7 days on).
  const appTrialUsers = (
    await prisma.user.findMany({
      where: {
        subscriptionSource: { in: ["apple", "google"] },
        subscriptionStatus: { in: ["TRIAL", "PRO"] },
        trialEndsAt: { gte: new Date(start.getTime() + 7 * 86400_000), lt: new Date(end.getTime() + 7 * 86400_000) },
      },
      select: { ...userSel, isAdmin: true },
    })
  ).filter(real) as (U & { isAdmin: boolean })[];

  // Trials that turned into a first real charge today: App Store / Play from
  // trial_converted events (logged since 2026-10-27); web from a user's FIRST
  // Stripe renewal landing today (the charge after the free week).
  const conv = await prisma.onboardingEvent.findMany({
    where: { event: "trial_converted", createdAt: { gte: start, lt: end }, userId: { not: null } },
    select: { userId: true },
  });
  const renewalsToday = await prisma.onboardingEvent.findMany({
    where: { event: "funnel_payment_completed", value: { endsWith: ":renewal" }, createdAt: { gte: start, lt: end }, userId: { not: null } },
    select: { userId: true },
  });
  const renewIds = [...new Set(renewalsToday.map((r) => r.userId!))];
  const renewedBefore = renewIds.length
    ? new Set(
        (await prisma.onboardingEvent.findMany({
          where: { event: "funnel_payment_completed", value: { endsWith: ":renewal" }, createdAt: { lt: start }, userId: { in: renewIds } },
          select: { userId: true },
        })).map((r) => r.userId!)
      )
    : new Set<string>();
  const convIds = [...new Set([...conv.map((c) => c.userId!), ...renewIds.filter((id) => !renewedBefore.has(id))])];
  const convUsers = convIds.length
    ? (await prisma.user.findMany({ where: { id: { in: convIds } }, select: { id: true, name: true, email: true, isAdmin: true } })).filter(real)
    : [];

  // Planners-campaign visitors and each web payer's price arm.
  const ids = [...new Set([...signups, ...webTrialUsers, ...appTrialUsers].map((u) => u.id))];
  const armEvents = ids.length
    ? await prisma.onboardingEvent.findMany({ where: { event: "funnel_price_arm", userId: { in: ids } }, select: { userId: true, value: true } })
    : [];
  const planners = new Set(armEvents.filter((e) => (e.value ?? "").endsWith(":planners")).map((e) => e.userId!));
  const lowArm = new Set(armEvents.filter((e) => (e.value ?? "").startsWith("low")).map((e) => e.userId!));

  const { affiliateTagsForEmails } = await import("@/lib/creators/affiliate-users");
  affiliateEmails = await affiliateTagsForEmails([...signups, ...webTrialUsers, ...appTrialUsers].map((u) => u.email));

  const downloads = await prisma.onboardingEvent.count({ where: { event: "app_first_open", createdAt: { gte: start, lt: end } } });

  // ── Potential issues (Keenan: "also note any potential issues") ──────
  const issues: string[] = [];
  // Web payers from the last 3 days who still haven't opened the app.
  const recentPays = await prisma.onboardingEvent.findMany({
    where: { event: "funnel_payment_completed", value: { contains: "first_payment" }, createdAt: { gte: new Date(end.getTime() - 3 * 86400_000), lt: end }, userId: { not: null } },
    select: { userId: true, createdAt: true },
  });
  const recentIds = [...new Set(recentPays.map((p) => p.userId!))];
  if (recentIds.length) {
    const signedIn = new Set(
      (await prisma.onboardingEvent.findMany({ where: { event: "app_signed_in", userId: { in: recentIds } }, select: { userId: true } })).map((e) => e.userId!)
    );
    const stuck = (await prisma.user.findMany({ where: { id: { in: recentIds.filter((id) => !signedIn.has(id)) } }, select: { name: true, email: true, isAdmin: true } })).filter(real);
    if (stuck.length) issues.push(`${stuck.length} web payer${stuck.length === 1 ? "" : "s"} from the last 3 days never opened the app: ${stuck.map((u) => escapeHtml(u.email!)).join(", ")}. They're paying (or about to) without using it.`);
  }
  // Failed card charges today.
  const failed = (await prisma.user.findMany({ where: { stripeFirstFailureAt: { gte: start, lt: end } }, select: { email: true, isAdmin: true } })).filter(real);
  if (failed.length) issues.push(`${failed.length} card charge${failed.length === 1 ? "" : "s"} failed ${when}: ${failed.map((u) => escapeHtml(u.email!)).join(", ")}.`);
  // Debriefs that failed to process today.
  const failedEntries = await prisma.entry.count({ where: { status: "FAILED", createdAt: { gte: start, lt: end } } });
  if (failedEntries) issues.push(`${failedEntries} debrief${failedEntries === 1 ? "" : "s"} failed to process ${when}.`);
  // Downloads that never became accounts.
  const appSignups = signups.filter((u) => (u.signupMethod ?? "").startsWith("mobile")).length;
  if (downloads >= 3 * days && appSignups / downloads < 0.25) issues.push(`${downloads} app downloads but only ${appSignups} app account${appSignups === 1 ? "" : "s"}: most people who open the app leave before signing up.`);
  // Web traffic with no trials.
  const webSignups = signups.length - appSignups;
  if (webSignups >= 8 * days && webTrialUsers.length === 0) issues.push(`${webSignups} web signups and no paid trials ${when}. Worth checking the paywall and checkout.`);
  // Nothing at all usually means something is broken, not a slow day.
  if (signups.length === 0) issues.push(`No signups at all ${when}. Check that the ads are delivering and the funnel loads.`);

  // Group by funnel.
  type Row = { signups: string[]; trials: string[] };
  const funnels = new Map<string, Row>();
  const row = (f: string) => funnels.get(f) ?? (funnels.set(f, { signups: [], trials: [] }), funnels.get(f)!);
  for (const u of signups) row(funnelOf(u, planners)).signups.push(who(u));
  for (const u of webTrialUsers) {
    const price = lowArm.has(u.id) ? (payPlan.get(u.id) === "yearly" ? "$39.99/yr early bird" : "$6.99/mo early bird") : payPlan.get(u.id) === "yearly" ? "yearly" : "monthly";
    row(funnelOf(u, planners)).trials.push(`${who(u)} <span style="color:#C4451C">(${price})</span>`);
  }
  for (const u of appTrialUsers) row("App Store / Google Play trial").trials.push(who(u));

  const totalTrials = webTrialUsers.length + appTrialUsers.length;
  // ── Ad spend (every Meta campaign; lib/adlab/account-spend.ts) ────────
  let spendHtml = "";
  let spendCents: number | null = null;
  if (opts.spend !== false) {
    try {
      const { accountSpend } = await import("@/lib/adlab/account-spend");
      const ymd = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });
      const a = await accountSpend(ymd(start), ymd(new Date(end.getTime() - 1)));
      spendCents = a.totalSpendCents;
      const usd = (c: number) => `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
      const rows = a.campaigns
        .filter((c) => c.spendCents > 0)
        .map(
          (c) => `<tr><td style="padding:4px 0">${escapeHtml(c.name)}</td><td style="padding:4px 0;text-align:right;white-space:nowrap">${usd(c.spendCents)}</td><td style="padding:4px 0 4px 10px;text-align:right;white-space:nowrap;color:#666">${
            c.paidTrials ? `${Number.isInteger(c.paidTrials) ? c.paidTrials : c.paidTrials.toFixed(1)} trial${c.paidTrials === 1 ? "" : "s"} · ${usd(Math.round(c.spendCents / c.paidTrials))} each` : "no trials"
          }</td></tr>`
        )
        .join("");
      const perTrial = totalTrialsForSpend() ? usd(Math.round(a.totalSpendCents / totalTrialsForSpend())) : "–";
      spendHtml = `
      <div style="margin:18px 0;padding:14px 16px;border:1px solid #eee;border-radius:12px;font-size:13px">
        <div style="display:flex;justify-content:space-between"><strong>Ad spend (Meta, all campaigns)</strong><strong>${usd(a.totalSpendCents)}</strong></div>
        <div style="color:#666;margin-top:2px">Cost per paid trial, all sources: <strong style="color:#C4451C">${perTrial}</strong>. App campaigns are split by spend (Apple doesn't say which ad a trial came from).</div>
        <table role="presentation" width="100%" style="margin-top:8px;border-collapse:collapse;font-size:12.5px">${rows || `<tr><td style="color:#999">No spend</td></tr>`}</table>
      </div>`;
    } catch (e) {
      spendHtml = `<div style="margin:18px 0;color:#999;font-size:12px">Ad spend unavailable: ${escapeHtml(String(e).slice(0, 120))}</div>`;
    }
  }
  function totalTrialsForSpend() {
    return webTrialUsers.length + appTrialUsers.length;
  }

  // ── Weekly: vs the week before ──────────────────────────────────────
  let compareHtml = "";
  if (weekly && opts.compare !== false) {
    try {
      const prev = await buildDailySummary(new Date(at.getTime() - days * 86400_000), days, { compare: false, spend: true });
      const cur = { signups: signups.length, trials: webTrialUsers.length + appTrialUsers.length, converted: convUsers.length, downloads, spend: spendCents };
      const delta = (a: number | null, b: number | null, money = false) => {
        if (a === null || b === null) return "";
        const d = a - b;
        const fmt = (n: number) => (money ? `$${Math.round(Math.abs(n) / 100)}` : String(Math.abs(n)));
        return d === 0 ? `<span style="color:#888">same</span>` : `<span style="color:${d > 0 ? "#2F855A" : "#C53030"}">${d > 0 ? "▲" : "▼"} ${fmt(d)}</span>`;
      };
      const line = (l: string, a: number | null, b: number | null, money = false) =>
        `<tr><td style="padding:3px 0">${l}</td><td style="text-align:right">${a === null ? "–" : money ? `$${Math.round(a / 100)}` : a}</td><td style="text-align:right;color:#888">${b === null ? "–" : money ? `$${Math.round(b / 100)}` : b}</td><td style="text-align:right;padding-left:10px">${delta(a, b, money)}</td></tr>`;
      compareHtml = `
      <div style="margin:18px 0;padding:14px 16px;border:1px solid #eee;border-radius:12px;font-size:13px">
        <strong>vs the week before</strong>
        <table role="presentation" width="100%" style="margin-top:6px;border-collapse:collapse;font-size:12.5px">
          <tr style="color:#888"><td></td><td style="text-align:right">This week</td><td style="text-align:right">Last week</td><td></td></tr>
          ${line("Signups", cur.signups, prev.counts.signups)}
          ${line("Paid trials", cur.trials, prev.counts.trials)}
          ${line("Trials → paid", cur.converted, prev.counts.converted)}
          ${line("App downloads", cur.downloads, prev.counts.downloads)}
          ${line("Ad spend", cur.spend, prev.counts.spend ?? null, true)}
        </table>
      </div>`;
    } catch {
      compareHtml = "";
    }
  }

  const subject = `Ripple ${weekly ? "this week" : "today"}: ${signups.length} signup${signups.length === 1 ? "" : "s"}, ${totalTrials} paid trial${totalTrials === 1 ? "" : "s"}${convUsers.length ? `, ${convUsers.length} converted` : ""}${issues.length ? ` · ${issues.length} to check` : ""}`;

  const stat = (n: number, l: string) =>
    `<td style="padding:12px;text-align:center;background:#FFF4EF;border-radius:12px"><div style="font-size:26px;font-weight:700;color:#C4451C">${n}</div><div style="font-size:12px;color:#666">${l}</div></td>`;
  const list = (items: string[]) =>
    items.length ? `<ul style="margin:4px 0 0;padding-left:18px">${items.map((i) => `<li style="margin:2px 0">${i}</li>`).join("")}</ul>` : `<div style="color:#999;margin-top:2px">none</div>`;
  const sections = [...funnels.entries()]
    .sort((a, b) => b[1].trials.length - a[1].trials.length || b[1].signups.length - a[1].signups.length)
    .map(
      ([name, r]) => `
      <div style="margin:18px 0;padding:14px 16px;border:1px solid #eee;border-radius:12px">
        <div style="font-weight:700;font-size:15px">${escapeHtml(name)}</div>
        <div style="margin-top:8px;font-size:13px"><strong>Signups: ${r.signups.length}</strong>${
          weekly && r.signups.length > 15 ? `<div style="color:#888;margin-top:2px">Names are in the daily emails.</div>` : list(r.signups)
        }</div>
        <div style="margin-top:8px;font-size:13px"><strong>Paid trials: ${r.trials.length}</strong>${list(r.trials)}</div>
      </div>`
    )
    .join("");
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a1a">
      <h2 style="margin:0 0 4px;color:#C4451C">Ripple ${weekly ? "this week" : "today"}</h2>
      <div style="color:#666;font-size:14px;margin-bottom:16px">${escapeHtml(label)} (Central time). Internal and admin accounts left out.</div>
      <table role="presentation" width="100%" cellspacing="6"><tr>
        ${stat(signups.length, "Signups")}${stat(totalTrials, "Paid trials started")}${stat(convUsers.length, "Trials → paid")}${stat(downloads, "App downloads")}
      </tr></table>
      ${compareHtml}
      ${spendHtml}
      ${convUsers.length ? `<div style="margin:18px 0;padding:14px 16px;border:1px solid #CDEBD8;background:#F2FBF5;border-radius:12px;font-size:13px"><strong>Trials that became paying customers: ${convUsers.length}</strong>${list(convUsers.map((u) => who({ name: u.name, email: u.email! })))}</div>` : ""}
      <div style="margin:18px 0;padding:14px 16px;border:1px solid ${issues.length ? "#F3D2C4" : "#CDEBD8"};background:${issues.length ? "#FFF6F2" : "#F2FBF5"};border-radius:12px;font-size:13px">
        <strong>${issues.length ? `Potential issues (${issues.length})` : "No issues spotted"}</strong>
        ${issues.length ? `<ul style="margin:6px 0 0;padding-left:18px">${issues.map((i) => `<li style="margin:4px 0">${i}</li>`).join("")}</ul>` : ""}
      </div>
      <h3 style="margin:22px 0 0;font-size:16px">By funnel</h3>
      ${sections || `<div style="color:#999;margin-top:8px">No signups or trials ${when}.</div>`}
    </div>`;
  return { subject, html, counts: { signups: signups.length, trials: totalTrials, converted: convUsers.length, downloads, issues: issues.length, spend: spendCents }, label };
}

export async function sendDailySummary(at: Date = new Date(), days = 1) {
  const s = await buildDailySummary(at, days);
  const { getResendClient } = await import("@/lib/resend");
  const { error } = await getResendClient().emails.send({
    from: "hello@goripple.io",
    to: ["keenan@heelerdigital.com", "jim@heelerdigital.com"],
    replyTo: "keenan@heelerdigital.com",
    subject: s.subject,
    html: s.html,
  });
  if (error) throw new Error(`${error.name}: ${error.message}`);
  return s;
}
