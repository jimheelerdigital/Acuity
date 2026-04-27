"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import MetricCard from "../components/MetricCard";
import RefreshButton from "../components/RefreshButton";
import { DrilldownModal } from "../components/DrilldownModal";
import { SkeletonMetric, SkeletonTable } from "../components/SkeletonCard";
import { TabError } from "../components/TabError";
import { useTabData } from "./useTabData";

interface EngagementData {
  dau: number;
  wau: number;
  mau: number;
  dauMauRatio: number;
  totalEntries: number;
  avgDuration: number;
  avgPerUserPerWeek: number;
  silentTrialUsers: { id: string; email: string; lastSeenAt: string | null }[];
}

export default function EngagementTab({
  start,
  end,
}: {
  start: string;
  end: string;
}) {
  const { data, loading, error, meta, refresh } = useTabData<EngagementData>(
    "engagement",
    start,
    end
  );
  const [drilldown, setDrilldown] = useState<{
    window: "dau" | "wau" | "mau";
    label: string;
  } | null>(null);
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
          label="Daily Active Users (DAU)"
          value={data.dau}
          onClick={() =>
            setDrilldown({ window: "dau", label: "Daily Active Users" })
          }
        />
        <MetricCard
          label="Weekly Active Users (WAU)"
          value={data.wau}
          onClick={() =>
            setDrilldown({ window: "wau", label: "Weekly Active Users" })
          }
        />
        <MetricCard
          label="Monthly Active Users (MAU)"
          value={data.mau}
          onClick={() =>
            setDrilldown({ window: "mau", label: "Monthly Active Users" })
          }
        />
        <MetricCard
          label="Daily/Monthly Active Users Ratio (DAU/MAU)"
          value={`${data.dauMauRatio}%`}
        />
        <MetricCard
          label="Avg Recordings/User/Week"
          value={data.avgPerUserPerWeek}
        />
        <MetricCard
          label="Avg Duration"
          value={data.avgDuration > 0 ? `${data.avgDuration}s` : "—"}
        />
      </div>

      {/* Silent trial users */}
      <div className="rounded-xl bg-[#13131F] p-5">
        <h3 className="mb-3 text-sm font-medium text-white/60">
          Silent Trial Users (0 recordings in 3+ days)
        </h3>
        {data.silentTrialUsers.length === 0 ? (
          <p className="text-sm text-white/30 py-6 text-center">
            All trial users are active
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-white/40">
                  <th className="pb-2 pr-4 font-medium">Email</th>
                  <th className="pb-2 font-medium">Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {data.silentTrialUsers.map((u) => (
                  <tr
                    key={u.id}
                    className="cursor-pointer border-b border-white/5 text-white/70 hover:bg-white/5"
                    onClick={() =>
                      router.push(`/admin?tab=users&select=${u.id}`)
                    }
                  >
                    <td className="py-2 pr-4">{u.email}</td>
                    <td className="py-2 whitespace-nowrap">
                      {u.lastSeenAt
                        ? new Date(u.lastSeenAt).toLocaleDateString()
                        : "Never"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {drilldown && (
        <DrilldownModal
          metric="engagement_users"
          start={start}
          end={end}
          fallbackTitle={drilldown.label}
          params={{ window: drilldown.window }}
          onClose={() => setDrilldown(null)}
        />
      )}
    </div>
  );
}
