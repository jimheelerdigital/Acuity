"use client";

import { useRouter } from "next/navigation";

import MetricCard from "../components/MetricCard";
import RefreshButton from "../components/RefreshButton";
import { SkeletonMetric, SkeletonTable } from "../components/SkeletonCard";
import { TabError } from "../components/TabError";
import { useTabData } from "./useTabData";
import { MONTHLY_PRICE_CENTS, formatDollars } from "@/lib/pricing";

interface RevenueData {
  mrrCents: number;
  payingSubs: number;
  trialUsers: number;
  churnRate: number;
  conversionRate: number;
  churnedInPeriod: number;
  pastDueUsers: {
    id: string;
    email: string;
    stripeCurrentPeriodEnd: string | null;
    createdAt: string;
  }[];
  recentPaying: {
    email: string;
    createdAt: string;
    stripeCurrentPeriodEnd: string | null;
  }[];
  costs: {
    claudeApiCents: number;
    whisperCents: number | null;
    stripeFeeCents: number;
    resendCents: number;
    vercelCents: number;
    supabaseCents: number;
    totalCents: number;
  };
  margin: {
    grossMarginCents: number;
    grossMarginPct: number;
  };
  unitEconomics: {
    arpuCents: number;
    avgCostPerCustomerCents: number;
    contributionMarginCents: number;
    ltvCents: number;
    cacCents: number | null;
    ltvCacRatio: number | null;
  };
  aiSummary: {
    claudeSpendMtdCents: number;
    budgetCents: number;
    budgetRemainingCents: number;
    costPerRecordingCents: number;
    costPerSignupCents: number;
    entriesThisMonth: number;
    signupsThisMonth: number;
  };
}

