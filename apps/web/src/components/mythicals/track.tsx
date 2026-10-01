"use client";

import { useEffect } from "react";

type BeaconType = "page_view" | "quiz_start" | "quiz_complete" | "result_view" | "share";

/** Fire-and-forget analytics beacon to /api/mythicals/event (storage JSON). */
export function beacon(type: BeaconType, data: Record<string, unknown> = {}): void {
  try {
    const body = JSON.stringify({ type, path: window.location.pathname, ref: document.referrer || undefined, ...data });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/mythicals/event", new Blob([body], { type: "application/json" }));
    } else {
      void fetch("/api/mythicals/event", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true });
    }
  } catch {
    // analytics never matters
  }
}

export function Track({ type, data }: { type: BeaconType; data?: Record<string, unknown> }) {
  useEffect(() => {
    beacon(type, data);
    // once per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
