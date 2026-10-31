/**
 * Creator platform admin (2026-10-22, spec "Ripple UGC Creator Platform").
 * Four tabs: Creators (ROI table + BOOST / DORMANT), Ledger (every row),
 * Payout run (preview → approve → execute), Flags. Server-rendered; the
 * admin layout gates access. Actions: /api/admin/creators/action.
 */
import Link from "next/link";
import {
  CalendarClock,
  ChevronRight,
  Eye,
  HandCoins,
  KeyRound,
  Moon,
  Rocket,
  Target,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";

import { CREATOR_TYPES, PERSONAS } from "@/lib/ugc/config";
import { stripePayoutsEnabled } from "@/lib/creators/config";
import { formatCents, nextPayoutDate } from "@/lib/creators/money";
import { labelFor } from "@/lib/creators/emails";
import { adminCreatorRows, adminTopline } from "@/lib/creators/stats";
import { prisma } from "@/lib/prisma";

import { ActionButton, FilterBar, FormAction, PayoutRunPanel } from "./creators-client";
import "./ripple-skin.css";

export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;
const TABS = [
  { key: "creators", label: "Creators" },
  { key: "ledger", label: "Ledger" },
  { key: "payouts", label: "Payout run" },
  { key: "flags", label: "Flags" },
] as const;
const PAGE_SIZE = 100;

const usd = (c: number | null | undefined) => (c == null ? "—" : formatCents(c));
const day = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "—");
const CARD = "neo-glass rounded-2xl p-5";
const TH = "px-3 py-3 font-medium";

function qs(sp: SP, patch: Record<string, string | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) p.set(k, v);
  return `/admin/creators?${p}`;
}

function ExportLink({ table }: { table: string }) {
  return (
    <a className="inline-flex items-center rounded-full border border-acuity-line px-3 py-1.5 text-xs text-acuity-text-sec hover:text-acuity-text" href={`/api/admin/creators/export?table=${table}`}>
      Export CSV
    </a>
  );
}

