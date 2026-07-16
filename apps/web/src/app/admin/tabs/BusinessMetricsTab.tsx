"use client";

// Recharts removed — charts use CSS bars
import MetricCard from "../components/MetricCard";
import ChartCard from "../components/ChartCard";
import RefreshButton from "../components/RefreshButton";
import { SkeletonMetric, SkeletonChart, SkeletonTable } from "../components/SkeletonCard";
import { TabError } from "../components/TabError";
import { useTabData } from "./useTabData";

/* ── Data shape ────────────────────────────────────────────────────── */

type BusinessMetricsData = {
  // Revenue
  mrrCents: number;
  totalRevenueCents: number;
  revenueThisMonthCents: number;
  arpuCents: number;
  payingUsers: number;
  mrrTrend: { month: string; mrr: number }[];

  // Costs
  aiCostsThisMonthCents: number;
  adSpendThisMonthCents: number;
  infraCosts: { category: string; label: string; amountCents: number }[];
  totalCostsThisMonthCents: number;

  // Unit Economics
  costPerUserCents: number;
  cacCents: number | null;
  grossMarginPerUserCents: number;
  grossMarginPct: number;
  ltvCents: number;
  ltvCacRatio: number | null;
  paybackMonths: number | null;

  // P&L
  netProfitCents: number;
  profitTrend: { month: string; revenue: number; costs: number; net: number }[];
  breakEvenUsers: number;
  runwayMonths: number | null;
  staleStripeRecords: {
    email: string;
    name: string | null;
    subscriptionStatus: string;
    stripeSubscriptionId: string | null;
    stripeFirstFailureAt: string | null;
    createdAt: string;
    lastSeenAt: string | null;
    daysInactive: number | null;
  }[];
  pastDueRecovery: {
    email: string;
    name: string | null;
    subscriptionSource: string | null;
    stripeFirstFailureAt: string | null;
    createdAt: string;
  }[];
};

/* ── Formatting helpers ────────────────────────────────────────────── */

function fmtDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function fmtWholeDollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString()}`;
}

/* ── Component ─────────────────────────────────────────────────────── */

export default function BusinessMetricsTab({
  start,
  end,
}: {
  start: string;
  end: string;
}) {
  const { data, loading, error, meta, refresh } = useTabData<BusinessMetricsData>(
    "business-metrics",
    start,
    end,
  );

  if (error && !data) {
    return <TabError message={error} onRetry={refresh} />;
  }

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonMetric key={i} />
          ))}
        </div>
        <SkeletonChart />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonMetric key={i} />
          ))}
        </div>
        <SkeletonTable />
        <SkeletonChart />
      </div>
    );
  }

  const infraTotal = data.infraCosts.reduce((sum, c) => sum + c.amountCents, 0);
  const isProfitable = data.netProfitCents >= 0;

  return (
    <div className="space-y-8">
      <div className="flex justify-end">
        <RefreshButton computedAt={meta?.computedAt ?? null} onRefresh={refresh} loading={loading} />
      </div>

      {/* ── 1. Revenue Section ───────────────────────────────────── */}
      <section>
        <h2 className="mb-4 text-sm uppercase tracking-wider text-white/40">
          Revenue
        </h2>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricCard label="MRR" value={fmtDollars(data.mrrCents)} />
          <MetricCard label="Total Revenue" value={fmtDollars(data.totalRevenueCents)} />
          <MetricCard label="Revenue This Month" value={fmtDollars(data.revenueThisMonthCents)} />
          <MetricCard label="ARPU" value={fmtDollars(data.arpuCents)} />
        </div>

        <div className="mt-4 rounded-xl bg-[#13131F] px-5 py-3">
          <span className="text-sm text-white/50">Paying users: </span>
          <span className="text-sm font-semibold text-white">
            {data.payingUsers.toLocaleString()}
          </span>
        </div>

        <div className="mt-4">
          <ChartCard title="MRR Trend">
            {data.mrrTrend.length < 2 ? (
              <p className="py-12 text-center text-sm text-white/40">Not enough data</p>
            ) : (() => {
                const max = Math.max(...data.mrrTrend.map((d: { mrr: number }) => d.mrr), 1);
                return (
                  <div className="flex items-end gap-1 h-48 pt-4">
                    {data.mrrTrend.map((d: { month: string; mrr: number }, i: number) => (
                      <div key={i} className="flex-1 flex flex-col items-center justify-end" title={`${d.month}: ${fmtDollars(d.mrr)}`}>
                        <div className="w-full rounded-t bg-[#8E6FE6]" style={{ height: `${Math.max(2, (d.mrr / max) * 100)}%` }} />
                      </div>
                    ))}
                  </div>
                );
              })()}
          </ChartCard>
        </div>
      </section>

      {/* ── 2. Costs Section ─────────────────────────────────────── */}
      <section>
        <h2 className="mb-4 text-sm uppercase tracking-wider text-white/40">
          Costs
        </h2>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <MetricCard label="AI Costs This Month" value={fmtDollars(data.aiCostsThisMonthCents)} />
          <MetricCard label="Ad Spend This Month" value={fmtDollars(data.adSpendThisMonthCents)} />
          <MetricCard label="Total Costs This Month" value={fmtDollars(data.totalCostsThisMonthCents)} />
        </div>

        {/* Infrastructure costs table */}
        <div className="mt-4 rounded-xl bg-[#13131F] p-5">
          <h3 className="mb-3 text-sm font-medium text-white/60">
            Infrastructure Costs
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-white/40">
                  <th className="pb-2 pr-4 font-medium">Category</th>
                  <th className="pb-2 pr-4 font-medium">Label</th>
                  <th className="pb-2 font-medium text-right">Monthly Cost</th>
                </tr>
              </thead>
              <tbody>
                {data.infraCosts.map((row, i) => (
                  <tr key={i} className="border-b border-white/5 text-white/70">
                    <td className="py-2 pr-4">{row.category}</td>
                    <td className="py-2 pr-4">{row.label}</td>
                    <td className="py-2 text-right tabular-nums">{fmtDollars(row.amountCents)}</td>
                  </tr>
                ))}
                <tr className="border-t border-white/20 font-medium text-white">
                  <td className="pt-3 pr-4" colSpan={2}>
                    Total Infrastructure
                  </td>
                  <td className="pt-3 text-right tabular-nums">{fmtDollars(infraTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── 3. Unit Economics Section ────────────────────────────── */}
      <section>
        <h2 className="mb-4 text-sm uppercase tracking-wider text-white/40">
          Unit Economics
        </h2>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <MiniMetric
            label="Cost per User / Month"
            value={fmtDollars(data.costPerUserCents)}
          />
          <MiniMetric
            label="Customer Acquisition Cost"
            value={data.cacCents !== null ? fmtDollars(data.cacCents) : "N/A"}
            color={data.cacCents === null ? "text-white/30" : undefined}
          />
          <MiniMetric
            label="Gross Margin / User"
            value={fmtDollars(data.grossMarginPerUserCents)}
            color={data.grossMarginPerUserCents >= 0 ? "text-emerald-400" : "text-red-400"}
          />
          <MiniMetric
            label="Gross Margin %"
            value={fmtPct(data.grossMarginPct)}
            color={data.grossMarginPct >= 0 ? "text-emerald-400" : "text-red-400"}
          />
          <MiniMetric
            label="LTV Estimate"
            value={fmtDollars(data.ltvCents)}
          />
          <MiniMetric
            label="LTV : CAC Ratio"
            value={data.ltvCacRatio !== null ? `${data.ltvCacRatio.toFixed(1)}x` : "N/A"}
            color={
              data.ltvCacRatio === null
                ? "text-white/30"
                : data.ltvCacRatio >= 3
                  ? "text-emerald-400"
                  : "text-amber-400"
            }
          />
          <MiniMetric
            label="Months to Payback"
            value={data.paybackMonths !== null ? `${data.paybackMonths.toFixed(1)}` : "N/A"}
            color={data.paybackMonths === null ? "text-white/30" : undefined}
          />
        </div>
      </section>

      {/* ── 4. P&L Section ───────────────────────────────────────── */}
      <section>
        <h2 className="mb-4 text-sm uppercase tracking-wider text-white/40">
          Profit &amp; Loss
        </h2>

        {/* Big net profit number */}
        <div className="rounded-xl bg-[#13131F] p-6 text-center">
          <p className="text-sm text-white/40 mb-2">Net Profit / Loss This Month</p>
          <p
            className={`text-3xl font-bold tabular-nums ${
              isProfitable ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {isProfitable ? "+" : ""}
            {fmtDollars(data.netProfitCents)}
          </p>
        </div>

        {/* Revenue vs Costs vs Net trend */}
        <div className="mt-4">
          <ChartCard title="Revenue vs Costs vs Net">
            {data.profitTrend.length < 2 ? (
              <p className="py-12 text-center text-sm text-white/40">Not enough data</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead><tr className="border-b border-white/10 text-white/30 text-xs">
                    <th className="pb-2 pr-3">Month</th><th className="pb-2 pr-3 text-right">Revenue</th><th className="pb-2 pr-3 text-right">Costs</th><th className="pb-2 pr-3 text-right">Net</th>
                  </tr></thead>
                  <tbody>
                    {data.profitTrend.map((d: { month: string; revenue: number; costs: number; net: number }, i: number) => (
                      <tr key={i} className="border-b border-white/5 text-white/60">
                        <td className="py-1.5 pr-3 text-xs">{d.month}</td>
                        <td className="py-1.5 pr-3 text-xs text-right text-emerald-400 tabular-nums">{fmtDollars(d.revenue)}</td>
                        <td className="py-1.5 pr-3 text-xs text-right text-red-400 tabular-nums">{fmtDollars(d.costs)}</td>
                        <td className={`py-1.5 pr-3 text-xs text-right font-medium tabular-nums ${d.net >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmtDollars(d.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ChartCard>
        </div>

        {/* Break-even callout */}
        <div className="mt-4 rounded-xl bg-[#13131F] p-5">
          <p className="text-sm text-white/60">
            <span className="text-white font-medium">Break-even target:</span>{" "}
            Need{" "}
            <span className="text-white font-semibold tabular-nums">
              {data.breakEvenUsers.toLocaleString()}
            </span>{" "}
            paying users to cover monthly costs
          </p>
        </div>

        {/* Runway callout — only shown when costs exceed revenue */}
        {!isProfitable && data.runwayMonths !== null && (
          <div className="mt-4 rounded-xl border border-red-500/20 bg-red-900/10 p-5">
            <p className="text-sm text-red-300/80">
              <span className="text-red-400 font-medium">Runway:</span>{" "}
              At current burn rate, runway is{" "}
              <span className="text-red-300 font-semibold tabular-nums">
                {data.runwayMonths.toFixed(1)}
              </span>{" "}
              months
            </p>
          </div>
        )}

        {/* Stripe reconciliation (analytics 2026-06-16) — admin-only PII */}
        <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-900/10 p-4">
          <p className="text-xs text-amber-200/70">
            ⚠️ Revenue figures above are <strong>estimates</strong>. For
            authoritative numbers see the Stripe Dashboard + App Store Connect
            Sales reports. The tables below are reconciliation tools — compare
            against Stripe directly.
          </p>
        </div>

        <ChartCard
          title={`Stale Stripe records — Stripe PRO users by last seen (${(data.staleStripeRecords ?? []).length})`}
          className="mt-4"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-white/40">
                  <th className="py-2 pr-4 font-medium">Email</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Sub ID</th>
                  <th className="py-2 pr-4 text-right font-medium">
                    Days inactive
                  </th>
                  <th className="py-2 text-right font-medium">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {(data.staleStripeRecords ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-white/30">
                      No Stripe PRO users
                    </td>
                  </tr>
                ) : (
                  (data.staleStripeRecords ?? []).map((r, i) => {
                    const stale = r.daysInactive != null && r.daysInactive > 14;
                    return (
                      <tr
                        key={i}
                        className="border-t border-white/5 text-white/75"
                      >
                        <td className="py-2 pr-4">{r.email}</td>
                        <td className="py-2 pr-4">{r.subscriptionStatus}</td>
                        <td className="py-2 pr-4 font-mono text-xs text-white/40">
                          {r.stripeSubscriptionId ?? "—"}
                        </td>
                        <td
                          className="py-2 pr-4 text-right tabular-nums"
                          style={
                            stale
                              ? { color: "#FB7185", fontWeight: 600 }
                              : undefined
                          }
                        >
                          {r.daysInactive ?? "—"}
                          {stale ? " ⚠" : ""}
                        </td>
                        <td className="py-2 text-right tabular-nums text-white/50">
                          {r.lastSeenAt
                            ? new Date(r.lastSeenAt).toLocaleDateString()
                            : "never"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </ChartCard>

        <ChartCard
          title={`PAST_DUE recovery candidates (${(data.pastDueRecovery ?? []).length})`}
          className="mt-4"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-white/40">
                  <th className="py-2 pr-4 font-medium">Email</th>
                  <th className="py-2 pr-4 font-medium">Source</th>
                  <th className="py-2 text-right font-medium">First failure</th>
                </tr>
              </thead>
              <tbody>
                {(data.pastDueRecovery ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-white/30">
                      No PAST_DUE users 🎉
                    </td>
                  </tr>
                ) : (
                  (data.pastDueRecovery ?? []).map((r, i) => (
                    <tr
                      key={i}
                      className="border-t border-white/5 text-white/75"
                    >
                      <td className="py-2 pr-4">{r.email}</td>
                      <td className="py-2 pr-4">
                        {r.subscriptionSource ?? "—"}
                      </td>
                      <td className="py-2 text-right tabular-nums text-white/50">
                        {r.stripeFirstFailureAt
                          ? new Date(
                              r.stripeFirstFailureAt
                            ).toLocaleDateString()
                          : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </ChartCard>
      </section>
    </div>
  );
}

/* ── Helper component ──────────────────────────────────────────────── */

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
