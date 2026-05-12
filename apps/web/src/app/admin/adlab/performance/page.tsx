"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, BarChart3, ArrowUpDown } from "lucide-react";

interface PerformanceAd {
  adId: string;
  headline: string;
  status: string;
  experimentId: string;
  experimentBrief: string;
  impressions: number;
  clicks: number;
  ctr: number;
  spendCents: number;
  conversions: number;
  cplCents: number | null;
  cpcCents: number | null;
  frequency: number;
}

interface Summary {
  totalSpendCents: number;
  totalConversions: number;
  avgCplCents: number | null;
  avgCtr: number;
  totalImpressions: number;
  totalClicks: number;
}

type SortKey = keyof PerformanceAd;

export default function PerformancePage() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [ads, setAds] = useState<PerformanceAd[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("spendCents");
  const [sortAsc, setSortAsc] = useState(false);

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [from, setFrom] = useState(thirtyDaysAgo.toISOString().split("T")[0]);
  const [to, setTo] = useState(now.toISOString().split("T")[0]);

  function fetchData() {
    setLoading(true);
    fetch(`/api/admin/adlab/performance?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((data) => {
        setSummary(data.summary);
        setAds(data.ads || []);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  const sorted = [...ads].sort((a, b) => {
    const av = a[sortKey] ?? -1;
    const bv = b[sortKey] ?? -1;
    return sortAsc ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
  });

  const statusColor: Record<string, string> = {
    live: "bg-emerald-500/20 text-emerald-400",
    paused: "bg-yellow-500/20 text-yellow-400",
    scaled: "bg-blue-500/20 text-blue-400",
    killed: "bg-red-500/20 text-red-400",
  };

  return (
    <>
      <h1 className="text-2xl font-bold text-white mb-1">Performance</h1>
      <p className="text-sm text-[#A0A0B8] mb-6">Ad performance metrics and analytics.</p>

      {/* Date range */}
      <div className="flex items-center gap-3 mb-6">
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="rounded-lg border border-white/10 bg-[#1E1E2E] px-3 py-1.5 text-sm text-white outline-none focus:border-[#7C5CFC]"
        />
        <span className="text-sm text-[#A0A0B8]">to</span>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="rounded-lg border border-white/10 bg-[#1E1E2E] px-3 py-1.5 text-sm text-white outline-none focus:border-[#7C5CFC]"
        />
        <button
          onClick={fetchData}
          className="rounded-lg bg-[#7C5CFC] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#6B4FE0] transition"
        >
          Update
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 text-[#A0A0B8] animate-spin" />
        </div>
      ) : ads.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/20 bg-[#13131F] p-12 text-center">
          <BarChart3 className="h-10 w-10 text-[#A0A0B8] mx-auto mb-4" />
          <p className="text-sm text-[#A0A0B8]">
            No performance data yet. Launch your first experiment to see results here.
          </p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          {summary && (
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 mb-6">
              <SummaryCard label="Total Spend" value={`$${(summary.totalSpendCents / 100).toFixed(2)}`} />
              <SummaryCard label="Conversions" value={String(summary.totalConversions)} />
              <SummaryCard label="Avg CPL" value={summary.avgCplCents ? `$${(summary.avgCplCents / 100).toFixed(2)}` : "\u2014"} />
              <SummaryCard label="Avg CTR" value={`${summary.avgCtr.toFixed(2)}%`} />
              <SummaryCard label="Impressions" value={summary.totalImpressions.toLocaleString()} />
              <SummaryCard label="Clicks" value={summary.totalClicks.toLocaleString()} />
            </div>
          )}

          {/* Ads table */}
          <div className="rounded-xl border border-white/10 bg-[#13131F] overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-[#A0A0B8] text-xs">
                  <Th label="Ad" sortKey="headline" current={sortKey} asc={sortAsc} onSort={toggleSort} />
                  <Th label="Status" sortKey="status" current={sortKey} asc={sortAsc} onSort={toggleSort} />
                  <Th label="Impr." sortKey="impressions" current={sortKey} asc={sortAsc} onSort={toggleSort} />
                  <Th label="Clicks" sortKey="clicks" current={sortKey} asc={sortAsc} onSort={toggleSort} />
                  <Th label="CTR" sortKey="ctr" current={sortKey} asc={sortAsc} onSort={toggleSort} />
                  <Th label="Spend" sortKey="spendCents" current={sortKey} asc={sortAsc} onSort={toggleSort} />
                  <Th label="Conv." sortKey="conversions" current={sortKey} asc={sortAsc} onSort={toggleSort} />
                  <Th label="CPL" sortKey="cplCents" current={sortKey} asc={sortAsc} onSort={toggleSort} />
                  <Th label="CPC" sortKey="cpcCents" current={sortKey} asc={sortAsc} onSort={toggleSort} />
                  <Th label="Freq." sortKey="frequency" current={sortKey} asc={sortAsc} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((ad) => (
                  <tr key={ad.adId} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/admin/adlab/experiments/${ad.experimentId}`}
                        className="text-white hover:text-[#7C5CFC] transition-colors line-clamp-1"
                      >
                        {ad.headline}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColor[ad.status] || "bg-white/10 text-white"}`}>
                        {ad.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-[#A0A0B8] text-right">{ad.impressions.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-[#A0A0B8] text-right">{ad.clicks.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-[#A0A0B8] text-right">{ad.ctr.toFixed(2)}%</td>
                    <td className="px-3 py-2.5 text-white text-right">${(ad.spendCents / 100).toFixed(2)}</td>
                    <td className="px-3 py-2.5 text-white text-right">{ad.conversions}</td>
                    <td className="px-3 py-2.5 text-[#A0A0B8] text-right">{ad.cplCents ? `$${(ad.cplCents / 100).toFixed(2)}` : "\u2014"}</td>
                    <td className="px-3 py-2.5 text-[#A0A0B8] text-right">{ad.cpcCents ? `$${(ad.cpcCents / 100).toFixed(2)}` : "\u2014"}</td>
                    <td className="px-3 py-2.5 text-[#A0A0B8] text-right">{ad.frequency.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#13131F] p-4">
      <p className="text-[10px] text-[#A0A0B8] mb-1">{label}</p>
      <p className="text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

function Th({
  label,
  sortKey,
  current,
  asc,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  asc: boolean;
  onSort: (key: SortKey) => void;
}) {
  return (
    <th
      className="px-3 py-2.5 text-left cursor-pointer hover:text-white transition-colors select-none whitespace-nowrap"
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown className={`h-3 w-3 ${current === sortKey ? "text-[#7C5CFC]" : "opacity-30"}`} />
        {current === sortKey && <span className="text-[#7C5CFC] text-[9px]">{asc ? "\u2191" : "\u2193"}</span>}
      </span>
    </th>
  );
}
