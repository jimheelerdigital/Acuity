"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, BarChart3 } from "lucide-react";

interface LiveExperiment {
  id: string;
  topicBrief: string;
  status: string;
  launchedAt: string | null;
  project: { name: string };
  angles: Array<{
    creatives: Array<{
      ads: Array<{
        id: string;
        status: string;
        dailyBudgetCents: number | null;
        metrics: Array<{
          spendCents: number;
          conversions: number;
          impressions: number;
          clicks: number;
        }>;
      }>;
    }>;
  }>;
}

export default function PerformancePage() {
  const [experiments, setExperiments] = useState<LiveExperiment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/adlab/experiments")
      .then((r) => r.json())
      .then((all: LiveExperiment[]) => {
        setExperiments(all.filter((e) => e.status === "live" || e.status === "concluded"));
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 text-[#A0A0B8] animate-spin" />
      </div>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-bold text-white mb-1">Performance</h1>
      <p className="text-sm text-[#A0A0B8] mb-8">
        Live experiment metrics and decision history.
      </p>

      {experiments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/20 bg-[#13131F] p-12 text-center">
          <BarChart3 className="h-10 w-10 text-[#A0A0B8] mx-auto mb-4" />
          <p className="text-sm text-[#A0A0B8]">No live or concluded experiments yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {experiments.map((exp) => (
            <Link
              key={exp.id}
              href={`/admin/adlab/experiments/${exp.id}`}
              className="block rounded-xl border border-white/10 bg-[#13131F] p-5 transition hover:border-[#7C5CFC]/30"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-[#A0A0B8]">{exp.project.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  exp.status === "live"
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "bg-[#7C5CFC]/20 text-[#7C5CFC]"
                }`}>
                  {exp.status}
                </span>
                {exp.launchedAt && (
                  <span className="text-[10px] text-[#A0A0B8]">
                    Launched {new Date(exp.launchedAt).toLocaleDateString()}
                  </span>
                )}
              </div>
              <p className="text-sm text-white line-clamp-1">{exp.topicBrief}</p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
