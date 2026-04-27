"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { formatDollars } from "@/lib/pricing";

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  subscriptionStatus: string;
  signInMethod?: string;
  trialEndsAt?: string | null;
  stripeCurrentPeriodEnd?: string | null;
  inferredInterval?: "monthly" | "annual" | null;
  monthlyContributionCents?: number;
};

type AggregateColumn = {
  key: string;
  label: string;
  align?: "left" | "right";
};

type UsersPayload = {
  kind: "users";
  title: string;
  rows: UserRow[];
  meta: { count: number; metric: string };
};

type AggregatePayload = {
  kind: "aggregate";
  title: string;
  columns: AggregateColumn[];
  rows: Record<string, string | number>[];
  meta: {
    count: number;
    metric: string;
    summary?: Record<string, number | string>;
  };
};

type Payload = UsersPayload | AggregatePayload;

interface Props {
  metric: string;
  start: string;
  end: string;
  /** Display label shown to the user pre-fetch (e.g. the tile label). */
  fallbackTitle: string;
  onClose: () => void;
  /** Optional date label (e.g. "Apr 27, 2026") shown in the modal header. */
  periodLabel?: string;
  /** Extra query params for metric variants (day=YYYY-MM-DD, purpose=…). */
  params?: Record<string, string>;
}

/**
 * Generic admin metric drilldown. Fetches /api/admin/drilldown?metric=…
 * and renders either a user list (kind=users) or an aggregate table
 * (kind=aggregate) — both shapes share the same chrome (header, count,
 * close, ESC).
 *
 * Privacy: the API only ever returns metadata (email, name, plan,
 * timestamps, sign-in provider). Entry content / audio / themes /
 * goals / tasks / AI insights are filtered out at the source.
 *
 * Each open issues one fetch which writes one AdminAuditLog row
 * server-side. Closing + re-opening triggers another fetch (and
 * another audit row) — by design, so we have a record of every list
 * pull.
 */
