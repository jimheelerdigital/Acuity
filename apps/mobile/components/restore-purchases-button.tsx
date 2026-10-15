import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, Text } from "react-native";

import { useTheme } from "@/contexts/theme-context";
import { restorePurchases } from "@/lib/iap";
import { isIapEnabled } from "@/lib/iap-config";
import { restoreProPurchases } from "@/lib/revenuecat";
import { rcFlags } from "@/lib/revenuecat/flags";

/**
 * "Restore Purchases" link. Required by Apple App Review on every
 * surface that presents a paid subscription. Renders only when:
 *   - Platform is iOS, AND
 *   - isIapEnabled() returns true (build-time gate per Phase 3a).
 *
 * On non-iOS or flag-off builds returns null — the surrounding
 * surface presents the "Continue on web" path which doesn't need
 * a restore affordance (Stripe state is server-side).
 *
 * Behavior:
 *   - Tap → restorePurchases() (calls StoreKit + cycles each
 *     restored transaction through /api/iap/verify-receipt).
 *   - "none"     → "No purchases to restore"
 *   - "restored" → "Subscription restored" + onRestored callback
 *   - "error"    → first error message in an Alert
 */
export function RestorePurchasesButton({
  onRestored,
}: {
  onRestored?: () => Promise<void> | void;
}) {
  const { tokens } = useTheme();
  const [busy, setBusy] = useState(false);

  // Rail-aware. RC restores on iOS + Android; the legacy StoreKit path is
  // iOS-only and stays gated on isIapEnabled().
  const rcPurchases = rcFlags().RC_SDK_PURCHASES;
  const show = rcPurchases
    ? Platform.OS === "ios" || Platform.OS === "android"
    : Platform.OS === "ios" && isIapEnabled();
  if (!show) return null;

  const handlePress = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // ── RevenueCat rail ──────────────────────────────────────────
      if (rcPurchases) {
        const hasPro = await restoreProPurchases();
        if (hasPro === null) {
          Alert.alert(
            "Couldn't restore",
            "Something went wrong restoring your purchases. Please try again."
          );
          return;
        }
        if (hasPro) {
          Alert.alert(
            "Subscription restored",
            "Your Ripple Pro access is active.",
            [
              {
                text: "OK",
                onPress: () => {
                  void Promise.resolve(onRestored?.());
                },
              },
            ]
          );
          return;
        }
        Alert.alert(
          "No purchases to restore",
          "We didn't find any Ripple Pro subscriptions on this account."
        );
        return;
      }

      const outcome = await restorePurchases();
      if (outcome.kind === "none") {
        Alert.alert(
          "No purchases to restore",
          "We didn't find any Ripple Pro subscriptions on this Apple ID."
        );
        return;
      }
      if (outcome.kind === "restored") {
        Alert.alert(
          outcome.count === 1
            ? "Subscription restored"
            : `${outcome.count} subscriptions restored`,
          "Your Ripple Pro access is active.",
          [
            {
              text: "OK",
              onPress: () => {
                void Promise.resolve(onRestored?.());
              },
            },
          ]
        );
        return;
      }
      Alert.alert("Couldn't restore", outcome.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={busy}
      className="flex-row items-center justify-center gap-2 py-3"
    >
      {busy ? (
        <ActivityIndicator size="small" color={tokens.textTer} />
      ) : (
        <Ionicons name="refresh-outline" size={14} color={tokens.textTer} />
      )}
      <Text className="text-xs" style={{ color: tokens.textSec }}>
        {busy ? "Restoring…" : "Restore purchases"}
      </Text>
    </Pressable>
  );
}
