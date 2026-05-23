import { useEffect, useState } from "react";

import {
  checkForUpdate,
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
 *   3. User dismisses (only possible when isForced=false) → modal
 *      hides and the recommended version is stored so the same
 *      version doesn't re-prompt next launch.
 *   4. User taps Update → opens App Store; modal stays visible.
 *      Next launch (after they update) the version comparison passes
 *      and the modal doesn't show.
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

  return (
    <UpdatePromptModal
      config={result.config}
      isForced={result.isForced}
      onDismiss={() => setDismissed(true)}
    />
  );
}
