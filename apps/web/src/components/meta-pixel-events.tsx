"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";

/**
 * Safe fbq wrapper — only fires if the pixel has loaded.
 * Uses window.fbq check to avoid issues with SSR and race conditions.
 */
function getStoredUtm(): Record<string, string> {
  try {
    const stored = sessionStorage.getItem("acuity_funnel_utm");
    if (stored) return JSON.parse(stored);
  } catch {}
  return {};
}

function fireFbq(event: string, params?: Record<string, unknown>) {
  if (typeof window !== "undefined" && typeof window.fbq === "function") {
    // Enrich pixel events with UTM attribution from the funnel session
    const utm = getStoredUtm();
    const enriched = {
      ...params,
      ...(utm.utmCampaign ? { content_name: utm.utmCampaign } : {}),
      ...(utm.utmContent ? { content_category: utm.utmContent } : {}),
    };
    console.log(`[meta-pixel] Firing ${event}`, enriched);
    window.fbq("track", event, enriched);
  }
}

/**
 * Re-initializes the Meta Pixel with Advanced Matching parameters when
 * a user session is available. This passes hashed email/name to Meta for
 * better ad attribution. Safe to call after the initial anonymous init —
 * fbq merges the user data for all subsequent events.
 *
 * Render this once in the root layout (inside Providers).
 */
export function MetaPixelAdvancedMatching() {
  const { data: session } = useSession();

  useEffect(() => {
    if (!session?.user?.email) return;
    if (typeof window === "undefined" || typeof window.fbq !== "function") return;

    const userData: Record<string, string> = {};
    userData.em = session.user.email.toLowerCase().trim();

    if (session.user.name) {
      const parts = session.user.name.trim().split(/\s+/);
      if (parts[0]) userData.fn = parts[0].toLowerCase();
      if (parts.length > 1) userData.ln = parts[parts.length - 1].toLowerCase();
    }

    console.log("[meta-pixel] Advanced matching — reinit with user data");
    window.fbq("init", "869829585445303", userData);
  }, [session]);

  return null;
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
          fireFbq("StartTrial", { value: 4.99, currency: "USD", predicted_ltv: 39.99 });
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
      const value = plan === "yearly" ? 39.99 : 4.99;
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
