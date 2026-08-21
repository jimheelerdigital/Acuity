import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

import { getToken } from "@/lib/auth";
import { isOnboardingV10Enabled } from "@/lib/feature-flags";
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
