"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { runWebTour } from "@/lib/web-tour";

/**
 * Drives the web product tour. Mounted on /home (inside the authenticated
 * shell). Two trigger paths, mirroring mobile:
 *
 *   - AUTO-FIRE: first /home visit when User.tourCompletedAt is null
 *     (onboarding completion is already guaranteed — /home redirects to
 *     /onboarding otherwise). A per-session flag prevents re-firing on
 *     in-session navigation back to /home before the server value catches
 *     up.
 *   - REPLAY: `?replayTour=1` (set by the Settings "Replay product tour"
 *     link) fires regardless of tourCompletedAt, then clears the param.
 *
 * On end, POSTs /api/user/tour-complete (the same endpoint mobile uses) —
 * idempotent: first completion of EITHER platform stamps tourCompletedAt
 * and grants guided_start in one transaction; the second is a no-op.
 */

const SESSION_FLAG = "acuity.webtour.fired";

export function WebTourController({
  tourCompletedAt,
}: {
  tourCompletedAt: string | null;
}) {
  const router = useRouter();
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;

    const replay =
      new URLSearchParams(window.location.search).get("replayTour") === "1";
    let alreadyFiredThisSession = false;
    try {
      alreadyFiredThisSession = sessionStorage.getItem(SESSION_FLAG) === "1";
    } catch {
      /* sessionStorage unavailable — treat as not fired */
    }
    const shouldAutoFire = !tourCompletedAt && !alreadyFiredThisSession;
    if (!replay && !shouldAutoFire) return;

    firedRef.current = true;

    // Let the shell + nav settle (layout/measure) before driver.js reads
    // anchor rects — same rationale as the mobile NAV_SETTLE delay.
    const timer = window.setTimeout(() => {
      try {
        sessionStorage.setItem(SESSION_FLAG, "1");
      } catch {
        /* non-fatal */
      }
      const ran = runWebTour({
        onEnd: (completed) => {
          void fetch("/api/user/tour-complete", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ completed }),
          }).catch(() => {
            /* idempotent server-side; a failed post just means the next
               session may re-fire until tourCompletedAt is stamped */
          });
          if (replay) router.replace("/home");
        },
      });
      // No anchors resolved (shouldn't happen on /home) — clear the replay
      // param so a refresh doesn't strand the user mid-trigger.
      if (!ran && replay) router.replace("/home");
    }, 600);

    return () => window.clearTimeout(timer);
  }, [tourCompletedAt, router]);

  return null;
}
