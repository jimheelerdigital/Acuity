"use client";

import { useState } from "react";
import { SkeletonTable } from "../components/SkeletonCard";
import { useTabData } from "./useTabData";

interface RedFlagsData {
  flags: {
    id: string;
    severity: "CRITICAL" | "WARNING" | "INFO";
    category: string;
    title: string;
    description: string;
    affectedUserIds: string[];
    createdAt: string;
  }[];
}

const SEVERITY_STYLES: Record<
  string,
  { border: string; bg: string; text: string; badge: string }
> = {
  CRITICAL: {
    border: "border-red-500/30",
    bg: "bg-red-900/10",
    text: "text-red-300",
    badge: "bg-red-500/20 text-red-400",
  },
  WARNING: {
    border: "border-amber-500/30",
    bg: "bg-amber-900/10",
    text: "text-amber-300",
    badge: "bg-amber-500/20 text-amber-400",
  },
  INFO: {
    border: "border-blue-500/30",
    bg: "bg-blue-900/10",
    text: "text-blue-300",
    badge: "bg-blue-500/20 text-blue-400",
  },
};

export default function RedFlagsTab({
  start,
  end,
}: {
  start: string;
  end: string;
}) {
  const { data, loading } = useTabData<RedFlagsData>("red-flags", start, end);
  const [resolving, setResolving] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const handleResolve = async (flagId: string, action: string) => {
    setResolving(flagId);
    try {
      await fetch("/api/admin/red-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flagId, action }),
      });
      setDismissed((prev) => new Set(prev).add(flagId));
    } finally {
      setResolving(null);
    }
  };

  if (loading || !data) {
    return <SkeletonTable />;
  }

  const visible = data.flags.filter((f) => !dismissed.has(f.id));
  const grouped = {
    CRITICAL: visible.filter((f) => f.severity === "CRITICAL"),
    WARNING: visible.filter((f) => f.severity === "WARNING"),
    INFO: visible.filter((f) => f.severity === "INFO"),
  };

  if (visible.length === 0) {
    return (
      <div className="rounded-xl bg-[#13131F] p-12 text-center">
        <p className="text-lg font-medium text-green-400">All clear</p>
        <p className="mt-1 text-sm text-white/40">
          No active red flags. System is healthy.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {(["CRITICAL", "WARNING", "INFO"] as const).map((severity) => {
        const flags = grouped[severity];
        if (flags.length === 0) return null;
        const style = SEVERITY_STYLES[severity];
        return (
          <div key={severity}>
            <h3 className={`mb-3 text-sm font-semibold ${style.text}`}>
              {severity} ({flags.length})
            </h3>
            <div className="space-y-2">
              {flags.map((f) => (
                <div
                  key={f.id}
                  className={`rounded-lg border ${style.border} ${style.bg} px-5 py-4`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${style.badge}`}
                        >
                          {f.category}
                        </span>
                        <span className="text-xs text-white/30">
                          {new Date(f.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className={`mt-1 text-sm font-medium ${style.text}`}>
                        {f.title}
                      </p>
                      <p className="mt-0.5 text-xs text-white/40">
                        {f.description}
                      </p>
                      {f.affectedUserIds.length > 0 && (
                        <p className="mt-1 text-[10px] text-white/25">
                          Affected: {f.affectedUserIds.length} user(s)
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => handleResolve(f.id, "resolve")}
                        disabled={resolving === f.id}
                        className="rounded-md bg-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/20 disabled:opacity-50"
                      >
                        Resolve
                      </button>
                      <button
                        onClick={() => handleResolve(f.id, "dismiss")}
                        disabled={resolving === f.id}
                        className="rounded-md bg-white/5 px-3 py-1.5 text-xs text-white/40 hover:bg-white/10 disabled:opacity-50"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