function fmt(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function marginColor(pct: number): string {
  if (pct >= 70) return "text-emerald-400";
  if (pct >= 40) return "text-amber-400";
  return "text-red-400";
}

function marginBg(pct: number): string {
  if (pct >= 70) return "border-emerald-500/20 bg-emerald-900/10";
  if (pct >= 40) return "border-amber-500/20 bg-amber-900/10";
  return "border-red-500/20 bg-red-900/10";
}

export default function RevenueTab({
  start,
  end,
}: {
  start: string;
  end: string;
}) {
  const { data, loading, error, meta, refresh } = useTabData<RevenueData>("revenue", start, end);
  const router = useRouter();

  if (error && !data) {
    return <TabError message={error} onRetry={refresh} />;
  }

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonMetric key={i} />
          ))}
        </div>
        <SkeletonTable />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <RefreshButton computedAt={meta?.computedAt ?? null} onRefresh={refresh} loading={loading} />
      </div>

      {/* ── Core Revenue Metrics ──────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <MetricCard
          label="Monthly Recurring Revenue (MRR)"
          value={`$${(data.mrrCents / 100).toFixed(0)}`}
        />
        <MetricCard label="Paying Subscribers" value={data.payingSubs} />
        <MetricCard label="Trial Users" value={data.trialUsers} />
        <MetricCard
          label="Churn Rate"
          value={`${data.churnRate}%`}
        />
        <MetricCard
          label="Trial-to-Paid Conversion Rate"
          value={`${data.conversionRate}%`}
        />
        <MetricCard
          label="Average Revenue Per User (ARPU)"
          value={
            data.payingSubs > 0
              ? `$${(data.mrrCents / data.payingSubs / 100).toFixed(2)}`
              : "—"
          }
        />
      </div>

      {/* ── Gross Margin Card ─────────────────────────────────────── */}
      <div className={`rounded-xl border p-5 ${marginBg(data.margin.grossMarginPct)}`}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-white/60 mb-1">Gross Margin</h3>
            <div className="flex items-baseline gap-3">
              <span className={`text-3xl font-bold ${marginColor(data.margin.grossMarginPct)}`}>
                {data.margin.grossMarginPct}%
              </span>
              <span className="text-sm text-white/40">
                {fmt(data.margin.grossMarginCents)} / mo
              </span>
            </div>
          </div>
          <div className="text-right text-xs text-white/30">
            {data.margin.grossMarginPct >= 70
              ? "Healthy"
              : data.margin.grossMarginPct >= 40
                ? "Watch closely"
                : "Below target"}
          </div>
        </div>
      </div>

      {/* ── True Cost of Revenue (last 30 days) ───────────────────── */}
      <div className="rounded-xl bg-[#13131F] p-5">
        <h3 className="mb-3 text-sm font-medium text-white/60">
          True Cost of Revenue (Last 30 Days)
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-white/40">
                <th className="pb-2 pr-4 font-medium">Cost Line</th>
                <th className="pb-2 pr-4 font-medium text-right">Amount</th>
                <th className="pb-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              <CostRow label="Claude API" cents={data.costs.claudeApiCents} />
              <CostRow
                label="OpenAI Whisper"
                cents={data.costs.whisperCents}
                note="Not tracked yet"
              />
              <CostRow
                label="Stripe Fees"
                cents={data.costs.stripeFeeCents}
                note="Estimated (2.9% + 30¢/txn)"
              />
              <CostRow
                label="Resend (Email)"
                cents={data.costs.resendCents}
                note="Hardcoded $20/mo"
              />
              <CostRow
                label="Vercel Hosting"
                cents={data.costs.vercelCents}
                note="Hardcoded $20/mo"
              />
              <CostRow
                label="Supabase"
                cents={data.costs.supabaseCents}
                note="Hardcoded $25/mo"
              />
              <tr className="border-t border-white/20 font-medium text-white">
                <td className="pt-3 pr-4">Total Cost</td>
                <td className="pt-3 pr-4 text-right">{fmt(data.costs.totalCents)}</td>
                <td className="pt-3" />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Per-Customer Unit Economics ────────────────────────────── */}
      <div className="rounded-xl bg-[#13131F] p-5">
        <h3 className="mb-3 text-sm font-medium text-white/60">
          Per-Customer Unit Economics
        </h3>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <MiniMetric label="ARPU" value={fmt(data.unitEconomics.arpuCents)} />
          <MiniMetric
            label="Avg Cost / Customer"
            value={fmt(data.unitEconomics.avgCostPerCustomerCents)}
          />
          <MiniMetric
            label="Contribution Margin"
            value={fmt(data.unitEconomics.contributionMarginCents)}
            color={data.unitEconomics.contributionMarginCents > 0 ? "text-emerald-400" : "text-red-400"}
          />
          <MiniMetric
            label="Estimated LTV"
            value={fmt(data.unitEconomics.ltvCents)}
            sub="Capped at 36 months"
          />
          <MiniMetric
            label="LTV : CAC Ratio"
            value={
              data.unitEconomics.ltvCacRatio !== null
                ? `${data.unitEconomics.ltvCacRatio}x`
                : "Awaiting CAC data"
            }
            color={
              data.unitEconomics.ltvCacRatio === null
                ? "text-white/30"
                : data.unitEconomics.ltvCacRatio >= 3
                  ? "text-emerald-400"
                  : "text-amber-400"
            }
          />
          <MiniMetric
            label="CAC"
            value={
              data.unitEconomics.cacCents !== null
                ? fmt(data.unitEconomics.cacCents)
                : "No ad spend"
            }
          />
        </div>
      </div>

      {/* ── AI Cost Breakdown (executive summary) ─────────────────── */}
      <div className="rounded-xl bg-[#13131F] p-5">
        <h3 className="mb-3 text-sm font-medium text-white/60">
          AI Cost Breakdown (Month-to-Date)
        </h3>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MiniMetric
            label="Claude Spend MTD"
            value={fmt(data.aiSummary.claudeSpendMtdCents)}
          />
          <MiniMetric
            label="Budget Remaining"
            value={fmt(data.aiSummary.budgetRemainingCents)}
            color={data.aiSummary.budgetRemainingCents > 0 ? "text-emerald-400" : "text-red-400"}
          />
          <MiniMetric
            label="Cost / Recording"
            value={
              data.aiSummary.entriesThisMonth > 0
                ? `${(data.aiSummary.costPerRecordingCents / 100).toFixed(3)}`
                : "—"
            }
            sub={`${data.aiSummary.entriesThisMonth} recordings`}
          />
          <MiniMetric
            label="Cost / Signup"
            value={
              data.aiSummary.signupsThisMonth > 0
                ? fmt(data.aiSummary.costPerSignupCents)
                : "—"
            }
            sub={`${data.aiSummary.signupsThisMonth} signups`}
          />
        </div>
      </div>

      {/* ── Past Due Alerts ───────────────────────────────────────── */}
      {data.pastDueUsers.length > 0 && (
        <div className="rounded-xl border border-red-500/20 bg-red-900/10 p-5">
          <h3 className="mb-3 text-sm font-medium text-red-400">
            Failed Payment Alerts ({data.pastDueUsers.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-red-500/10 text-red-300/60">
                  <th className="pb-2 pr-4 font-medium">Email</th>
                  <th className="pb-2 font-medium">Period End</th>
                </tr>
              </thead>
              <tbody>
                {data.pastDueUsers.map((u) => (
                  <tr
                    key={u.id}
                    className="cursor-pointer border-b border-red-500/5 text-red-200/70 hover:bg-red-500/5"
                    onClick={() => router.push(`/admin?tab=users&select=${u.id}`)}
                  >
                    <td className="py-2 pr-4">{u.email}</td>
                    <td className="py-2">
                      {u.stripeCurrentPeriodEnd
                        ? new Date(
                            u.stripeCurrentPeriodEnd
                          ).toLocaleDateString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Paying Users Table ────────────────────────────────────── */}
      <div className="rounded-xl bg-[#13131F] p-5">
        <h3 className="mb-3 text-sm font-medium text-white/60">
          Current Paying Users
        </h3>
        {data.recentPaying.length === 0 ? (
          <p className="text-sm text-white/30 py-6 text-center">
            No paying users yet
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-white/40">
                  <th className="pb-2 pr-4 font-medium">Email</th>
                  <th className="pb-2 pr-4 font-medium">Signup</th>
                  <th className="pb-2 pr-4 font-medium">Monthly Recurring Revenue</th>
                  <th className="pb-2 font-medium">Days Paying</th>
                </tr>
              </thead>
              <tbody>
                {data.recentPaying.map((u) => {
                  const daysPaying = Math.floor(
                    (Date.now() - new Date(u.createdAt).getTime()) / 86400000
                  );
                  return (
                    <tr
                      key={u.email}
                      className="border-b border-white/5 text-white/70"
                    >
                      <td className="py-2 pr-4">{u.email}</td>
                      <td className="py-2 pr-4 whitespace-nowrap">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-2 pr-4">
                        {formatDollars(MONTHLY_PRICE_CENTS)}
                      </td>
                      <td className="py-2">{daysPaying}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Helper components ───────────────────────────────────────────── */

function CostRow({
  label,
  cents,
  note,
}: {
  label: string;
  cents: number | null;
  note?: string;
}) {
  return (
    <tr className="border-b border-white/5 text-white/70">
      <td className="py-2 pr-4">{label}</td>
      <td className="py-2 pr-4 text-right tabular-nums">
        {cents !== null ? fmt(cents) : "—"}
      </td>
      <td className="py-2 text-white/30 text-xs">{note ?? ""}</td>
    </tr>
  );
}

function MiniMetric({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-lg bg-white/[0.03] px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-white/30 mb-1">
        {label}
      </div>
      <div className={`text-lg font-semibold tabular-nums ${color ?? "text-white"}`}>
        {value}
      </div>
      {sub && (
        <div className="text-[10px] text-white/20 mt-0.5">{sub}</div>
      )}
    </div>
  );
}
