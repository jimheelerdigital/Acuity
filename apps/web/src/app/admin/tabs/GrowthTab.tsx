"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import MetricCard from "../components/MetricCard";
import ChartCard from "../components/ChartCard";
import RefreshButton from "../components/RefreshButton";
import { SkeletonMetric, SkeletonChart } from "../components/SkeletonCard";
import { TabError } from "../components/TabError";
import { useTabData } from "./useTabData";

interface GrowthData {
  signups: number;
  prevSignups: number;
  waitlistSignups: number;
  d0Rate: number;
  signupsOverTime: { date: string; count: number }[];
  recentSignups: {
    email: string;
    createdAt: string;
    subscriptionStatus: string;
  }[];
}

export default function GrowthTab({
  start,
  end,
}: {
  start: string;
  end: string;
}) {
  const { data, loading, error, meta, refresh } = useTabData<GrowthData>("growth", start, end);

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
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <RefreshButton computedAt={meta?.computedAt ?? null} onRefresh={refresh} loading={loading} />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          label="New Signups"
          value={data.signups}
          currentValue={data.signups}
          previousValue={data.prevSignups}
        />
        <MetricCard
          label="Waitlist Signups"
          value={data.waitlistSignups}
        />
        <MetricCard
          label="Day 0 Activation Rate"
          value={`${data.d0Rate}%`}
        />
        <MetricCard
          label="Referral Signups"
          value="—"
        />
      </div>

      <ChartCard title="Signups by Day">
        {data.signupsOverTime.length === 0 ? (
          <p className="text-sm text-white/40 py-12 text-center">
            Not enough data
          </p>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.signupsOverTime}>
                <XAxis
                  dataKey="date"
                  tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 12 }}
                  tickFormatter={(v) => v.slice(5)}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "#13131F",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="count" fill="#7C5CFC" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      {/* Recent signups table */}
      <div className="rounded-xl bg-[#13131F] p-5">
        <h3 className="mb-3 text-sm font-medium text-white/60">
          Recent Signups
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-white/40">
                <th className="pb-2 pr-4 font-medium">Email</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                <th className="pb-2 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {data.recentSignups.map((u) => (
                <tr
                  key={u.email}
                  className="border-b border-white/5 text-white/70"
                >
                  <td className="py-2 pr-4">{u.email}</td>
                  <td className="py-2 pr-4">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        u.subscriptionStatus === "ACTIVE"
                          ? "bg-green-500/20 text-green-400"
                          : u.subscriptionStatus === "TRIAL"
                            ? "bg-blue-500/20 text-blue-400"
                            : "bg-white/10 text-white/50"
                      }`}
                    >
                      {u.subscriptionStatus}
                    </span>
                  </td>
                  <td className="py-2 whitespace-nowrap">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
