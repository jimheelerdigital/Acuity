"use client";

import { useCallback, useEffect, useState } from "react";

interface SourceRow {
  source: string;
  total: number;
  firstRecording: number;
  paid: number;
  conversionRate: number;
}

interface CampaignRow {
  campaign: string;
  spendCents: number;
  signups: number;
  paid: number;
  blendedCac: number | null;
  trueCac: number | null;
}

interface LandingRow {
  path: string;
  signups: number;
  firstRecording: number;
  paid: number;
  signupToPaidRate: number;
}

interface ExperimentVariant {
  variant: string;
  assigned: number;
  converted: number;
  conversionRate: number;
}

interface Experiment {
  flagKey: string;
  flagName: string;
  variants: string[];
  variantData: ExperimentVariant[];
}

interface AcquisitionData {
  signupsBySource: SourceRow[];
  campaignCAC: CampaignRow[];
  landingPages: LandingRow[];
  experiments: Experiment[];
  preSignupFunnel: {
    landingSessions: number;
    signupPageViews: number;
    signupCompletions: number;
  };
}

export default function AcquisitionTab() {
  const [data, setData] = useState<AcquisitionData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/acquisition-data");
      if (res.ok) setData(await res.json());
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-[#7C5CFC]" />
      </div>
    );
  }

  if (!data) {
    return (
      <p className="py-10 text-center text-sm text-zinc-500">
        Failed to load acquisition data
      </p>
    );
  }

  const { signupsBySource, campaignCAC, landingPages, experiments, preSignupFunnel } = data;

  return (
    <div className="space-y-8">
      <h2 className="text-lg font-semibold text-white">
        Acquisition (Last 30 Days)
      </h2>

      {/* Section 1: Signup Source Breakdown */}
      <div className="rounded-xl border border-white/10 bg-[#1E1E2E] p-5">
        <h3 className="mb-4 text-sm font-semibold text-white">
          Signup Source Breakdown
        </h3>
        {signupsBySource.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No UTM-attributed signups yet. Attribution begins once the acuity_attribution cookie is set on landing pages.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs text-zinc-500">
                  <th className="pb-2 pr-4">Source</th>
                  <th className="pb-2 pr-4 text-right">Signups</th>
                  <th className="pb-2 pr-4 text-right">First Recording</th>
                  <th className="pb-2 pr-4 text-right">Paid</th>
                  <th className="pb-2 text-right">Conv %</th>
                </tr>
              </thead>
              <tbody>
                {signupsBySource.map((row) => (
                  <tr key={row.source} className="border-b border-white/5">
                    <td className="py-2 pr-4 text-zinc-200">{row.source}</td>
                    <td className="py-2 pr-4 text-right text-zinc-300">
                      {row.total}
                    </td>
                    <td className="py-2 pr-4 text-right text-zinc-300">
                      {row.firstRecording}
                    </td>
                    <td className="py-2 pr-4 text-right text-zinc-300">
                      {row.paid}
                    </td>
                    <td className="py-2 text-right text-zinc-300">
                      {row.conversionRate}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section 2: Per-Campaign CAC */}
      <div className="rounded-xl border border-white/10 bg-[#1E1E2E] p-5">
        <h3 className="mb-4 text-sm font-semibold text-white">
          Per-Campaign CAC
        </h3>
        {campaignCAC.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No campaign data. Enter ad spend in the Ads tab and ensure UTM campaigns match.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs text-zinc-500">
                  <th className="pb-2 pr-4">Campaign</th>
                  <th className="pb-2 pr-4 text-right">Spend</th>
                  <th className="pb-2 pr-4 text-right">Signups</th>
                  <th className="pb-2 pr-4 text-right">Paid</th>
                  <th className="pb-2 pr-4 text-right">Blended CAC</th>
                  <th className="pb-2 text-right">True CAC</th>
                </tr>
              </thead>
              <tbody>
                {campaignCAC.map((row) => (
                  <tr key={row.campaign} className="border-b border-white/5">
                    <td className="py-2 pr-4 text-zinc-200">
                      {row.campaign}
                    </td>
                    <td className="py-2 pr-4 text-right text-zinc-300">
                      ${(row.spendCents / 100).toFixed(0)}
                    </td>
                    <td className="py-2 pr-4 text-right text-zinc-300">
                      {row.signups}
                    </td>
                    <td className="py-2 pr-4 text-right text-zinc-300">
                      {row.paid}
                    </td>
                    <td className="py-2 pr-4 text-right text-zinc-300">
                      {row.blendedCac != null
                        ? `$${(row.blendedCac / 100).toFixed(2)}`
                        : "—"}
                    </td>
                    <td className="py-2 text-right text-zinc-300">
                      {row.trueCac != null
                        ? `$${(row.trueCac / 100).toFixed(2)}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section 3: Landing Page Performance */}
      <div className="rounded-xl border border-white/10 bg-[#1E1E2E] p-5">
        <h3 className="mb-4 text-sm font-semibold text-white">
          Landing Page Performance
        </h3>
        {landingPages.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No landing page attribution data yet. Data populates as users sign up with the attribution cookie set.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs text-zinc-500">
                  <th className="pb-2 pr-4">Page</th>
                  <th className="pb-2 pr-4 text-right">Signups</th>
                  <th className="pb-2 pr-4 text-right">First Recording</th>
                  <th className="pb-2 pr-4 text-right">Paid</th>
                  <th className="pb-2 text-right">Signup→Paid %</th>
                </tr>
              </thead>
              <tbody>
                {landingPages.map((row) => (
                  <tr key={row.path} className="border-b border-white/5">
                    <td className="py-2 pr-4 font-mono text-xs text-zinc-200">
                      {row.path}
                    </td>
                    <td className="py-2 pr-4 text-right text-zinc-300">
                      {row.signups}
                    </td>
                    <td className="py-2 pr-4 text-right text-zinc-300">
                      {row.firstRecording}
                    </td>
                    <td className="py-2 pr-4 text-right text-zinc-300">
                      {row.paid}
                    </td>
                    <td className="py-2 text-right text-zinc-300">
                      {row.signupToPaidRate}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section 4: Active Experiments */}
      <div className="rounded-xl border border-white/10 bg-[#1E1E2E] p-5">
        <h3 className="mb-4 text-sm font-semibold text-white">
          Active Experiments
        </h3>
        {experiments.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No active experiments. Create a FeatureFlag with experimentVariants to start testing.
          </p>
        ) : (
          <div className="space-y-6">
            {experiments.map((exp) => {
              const totalAssigned = exp.variantData.reduce(
                (sum, v) => sum + v.assigned,
                0
              );
              return (
                <div key={exp.flagKey} className="rounded-lg bg-white/5 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-zinc-200">
                        {exp.flagName}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {exp.flagKey} — {totalAssigned} users assigned
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        totalAssigned >= 200
                          ? "bg-emerald-500/20 text-emerald-400"
                          : "bg-amber-500/20 text-amber-400"
                      }`}
                    >
                      {totalAssigned >= 200
                        ? "Ready to evaluate"
                        : "Still collecting"}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {exp.variantData.map((v) => (
                      <div
                        key={v.variant}
                        className="rounded-lg border border-white/10 p-3 text-center"
                      >
                        <p className="text-xs text-zinc-500">{v.variant}</p>
                        <p className="text-lg font-bold text-zinc-200">
                          {v.conversionRate}%
                        </p>
                        <p className="text-xs text-zinc-500">
                          {v.converted}/{v.assigned}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Section 5: Pre-Signup Funnel */}
      <div className="rounded-xl border border-white/10 bg-[#1E1E2E] p-5">
        <h3 className="mb-4 text-sm font-semibold text-white">
          Pre-Signup Funnel
        </h3>
        <div className="space-y-3">
          {[
            {
              label: "Visitors with landing path",
              count: preSignupFunnel.landingSessions,
            },
            {
              label: "With UTM campaign",
              count: preSignupFunnel.signupPageViews,
            },
            {
              label: "Signup completions",
              count: preSignupFunnel.signupCompletions,
            },
          ].map((step, i, arr) => {
            const prevCount = i > 0 ? arr[i - 1].count : step.count;
            const dropOff =
              prevCount > 0
                ? Math.round(
                    ((prevCount - step.count) / prevCount) * 100
                  )
                : 0;
            const barWidth =
              arr[0].count > 0
                ? Math.max(5, (step.count / arr[0].count) * 100)
                : 100;

            return (
              <div key={step.label}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-zinc-300">{step.label}</span>
                  <span className="text-zinc-400">
                    {step.count.toLocaleString()}
                    {i > 0 && dropOff > 0 && (
                      <span className="ml-2 text-xs text-red-400">
                        -{dropOff}%
                      </span>
                    )}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-white/5">
                  <div
                    className="h-2 rounded-full bg-[#7C5CFC]"
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
