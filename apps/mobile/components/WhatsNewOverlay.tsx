import { useSegments } from "expo-router";
import { useEffect, useRef, useState } from "react";

import { useWhatsNewTour } from "@/components/tour/use-whats-new-tour";
import { useAuth } from "@/contexts/auth-context";
import {
  checkWhatsNew,
  rememberWhatsNewSeen,
  type WhatsNewResult,
} from "@/lib/whats-new";
import { markEligible, useWhatsNewState } from "@/lib/whats-new-state";

import { WhatsNewSheet } from "./WhatsNewSheet";

/**
 * WhatsNewOverlay — shows the What's New sheet once, on the first launch after
 * an update. Mounted once in the root layout (inside TourProvider).
 *
 * Waits until someone is signed in AND on the main tabs, so it never covers
 * sign-in, onboarding, or a recording started from the Action Button /
 * widget. Showing it marks this version "eligible", which turns on the Home
 * pill for 7 days (lib/whats-new-state.ts). "Show me around" / an item tap
 * close the sheet and start the tour (components/tour/whats-new-tour.ts).
 */
export function WhatsNewOverlay() {
  const { user } = useAuth();
  const segments = useSegments();
  const wn = useWhatsNewState();
  const { startAll, startItem } = useWhatsNewTour();
  const [result, setResult] = useState<WhatsNewResult | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const checkedRef = useRef(false);

  const onTabs = segments[0] === "(tabs)";
  const signedIn = !!user;

  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    []
  );

  useEffect(() => {
    if (checkedRef.current || !signedIn || !onTabs) return;
    checkedRef.current = true;
    void (async () => {
      const r = await checkWhatsNew();
      if (!mountedRef.current) return;
      if (r.shouldShow && r.items) markEligible();
      setResult(r);
    })();
  }, [signedIn, onTabs]);

  if (!result || !result.shouldShow || dismissed || !result.version) {
    return null;
  }
  if (!result.items && !result.notes) return null;

  const { version } = result;
  const close = () => {
    // Persist BEFORE hiding so a mid-dismiss app kill still records it.
    rememberWhatsNewSeen(version);
    setDismissed(true);
  };

  return (
    <WhatsNewSheet
      version={version}
      notes={result.notes ?? []}
      items={result.items ?? undefined}
      explored={wn.explored}
      onDismiss={close}
      onTour={() => {
        close();
        // Let the sheet's slide-out finish before the spotlight measures.
        setTimeout(() => void startAll(), 350);
      }}
      onItem={(id) => {
        close();
        setTimeout(() => void startItem(id), 350);
      }}
    />
  );
}
