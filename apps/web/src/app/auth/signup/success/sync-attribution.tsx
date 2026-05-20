"use client";

import { useEffect } from "react";

/**
 * Reads the acuity_attribution cookie and POSTs it to /api/auth/set-attribution.
 *
 * This catches OAuth signups (Google/Apple) whose attribution would otherwise
 * be lost — the NextAuth events.createUser callback runs server-side and has
 * no access to the browser cookie. By firing this on the success page (where
 * the user lands after OAuth redirect), we backfill the User row with the
 * first-touch UTM data that was captured on the landing page.
 *
 * The set-attribution endpoint is write-once (first-touch model), so calling
 * this for email/password users who already have attribution is a no-op.
 */
export function SyncAttribution() {
  useEffect(() => {
    try {
      const { getClientAttribution } = require("@/lib/attribution");
      const attr = getClientAttribution();

      console.log("[attribution] signup success — syncing cookie to backend:", attr);

      if (attr) {
        fetch("/api/auth/set-attribution", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(attr),
        }).catch((err) => {
          console.error("[attribution] set-attribution POST failed:", err);
        });
      } else {
        console.warn("[attribution] no acuity_attribution cookie found on signup success");
      }
    } catch {
      // attribution module not loaded
    }
  }, []);

  return null;
}
