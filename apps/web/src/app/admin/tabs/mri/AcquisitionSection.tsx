"use client";

import { useEffect, useRef, useState } from "react";

import ChartCard from "../../components/ChartCard";
import { SkeletonTable } from "../../components/SkeletonCard";
import type { AcquisitionResponse } from "@/lib/mri/types";

interface Props {
  start: string;
  end: string;
}

/** Single source × platform acquisition row, derived from the response type. */
type AcquisitionRow = AcquisitionResponse["platformAcquisition"][number];

/** Activation% color thresholds: <15% red, 15–35% amber, ≥35% green. */
function activationColor(pct: number): string {
  if (pct < 15) return "#F87171"; // red
  if (pct < 35) return "#FBBF24"; // amber
  return "#4ADE80"; // green
}

export default function AcquisitionSection({ start, end }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [data, setData] = useState<AcquisitionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lazy gate: only mark visible once the section scrolls into view.
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

  // Fetch once visible (and whenever the range changes while visible).
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const url = `/api/admin/mri?section=acquisition&start=${encodeURIComponent(
      start,
    )}&end=${encodeURIComponent(end)}`;
    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error || `Request failed (${res.status})`);
        }
        return (await res.json()) as AcquisitionResponse;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load acquisition data");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, start, end]);

  const rows: AcquisitionRow[] = data?.platformAcquisition ?? [];

  return (
    <div ref={containerRef}>
      <ChartCard title="Acquisition (source × platform)">
        {loading || (!data && !error) ? (
          <SkeletonTable />
        ) : error ? (
          <p className="text-sm" style={{ color: "#F87171" }}>
            {error}
          </p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-white/40">No acquisition data for this range.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr className="text-white/50" style={{ textAlign: "left" }}>
                  <th style={{ padding: "8px 12px", fontWeight: 500 }}>Source</th>
                  <th style={{ padding: "8px 12px", fontWeight: 500 }}>Platform</th>
                  <th style={{ padding: "8px 12px", fontWeight: 500, textAlign: "right" }}>
                    Signups
                  </th>
                  <th style={{ padding: "8px 12px", fontWeight: 500, textAlign: "right" }}>
                    Activated
                  </th>
                  <th style={{ padding: "8px 12px", fontWeight: 500, textAlign: "right" }}>
                    Activation %
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: AcquisitionRow, i: number) => {
                  // null devicePlatform is already coalesced to "web" server-side,
                  // but guard here too in case of any falsy platform value.
                  const platform = r.platform || "web";
                  const color = activationColor(r.activationPct);
                  return (
                    <tr
                      key={`${r.source}-${platform}-${i}`}
                      style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
                    >
                      <td className="text-white/80" style={{ padding: "10px 12px" }}>
                        {r.source}
                      </td>
                      <td className="text-white/60" style={{ padding: "10px 12px" }}>
                        {platform}
                      </td>
                      <td
                        className="text-white/80"
                        style={{ padding: "10px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                      >
                        {r.signups.toLocaleString()}
                      </td>
                      <td
                        className="text-white/80"
                        style={{ padding: "10px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                      >
                        {r.activated.toLocaleString()}
                      </td>
                      <td
                        style={{
                          padding: "10px 12px",
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                          fontWeight: 600,
                          color,
                        }}
                      >
                        {r.activationPct.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>
    </div>
  );
}
