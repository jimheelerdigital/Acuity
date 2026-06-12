import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";

/**
 * Persistent PAST_DUE banner for the authenticated tab shell (iOS + Android).
 * Parity with the web global banner (components/past-due-banner.tsx). Renders
 * only when the user's subscriptionStatus === "PAST_DUE". Action-only (no
 * dismiss): "Update payment" opens the Stripe Customer Portal via
 * POST /api/stripe/portal in an in-app browser.
 */
export function PastDueBanner() {
  const { user } = useAuth();
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const [submitting, setSubmitting] = useState(false);

  if (user?.subscriptionStatus !== "PAST_DUE") return null;

  const updatePayment = async () => {
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
          Update your card to keep your insights.
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
