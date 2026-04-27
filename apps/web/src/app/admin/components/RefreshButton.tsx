"use client";

import { useEffect, useState } from "react";

interface Props {
  computedAt: number | null;
  onRefresh: () => void;
  loading?: boolean;
}

function timeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export default function RefreshButton({ computedAt, onRefresh, loading }: Props) {
  const [, setTick] = useState(0);

  // Update "X ago" text every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <button
      onClick={onRefresh}
      disabled={loading}
      className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-white/55 transition hover:bg-white/10 hover:text-white/80 disabled:opacity-50"
      style={{ fontSize: 12 }}
      title="Refresh data (invalidates cache)"
    >
      <svg
        className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        />
      </svg>
      {computedAt ? (
        <span>Updated {timeAgo(computedAt)}</span>
      ) : (
        <span>Refresh</span>
      )}
    </button>
  );
}
