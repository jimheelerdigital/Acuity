import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

import { getToken } from "@/lib/auth";
import { isOnboardingV10Enabled } from "@/lib/feature-flags";
import { isQaForceV10, warnIfQaForceV10Active } from "@/lib/qa/force-v10";
import { hasAppHistoryFromKeys } from "./entry-routing";
import { isV10Guest, wasV10Dismissed, wasV10Offered } from "./state";

export interface DeviceRoutingFacts {
  v10Enabled: boolean;
  isGuest: boolean;
  v10Offered: boolean;
  v10Dismissed: boolean;
  hasAppHistory: boolean;
}

/**
 * Device-side facts AuthGate needs before it can route a signed-out launch.
 *
 * ── Why AuthGate must WAIT for these ─────────────────────────────────
 * Every one of them can only make routing more permissive: guest state and
 * mid-funnel state both prevent a redirect to sign-in. If AuthGate ran with
 * defaults while these loaded, it would fire the redirect first and the
 * correct answer would arrive too late — the user would already be looking
 * at the sign-in screen. So the hook reports `ready`, and AuthGate does
 * nothing until it flips.
 *
 * The wait is invisible: the native splash is held open until auth resolves
 * (see _layout.tsx), and these local reads finish long before the network
 * call behind `loading` does.
 */
export function useColdStartFacts(): {
  facts: DeviceRoutingFacts;
  ready: boolean;
} {
  const [facts, setFacts] = useState<DeviceRoutingFacts>({
    v10Enabled: isOnboardingV10Enabled(),
    isGuest: false,
    v10Offered: false,
    v10Dismissed: false,
    // Defaults deliberately biased toward "returning user". If something
    // goes wrong and this value is somehow consumed early, sending a new
    // user to sign-in is a lesser failure than dropping a subscriber into a
    // signup funnel.
    hasAppHistory: true,
  });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // ─── ⚠️ QA-ONLY OVERRIDE — see lib/qa/force-v10.ts ──────────────
      // Report the facts a brand-new install would have, so
      // decideColdStartRoute returns "v10" on a device that has history.
      // Skips the storage reads entirely: their answers cannot matter,
      // and not reading them keeps this block free of side effects.
      //
      // decideColdStartRoute itself is untouched — it still receives an
      // honest ColdStartFacts and applies its real logic. Only what we
      // hand it changes, so the function under test is the one that
      // ships. signedIn/onboardingCompleted are not ours to set; they
      // come from `user` in app/_layout.tsx and fall out false because
      // auth-context ignores the stored session under the same flag.
      if (isQaForceV10()) {
        warnIfQaForceV10Active();
        if (!cancelled) {
          setFacts({
            v10Enabled: true,
            isGuest: false,
            v10Offered: false,
            v10Dismissed: false,
            hasAppHistory: false,
          });
          setReady(true);
        }
        return;
      }
      // ─── end QA-only override ──────────────────────────────────────

      const v10Enabled = isOnboardingV10Enabled();

      // Flag off ⇒ none of the rest can change the outcome, so skip the
      // reads entirely. Keeps the flag-OFF path to a single boolean.
      if (!v10Enabled) {
        if (!cancelled) {
          setFacts((f) => ({ ...f, v10Enabled: false }));
          setReady(true);
        }
        return;
      }

      const [guest, offered, dismissed, keys, token] = await Promise.all([
        isV10Guest(),
        wasV10Offered(),
        wasV10Dismissed(),
        AsyncStorage.getAllKeys().catch(() => [] as readonly string[]),
        // Strongest history signal, and the one that matters most: on iOS
        // the keychain SURVIVES app deletion, so a reinstalling subscriber
        // still has this even with AsyncStorage wiped. Checking it is what
        // stops them being dropped into a signup funnel.
        //
        // Normally such a user resolves as signed-in before routing runs,
        // but not always — a token can be present yet rejected by the
        // server (revoked, rotated secret, offline). Then `user` is null
        // and this is the only thing standing between them and the funnel.
        getToken().catch(() => null),
      ]);
      if (cancelled) return;

      setFacts({
        v10Enabled,
        isGuest: guest,
        v10Offered: offered,
        v10Dismissed: dismissed,
        hasAppHistory: !!token || hasAppHistoryFromKeys(keys),
      });
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { facts, ready };
}
