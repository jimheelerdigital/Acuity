"use client";

import { useEffect, useRef, useState } from "react";

import ChartCard from "../../components/ChartCard";
import { SkeletonTable } from "../../components/SkeletonCard";
import type { FailuresResponse, FailureRow, StuckUser } from "@/lib/mri/types";

interface Props {
  start: string;
  end: string;
}

// Group key collapses identical source+message rows so the same failure does
// not appear twice; the backend already groups by message but we re-key
// defensively so the expand state is stable across renders.
function rowKey(r: FailureRow): string {
  return `${r.source}::${r.message ?? "(none)"}`;
}

function sourceColor(source: FailureRow["source"]): string {
  switch (source) {
    case "Entry failure":
      return "text-acuity-bad";
    case "AI call failure":
      return "text-acuity-warn";
    case "Signup failure":
      return "text-purple-300";
    default:
      return "text-acuity-text-ter";
  }
}

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function FailureSurfacesSection({ start, end }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);
  const [data, setData] = useState<FailuresResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

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
    const url = `/api/admin/mri?section=failures&start=${encodeURIComponent(
      start,
    )}&end=${encodeURIComponent(end)}`;
    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        return (await res.json()) as FailuresResponse;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load failure surfaces",
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

  const surfaces: FailureRow[] = data?.surfaces ?? [];
  const stuckUsers: StuckUser[] = data?.stuckUsers ?? [];

  return (
    <div ref={containerRef}>
      <ChartCard title="Failure Surfaces">
        {loading && !data ? (
          <SkeletonTable />
        ) : error ? (
          <p className="text-sm text-acuity-bad">{error}</p>
        ) : (
          <div className="space-y-8">
            {/* ── Grouped failures table ───────────────────────────────── */}
            <div>
              {surfaces.length === 0 ? (
                <p className="text-sm text-acuity-text-ter">
                  No failures recorded in this range.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="text-left text-acuity-text-ter">
                        <th className="pb-3 pr-4 font-medium">Source</th>
                        <th className="pb-3 pr-4 font-medium">Message</th>
                        <th className="pb-3 pr-4 text-right font-medium">
                          Occurrences
                        </th>
                        <th className="pb-3 pr-4 text-right font-medium">Users</th>
                        <th className="pb-3 text-right font-medium">Last&nbsp;Seen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {surfaces.map((r) => {
                        const key = rowKey(r);
                        const isOpen = expanded === key;
                        const msg = r.message?.trim() || "(no message)";
                        return (
                          <>
                            <tr
                              key={key}
                              onClick={() =>
                                setExpanded(isOpen ? null : key)
                              }
                              className="cursor-pointer border-t border-acuity-line text-acuity-text-sec transition-colors hover:bg-acuity-bg-inset"
                            >
                              <td
                                className={`py-3 pr-4 font-medium ${sourceColor(
                                  r.source,
                                )}`}
                              >
                                {r.source}
                              </td>
                              <td className="max-w-[420px] py-3 pr-4">
                                <span className="flex items-center gap-2">
                                  <span className="text-acuity-text-ter">
                                    {isOpen ? "▾" : "▸"}
                                  </span>
                                  <span
                                    className={
                                      isOpen
                                        ? "text-acuity-text"
                                        : "truncate text-acuity-text-sec"
                                    }
                                    title={msg}
                                  >
                                    {msg}
                                  </span>
                                </span>
                              </td>
                              <td className="py-3 pr-4 text-right font-semibold tabular-nums text-acuity-text">
                                {r.occurrences}
                              </td>
                              <td className="py-3 pr-4 text-right tabular-nums text-acuity-text-ter">
                                {r.usersAffected}
                              </td>
                              <td className="py-3 text-right tabular-nums text-acuity-text-ter">
                                {formatWhen(r.lastSeen)}
                              </td>
                            </tr>
                            {isOpen && (
                              <tr
                                key={`${key}::detail`}
                                className="border-t border-acuity-line"
                              >
                                <td colSpan={5} className="px-4 py-4">
                                  <div className="rounded-lg bg-acuity-bg p-4">
                                    <div className="mb-2 text-xs uppercase tracking-wide text-acuity-text-ter">
                                      Full message
                                    </div>
                                    <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-acuity-text-sec">
                                      {msg}
                                    </pre>
                                    <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-acuity-text-ter">
                                      <span>
                                        Source:{" "}
                                        <span className="text-acuity-text-sec">
                                          {r.source}
                                        </span>
                                      </span>
                                      <span>
                                        Occurrences:{" "}
                                        <span className="text-acuity-text-sec">
                                          {r.occurrences}
                                        </span>
                                      </span>
                                      <span>
                                        Users affected:{" "}
                                        <span className="text-acuity-text-sec">
                                          {r.usersAffected}
                                        </span>
                                      </span>
                                      <span>
                                        Last seen:{" "}
                                        <span className="text-acuity-text-sec">
                                          {formatWhen(r.lastSeen)}
                                        </span>
                                      </span>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── Stuck users sub-list ─────────────────────────────────── */}
            <div>
              <h4 className="mb-3 text-sm font-medium text-acuity-text-ter">
                Stuck users
                <span className="ml-2 text-xs font-normal text-acuity-text-quiet">
                  signed up &gt;7d ago · hit an error · never converted, never
                  recorded again
                </span>
              </h4>
              {stuckUsers.length === 0 ? (
                <p className="text-sm text-acuity-text-ter">No stuck users right now.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="text-left text-acuity-text-ter">
                        <th className="pb-3 pr-4 font-medium">Email</th>
                        <th className="pb-3 pr-4 font-medium">Name</th>
                        <th className="pb-3 pr-4 font-medium">Signed&nbsp;Up</th>
                        <th className="pb-3 text-right font-medium">Errors</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stuckUsers.map((u) => (
                        <tr
                          key={u.id}
                          className="border-t border-acuity-line text-acuity-text-sec"
                        >
                          <td className="py-3 pr-4 font-medium text-acuity-text">
                            {u.email}
                          </td>
                          <td className="py-3 pr-4 text-acuity-text-ter">
                            {u.name?.trim() || "—"}
                          </td>
                          <td className="py-3 pr-4 tabular-nums text-acuity-text-ter">
                            {formatWhen(u.createdAt)}
                          </td>
                          <td className="py-3 text-right font-semibold tabular-nums text-acuity-bad">
                            {u.errorCount}
                          </td>
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