export default async function CreatorsAdmin({ searchParams }: { searchParams: SP }) {
  const tab = TABS.some((t) => t.key === searchParams.tab) ? searchParams.tab! : "creators";
  const next = nextPayoutDate();
  const [payable, openFlags, creatorCount] = await Promise.all([
    prisma.creatorLedgerEntry.aggregate({
      where: { status: "payable", payoutId: null, type: { not: "payout" }, payableAt: { lt: next } },
      _sum: { amount: true },
    }),
    prisma.creatorFlag.count({ where: { status: { in: ["open", "held"] } } }),
    prisma.ugcCreator.count({ where: { referralCode: { not: null } } }),
  ]);
  const counts: Record<string, number | null> = { creators: creatorCount, ledger: null, payouts: null, flags: openFlags };
  return (
    <div data-ripple-skin className="min-h-screen px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-[1.4px] text-acuity-text-ter">Creator program</p>
            <h1 className="neo-title mt-2 font-display text-[34px] font-extrabold leading-none tracking-[-1px] sm:text-[40px]">
              Creator payouts
            </h1>
            <p className="mt-3 max-w-xl text-[15px] text-acuity-text-sec">
              Creators earn 25% of what their customers pay for 12 months. Money only moves after you approve a run.
            </p>
          </div>
          <Link
            href="/admin/creators?tab=payouts"
            className="neo-glass neo-edge group flex items-center gap-4 rounded-2xl px-5 py-4 transition hover:-translate-y-0.5"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--acuity-primary-soft)] text-[color:var(--acuity-primary)]">
              <CalendarClock size={20} strokeWidth={1.8} />
            </span>
            <span>
              <span className="block font-mono text-[10px] font-bold uppercase tracking-[1.4px] text-acuity-text-ter">Next payout</span>
              <span className="block text-[15px] font-semibold">
                {next.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}
                <span className="text-acuity-text-ter"> · </span>
                <span className="tabular-nums">{usd(payable._sum.amount ?? 0)}</span>
                <span className="text-acuity-text-ter"> payable</span>
              </span>
            </span>
            <ChevronRight size={18} className="text-acuity-text-ter transition group-hover:translate-x-0.5" />
          </Link>
        </header>

        <nav className="neo-glass inline-flex flex-wrap gap-1 rounded-full p-1">
          {TABS.map((t) => {
            const active = tab === t.key;
            const n = counts[t.key];
            return (
              <Link
                key={t.key}
                href={`/admin/creators?tab=${t.key}`}
                className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm transition ${
                  active
                    ? "bg-[color:var(--acuity-card-bg-raised)] font-semibold text-acuity-text shadow-[var(--acuity-shadow-soft)]"
                    : "text-acuity-text-ter hover:text-acuity-text"
                }`}
              >
                {t.label}
                {n != null && n > 0 && (
                  <span
                    className={`rounded-full px-1.5 py-px text-[11px] tabular-nums ${
                      t.key === "flags" ? "bg-amber-500/20 text-amber-300" : "bg-white/10 text-acuity-text-sec"
                    }`}
                  >
                    {n}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {tab === "creators" && <CreatorsTab sp={searchParams} />}
        {tab === "ledger" && <LedgerTab sp={searchParams} />}
        {tab === "payouts" && <PayoutsTab />}
        {tab === "flags" && <FlagsTab sp={searchParams} />}
      </div>
    </div>
  );
}

// ── Creators ──────────────────────────────────────────────────────────

type Row = Awaited<ReturnType<typeof adminCreatorRows>>[number];

function Stat({
  icon: Icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  hint?: string;
  accent: "primary" | "secondary" | "good" | "warn";
}) {
  const tint = {
    primary: "bg-[color:var(--acuity-primary-soft)] text-[color:var(--acuity-primary)]",
    secondary: "bg-[color:var(--acuity-secondary-soft)] text-[color:var(--acuity-secondary)]",
    good: "bg-emerald-400/10 text-emerald-300",
    warn: "bg-amber-400/10 text-amber-300",
  }[accent];
  return (
    <div className="neo-glass neo-edge rounded-2xl p-5 transition hover:-translate-y-0.5">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[1.4px] text-acuity-text-ter">{label}</p>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tint}`}>
          <Icon size={16} strokeWidth={1.8} />
        </span>
      </div>
      <p className="mt-4 font-display text-[32px] font-extrabold leading-none tracking-[-0.8px] tabular-nums">{value}</p>
      {hint && <p className="mt-2 text-xs text-acuity-text-ter">{hint}</p>}
    </div>
  );
}

function Pill({ tone, children }: { tone: "good" | "warn" | "quiet" | "bad"; children: React.ReactNode }) {
  const t = {
    good: "bg-emerald-400/10 text-emerald-300 ring-emerald-400/20",
    warn: "bg-amber-400/10 text-amber-300 ring-amber-400/20",
    bad: "bg-red-400/10 text-red-300 ring-red-400/20",
    quiet: "bg-white/5 text-acuity-text-ter ring-white/10",
  }[tone];
  const dot = { good: "bg-emerald-300", warn: "bg-amber-300", bad: "bg-red-300", quiet: "bg-acuity-text-ter" }[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset ${t}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {children}
    </span>
  );
}

/** What's still missing before this creator can be paid, in plain words. */
function SetupPill({ r }: { r: Row }) {
  if (r.openFlags) return <Pill tone="bad">{r.openFlags} flag{r.openFlags === 1 ? "" : "s"}</Pill>;
  if (!r.referralCode) return <Pill tone="quiet">No code yet</Pill>;
  if (!r.agreementAccepted) return <Pill tone="warn">Needs agreement</Pill>;
  if (!r.payoutReady) return <Pill tone="warn">Needs payout setup</Pill>;
  return <Pill tone="good">Ready to pay</Pill>;
}

function Avatar({ name }: { name: string }) {
  const initial = name.replace(/^@/, "").trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ring-1 ring-white/15"
      style={{ background: "linear-gradient(135deg, var(--acuity-primary), var(--acuity-secondary))" }}
    >
      {initial}
    </span>
  );
}

