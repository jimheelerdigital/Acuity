"use client";

import { useCallback, useEffect, useState } from "react";
import MetricCard from "../components/MetricCard";
import RefreshButton from "../components/RefreshButton";
import { SkeletonMetric, SkeletonTable } from "../components/SkeletonCard";
import { TabError } from "../components/TabError";
import { useTabData } from "./useTabData";

interface AdsData {
  totalSpendCents: number;
  blendedCac: number;
  totalSignups: number;
  byCampaign: { campaign: string; cents: number }[];
  spendRows: { weekStart: string; campaign: string; spendCents: number }[];
}

interface AcquisitionData {
  signupsBySource: { source: string; total: number; firstRecording: number; paid: number; conversionRate: number }[];
  campaignCAC: { campaign: string; spendCents: number; signups: number; paid: number; blendedCac: number | null; trueCac: number | null }[];
  landingPages: { path: string; signups: number; firstRecording: number; paid: number; signupToPaidRate: number }[];
  experiments: { flagKey: string; flagName: string; variants: string[]; variantData: { variant: string; assigned: number; converted: number; conversionRate: number }[] }[];
  preSignupFunnel: { landingSessions: number; signupPageViews: number; signupCompletions: number };
}

const CAMPAIGNS = ["therapy", "sleep", "founders", "decoded", "weekly-report", "main"];

