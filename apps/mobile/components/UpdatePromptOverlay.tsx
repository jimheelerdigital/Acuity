import { useEffect, useState } from "react";

import {
  checkForUpdate,
  openAppStore,
  rememberDismissal,
  type VersionCheckResult,
} from "@/lib/version-check";

import { UpdatePromptModal } from "./UpdatePromptModal";

/**
 * UpdatePromptOverlay — orchestrates the in-app update prompt on
 * launch.
 *
 * Mounted once in the root layout (above the Stack, below the lock
 * overlay so the lock wins z-order if both fire). Fires
 * `checkForUpdate()` exactly once on mount; the response decides
 * whether to render `<UpdatePromptModal>`.
 *
 * Lifecycle:
 *
 *   1. Mount → call checkForUpdate (network request + AsyncStorage
 *      read, both bounded by a 4s timeout).
 *   2. Result resolves → set state; if shouldShow, the modal renders.
 *   3. User taps Update → openAppStore() launches itms-apps:// (iOS)
 *      with https:// fallback. Modal stays visible — the user has
 *      left the app to update; on their next launch the version
 *      comparison passes and the modal won't re-show.
 *   4. User taps Later (only when isForced=false) → rememberDismissal
 *      stores the recommended version they dismissed, then the
 *      modal hides. Re-prompt only fires when the server advances
 *      `recommendedVersion` past the stored value.
 *
 * Once-per-session: re-checking on foreground is intentionally NOT
 * done. Mobile users foreground the app dozens of times a day; a
 * push that re-runs the check on every wake would be both noisy
 * (UX) and chatty (API). The launch-only cadence matches mobile
 * version-prompt conventions on iOS.
 */
export function UpdatePromptOverlay() {
  const [result, setResult] = useState<VersionCheckResult | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const r = await checkForUpdate();
      if (cancelled) return;
      setResult(r);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!result || !result.shouldShow || dismissed || !result.config) {
    return null;
  }

  const config = result.config;

  return (
    <UpdatePromptModal
      config={config}
      isForced={result.isForced}
      onUpdate={() => {
        // Fire-and-forget. openAppStore returns a Promise but the
        // modal doesn't need to react to its result — success means
        // the user has left the app; failure means they're staring
        // at a non-functional CTA which is rare enough that we just
        // log silently (no toast, no error UI, no dismiss).
        void openAppStore(config.appStoreUrl);
      }}
      onDismiss={() => {
        // Persist the version the user just dismissed BEFORE
        // toggling the dismissed flag — if the user kills the app
        // mid-dismiss, the next launch should still respect the
        // tap. AsyncStorage write is fire-and-forget; persistence
        // failure is non-fatal.
        rememberDismissal(config.recommendedVersion);
        setDismissed(true);
      }}
    />
  );
}
