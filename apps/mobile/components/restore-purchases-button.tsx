import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, Text } from "react-native";

import { restorePurchases } from "@/lib/iap";
import { isIapEnabled } from "@/lib/iap-config";

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
  const [busy, setBusy] = useState(false);

  if (Platform.OS !== "ios" || !isIapEnabled()) return null;

  const handlePress = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const outcome = await restorePurchases();
      if (outcome.kind === "none") {
        Alert.alert(
          "No purchases to restore",
          "We didn't find any Acuity Pro subscriptions on this Apple ID."
        );
        return;
      }
      if (outcome.kind === "restored") {
        Alert.alert(
          outcome.count === 1
            ? "Subscription restored"
            : `${outcome.count} subscriptions restored`,
          "Your Acuity Pro access is active.",
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
        <ActivityIndicator size="small" color="#A1A1AA" />
      ) : (
        <Ionicons name="refresh-outline" size={14} color="#A1A1AA" />
      )}
      <Text className="text-zinc-500 dark:text-zinc-400 text-xs">
        {busy ? "Restoring…" : "Restore purchases"}
      </Text>
    </Pressable>
  );
}
