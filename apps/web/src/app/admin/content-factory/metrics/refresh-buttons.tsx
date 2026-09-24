"use client";

import { useState } from "react";

/** Fires the metrics refresh (IG/FB + TikTok latest, or TikTok full history). */
export function RefreshButtons() {
  const [state, setState] = useState<string | null>(null);

  async function run(full: boolean) {
    setState("Starting…");
    const res = await fetch(`/api/admin/content-factory/metrics-refresh${full ? "?full=1" : ""}`, { method: "POST" });
    setState(res.ok ? "Running — reload in ~5 minutes" : "Failed to start");
  }

  return (
    <div className="flex items-center gap-2">
      {state && <span className="text-xs text-acuity-text-ter">{state}</span>}
      <button
        onClick={() => run(false)}
        className="px-3 py-1.5 rounded text-sm font-medium bg-acuity-bg-inset hover:bg-acuity-card-bg transition"
      >
        Refresh now
      </button>
      <button
        onClick={() => run(true)}
        className="px-3 py-1.5 rounded text-sm font-medium bg-acuity-bg-inset hover:bg-acuity-card-bg transition"
      >
        Refresh incl. full TikTok history
      </button>
    </div>
  );
}
