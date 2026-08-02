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
        className="w-full max-w-4xl rounded-acuity-xl border border-acuity-card-border bg-acuity-card-bg text-acuity-text shadow-acuity-lift"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="flex items-start justify-between gap-4 border-b border-acuity-line px-6 py-5">
          <div>
            <h2
              className="font-display font-bold"
              style={{ fontSize: 22, letterSpacing: "-0.6px" }}
            >
              {title}
            </h2>
            <p className="mt-1 font-mono text-[11px] font-bold uppercase tracking-[1.4px] text-acuity-text-ter">
              {periodLabel ? `${periodLabel.toUpperCase()} · ` : ""}
              {data
                ? `${data.meta.count} ROW${data.meta.count === 1 ? "" : "S"}`
                : "LOADING…"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-acuity-pill text-acuity-text-ter hover:bg-acuity-bg-sub hover:text-acuity-text"
            style={{ fontSize: 14 }}
            aria-label="Close"
            title="Close (ESC)"
          >
            ✕
          </button>
        </header>

        {error ? (
          <p className="px-6 py-12 text-center text-sm text-acuity-bad">{error}</p>
        ) : !data ? (
          <p className="px-6 py-12 text-center text-sm text-acuity-text-ter">Loading…</p>
        ) : data.rows.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-acuity-text-ter">
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
        className={`hover:text-acuity-text ${active ? "text-acuity-primary" : ""}`}
      >
        {label}
        {active ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );
}

function StatusPill({ status }: { status: string }) {
  // Mirrors SubscriptionPill conventions (DESIGN_SYSTEM §5.3): PRO is
  // focal (gradMix), TRIAL reads positive (good), everything else quiet.
  if (status === "PRO") {
    return (
      <span className="rounded-acuity-pill bg-acuity-grad-mix px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[1px] text-acuity-text">
        {status}
      </span>
    );
  }
  const cls =
    status === "TRIAL"
      ? "bg-acuity-good-soft text-acuity-good"
      : status === "PAST_DUE"
      ? "text-acuity-warn"
      : "bg-acuity-bg-sub text-acuity-text-ter border border-acuity-line";
  return (
    <span
      className={`rounded-acuity-pill px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[1px] ${cls}`}
      style={
        status === "PAST_DUE"
          ? {
              background:
                "color-mix(in srgb, var(--acuity-warn) 15%, transparent)",
            }
          : undefined
      }
    >
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
      <table
        className="w-full text-left"
        style={{ fontSize: 14 }}
      >
        <thead
          className="sticky top-0 bg-acuity-card-bg uppercase tracking-wider text-acuity-text-ter"
          style={{ fontSize: 13, fontWeight: 500 }}
        >
          <tr className="border-b border-acuity-line-strong">
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
              className="cursor-pointer border-b border-acuity-line hover:bg-acuity-bg-sub"
              onClick={() => onRowClick(u.id)}
            >
              <td className="px-3 py-2.5">{u.email}</td>
              <td className="px-3 py-2.5 text-acuity-text-sec">{u.name ?? "—"}</td>
              <td className="px-3 py-2.5 whitespace-nowrap text-xs text-acuity-text-ter">
                {new Date(u.createdAt).toLocaleString()}
              </td>
              {showSignInMethod && (
                <td className="px-3 py-2.5 text-xs text-acuity-text-ter capitalize">
                  {u.signInMethod ?? "—"}
                </td>
              )}
              <td className="px-3 py-2.5">
                <StatusPill status={u.subscriptionStatus} />
              </td>
              {showInferredInterval && (
                <>
                  <td className="px-3 py-2.5 text-right text-xs text-acuity-text-sec capitalize">
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
                <td className="px-3 py-2.5 whitespace-nowrap text-xs text-acuity-text-ter">
                  {u.stripeCurrentPeriodEnd
                    ? new Date(u.stripeCurrentPeriodEnd).toLocaleDateString()
                    : "—"}
                </td>
              )}
              <td className="px-3 py-2.5 text-right">
                <span className="text-xs text-acuity-primary">view →</span>
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
        <div
          className="border-b border-acuity-line px-6 py-4 text-acuity-text-sec"
          style={{ fontSize: 13 }}
        >
          {Object.entries(summary).map(([k, v]) => (
            <span key={k} className="mr-5">
              <span className="text-acuity-text-ter">{k}:</span>{" "}
              <span className="text-acuity-text">
                {k.toLowerCase().includes("cents") && typeof v === "number"
                  ? formatDollars(v)
                  : v}
              </span>
            </span>
          ))}
        </div>
      )}
      <table className="w-full text-left" style={{ fontSize: 14 }}>
        <thead
          className="sticky top-0 bg-acuity-card-bg uppercase tracking-wider text-acuity-text-ter"
          style={{ fontSize: 13, fontWeight: 500 }}
        >
          <tr className="border-b border-acuity-line-strong">
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
            <tr key={i} className="border-b border-acuity-line hover:bg-acuity-bg-sub">
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
