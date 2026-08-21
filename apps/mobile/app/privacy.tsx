import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";
import {
  ART9_CONSENT_TEXT,
  ART9_WORDING_VERSION,
  recordConsent,
} from "@/lib/consent";

/**
 * Settings → Privacy (v1.4 GDPR slice).
 *
 * Two controls:
 *
 *  1. Product analytics opt-out — toggles User.productAnalyticsEnabled
 *     via /api/user/product-analytics. Default ON (existing users
 *     accepted the prior policy); opting out is enforced server-side in
 *     /api/onboarding-events. Anonymous pre-signup funnel measurement is
 *     NOT affected (legitimate interest, ad attribution).
 *
 *  2. Withdraw special-category consent — writes a granted=false
 *     ConsentRecord for special_category_processing. Withdrawing means
 *     we should stop processing new sensitive content, which in practice
 *     means stopping recording; we point the user to delete entries or
 *     their account to action it.
 */
export default function PrivacyScreen() {
  const router = useRouter();
  const { tokens } = useTheme();

  const [analyticsEnabled, setAnalyticsEnabled] = useState<boolean | null>(
    null
  );
  const [saving, setSaving] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ enabled: boolean }>("/api/user/product-analytics")
      .then((res) => {
        if (!cancelled) setAnalyticsEnabled(res.enabled);
      })
      .catch(() => {
        // Default to ON if we can't read it — matches the server default.
        if (!cancelled) setAnalyticsEnabled(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleAnalytics = async (next: boolean) => {
    const prev = analyticsEnabled;
    setAnalyticsEnabled(next); // optimistic
    setSaving(true);
    try {
      await api.post("/api/user/product-analytics", { enabled: next });
    } catch {
      setAnalyticsEnabled(prev ?? true); // revert
      Alert.alert(
        "Couldn't save",
        "We couldn't update your analytics preference. Check your connection and try again."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleWithdraw = () => {
    Alert.alert(
      "Withdraw consent",
      "Withdrawing your consent means we'll stop processing new voice entries that may contain sensitive information. In practice that means you won't be able to record new entries. Your existing entries stay until you delete them or your account. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Withdraw",
          style: "destructive",
          onPress: async () => {
            setWithdrawing(true);
            try {
              await recordConsent({
                consentType: "special_category_processing",
                granted: false,
                consentText: ART9_CONSENT_TEXT,
                wordingVersion: ART9_WORDING_VERSION,
              });
              Alert.alert(
                "Consent withdrawn",
                "We've recorded your withdrawal. To remove the entries we've already processed, delete individual entries or your account in Profile.",
                [
                  { text: "Not now", style: "cancel" },
                  {
                    text: "Manage account",
                    onPress: () => router.back(),
                  },
                ]
              );
            } catch {
              Alert.alert(
                "Couldn't withdraw",
                "We couldn't record your withdrawal. Check your connection and try again."
              );
            } finally {
              setWithdrawing(false);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView
      className="flex-1"
      edges={["bottom"]}
      style={{ backgroundColor: tokens.bg }}
    >
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {/* Product analytics */}
        <View
          style={{
            borderRadius: tokens.radius.lg,
            backgroundColor: tokens.cardBg,
            borderWidth: 1,
            borderColor: tokens.cardBorder,
            padding: 16,
          }}
        >
          <View className="flex-row items-center justify-between gap-3">
            <Text
              style={{ color: tokens.text, fontSize: 15, fontWeight: "500", flex: 1 }}
            >
              Product analytics
            </Text>
            {analyticsEnabled === null ? (
              <ActivityIndicator color={tokens.primary} />
            ) : (
              <Switch
                value={analyticsEnabled}
                onValueChange={toggleAnalytics}
                disabled={saving}
                trackColor={{ true: tokens.primary, false: tokens.line }}
              />
            )}
          </View>
          <Text
            className="mt-2 text-sm leading-relaxed"
            style={{ color: tokens.textSec }}
          >
            Help us improve Ripple by sharing anonymous usage data. We use
            this to understand which features help users most. We never
            sell this data or share it for advertising.
          </Text>
        </View>

        {/* Special-category consent */}
        <View
          style={{
            marginTop: 20,
            borderRadius: tokens.radius.lg,
            backgroundColor: tokens.cardBg,
            borderWidth: 1,
            borderColor: tokens.cardBorder,
            padding: 16,
          }}
        >
          <Text style={{ color: tokens.text, fontSize: 15, fontWeight: "500" }}>
            Data-processing consent
          </Text>
          <Text
            className="mt-2 text-sm leading-relaxed"
            style={{ color: tokens.textSec }}
          >
            At sign-up you explicitly consented to Ripple transcribing and
            analysing voice entries that may contain special-category
            information (such as health or beliefs). You can withdraw that
            consent at any time.
          </Text>
          <Pressable
            onPress={handleWithdraw}
            disabled={withdrawing}
            className="mt-4 self-start rounded-full px-4 py-2.5"
            style={{ borderWidth: 1, borderColor: tokens.bad, opacity: withdrawing ? 0.6 : 1 }}
          >
            {withdrawing ? (
              <ActivityIndicator color={tokens.bad} />
            ) : (
              <Text style={{ color: tokens.bad, fontSize: 14, fontWeight: "500" }}>
                Withdraw consent
              </Text>
            )}
          </Pressable>
        </View>

        <Text
          className="mt-6 text-xs leading-relaxed"
          style={{ color: tokens.textTer }}
        >
          Pre-signup funnel measurement (anonymous, used for ad
          attribution) is conducted under our legitimate interest and
          isn&rsquo;t controlled by the toggle above. Full details are in
          our Privacy Policy.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
