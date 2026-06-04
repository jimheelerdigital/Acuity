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

/**
 * Fire a Meta pixel event with optional event_id for CAPI deduplication.
 * When eventId is provided, Meta will deduplicate this browser event
 * against the matching server-side CAPI event.
 */
export function fireFbq(event: string, params?: Record<string, unknown>, eventId?: string) {
  if (typeof window !== "undefined" && typeof window.fbq === "function") {
    // Enrich pixel events with UTM attribution from the funnel session
    const utm = getStoredUtm();
    const enriched = {
      ...params,
      ...(utm.utmCampaign ? { content_name: utm.utmCampaign } : {}),
      ...(utm.utmContent ? { content_category: utm.utmContent } : {}),
    };
    console.log(`[meta-pixel] Firing ${event}`, enriched, eventId ? `(event_id: ${eventId})` : "");
    if (eventId) {
      window.fbq("track", event, enriched, { eventID: eventId });
    } else {
      window.fbq("track", event, enriched);
    }
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
 * Fires CompleteRegistration + StartTrial for genuinely new signups.
 *
 * Flow:
 *   1. POSTs to /api/capi/complete-registration — fires CAPI with full
 *      request context (IP, UA, cookies) and returns an event_id.
 *   2. Fires the browser pixel with the same event_id for dedup.
 *   3. Sets a sessionStorage guard so it never double-fires.
 *
 * The CAPI endpoint rejects users created >5 min ago, so this is safe
 * against page refreshes and direct-URL visits.
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

    // Fire CAPI first (has its own 5-min guard), then browser pixel with
    // the returned eventId for deduplication.
    fetch("/api/capi/complete-registration", { method: "POST" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.eventId) {
          console.log("[meta-pixel] CAPI returned no eventId (not a new signup or error), skipping browser pixel");
          return;
        }
        console.log(`[meta-pixel] CAPI CompleteRegistration fired, eventId=${data.eventId}`);
        fireFbq("CompleteRegistration", { content_name: "Free Trial Signup", currency: "USD", value: 0 }, data.eventId);
        fireFbq("StartTrial", { value: 4.99, currency: "USD", predicted_ltv: 39.99 });
        sessionStorage.setItem(key, "1");
      })
      .catch((err) => {
        console.error("[meta-pixel] CAPI complete-registration call failed:", err);
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
