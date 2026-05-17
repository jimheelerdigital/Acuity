"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Safe fbq wrapper — only fires if the pixel has loaded.
 * Uses window.fbq check to avoid issues with SSR and race conditions.
 */
function fireFbq(event: string, params?: Record<string, unknown>) {
  if (typeof window !== "undefined" && typeof window.fbq === "function") {
    console.log(`[meta-pixel] Firing ${event}`, params ?? "");
    window.fbq("track", event, params);
  }
}

export function TrackCompleteRegistration() {
  useEffect(() => {
    fireFbq("CompleteRegistration", { content_name: "Free Trial Signup", currency: "USD", value: 0 });
    fireFbq("StartTrial", { value: 0, currency: "USD" });
  }, []);

  return null;
}

export function TrackSubscribe() {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("upgraded") === "1") {
      const plan = searchParams.get("plan");
      const value = plan === "yearly" ? 99 : 12.99;
      fireFbq("Subscribe", { value, currency: "USD" });
    }
  }, [searchParams]);

  return null;
}

export function TrackViewContent({ contentName }: { contentName: string }) {
  useEffect(() => {
    fireFbq("ViewContent", { content_name: contentName });
  }, [contentName]);

  return null;
}
