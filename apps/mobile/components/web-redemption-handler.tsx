import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert } from "react-native";

import { useAuth } from "@/contexts/auth-context";
import {
  onWebRedemptionQueued,
  redeemWebPurchaseUrl,
  takePendingWebRedemption,
} from "@/lib/revenuecat/web-redemption";

/**
 * Mounted invisibly at the root layout (next to AuthGate). Drains the
 * Redemption Link queued by app/+native-intent.tsx once auth has resolved,
 * redeems it through the RevenueCat SDK, and tells the customer what
 * happened. See lib/revenuecat/web-redemption.ts for the full flow.
 */
export function WebRedemptionHandler() {
  const { user, loading, refresh } = useAuth();
  const router = useRouter();
  const [queueTick, setQueueTick] = useState(0);

  useEffect(() => onWebRedemptionQueued(() => setQueueTick((t) => t + 1)), []);

  useEffect(() => {
    if (loading) return;
    const url = takePendingWebRedemption();
    if (!url) return;
    const signedIn = !!user;
    void (async () => {
      const outcome = await redeemWebPurchaseUrl(url, user?.id ?? null);
      switch (outcome.kind) {
        case "success":
          if (signedIn) {
            await refresh();
            Alert.alert(
              "Ripple Pro is active",
              "Your web purchase is now linked to this account."
            );
            router.replace("/(tabs)");
          } else {
            Alert.alert(
              "Purchase received",
              "Create your Ripple account (or sign in) to start using Ripple Pro.",
              [
                {
                  text: "Continue",
                  onPress: () => router.replace("/(auth)/sign-up"),
                },
              ]
            );
          }
          return;
        case "belongs-to-other-user":
          Alert.alert(
            "Already linked to another account",
            "This purchase belongs to a different Ripple account. Sign in with the account you used when you bought it."
          );
          return;
        case "expired":
          Alert.alert(
            "This link has expired",
            outcome.obfuscatedEmail
              ? `Check ${outcome.obfuscatedEmail} for a new link, then open it on this phone.`
              : "Check your purchase email for a new link, then open it on this phone."
          );
          return;
        case "invalid-token":
          Alert.alert(
            "This link isn't valid",
            "Open the most recent link from your Ripple purchase email."
          );
          return;
        case "error":
          Alert.alert(
            "Couldn't link your purchase",
            "Please check your connection and open the link again."
          );
          return;
        case "unavailable":
          return;
      }
    })();
  }, [queueTick, loading, user, refresh, router]);

  return null;
}