export function DrilldownModal({
  metric,
  start,
  end,
  fallbackTitle,
  onClose,
  periodLabel,
  params,
}: Props) {
  const router = useRouter();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleSort = useCallback(
    (column: string) => {
      if (sortBy === column) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortBy(column);
        setSortDir("desc");
      }
    },
    [sortBy]
  );

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setData(null);

    (async () => {
      try {
        const qs = new URLSearchParams({ metric, start, end });
        if (params) {
          for (const [k, v] of Object.entries(params)) qs.set(k, v);
        }
        const url = `/api/admin/drilldown?${qs.toString()}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setError(`Failed (${res.status})`);
          return;
        }
        const json = (await res.json()) as Payload;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError("Failed to load");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [metric, start, end, params]);

  // ESC to close.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sortedUsers: UserRow[] = useMemo(() => {
    if (!data || data.kind !== "users") return [];
    if (!sortBy) return data.rows;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...data.rows].sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[sortBy];
      const bv = (b as unknown as Record<string, unknown>)[sortBy];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return 0;
    });
  }, [data, sortBy, sortDir]);

  const sortedAggregate = useMemo(() => {
    if (!data || data.kind !== "aggregate") return [];
    if (!sortBy) return data.rows;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...data.rows].sort((a, b) => {
      const av = a[sortBy];
      const bv = b[sortBy];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return 0;
    });
  }, [data, sortBy, sortDir]);

  const onUserRowClick = useCallback(
    (userId: string) => {
      onClose();
      // Deep-link into the Users tab; UsersTab opens the detail modal
      // when ?select=<id> is present.
      router.push(`/admin?tab=users&select=${userId}`);
    },
    [onClose, router]
  );

  const title = data?.title ?? fallbackTitle;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl rounded-xl bg-[#0A0A0F] text-white shadow-2xl ring-1 ring-white/10"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="mt-0.5 text-xs text-white/40">
              {periodLabel ? `${periodLabel} · ` : ""}
              {data ? `${data.meta.count} row${data.meta.count === 1 ? "" : "s"}` : "Loading…"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1 text-sm text-white/40 hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            Close (ESC)
          </button>
        </header>

        {error ? (
          <p className="px-6 py-12 text-center text-sm text-red-400">{error}</p>
        ) : !data ? (
          <p className="px-6 py-12 text-center text-sm text-white/40">Loading…</p>
        ) : data.rows.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-white/40">
            No matching rows in this period.
          </p>
        ) : data.kind === "users" ? (
          <UserTable
            rows={sortedUsers}
            metric={data.meta.metric}
            sortBy={sortBy}
            sortDir={sortDir}
            onSort={handleSort}
            onRowClick={onUserRowClick}
          />
        ) : (
          <AggregateTable
            columns={data.columns}
            rows={sortedAggregate}
            summary={data.meta.summary}
            sortBy={sortBy}
            sortDir={sortDir}
            onSort={handleSort}
          />
        )}
      </div>
    </div>
  );
}

function SortHeader({
  label,
  column,
  sortBy,
  sortDir,
  onSort,
  align,
}: {
  label: string;
  column: string;
  sortBy: string | null;
  sortDir: "asc" | "desc";
  onSort: (column: string) => void;
  align?: "left" | "right";
}) {
  const active = sortBy === column;
  return (
    <th
      className={`pb-2 pr-3 font-medium ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      <button
        onClick={() => onSort(column)}
        className={`hover:text-white ${active ? "text-white" : ""}`}
      >
        {label}
        {active ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );
}

function StatusPill({ status }: { status: string }) {
  const bg =
    status === "PRO"
      ? "bg-green-500/20 text-green-300"
      : status === "TRIAL"
      ? "bg-blue-500/20 text-blue-300"
      : status === "PAST_DUE"
      ? "bg-amber-500/20 text-amber-300"
      : "bg-white/5 text-white/40";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${bg}`}>
      {status}
    </span>
  );
}

function UserTable({
  rows,
  metric,
  sortBy,
  sortDir,
  onSort,
  onRowClick,
}: {
  rows: UserRow[];
  metric: string;
  sortBy: string | null;
  sortDir: "asc" | "desc";
  onSort: (column: string) => void;
  onRowClick: (userId: string) => void;
}) {
  const showSignInMethod = metric === "signups";
  const showInferredInterval = metric === "mrr_breakdown";
  const showPeriodEnd =
    metric === "paying_subs" ||
    metric === "mrr_breakdown" ||
    metric === "trial_to_paid";

  return (
    <div className="max-h-[70vh] overflow-y-auto">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-[#0A0A0F] text-xs uppercase tracking-wider text-white/40">
          <tr className="border-b border-white/10">
            <SortHeader
              label="Email"
              column="email"
              sortBy={sortBy}
              sortDir={sortDir}
              onSort={onSort}
            />
            <SortHeader
              label="Name"
              column="name"
              sortBy={sortBy}
              sortDir={sortDir}
              onSort={onSort}
            />
            <SortHeader
              label="Signup"
              column="createdAt"
              sortBy={sortBy}
              sortDir={sortDir}
              onSort={onSort}
            />
            {showSignInMethod && (
              <SortHeader
                label="Method"
                column="signInMethod"
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={onSort}
              />
            )}
            <SortHeader
              label="Status"
              column="subscriptionStatus"
              sortBy={sortBy}
              sortDir={sortDir}
              onSort={onSort}
            />
            {showInferredInterval && (
              <>
                <SortHeader
                  label="Plan"
                  column="inferredInterval"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={onSort}
                  align="right"
                />
                <SortHeader
                  label="MRR contrib"
                  column="monthlyContributionCents"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={onSort}
                  align="right"
                />
              </>
            )}
            {showPeriodEnd && (
              <SortHeader
                label="Period end"
                column="stripeCurrentPeriodEnd"
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={onSort}
              />
            )}
            <th className="pb-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr
              key={u.id}
              className="cursor-pointer border-b border-white/5 hover:bg-white/5"
              onClick={() => onRowClick(u.id)}
            >
              <td className="px-3 py-2.5">{u.email}</td>
              <td className="px-3 py-2.5 text-white/70">{u.name ?? "—"}</td>
              <td className="px-3 py-2.5 whitespace-nowrap text-xs text-white/60">
                {new Date(u.createdAt).toLocaleString()}
              </td>
              {showSignInMethod && (
                <td className="px-3 py-2.5 text-xs text-white/60 capitalize">
                  {u.signInMethod ?? "—"}
                </td>
              )}
              <td className="px-3 py-2.5">
                <StatusPill status={u.subscriptionStatus} />
              </td>
              {showInferredInterval && (
                <>
                  <td className="px-3 py-2.5 text-right text-xs text-white/70 capitalize">
                    {u.inferredInterval ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs tabular-nums">
                    {u.monthlyContributionCents != null
                      ? formatDollars(u.monthlyContributionCents)
                      : "—"}
                  </td>
                </>
              )}
              {showPeriodEnd && (
                <td className="px-3 py-2.5 whitespace-nowrap text-xs text-white/60">
                  {u.stripeCurrentPeriodEnd
                    ? new Date(u.stripeCurrentPeriodEnd).toLocaleDateString()
                    : "—"}
                </td>
              )}
              <td className="px-3 py-2.5 text-right">
                <span className="text-xs text-[#A78BFA]">view →</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AggregateTable({
  columns,
  rows,
  summary,
  sortBy,
  sortDir,
  onSort,
}: {
  columns: AggregateColumn[];
  rows: Record<string, string | number>[];
  summary?: Record<string, number | string>;
  sortBy: string | null;
  sortDir: "asc" | "desc";
  onSort: (column: string) => void;
}) {
  return (
    <div className="max-h-[70vh] overflow-y-auto">
      {summary && (
        <div className="border-b border-white/10 px-6 py-3 text-xs text-white/60">
          {Object.entries(summary).map(([k, v]) => (
            <span key={k} className="mr-4">
              <span className="text-white/40">{k}:</span>{" "}
              <span className="text-white/80">
                {k.toLowerCase().includes("cents") && typeof v === "number"
                  ? formatDollars(v)
                  : v}
              </span>
            </span>
          ))}
        </div>
      )}
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-[#0A0A0F] text-xs uppercase tracking-wider text-white/40">
          <tr className="border-b border-white/10">
            {columns.map((c) => (
              <SortHeader
                key={c.key}
                label={c.label}
                column={c.key}
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={onSort}
                align={c.align}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-white/5 hover:bg-white/5">
              {columns.map((c) => {
                const val = r[c.key];
                const display =
                  c.key.toLowerCase().includes("cents") && typeof val === "number"
                    ? formatDollars(val)
                    : val;
                return (
                  <td
                    key={c.key}
                    className={`px-3 py-2.5 ${
                      c.align === "right" ? "text-right tabular-nums" : ""
                    }`}
                  >
                    {display}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