export default function AdsTab({ start, end }: { start: string; end: string }) {
  const { data, loading, error, meta, refresh } = useTabData<AdsData>("ads", start, end);
  const [acqData, setAcqData] = useState<AcquisitionData | null>(null);
  const [saving, setSaving] = useState(false);
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    return d.toISOString().slice(0, 10);
  });
  const [spendInputs, setSpendInputs] = useState<Record<string, string>>({});

  // Fetch acquisition data separately (its own endpoint)
  const fetchAcq = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/acquisition-data");
      if (res.ok) setAcqData(await res.json());
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchAcq(); }, [fetchAcq]);

  const handleSaveSpend = async () => {
    setSaving(true);
    try {
      const entries = CAMPAIGNS.map((c) => ({
        campaign: c,
        spendCents: Math.round(parseFloat(spendInputs[c] || "0") * 100),
      })).filter((e) => e.spendCents > 0);
      await fetch("/api/admin/meta-spend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart, entries }),
      });
      refresh();
    } finally {
      setSaving(false);
    }
  };

  if (error && !data) return <TabError message={error} onRetry={refresh} />;

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonMetric key={i} />)}
        </div>
        <SkeletonTable />
      </div>
    );
  }

  const acq = acqData;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <RefreshButton computedAt={meta?.computedAt ?? null} onRefresh={refresh} loading={loading} />
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Total Ad Spend" value={`$${(data.totalSpendCents / 100).toFixed(2)}`} />
        <MetricCard label="Blended CAC" value={data.blendedCac > 0 ? `$${(data.blendedCac / 100).toFixed(2)}` : "—"} />
        <MetricCard label="Signups (period)" value={data.totalSignups} />
        <MetricCard label="Campaigns Tracked" value={data.byCampaign.length} />
      </div>

      {/* Signup Source Breakdown (from acquisition) */}
      {acq && acq.signupsBySource.length > 0 && (
        <div className="rounded-xl bg-[#13131F] p-5">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/40">Signup Source Breakdown</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs text-white/40">
                  <th className="pb-2 pr-4">Source</th>
                  <th className="pb-2 pr-4 text-right">Signups</th>
                  <th className="pb-2 pr-4 text-right">First Recording</th>
                  <th className="pb-2 pr-4 text-right">Paid</th>
                  <th className="pb-2 text-right">Conv %</th>
                </tr>
              </thead>
              <tbody>
                {acq.signupsBySource.map((row) => (
                  <tr key={row.source} className="border-b border-white/5 text-white/70">
                    <td className="py-2 pr-4">{row.source}</td>
                    <td className="py-2 pr-4 text-right">{row.total}</td>
                    <td className="py-2 pr-4 text-right">{row.firstRecording}</td>
                    <td className="py-2 pr-4 text-right">{row.paid}</td>
                    <td className="py-2 text-right">{row.conversionRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Per-Campaign CAC (from acquisition) */}
      {acq && acq.campaignCAC.length > 0 && (
        <div className="rounded-xl bg-[#13131F] p-5">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/40">Per-Campaign CAC</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs text-white/40">
                  <th className="pb-2 pr-4">Campaign</th>
                  <th className="pb-2 pr-4 text-right">Spend</th>
                  <th className="pb-2 pr-4 text-right">Signups</th>
                  <th className="pb-2 pr-4 text-right">Paid</th>
                  <th className="pb-2 pr-4 text-right">Blended CAC</th>
                  <th className="pb-2 text-right">True CAC</th>
                </tr>
              </thead>
              <tbody>
                {acq.campaignCAC.map((row) => (
                  <tr key={row.campaign} className="border-b border-white/5 text-white/70">
                    <td className="py-2 pr-4">{row.campaign}</td>
                    <td className="py-2 pr-4 text-right">${(row.spendCents / 100).toFixed(0)}</td>
                    <td className="py-2 pr-4 text-right">{row.signups}</td>
                    <td className="py-2 pr-4 text-right">{row.paid}</td>
                    <td className="py-2 pr-4 text-right">{row.blendedCac != null ? `$${(row.blendedCac / 100).toFixed(2)}` : "—"}</td>
                    <td className="py-2 text-right">{row.trueCac != null ? `$${(row.trueCac / 100).toFixed(2)}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Landing Page Performance (from acquisition) */}
      {acq && acq.landingPages.length > 0 && (
        <div className="rounded-xl bg-[#13131F] p-5">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/40">Landing Page Performance</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs text-white/40">
                  <th className="pb-2 pr-4">Page</th>
                  <th className="pb-2 pr-4 text-right">Signups</th>
                  <th className="pb-2 pr-4 text-right">First Recording</th>
                  <th className="pb-2 pr-4 text-right">Paid</th>
                  <th className="pb-2 text-right">Signup→Paid %</th>
                </tr>
              </thead>
              <tbody>
                {acq.landingPages.map((row) => (
                  <tr key={row.path} className="border-b border-white/5 text-white/70">
                    <td className="py-2 pr-4 font-mono text-xs">{row.path}</td>
                    <td className="py-2 pr-4 text-right">{row.signups}</td>
                    <td className="py-2 pr-4 text-right">{row.firstRecording}</td>
                    <td className="py-2 pr-4 text-right">{row.paid}</td>
                    <td className="py-2 text-right">{row.signupToPaidRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Spend by campaign (bar chart) */}
      {data.byCampaign.length > 0 && (
        <div className="rounded-xl bg-[#13131F] p-5">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/40">Spend by Campaign</h3>
          <div className="space-y-2">
            {data.byCampaign.map((c) => {
              const maxCents = Math.max(...data.byCampaign.map((x) => x.cents), 1);
              return (
                <div key={c.campaign} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 truncate text-sm text-white/70 capitalize">{c.campaign}</span>
                  <div className="relative h-6 flex-1 overflow-hidden rounded bg-white/5">
                    <div className="h-full rounded bg-[#7C5CFC]" style={{ width: `${(c.cents / maxCents) * 100}%` }} />
                  </div>
                  <span className="w-16 text-right text-sm font-medium text-white/80">${(c.cents / 100).toFixed(0)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Weekly spend input */}
      <div className="rounded-xl bg-[#13131F] p-5">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/40">Log Weekly Ad Spend</h3>
        <div className="mb-4 flex items-center gap-3">
          <label className="text-xs text-white/40">Week of:</label>
          <input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} className="rounded-md bg-[#0A0A0F] px-3 py-1.5 text-sm text-white/80" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {CAMPAIGNS.map((c) => (
            <div key={c}>
              <label className="text-xs text-white/40 capitalize">{c}</label>
              <div className="mt-1 flex items-center gap-1">
                <span className="text-sm text-white/30">$</span>
                <input type="number" min="0" step="0.01" value={spendInputs[c] ?? ""} onChange={(e) => setSpendInputs((p) => ({ ...p, [c]: e.target.value }))} placeholder="0.00" className="w-full rounded-md bg-[#0A0A0F] px-3 py-1.5 text-sm text-white/80" />
              </div>
            </div>
          ))}
        </div>
        <button onClick={handleSaveSpend} disabled={saving} className="mt-4 rounded-lg bg-[#7C5CFC] px-4 py-2 text-sm font-medium transition hover:bg-[#6B4DE6] disabled:opacity-50">
          {saving ? "Saving…" : "Save Spend"}
        </button>
      </div>
    </div>
  );
}
