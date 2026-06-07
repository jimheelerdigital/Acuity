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

    // POLL until the shell is actually mounted before firing. On a fresh
    // signup, AppShell bypasses to a no-sidebar view while useSession() is
    // still "loading", so the Record/nav anchors don't exist yet. A single
    // fixed delay raced that and fired into an empty DOM (0 anchors). We
    // wait for a VISIBLE record anchor (sidebar on desktop / #record on
    // mobile) — its presence means the authenticated shell has rendered —
    // and only mark the tour "fired" once it actually starts, so a missed
    // attempt retries on the next load instead of being silently consumed.
    let cancelled = false;
    let timer: number;
    let attempts = 0;
    const MAX_ATTEMPTS = 20; // ~6s at 300ms

    const shellReady = () =>
      Array.from(
        document.querySelectorAll<HTMLElement>('[data-tour="record"]')
      ).some((el) => el.offsetParent !== null);

    const tryFire = () => {
      if (cancelled) return;
      if (!shellReady() && attempts < MAX_ATTEMPTS) {
        attempts += 1;
        timer = window.setTimeout(tryFire, 300);
        return;
      }
      const ran = runWebTour({
        navigate: (path) => router.push(path),
        onEnd: (completed) => {
          void fetch("/api/user/tour-complete", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ completed }),
          })
            .then(() => {
              // On genuine completion the server granted guided_start
              // (shownToUser:false). Nudge the global celebration queue to
              // re-poll so the modal fires now (it otherwise only polls on
              // mount/focus). Mirrors the mobile bus ping.
              if (completed) {
                window.dispatchEvent(new Event("acuity:achievement-check"));
              }
            })
            .catch(() => {
              /* idempotent server-side; a failed post just means the next
                 session may re-fire until tourCompletedAt is stamped */
            });
          // runWebTour already navigates back to /home on end (which drops
          // the ?replayTour param), so no extra cleanup needed here.
        },
      });
      if (ran) {
        // Mark fired ONLY on a successful start, so a failed attempt
        // (anchors never appeared) can retry on a later load.
        try {
          sessionStorage.setItem(SESSION_FLAG, "1");
        } catch {
          /* non-fatal */
        }
      } else {
        firedRef.current = false;
        if (replay) router.replace("/home");
      }
    };

    timer = window.setTimeout(tryFire, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [tourCompletedAt, router]);

  return null;
}
