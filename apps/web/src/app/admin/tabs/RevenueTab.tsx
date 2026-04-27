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

      {/* Past due alerts */}
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

      {/* Paying users table */}
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
