import { useEffect, useState } from "react";

import {
  checkWhatsNew,
  rememberWhatsNewSeen,
  type WhatsNewResult,
} from "@/lib/whats-new";

import { WhatsNewSheet } from "./WhatsNewSheet";

/**
 * WhatsNewOverlay — shows the What's New sheet once, on the first launch after
 * an update. Mounted once in the root layout alongside UpdatePromptOverlay.
 *
 * Mutually exclusive with the update prompt: checkWhatsNew only returns
 * shouldShow when the running version matches the server's recommendedVersion,
 * which is exactly when the update prompt stays silent. Launch-only cadence
 * (no foreground re-check), matching the update prompt.
 */
export function WhatsNewOverlay() {
  const [result, setResult] = useState<WhatsNewResult | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const r = await checkWhatsNew();
      if (cancelled) return;
      setResult(r);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (
    !result ||
    !result.shouldShow ||
    dismissed ||
    !result.version ||
    !result.notes
  ) {
    return null;
  }

  const { version, notes } = result;

  return (
    <WhatsNewSheet
      version={version}
      notes={notes}
      onDismiss={() => {
        // Persist BEFORE hiding so a mid-dismiss app kill still records it.
        rememberWhatsNewSeen(version);
        setDismissed(true);
      }}
    />
  );
}
