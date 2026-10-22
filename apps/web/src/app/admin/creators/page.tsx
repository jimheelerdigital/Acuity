/**
 * Creator platform admin (2026-10-22, spec "Ripple UGC Creator Platform").
 * Four tabs: Creators (ROI table + BOOST / DORMANT), Ledger (every row),
 * Payout run (preview → approve → execute), Flags. Server-rendered; the
 * admin layout gates access. Actions: /api/admin/creators/action.
 */
import Link from "next/link";

import { CREATOR_TYPES, PERSONAS } from "@/lib/ugc/config";
import { ALL_STATUSES } from "@/lib/ugc/status";
import { stripePayoutsEnabled } from "@/lib/creators/config";
import { formatCents, nextPayoutDate } from "@/lib/creators/money";
import { labelFor } from "@/lib/creators/emails";
import { adminCreatorRows, adminTopline } from "@/lib/creators/stats";
import { prisma } from "@/lib/prisma";

import { ActionButton, FormAction, PayoutRunPanel } from "./creators-client";

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
const CARD = "rounded-lg border border-acuity-line bg-acuity-card-bg p-4";
const TH = "p-2";

function qs(sp: SP, patch: Record<string, string | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) p.set(k, v);
  return `/admin/creators?${p}`;
}

function ExportLink({ table }: { table: string }) {
  return (
    <a className="text-xs underline text-acuity-text-ter" href={`/api/admin/creators/export?table=${table}`}>
      Export CSV
    </a>
  );
}

