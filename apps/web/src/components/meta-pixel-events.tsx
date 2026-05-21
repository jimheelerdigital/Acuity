"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";

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

/**
 * Only fires CompleteRegistration + StartTrial if the current session user
 * was created within the last 5 minutes. This prevents:
 *   1. Firing on repeat visits to the success page
 *   2. Firing for returning users who hit this page via direct URL
 *   3. Double-firing (OAuth buttons no longer fire these events)
 */
export function TrackCompleteRegistration() {
  const { status } = useSession();

  useEffect(() => {
    if (status !== "authenticated") return;

    // Deduplicate within this browser session
    const key = "acuity_reg_pixel_fired";
    if (typeof window !== "undefined" && sessionStorage.getItem(key)) {
      console.log("[meta-pixel] CompleteRegistration already fired this session, skipping");
      return;
    }

    // Check user createdAt to confirm this is a genuinely new signup
    fetch("/api/user/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.user?.createdAt) return;
        const createdAt = new Date(data.user.createdAt).getTime();
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
        if (createdAt >= fiveMinutesAgo) {
          fireFbq("CompleteRegistration", { content_name: "Free Trial Signup", currency: "USD", value: 0 });
          fireFbq("StartTrial", { value: 0, currency: "USD" });
          sessionStorage.setItem(key, "1");
        } else {
          console.log("[meta-pixel] User created >5min ago, skipping CompleteRegistration");
        }
      })
      .catch((err) => {
        console.error("[meta-pixel] Failed to verify new signup:", err);
      });
  }, [status]);

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
