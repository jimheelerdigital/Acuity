"use client";

import { useState } from "react";
import MetricCard from "../components/MetricCard";
import { SkeletonMetric, SkeletonTable } from "../components/SkeletonCard";
import { useTabData } from "./useTabData";

interface AdsData {
  totalSpendCents: number;
  blendedCac: number;
  totalSignups: number;
  byCampaign: { campaign: string; cents: number }[];
  spendRows: { weekStart: string; campaign: string; spendCents: number }[];
}

const CAMPAIGNS = [
  "therapy",
  "sleep",
  "founders",
  "decoded",
  "weekly-report",
  "main",
];

export default function AdsTab({
  start,
  end,
}: {
  start: string;
  end: string;
}) {
  const { data, loading } = useTabData<AdsData>("ads", start, end);
  const [saving, setSaving] = useState(false);
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay()); // Monday
    return d.toISOString().slice(0, 10);
  });
  const [spendInputs, setSpendInputs] = useState<Record<string, string>>({});

  const handleSaveSpend = async () => {
    setSaving(true);
    try {
      const entries = CAMPAIGNS.map((c) => ({
        campaign: c,
        spendCents: Math.round(
          parseFloat(spendInputs[c] || "0") * 100
        ),
      })).filter((e) => e.spendCents > 0);

      await fetch("/api/admin/meta-spend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart, entries }),
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonMetric key={i} />
          ))}
        </div>
        <SkeletonTable />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          label="Total Ad Spend"
          value={`$${(data.totalSpendCents / 100).toFixed(2)}`}
        />
        <MetricCard
          label="Blended CAC"
          value={
            data.blendedCac > 0
              ? `$${(data.blendedCac / 100).toFixed(2)}`
              : "—"
          }
        />
        <MetricCard label="Signups (this period)" value={data.totalSignups} />
        <MetricCard
          label="Campaigns Tracked"
          value={data.byCampaign.length}
        />
      </div>

      {/* CAC by campaign */}
      {data.byCampaign.length > 0 && (
        <div className="rounded-xl bg-[#13131F] p-5">
          <h3 className="mb-3 text-sm font-medium text-white/60">
            Spend by Campaign
          </h3>
          <div className="space-y-2">
            {data.byCampaign.map((c) => {
              const maxCents = Math.max(
                ...data.byCampaign.map((x) => x.cents),
                1
              );
              return (
                <div key={c.campaign} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 truncate text-sm text-white/70 capitalize">
                    {c.campaign}
                  </span>
                  <div className="relative h-6 flex-1 overflow-hidden rounded bg-white/5">
                    <div
                      className="h-full rounded bg-[#7C5CFC]"
                      style={{
                        width: `${(c.cents / maxCents) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="w-16 text-right text-sm font-medium text-white/80">
                    ${(c.cents / 100).toFixed(0)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Weekly spend input */}
      <div className="rounded-xl bg-[#13131F] p-5">
        <h3 className="mb-4 text-sm font-medium text-white/60">
          Log Weekly Ad Spend
        </h3>
        <div className="mb-4 flex items-center gap-3">
          <label className="text-xs text-white/40">Week of:</label>
          <input
            type="date"
            value={weekStart}
            onChange={(e) => setWeekStart(e.target.value)}
            className="rounded-md bg-[#0A0A0F] px-3 py-1.5 text-sm text-white/80"
          />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {CAMPAIGNS.map((c) => (
            <div key={c}>
              <label className="text-xs text-white/40 capitalize">{c}</label>
              <div className="mt-1 flex items-center gap-1">
                <span className="text-sm text-white/30">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={spendInputs[c] ?? ""}
                  onChange={(e) =>
                    setSpendInputs((p) => ({ ...p, [c]: e.target.value }))
                  }
                  placeholder="0.00"
                  className="w-full rounded-md bg-[#0A0A0F] px-3 py-1.5 text-sm text-white/80"
                />
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={handleSaveSpend}
          disabled={saving}
          className="mt-4 rounded-lg bg-[#7C5CFC] px-4 py-2 text-sm font-medium transition hover:bg-[#6B4DE6] disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Spend"}
        </button>
      </div>
    </div>
  );
}