export default async function CreatorsAdmin({ searchParams }: { searchParams: SP }) {
  const tab = TABS.some((t) => t.key === searchParams.tab) ? searchParams.tab! : "creators";
  return (
    <div className="min-h-screen bg-acuity-bg text-white p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Creator payouts</h1>
          <p className="text-sm text-acuity-text-ter">
            Commission-only creators: 25% for 12 months, 14-day hold, payouts every other Friday after you approve.
            Outreach lives in <Link className="underline" href="/admin/ugc">UGC creators</Link>.
          </p>
        </div>
        <nav className="flex gap-2 border-b border-acuity-line">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/admin/creators?tab=${t.key}`}
              className={`px-3 py-2 text-sm ${tab === t.key ? "border-b-2 border-emerald-500 font-semibold" : "text-acuity-text-ter"}`}
            >
              {t.label}
            </Link>
          ))}
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

async function CreatorsTab({ sp }: { sp: SP }) {
  const all = await adminCreatorRows();
  const top = await adminTopline(all);
  const rows = all.filter(
    (r) =>
      (!sp.status || r.status === sp.status) &&
      (!sp.persona || r.persona === sp.persona) &&
      (!sp.type || r.creatorType === sp.type)
  );
  const filter = (k: string, values: string[]) => (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-acuity-text-ter">{k}:</span>
      <Link className={!sp[k] ? "font-bold" : "underline"} href={qs(sp, { tab: "creators", [k]: undefined })}>
        all
      </Link>
      {values.map((v) => (
        <Link key={v} className={sp[k] === v ? "font-bold" : "underline"} href={qs(sp, { tab: "creators", [k]: v })}>
          {v}
        </Link>
      ))}
    </div>
  );
  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-3">
        <div className={CARD}>
          <p className="text-xs text-acuity-text-ter">Creator spend this month</p>
          <p className="text-2xl font-bold tabular-nums">{usd(top.creatorSpendMonthCents)}</p>
          <p className="text-xs text-acuity-text-ter">commissions + bonuses + boost ad spend</p>
        </div>
        <div className={CARD}>
          <p className="text-xs text-acuity-text-ter">Attributed revenue (all time, net)</p>
          <p className="text-2xl font-bold tabular-nums">{usd(top.attributedRevenueCents)}</p>
        </div>
        <div className={CARD}>
          <p className="text-xs text-acuity-text-ter">Blended cost per trial (this month)</p>
          <p className="text-2xl font-bold tabular-nums">{usd(top.blendedCostPerTrialCents)}</p>
          <p className="text-xs text-acuity-text-ter">{top.trialsMonth} trials from creator traffic</p>
        </div>
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <div className={CARD}>
          <h2 className="font-semibold">BOOST ({top.boost.length})</h2>
          <p className="text-xs text-acuity-text-ter mb-2">Boosted posts under $15 per trial. Put more behind these.</p>
          {top.boost.map((b) => (
            <p key={b.postId} className="text-sm">
              {b.creator} · <a className="underline" href={b.url} target="_blank" rel="noreferrer">post</a> · {usd(b.costPerTrialCents)}/trial
            </p>
          ))}
        </div>
        <div className={CARD}>
          <h2 className="font-semibold">DORMANT ({top.dormant.length})</h2>
          <p className="text-xs text-acuity-text-ter mb-2">Creators with a code and no click in 30 days.</p>
          {top.dormant.map((d) => (
            <p key={d.id} className="text-sm">
              <Link className="underline" href={`/admin/creators/${d.id}`}>{d.name}</Link> · last click {day(d.lastClickAt)}
            </p>
          ))}
        </div>
      </section>
      <section className="space-y-2">
        {filter("status", ALL_STATUSES as unknown as string[])}
        {filter("persona", Object.keys(PERSONAS))}
        {filter("type", Object.keys(CREATOR_TYPES))}
        <div className="flex justify-end"><ExportLink table="creators" /></div>
        <div className="overflow-x-auto rounded-lg border border-acuity-line">
          <table className="w-full text-sm tabular-nums">
            <thead className="text-left text-acuity-text-ter text-xs bg-acuity-bg-inset">
              <tr>
                <th className={TH}>Creator</th>
                <th className={TH}>Status</th>
                <th className={TH}>Persona / type</th>
                <th className={TH}>Code</th>
                <th className={TH}>Clicks</th>
                <th className={TH}>Signups</th>
                <th className={TH}>Trials</th>
                <th className={TH}>Paying</th>
                <th className={TH}>Revenue</th>
                <th className={TH}>Owed</th>
                <th className={TH}>Ad spend</th>
                <th className={TH}>ROI</th>
                <th className={TH}>Agmt</th>
                <th className={TH}>Payout</th>
                <th className={TH}>Flags</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={15} className="p-3 text-acuity-text-ter">
                    No creators yet. Codes are issued when a creator reaches &ldquo;deal&rdquo; in UGC creators.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-acuity-line">
                  <td className="p-2">
                    <Link className="underline" href={`/admin/creators/${r.id}`}>{r.name}</Link>
                    <div className="text-xs text-acuity-text-ter">@{r.handle} · {r.platform}</div>
                  </td>
                  <td className="p-2">{r.status}</td>
                  <td className="p-2">{r.persona ?? "—"} / {r.creatorType ?? "—"}</td>
                  <td className="p-2 font-mono">{r.referralCode ?? "—"}</td>
                  <td className="p-2">{r.clicks}</td>
                  <td className="p-2">{r.signups}</td>
                  <td className="p-2">{r.trials}</td>
                  <td className="p-2">{r.paying}</td>
                  <td className="p-2">{usd(r.revenueCents)}</td>
                  <td className="p-2">{usd(r.commissionOwedCents)}</td>
                  <td className="p-2">{usd(r.adSpendCents)}</td>
                  <td className="p-2">{r.roi == null ? "—" : `${r.roi.toFixed(2)}×`}</td>
                  <td className="p-2">{r.agreementAccepted ? "✓" : "—"}</td>
                  <td className="p-2">{r.payoutReady ? "✓" : "—"}</td>
                  <td className={`p-2 ${r.openFlags ? "text-amber-400 font-semibold" : ""}`}>{r.openFlags || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-acuity-text-ter">ROI = attributed net revenue ÷ (commission + bonuses + boost ad spend). Sorted by ROI.</p>
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
        <select name="creator" defaultValue={sp.creator ?? ""} className="rounded border border-acuity-line bg-acuity-bg-inset px-2 py-1">
          <option value="">All creators</option>
          {creators.map((c) => (
            <option key={c.id} value={c.id}>{c.displayName ?? `@${c.handle}`}</option>
          ))}
        </select>
        <select name="type" defaultValue={sp.type ?? ""} className="rounded border border-acuity-line bg-acuity-bg-inset px-2 py-1">
          <option value="">All types</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select name="status" defaultValue={sp.status ?? ""} className="rounded border border-acuity-line bg-acuity-bg-inset px-2 py-1">
          <option value="">All statuses</option>
          {statuses.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input type="date" name="from" defaultValue={sp.from ?? ""} className="rounded border border-acuity-line bg-acuity-bg-inset px-2 py-1" />
        <input type="date" name="to" defaultValue={sp.to ?? ""} className="rounded border border-acuity-line bg-acuity-bg-inset px-2 py-1" />
        <button className="px-3 py-1.5 rounded text-sm font-medium bg-acuity-bg-inset hover:bg-acuity-card-bg">Filter</button>
        <span className="ml-auto"><ExportLink table="ledger" /></span>
      </form>
      <div className="overflow-x-auto rounded-lg border border-acuity-line">
        <table className="w-full text-sm tabular-nums">
          <thead className="text-left text-acuity-text-ter text-xs bg-acuity-bg-inset">
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
        <div className="overflow-x-auto rounded-lg border border-acuity-line">
          <table className="w-full text-sm tabular-nums">
            <thead className="text-left text-acuity-text-ter text-xs bg-acuity-bg-inset">
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
                  <td className={`p-2 ${p.status === "failed" ? "text-amber-400" : ""}`}>{p.status}</td>
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
