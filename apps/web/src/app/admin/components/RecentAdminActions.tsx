"use client";

import { useEffect, useState } from "react";

type Action = {
  id: string;
  action: string;
  adminUserId: string;
  adminEmail: string | null;
  targetUserId: string | null;
  targetEmail: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

const ACTION_LABELS: Record<string, string> = {
  "feature_flag.toggle": "Toggled flag",
  "feature_flag.rollout": "Changed rollout %",
  "feature_flag.tier": "Changed required tier",
  "feature_override.upsert": "Set user override",
  "feature_override.delete": "Removed user override",
  "user.soft_delete": "Deleted user account",
  "user.extend_trial": "Extended trial",
  "user.send_magic_link": "Sent password reset",
};

export default function RecentAdminActions() {
  const [rows, setRows] = useState<Action[] | null>(null);

  useEffect(() => {
    fetch("/api/admin/audit?limit=20", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => (Array.isArray(d.actions) ? setRows(d.actions) : setRows([])))
      .catch(() => setRows([]));
  }, []);

  return (
    <div className="rounded-xl bg-[#13131F]" style={{ padding: 22 }}>
      <h3
        className="mb-4 text-white/75"
        style={{ fontSize: 16, fontWeight: 500 }}
      >
        Recent admin actions
      </h3>
      {rows === null ? (
        <p className="text-white/55" style={{ fontSize: 13 }}>
          Loading…
        </p>
      ) : rows.length === 0 ? (
        <p className="text-white/55" style={{ fontSize: 13 }}>
          No admin actions yet.
        </p>
      ) : (
        <ul
          className="divide-y divide-white/5"
          style={{ fontSize: 14 }}
        >
          {rows.map((r) => (
            <li key={r.id} className="flex items-baseline justify-between gap-3 py-3">
              <div className="min-w-0">
                <span className="font-medium text-white/85">
                  {ACTION_LABELS[r.action] ?? r.action}
                </span>{" "}
                <ActionDetail row={r} />
              </div>
              <div
                className="shrink-0 text-right text-white/55"
                style={{ fontSize: 12 }}
              >
                <div>
                  {r.adminEmail ?? (
                    <span className="font-mono">{r.adminUserId.slice(0, 6)}</span>
                  )}
                </div>
                <div>{new Date(r.createdAt).toLocaleString()}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ActionDetail({ row }: { row: Action }) {
  const m = (row.metadata ?? {}) as Record<string, unknown>;
  const target = row.targetEmail ?? row.targetUserId;
  const flagKey = typeof m.flagKey === "string" ? m.flagKey : null;

  if (row.action === "feature_flag.toggle" && flagKey) {
    const after = (m.after as Record<string, unknown>)?.enabled;
    return (
      <span className="text-white/65" style={{ fontSize: 13 }}>
        <span className="font-mono">{flagKey}</span> →{" "}
        {after ? "ON" : "OFF"}
      </span>
    );
  }
  if (row.action === "feature_flag.rollout" && flagKey) {
    const pct = (m.after as Record<string, unknown>)?.rolloutPercentage;
    return (
      <span className="text-white/65" style={{ fontSize: 13 }}>
        <span className="font-mono">{flagKey}</span> → {String(pct)}%
      </span>
    );
  }
  if (row.action === "feature_flag.tier" && flagKey) {
    const tier = (m.after as Record<string, unknown>)?.requiredTier;
    return (
      <span className="text-white/65" style={{ fontSize: 13 }}>
        <span className="font-mono">{flagKey}</span> → tier{" "}
        {tier ? String(tier) : "any"}
      </span>
    );
  }
  if (row.action === "feature_override.upsert" && flagKey) {
    return (
      <span className="text-white/65" style={{ fontSize: 13 }}>
        <span className="font-mono">{flagKey}</span> on {target ?? "user"} →{" "}
        {m.enabled ? "ON" : "OFF"}
      </span>
    );
  }
  if (row.action === "feature_override.delete" && flagKey) {
    return (
      <span className="text-white/65" style={{ fontSize: 13 }}>
        <span className="font-mono">{flagKey}</span> on {target ?? "user"}
      </span>
    );
  }
  if (row.action === "user.extend_trial") {
    return (
      <span className="text-white/65" style={{ fontSize: 13 }}>
        {target} by {String(m.days ?? "?")} days — {String(m.reason ?? "")}
      </span>
    );
  }
  if (row.action === "user.send_magic_link") {
    return <span className="text-xs text-white/50">to {target}</span>;
  }
  if (row.action === "user.soft_delete") {
    return (
      <span className="text-white/65" style={{ fontSize: 13 }}>
        hashed email{" "}
        <span className="font-mono">{String(m.emailHash ?? "")}</span>
      </span>
    );
  }
  return null;
}
