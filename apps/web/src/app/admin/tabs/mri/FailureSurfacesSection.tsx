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
      return "text-red-400";
    case "AI call failure":
      return "text-amber-400";
    case "Signup failure":
      return "text-purple-300";
    default:
      return "text-white/60";
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
          <p className="text-sm text-red-400">{error}</p>
        ) : (
          <div className="space-y-8">
            {/* ── Grouped failures table ───────────────────────────────── */}
            <div>
              {surfaces.length === 0 ? (
                <p className="text-sm text-white/40">
                  No failures recorded in this range.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="text-left text-white/40">
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
                              className="cursor-pointer border-t border-white/5 text-white/80 transition-colors hover:bg-white/[0.03]"
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
                                  <span className="text-white/40">
                                    {isOpen ? "▾" : "▸"}
                                  </span>
                                  <span
                                    className={
                                      isOpen
                                        ? "text-white/90"
                                        : "truncate text-white/70"
                                    }
                                    title={msg}
                                  >
                                    {msg}
                                  </span>
                                </span>
                              </td>
                              <td className="py-3 pr-4 text-right font-semibold tabular-nums text-white">
                                {r.occurrences}
                              </td>
                              <td className="py-3 pr-4 text-right tabular-nums text-white/60">
                                {r.usersAffected}
                              </td>
                              <td className="py-3 text-right tabular-nums text-white/50">
                                {formatWhen(r.lastSeen)}
                              </td>
                            </tr>
                            {isOpen && (
                              <tr
                                key={`${key}::detail`}
                                className="border-t border-white/5"
                              >
                                <td colSpan={5} className="px-4 py-4">
                                  <div className="rounded-lg bg-[#0A0A0F] p-4">
                                    <div className="mb-2 text-xs uppercase tracking-wide text-white/40">
                                      Full message
                                    </div>
                                    <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-white/80">
                                      {msg}
                                    </pre>
                                    <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-white/40">
                                      <span>
                                        Source:{" "}
                                        <span className="text-white/70">
                                          {r.source}
                                        </span>
                                      </span>
                                      <span>
                                        Occurrences:{" "}
                                        <span className="text-white/70">
                                          {r.occurrences}
                                        </span>
                                      </span>
                                      <span>
                                        Users affected:{" "}
                                        <span className="text-white/70">
                                          {r.usersAffected}
                                        </span>
                                      </span>
                                      <span>
                                        Last seen:{" "}
                                        <span className="text-white/70">
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
              <h4 className="mb-3 text-sm font-medium text-white/60">
                Stuck users
                <span className="ml-2 text-xs font-normal text-white/30">
                  signed up &gt;7d ago · hit an error · never converted, never
                  recorded again
                </span>
              </h4>
              {stuckUsers.length === 0 ? (
                <p className="text-sm text-white/40">No stuck users right now.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="text-left text-white/40">
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
                          className="border-t border-white/5 text-white/80"
                        >
                          <td className="py-3 pr-4 font-medium text-white">
                            {u.email}
                          </td>
                          <td className="py-3 pr-4 text-white/60">
                            {u.name?.trim() || "—"}
                          </td>
                          <td className="py-3 pr-4 tabular-nums text-white/50">
                            {formatWhen(u.createdAt)}
                          </td>
                          <td className="py-3 text-right font-semibold tabular-nums text-red-400">
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
