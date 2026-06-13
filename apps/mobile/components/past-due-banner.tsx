import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";

const APPLE_SUBSCRIPTIONS_URL = "https://apps.apple.com/account/subscriptions";
const PLAY_SUBSCRIPTIONS_URL =
  "https://play.google.com/store/account/subscriptions";

/**
 * "Payment failed" recovery banner for the authenticated tab shell (iOS +
 * Android). Parity with the web banner. Renders only when
 * user.paymentFailed (FREE due to a recent failed charge, server-computed,
 * 30-day window). Action-only, no dismiss.
 *
 * No grace (2026-06-12 spec): the user is already on FREE, so the copy is
 * "get Pro back". The action routes by subscriptionSource:
 *   apple        → App Store subscriptions
 *   google_play  → Play Store subscriptions
 *   stripe       → Stripe Customer Portal (POST /api/stripe/portal)
 */
export function PastDueBanner() {
  const { user } = useAuth();
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const [submitting, setSubmitting] = useState(false);

  if (!user?.paymentFailed) return null;

  const updatePayment = async () => {
    if (user.subscriptionSource === "apple") {
      await WebBrowser.openBrowserAsync(APPLE_SUBSCRIPTIONS_URL);
      return;
    }
    if (user.subscriptionSource === "google_play") {
      await WebBrowser.openBrowserAsync(PLAY_SUBSCRIPTIONS_URL);
      return;
    }
    // stripe (default): open the Customer Portal.
    setSubmitting(true);
    try {
      const res = await api.post<{ url?: string; redirect?: string }>(
        "/api/stripe/portal",
        {}
      );
      const target =
        res?.url ?? (res?.redirect ? `${api.baseUrl()}${res.redirect}` : null);
      if (target) await WebBrowser.openBrowserAsync(target);
    } catch {
      // Leave the banner up; the user can retry.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: 16,
        paddingTop: insets.top + 12,
        paddingBottom: 12,
        backgroundColor: `${tokens.bad}1F`,
        borderBottomWidth: 1,
        borderBottomColor: tokens.bad,
      }}
    >
      <Ionicons name="alert-circle" size={20} color={tokens.bad} />
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: tokens.bad,
            fontFamily: tokens.fontSans,
            fontSize: 13,
            fontWeight: "700",
          }}
        >
          Your payment didn&rsquo;t go through
        </Text>
        <Text
          style={{
            color: tokens.textSec,
            fontFamily: tokens.fontSans,
            fontSize: 11,
            marginTop: 2,
          }}
        >
          Update your payment method to get Acuity Pro back.
        </Text>
      </View>
      <Pressable
        onPress={updatePayment}
        disabled={submitting}
        style={{
          backgroundColor: tokens.bad,
          borderRadius: 999,
          paddingHorizontal: 14,
          paddingVertical: 8,
          opacity: submitting ? 0.6 : 1,
        }}
      >
        <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "700" }}>
          {submitting ? "Opening…" : "Update payment"}
        </Text>
      </Pressable>
    </View>
  );
}
