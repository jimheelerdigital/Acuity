"use client";

import { useEffect, useRef, useState } from "react";

import ChartCard from "../../components/ChartCard";
import { SkeletonTable } from "../../components/SkeletonCard";
import type {
  FeaturesResponse,
  FeatureFreeVsPaidRow,
} from "@/lib/mri/types";

interface Props {
  start: string;
  end: string;
}

// Adoption % bar color: green healthy, amber soft, red barely-used.
function adoptionColor(pct: number): string {
  if (pct >= 50) return "bg-green-400";
  if (pct >= 20) return "bg-amber-400";
  return "bg-red-400";
}

// Per-feature columns in the free-vs-paid split table, in display order.
const FREE_VS_PAID_COLS: {
  key: keyof FeatureFreeVsPaidRow;
  label: string;
}[] = [
  { key: "usedTasks", label: "Tasks" },
  { key: "usedGoals", label: "Goals" },
  { key: "usedInsights", label: "Insights" },
  { key: "usedLifeAudit", label: "Life Audit" },
  { key: "usedWeeklyReport", label: "Weekly Report" },
  { key: "usedReminder", label: "Reminders" },
  { key: "usedCalendar", label: "Calendar" },
];

function adoptionPct(used: number, users: number): number | null {
  if (users <= 0) return null;
  return (used / users) * 100;
}

export default function FeatureUsageSection({ start, end }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);
  const [data, setData] = useState<FeaturesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lazy gate: only fetch once this section scrolls into view.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || inView) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [inView]);

  useEffect(() => {
    if (!inView) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const url = `/api/admin/mri?section=features&start=${encodeURIComponent(
      start,
    )}&end=${encodeURIComponent(end)}`;
    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        return (await res.json()) as FeaturesResponse;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load feature usage",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [inView, start, end]);

  const totalActivated = data?.adoption?.totalActivated ?? 0;
  const features = data?.adoption?.features ?? [];
  const depth = data?.depth ?? [];
  const freeVsPaid = data?.freeVsPaid ?? [];

  // Map depth rows by key so we can show median/avg alongside adoption.
  const depthByKey = new Map(depth.map((d) => [d.key, d]));

  return (
    <div ref={containerRef}>
      <ChartCard title="Feature Usage">
        {loading && !data ? (
          <SkeletonTable />
        ) : error ? (
          <p className="text-sm text-acuity-bad">{error}</p>
        ) : features.length === 0 ? (
          <p className="text-sm text-acuity-text-ter">
            No activated users in this range.
          </p>
        ) : (
          <div className="space-y-8">
            {/* ── Adoption % + depth per feature ──────────────────────── */}
            <div>
              <div className="mb-3 flex items-baseline justify-between">
                <h4 className="text-xs font-medium uppercase tracking-wide text-acuity-text-ter">
                  Adoption &amp; depth
                </h4>
                <span className="text-xs text-acuity-text-ter">
                  {totalActivated} activated user
                  {totalActivated === 1 ? "" : "s"}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="text-left text-acuity-text-ter">
                      <th className="pb-3 pr-4 font-medium">Feature</th>
                      <th className="pb-3 pr-4 font-medium">Adoption</th>
                      <th className="pb-3 pr-4 text-right font-medium">
                        Users
                      </th>
                      <th className="pb-3 pr-4 text-right font-medium">
                        Median
                      </th>
                      <th className="pb-3 text-right font-medium">
                        Avg / active
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {features.map((f) => {
                      const d = depthByKey.get(f.key);
                      const isAuto = f.type === "auto-seeded";
                      return (
                        <tr
                          key={f.key}
                          className={`border-t border-acuity-line ${
                            isAuto ? "text-acuity-text-ter" : "text-acuity-text-sec"
                          }`}
                        >
                          <td className="py-3 pr-4">
                            <span
                              className={
                                isAuto ? "text-acuity-text-ter" : "font-medium text-acuity-text"
                              }
                            >
                              {f.label}
                            </span>
                            {isAuto && (
                              <span className="ml-2 rounded bg-acuity-bg-inset px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-acuity-text-quiet">
                                auto-seeded
                              </span>
                            )}
                          </td>
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-28 overflow-hidden rounded-acuity-pill bg-acuity-bg-inset">
                                <div
                                  className={`h-full rounded-acuity-pill ${
                                    isAuto ? "bg-acuity-line-strong" : adoptionColor(f.pct)
                                  }`}
                                  style={{
                                    width: `${Math.min(100, Math.max(0, f.pct))}%`,
                                  }}
                                />
                              </div>
                              <span className="tabular-nums text-xs text-acuity-text-ter">
                                {f.pct.toFixed(1)}%
                              </span>
                            </div>
                          </td>
                          <td className="py-3 pr-4 text-right tabular-nums">
                            {f.users}
                          </td>
                          <td className="py-3 pr-4 text-right tabular-nums text-acuity-text-ter">
                            {d ? d.median : "—"}
                          </td>
                          <td className="py-3 text-right tabular-nums text-acuity-text-ter">
                            {d ? d.avgPerActiveUser.toFixed(1) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Free vs paid adoption split ─────────────────────────── */}
            <div>
              <h4 className="mb-3 text-xs font-medium uppercase tracking-wide text-acuity-text-ter">
                Free vs paid adoption
              </h4>
              {freeVsPaid.length === 0 ? (
                <p className="text-sm text-acuity-text-ter">No split available.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="text-left text-acuity-text-ter">
                        <th className="pb-3 pr-4 font-medium">Tier</th>
                        <th className="pb-3 pr-4 text-right font-medium">
                          Users
                        </th>
                        {FREE_VS_PAID_COLS.map((c) => (
                          <th
                            key={c.key}
                            className="pb-3 pr-4 text-right font-medium"
                          >
                            {c.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {freeVsPaid.map((row) => (
                        <tr
                          key={row.isPaid ? "paid" : "free"}
                          className="border-t border-acuity-line text-acuity-text-sec"
                        >
                          <td className="py-3 pr-4 font-medium text-acuity-text">
                            {row.isPaid ? "Paid" : "Free"}
                          </td>
                          <td className="py-3 pr-4 text-right tabular-nums">
                            {row.users}
                          </td>
                          {FREE_VS_PAID_COLS.map((c) => {
                            const used = row[c.key] as number;
                            const pct = adoptionPct(used, row.users);
                            return (
                              <td
                                key={c.key}
                                className="py-3 pr-4 text-right tabular-nums text-acuity-text-ter"
                              >
                                {used}
                                {pct != null && (
                                  <span className="ml-1 text-xs text-acuity-text-quiet">
                                    ({pct.toFixed(0)}%)
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </ChartCard>
    </div>
  );
}
