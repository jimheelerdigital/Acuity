"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LayoutDashboard, FlaskConical, BarChart3, Zap, Loader2 } from "lucide-react";

interface DashboardStats {
  totalSpendCents: number;
  totalConversions: number;
  blendedCplCents: number | null;
  liveExperiments: number;
  liveAds: number;
  recentDecisions: Array<{
    id: string;
    decisionType: string;
    rationale: string;
    executedAt: string;
  }>;
}

export default function AdLabDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/adlab/dashboard")
      .then((r) => (r.ok ? r.json() : null))
      .then(setStats)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 text-[#A0A0B8] animate-spin" />
      </div>
    );
  }

  const s = stats || {
    totalSpendCents: 0,
    totalConversions: 0,
    blendedCplCents: null,
    liveExperiments: 0,
    liveAds: 0,
    recentDecisions: [],
  };

  return (
    <>
      <h1 className="text-2xl font-bold text-white mb-1">AdLab Dashboard</h1>
      <p className="text-sm text-[#A0A0B8] mb-8">
        Automated ad research, creative generation, launch & optimization.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Zap className="h-5 w-5 text-[#7C5CFC]" />}
          label="Total Spend (Month)"
          value={`$${(s.totalSpendCents / 100).toFixed(2)}`}
        />
        <StatCard
          icon={<BarChart3 className="h-5 w-5 text-emerald-400" />}
          label="Conversions (Month)"
          value={String(s.totalConversions)}
        />
        <StatCard
          icon={<FlaskConical className="h-5 w-5 text-amber-400" />}
          label="Live Experiments"
          value={String(s.liveExperiments)}
        />
        <StatCard
          icon={<LayoutDashboard className="h-5 w-5 text-sky-400" />}
          label="Live Ads"
          value={String(s.liveAds)}
        />
      </div>

      {s.blendedCplCents !== null && (
        <div className="mt-4 rounded-xl border border-white/10 bg-[#13131F] p-5">
          <span className="text-xs text-[#A0A0B8]">Blended CPL</span>
          <p className="text-2xl font-bold text-white mt-1">
            ${(s.blendedCplCents / 100).toFixed(2)}
          </p>
        </div>
      )}

      {/* Recent Decisions */}
      {s.recentDecisions.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-white mb-4">Recent Decisions</h2>
          <div className="space-y-2">
            {s.recentDecisions.map((d) => (
              <div
                key={d.id}
                className="rounded-lg border border-white/10 bg-[#13131F] px-4 py-3 flex items-start gap-3"
              >
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium mt-0.5 ${
                  d.decisionType === "kill"
                    ? "bg-red-500/15 text-red-400"
                    : d.decisionType === "scale"
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "bg-zinc-500/15 text-zinc-400"
                }`}>
                  {d.decisionType}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[#A0A0B8]">{d.rationale}</p>
                  <p className="text-[10px] text-[#A0A0B8]/60 mt-0.5">
                    {new Date(d.executedAt).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {s.liveExperiments === 0 && s.recentDecisions.length === 0 && (
        <div className="mt-8 rounded-xl border border-white/10 bg-[#13131F] p-6">
          <h2 className="text-lg font-semibold text-white mb-2">Getting Started</h2>
          <p className="text-sm text-[#A0A0B8] leading-relaxed">
            Configure a project in{" "}
            <Link href="/admin/adlab/projects" className="text-[#7C5CFC] hover:underline">Projects</Link>,
            then create an experiment in{" "}
            <Link href="/admin/adlab/experiments" className="text-[#7C5CFC] hover:underline">Experiments</Link>.
          </p>
        </div>
      )}
    </>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#13131F] p-5">
      <div className="flex items-center gap-3 mb-3">
        {icon}
        <span className="text-xs text-[#A0A0B8]">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  );
}
