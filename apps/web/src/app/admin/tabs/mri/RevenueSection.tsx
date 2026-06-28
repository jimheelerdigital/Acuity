"use client";

import { useEffect, useRef, useState } from "react";

import ChartCard from "../../components/ChartCard";
import MetricCard from "../../components/MetricCard";
import { SkeletonTable } from "../../components/SkeletonCard";
import type { RevenueResponse } from "@/lib/mri/types";

interface Props {
  start: string;
  end: string;
}

type StaleRow = NonNullable<RevenueResponse["staleStripeRecords"]>[number];
type PastDueRow = NonNullable<RevenueResponse["pastDueRecovery"]>[number];

function fmtDate(d: Date | string | null): string {
  if (!d) return "—";
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

export default function RevenueSection({ start, end }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [data, setData] = useState<RevenueResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lazy gate: only fetch once scrolled into view.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || visible) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    // Revenue is current-state; start/end are ignored server-side but harmless.
    const url = `/api/admin/mri?section=revenue&start=${encodeURIComponent(
      start,
    )}&end=${encodeURIComponent(end)}`;
    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error || `Request failed (${res.status})`);
        }
        return (await res.json()) as RevenueResponse;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load revenue data");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, start, end]);

  const stale: StaleRow[] = data?.staleStripeRecords ?? [];
  const pastDue: PastDueRow[] = data?.pastDueRecovery ?? [];

  return (
    <div ref={containerRef} className="flex flex-col gap-4">
      <ChartCard title="Revenue / Subscriptions">
        {loading || (!data && !error) ? (
          <SkeletonTable />
        ) : error ? (
          <p className="text-sm" style={{ color: "#F87171" }}>
            {error}
          </p>
        ) : (
          <>
            <div
              className="mb-4 rounded-lg border px-4 py-3 text-xs"
              style={{
                borderColor: "rgba(251,191,36,0.2)",
                background: "rgba(120,53,15,0.12)",
                color: "rgba(253,224,71,0.75)",
              }}
            >
              ⚠️ Revenue figures are <strong>estimates</strong>. For authoritative
              numbers see the Stripe Dashboard + App Store Connect Sales reports.
              The tables below are reconciliation tools — compare against Stripe.
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <MetricCard label="Estimated MRR" value={`$${((data?.mrrCents ?? 0) / 100).toFixed(2)}`} />
              <MetricCard label="Paying users" value={data?.payingUsers ?? 0} />
              <MetricCard label="Active PAST_DUE" value={pastDue.length} />
            </div>
          </>
        )}
      </ChartCard>

      {data && !error && (
        <>
          <ChartCard title={`Stale Stripe records — PRO users by last seen (${stale.length})`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-white/40">
                    <th className="py-2 pr-4 font-medium">Email</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Sub ID</th>
                    <th className="py-2 pr-4 text-right font-medium">Days inactive</th>
                    <th className="py-2 text-right font-medium">Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {stale.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-white/30">
                        No Stripe PRO users
                      </td>
                    </tr>
                  ) : (
                    stale.map((r, i) => {
                      const flagged = r.daysInactive != null && r.daysInactive > 14;
                      return (
                        <tr key={i} className="border-t border-white/5 text-white/75">
                          <td className="py-2 pr-4">{r.email}</td>
                          <td className="py-2 pr-4">{r.subscriptionStatus}</td>
                          <td className="py-2 pr-4 font-mono text-xs text-white/40">
                            {r.stripeSubscriptionId ?? "—"}
                          </td>
                          <td
                            className="py-2 pr-4 text-right tabular-nums"
                            style={flagged ? { color: "#F87171", fontWeight: 600 } : undefined}
                          >
                            {r.daysInactive ?? "—"}
                            {flagged ? " ⚠" : ""}
                          </td>
                          <td className="py-2 text-right tabular-nums text-white/50">
                            {r.lastSeenAt ? fmtDate(r.lastSeenAt) : "never"}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </ChartCard>

          <ChartCard title={`PAST_DUE recovery candidates (${pastDue.length})`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-white/40">
                    <th className="py-2 pr-4 font-medium">Email</th>
                    <th className="py-2 pr-4 font-medium">Source</th>
                    <th className="py-2 text-right font-medium">First failure</th>
                  </tr>
                </thead>
                <tbody>
                  {pastDue.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-white/30">
                        No PAST_DUE users 🎉
                      </td>
                    </tr>
                  ) : (
                    pastDue.map((r, i) => (
                      <tr key={i} className="border-t border-white/5 text-white/75">
                        <td className="py-2 pr-4">{r.email}</td>
                        <td className="py-2 pr-4">{r.subscriptionSource ?? "—"}</td>
                        <td className="py-2 text-right tabular-nums text-white/50">
                          {fmtDate(r.stripeFirstFailureAt)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </ChartCard>
        </>
      )}
    </div>
  );
}