/** Four mini bars: clicks → signups → trials → paying, scaled to the biggest. */
function FunnelBars({ r }: { r: Row }) {
  const steps = [
    { label: "Clicks", n: r.clicks },
    { label: "Signups", n: r.signups },
    { label: "Trials", n: r.trials },
    { label: "Paying", n: r.paying },
  ];
  const max = Math.max(1, ...steps.map((s) => s.n));
  return (
    <div className="flex items-end gap-3" title={steps.map((s) => `${s.label} ${s.n}`).join(" → ")}>
      {steps.map((s, i) => (
        <div key={s.label} className="flex w-9 flex-col items-center gap-1">
          <span className={`text-[13px] tabular-nums ${i === 3 ? "font-bold text-acuity-text" : "text-acuity-text-sec"}`}>{s.n}</span>
          <span className="flex h-6 w-full items-end overflow-hidden rounded-md bg-white/[0.04]">
            <span
              className="w-full rounded-md"
              style={{
                height: `${Math.max(8, (s.n / max) * 100)}%`,
                background:
                  i === 3
                    ? "linear-gradient(180deg, var(--acuity-secondary-hi), var(--acuity-secondary))"
                    : "linear-gradient(180deg, var(--acuity-primary-hi), var(--acuity-primary-lo))",
                opacity: s.n === 0 ? 0.25 : 0.55 + i * 0.15,
              }}
            />
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[0.8px] text-acuity-text-quiet">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

function RoiBadge({ roi }: { roi: number | null }) {
  if (roi == null) return <span className="text-acuity-text-quiet">—</span>;
  const tone =
    roi >= 3
      ? "bg-emerald-400/10 text-emerald-300"
      : roi >= 1
        ? "bg-[color:var(--acuity-primary-soft)] text-[color:var(--acuity-primary)]"
        : "bg-amber-400/10 text-amber-300";
  return <span className={`rounded-lg px-2 py-1 text-[13px] font-semibold tabular-nums ${tone}`}>{roi.toFixed(1)}×</span>;
}

async function CreatorsTab({ sp }: { sp: SP }) {
  const all = await adminCreatorRows();
  const top = await adminTopline(all);
  const rows = all.filter(
    (r) =>
      (!sp.status || r.status === sp.status) &&
      (!sp.persona || r.persona === sp.persona) &&
      (!sp.type || r.creatorType === sp.type)
  );
  const statuses = Array.from(new Set(all.map((r) => r.status)));
  const owed = all.reduce((s, r) => s + r.commissionOwedCents, 0);
  return (
    <div className="space-y-8">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={TrendingUp} accent="good" label="Revenue from creators" value={usd(top.attributedRevenueCents)} hint="All time, after refunds" />
        <Stat icon={Wallet} accent="primary" label="Spent this month" value={usd(top.creatorSpendMonthCents)} hint="Commission, bonuses and boost ads" />
        <Stat
          icon={Target}
          accent="secondary"
          label="Cost per trial"
          value={top.blendedCostPerTrialCents == null ? "—" : usd(top.blendedCostPerTrialCents)}
          hint={`${top.trialsMonth} trial${top.trialsMonth === 1 ? "" : "s"} from creators this month`}
        />
        <Stat icon={HandCoins} accent="warn" label="Owed to creators" value={usd(owed)} hint="In the hold or waiting for a run" />
      </section>

      {(top.boost.length > 0 || top.dormant.length > 0) && (
        <section className="grid gap-4 lg:grid-cols-2">
          {top.boost.length > 0 && (
            <div className="neo-glass rounded-2xl p-5">
              <div className="flex items-center gap-2">
                <Rocket size={16} className="text-emerald-300" />
                <h2 className="text-sm font-semibold">Worth more ad spend</h2>
              </div>
              <p className="mb-3 mt-1 text-xs text-acuity-text-ter">Boosted posts getting trials under $15 each.</p>
              <ul className="space-y-2 text-sm">
                {top.boost.map((b) => (
                  <li key={b.postId} className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2">
                    <span>
                      {b.creator} · <a className="underline" href={b.url} target="_blank" rel="noreferrer">post</a>
                    </span>
                    <span className="tabular-nums text-emerald-300">{usd(b.costPerTrialCents)} / trial</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {top.dormant.length > 0 && (
            <div className="neo-glass rounded-2xl p-5">
              <div className="flex items-center gap-2">
                <Moon size={16} className="text-acuity-text-ter" />
                <h2 className="text-sm font-semibold">Gone quiet</h2>
              </div>
              <p className="mb-3 mt-1 text-xs text-acuity-text-ter">No clicks on their link in 30 days.</p>
              <ul className="space-y-2 text-sm">
                {top.dormant.map((d) => (
                  <li key={d.id} className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2">
                    <Link className="hover:underline" href={`/admin/creators/${d.id}`}>{d.name}</Link>
                    <span className="text-xs text-acuity-text-ter">last click {d.lastClickAt ? day(d.lastClickAt) : "never"}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <section className="neo-glass rounded-2xl p-5">
        <h2 className="text-sm font-semibold">Agreement update email</h2>
        <p className="mb-3 mt-1 text-xs text-acuity-text-ter">
          Emails every active creator about the current agreement (view bonuses), with the full text and a sign-in link to accept it. Each creator gets it once per agreement version.
        </p>
        <ActionButton body={{ action: "agreement-update-email" }} label="Send to all creators" tone="go" confirm />
      </section>

      <section className="neo-glass rounded-2xl p-5">
        <h2 className="text-sm font-semibold">Add a creator</h2>
        <p className="mb-3 mt-1 text-xs text-acuity-text-ter">
          For someone who said yes. Adds them, gives them their code (yours if it's free, otherwise a random one) and emails their dashboard invite.
        </p>
        <FormAction
          body={{ action: "add-creator" }}
          fields={[
            { name: "handle", placeholder: "@instagram handle", width: "w-44" },
            { name: "firstName", placeholder: "First name", width: "w-32" },
            { name: "email", placeholder: "Email", width: "w-56", type: "email" },
            { name: "code", placeholder: "Code (optional, e.g. GRACE)", width: "w-52" },
          ]}
          required={["handle", "firstName", "email"]}
          label="Add & send invite"
          tone="go"
          confirm
        />
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="mr-auto font-display text-[20px] font-bold tracking-[-0.3px]">
            Creators <span className="font-normal text-acuity-text-ter">{rows.length}</span>
          </h2>
          <FilterBar
            current={{ status: sp.status ?? "", persona: sp.persona ?? "", type: sp.type ?? "" }}
            options={{ status: statuses, persona: Object.keys(PERSONAS), type: Object.keys(CREATOR_TYPES) }}
          />
          <ExportLink table="creators" />
        </div>

        {rows.length === 0 && (
          <div className="neo-glass rounded-2xl px-6 py-12 text-center">
            <Users size={28} className="mx-auto text-acuity-text-quiet" />
            <p className="mt-3 font-semibold">No creators here yet</p>
            <p className="mt-1 text-sm text-acuity-text-ter">
              Mark a creator &ldquo;deal&rdquo; in <Link className="underline" href="/admin/ugc">UGC creators</Link> and they show up with a code.
            </p>
          </div>
        )}

        <div className="space-y-3">
          {rows.map((r) => (
            <div
              key={r.id}
              className="neo-glass grid items-center gap-x-6 gap-y-4 rounded-2xl p-4 transition hover:-translate-y-0.5 hover:border-[color:var(--acuity-line-strong)] md:grid-cols-[minmax(200px,1.6fr)_auto_1fr_auto] md:px-5"
            >
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={r.name} />
                <div className="min-w-0">
                  <Link className="block truncate font-semibold hover:underline" href={`/admin/creators/${r.id}`}>{r.name}</Link>
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-acuity-text-ter">
                    <span>@{r.handle}</span>
                    {r.referralCode && (
                      <span className="rounded-md bg-white/[0.06] px-1.5 py-px font-mono text-[11px] tracking-[1px] text-acuity-text-sec">
                        {r.referralCode}
                      </span>
                    )}
                    {r.persona && <span>{r.persona}</span>}
                  </div>
                </div>
              </div>

              <FunnelBars r={r} />

              <div className="grid grid-cols-3 gap-4 text-sm tabular-nums">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[1px] text-acuity-text-quiet">Revenue</p>
                  <p className="mt-1 font-semibold">{usd(r.revenueCents)}</p>
                </div>
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[1px] text-acuity-text-quiet">Owed</p>
                  <p className="mt-1 font-semibold">{usd(r.commissionOwedCents)}</p>
                </div>
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[1px] text-acuity-text-quiet">ROI</p>
                  <p className="mt-1"><RoiBadge roi={r.roi} /></p>
                </div>
              </div>

              <div className="flex items-center gap-3 md:flex-col md:items-end md:gap-2">
                <SetupPill r={r} />
                {r.referralCode ? (
                  <a
                    className="inline-flex items-center gap-1 text-xs text-acuity-text-sec hover:text-acuity-text"
                    href={`/api/admin/creators/view-as?id=${r.id}`}
                  >
                    <Eye size={13} /> View as creator
                  </a>
                ) : (
                  <Link className="inline-flex items-center gap-1 text-xs text-acuity-text-sec hover:text-acuity-text" href={`/admin/creators/${r.id}`}>
                    <KeyRound size={13} /> Issue code
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
        {rows.length > 0 && (
          <p className="text-xs text-acuity-text-ter">Sorted by ROI: revenue divided by everything we paid or spent on the creator.</p>
        )}
      </section>
    </div>
  );
}

// ── Ledger ────────────────────────────────────────────────────────────

async function LedgerTab({ sp }: { sp: SP }) {
  const page = Math.max(1, Number(sp.page) || 1);
  const from = sp.from ? new Date(sp.from) : null;
  const to = sp.to ? new Date(`${sp.to}T23:59:59Z`) : null;
  const where = {
    ...(sp.creator ? { creatorId: sp.creator } : {}),
    ...(sp.type ? { type: sp.type as never } : {}),
    ...(sp.status ? { status: sp.status as never } : {}),
    ...(from || to
      ? { createdAt: { ...(from && !Number.isNaN(from.getTime()) ? { gte: from } : {}), ...(to && !Number.isNaN(to.getTime()) ? { lte: to } : {}) } }
      : {}),
  };
  const [rows, total, creators] = await Promise.all([
    prisma.creatorLedgerEntry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { creator: { select: { handle: true, displayName: true } } },
    }),
    prisma.creatorLedgerEntry.count({ where }),
    prisma.ugcCreator.findMany({
      where: { referralCode: { not: null } },
      select: { id: true, handle: true, displayName: true },
      orderBy: { handle: "asc" },
    }),
  ]);
  const evIds = rows.map((r) => r.revenueEventId).filter((x): x is string => !!x);
  const evs = await prisma.creatorRevenueEvent.findMany({
    where: { id: { in: evIds } },
    select: { id: true, source: true, externalEventId: true, providerEventId: true },
  });
  const evBy = new Map(evs.map((e) => [e.id, e]));
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const types = ["commission", "clawback", "boost_bonus", "milestone_bonus", "adjustment", "payout"];
  const statuses = ["pending", "payable", "paid", "voided"];
  return (
    <div className="space-y-3">
      <form method="get" action="/admin/creators" className="flex flex-wrap items-center gap-2 text-sm">
        <input type="hidden" name="tab" value="ledger" />
        <select name="creator" defaultValue={sp.creator ?? ""} className="rounded-full border border-acuity-line bg-acuity-bg-inset px-3 py-1.5 text-xs">
          <option value="">All creators</option>
          {creators.map((c) => (
            <option key={c.id} value={c.id}>{c.displayName ?? `@${c.handle}`}</option>
          ))}
        </select>
        <select name="type" defaultValue={sp.type ?? ""} className="rounded-full border border-acuity-line bg-acuity-bg-inset px-3 py-1.5 text-xs">
          <option value="">All types</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select name="status" defaultValue={sp.status ?? ""} className="rounded-full border border-acuity-line bg-acuity-bg-inset px-3 py-1.5 text-xs">
          <option value="">All statuses</option>
          {statuses.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input type="date" name="from" defaultValue={sp.from ?? ""} className="rounded-full border border-acuity-line bg-acuity-bg-inset px-3 py-1.5 text-xs" />
        <input type="date" name="to" defaultValue={sp.to ?? ""} className="rounded-full border border-acuity-line bg-acuity-bg-inset px-3 py-1.5 text-xs" />
        <button className="rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold hover:bg-white/15">Filter</button>
        <span className="ml-auto"><ExportLink table="ledger" /></span>
      </form>
      <div className="neo-glass overflow-x-auto rounded-2xl">
        <table className="w-full text-sm tabular-nums">
          <thead className="text-left font-mono text-[10px] uppercase tracking-[1px] text-acuity-text-ter">
            <tr>
              <th className={TH}>Created</th>
              <th className={TH}>Creator</th>
              <th className={TH}>Type</th>
              <th className={TH}>Amount</th>
              <th className={TH}>Status</th>
              <th className={TH}>Payable</th>
              <th className={TH}>Source event</th>
              <th className={TH}>Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={8} className="p-3 text-acuity-text-ter">No ledger rows.</td></tr>
            )}
            {rows.map((r) => {
              const e = r.revenueEventId ? evBy.get(r.revenueEventId) : undefined;
              return (
                <tr key={r.id} className="border-t border-acuity-line">
                  <td className="p-2 whitespace-nowrap">{r.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                  <td className="p-2"><Link className="underline" href={`/admin/creators/${r.creatorId}`}>{r.creator.displayName ?? `@${r.creator.handle}`}</Link></td>
                  <td className="p-2">{labelFor(r.type)}</td>
                  <td className={`p-2 ${r.amount < 0 ? "text-amber-400" : ""}`}>{usd(r.amount)}</td>
                  <td className="p-2">{r.status}</td>
                  <td className="p-2">{day(r.payableAt)}</td>
                  <td className="p-2 font-mono text-xs">
                    {e ? (
                      e.source === "stripe" && e.providerEventId ? (
                        <a className="underline" href={`https://dashboard.stripe.com/events/${e.providerEventId}`} target="_blank" rel="noreferrer">
                          {e.externalEventId}
                        </a>
                      ) : (
                        <span>{e.externalEventId}{e.providerEventId ? ` · ${e.providerEventId}` : ""}</span>
                      )
                    ) : r.postId ? `post ${r.postId}` : r.payoutId ? `payout ${r.payoutId}` : "—"}
                  </td>
                  <td className="p-2 text-xs text-acuity-text-sec">{r.reason ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <span className="text-acuity-text-ter">{total} rows · page {page} of {pages}</span>
        {page > 1 && <Link className="underline" href={qs(sp, { tab: "ledger", page: String(page - 1) })}>Previous</Link>}
        {page < pages && <Link className="underline" href={qs(sp, { tab: "ledger", page: String(page + 1) })}>Next</Link>}
      </div>
    </div>
  );
}

// ── Payout run ────────────────────────────────────────────────────────

async function PayoutsTab() {
  const [creators, recent] = await Promise.all([
    prisma.ugcCreator.findMany({
      where: { referralCode: { not: null } },
      select: { id: true, handle: true, displayName: true },
      orderBy: { handle: "asc" },
    }),
    prisma.creatorPayout.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { creator: { select: { handle: true, displayName: true, paypalEmail: true } } },
    }),
  ]);
  const next = nextPayoutDate();
  return (
    <div className="space-y-6">
      <section className={`${CARD} space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Next scheduled run: {day(next)} (Friday)</h2>
          <ExportLink table="payouts" />
        </div>
        <p className="text-xs text-acuity-text-ter">
          Preview builds the run from rows payable before that Friday. Creators with an open flag, a payout hold, no
          accepted agreement, no payout account, or under $25 are held out. Nothing moves until you approve and execute.
        </p>
        <PayoutRunPanel
          creators={creators.map((c) => ({ id: c.id, name: c.displayName ?? `@${c.handle}` }))}
          stripePayoutsOn={stripePayoutsEnabled()}
        />
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">Recent payouts</h2>
        <div className="neo-glass overflow-x-auto rounded-2xl">
          <table className="w-full text-sm tabular-nums">
            <thead className="text-left font-mono text-[10px] uppercase tracking-[1px] text-acuity-text-ter">
              <tr>
                <th className={TH}>Run</th>
                <th className={TH}>Creator</th>
                <th className={TH}>Amount</th>
                <th className={TH}>Rail</th>
                <th className={TH}>Status</th>
                <th className={TH}>Sent</th>
                <th className={TH}>Reference / error</th>
                <th className={TH}></th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 && (
                <tr><td colSpan={8} className="p-3 text-acuity-text-ter">No payouts yet.</td></tr>
              )}
              {recent.map((p) => (
                <tr key={p.id} className="border-t border-acuity-line align-top">
                  <td className="p-2 font-mono text-xs">{p.runKey}</td>
                  <td className="p-2">{p.creator.displayName ?? `@${p.creator.handle}`}</td>
                  <td className="p-2">{usd(p.amount)}</td>
                  <td className="p-2">
                    {p.rail}
                    {p.rail === "paypal" && p.creator.paypalEmail && (
                      <div className="text-xs text-acuity-text-ter">{p.creator.paypalEmail}</div>
                    )}
                  </td>
                  <td className={`p-2 ${p.status === "failed" || p.status === "sending" ? "text-amber-400" : ""}`}>{p.status}</td>
                  <td className="p-2">{day(p.sentAt)}</td>
                  <td className="p-2 text-xs">{p.error ?? p.externalId ?? ""}</td>
                  <td className="p-2">
                    {p.status === "approved" && p.rail !== "stripe_connect" && (
                      <FormAction
                        body={{ action: "payout-mark-sent", payoutId: p.id }}
                        fields={[{ name: "externalRef", placeholder: "PayPal txn id / note", width: "w-40" }]}
                        required={["externalRef"]}
                        label="Mark sent"
                        tone="go"
                        confirm
                      />
                    )}
                    {p.status === "failed" && <ActionButton body={{ action: "payout-reset", payoutId: p.id }} label="Reset" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ── Flags ─────────────────────────────────────────────────────────────

async function FlagsTab({ sp }: { sp: SP }) {
  const status = sp.fstatus && ["open", "held", "resolved"].includes(sp.fstatus) ? sp.fstatus : undefined;
  const flags = await prisma.creatorFlag.findMany({
    where: status ? { status: status as "open" | "held" | "resolved" } : { status: { in: ["open", "held"] } },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { creator: { select: { handle: true, displayName: true } } },
  });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-acuity-text-ter">Show:</span>
        <Link className={!status ? "font-bold" : "underline"} href={qs(sp, { tab: "flags", fstatus: undefined })}>open + held</Link>
        {["open", "held", "resolved"].map((s) => (
          <Link key={s} className={status === s ? "font-bold" : "underline"} href={qs(sp, { tab: "flags", fstatus: s })}>{s}</Link>
        ))}
        <span className="ml-auto"><ExportLink table="flags" /></span>
      </div>
      <p className="text-xs text-acuity-text-ter">Open and held flags keep the creator out of payout runs. Every action needs a reason.</p>
      <div className="space-y-2">
        {flags.length === 0 && <p className="text-sm text-acuity-text-ter">No flags.</p>}
        {flags.map((f) => (
          <div key={f.id} className={`${CARD} space-y-2`}>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <b className={f.status === "resolved" ? "" : "text-amber-400"}>{f.kind}</b>
              <Link className="underline" href={`/admin/creators/${f.creatorId}`}>{f.creator.displayName ?? `@${f.creator.handle}`}</Link>
              <span className="text-acuity-text-ter">{day(f.createdAt)} · {f.status}</span>
            </div>
            <p className="text-sm">{f.detail}</p>
            {f.resolvedReason && (
              <p className="text-xs text-acuity-text-ter">Last action: {f.resolvedReason} ({day(f.resolvedAt)})</p>
            )}
            <div className="flex flex-wrap gap-4">
              {f.status !== "resolved" && (
                <FormAction body={{ action: "flag", flagId: f.id, status: "resolved" }} fields={[{ name: "reason", placeholder: "Why it's fine" }]} required={["reason"]} label="Resolve" tone="go" />
              )}
              {f.status === "open" && (
                <FormAction body={{ action: "flag", flagId: f.id, status: "held" }} fields={[{ name: "reason", placeholder: "Why hold" }]} required={["reason"]} label="Hold" tone="warn" />
              )}
              {f.status !== "open" && (
                <FormAction body={{ action: "flag", flagId: f.id, status: "open" }} fields={[{ name: "reason", placeholder: "Why reopen" }]} required={["reason"]} label="Reopen" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
