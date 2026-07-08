import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { RestorePurchasesButton } from "@/components/restore-purchases-button";
import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";
import { isIapEnabled } from "@/lib/iap-config";
import type { AcuityTokens } from "@/lib/theme/tokens";

/**
 * Native paywall screen for post-trial users. Per
 * docs/APPLE_IAP_DECISION.md Option C — no in-app purchase; subscription
 * signup happens on the web, the app opens /upgrade in SFSafari
 * via expo-web-browser. When the user returns (AppState → active)
 * the auth-context foreground-refresh picks up any new
 * subscriptionStatus.
 *
 * Copy matches IMPLEMENTATION_PLAN_PAYWALL §4.2 soft-transition
 * framing: the user's entries + prior insights remain visible
 * either way; only NEW generations are gated. No urgency, no
 * countdown, no cliff — month 2 as continuation.
 *
 * Presented as a modal (see _layout.tsx stack config) so the user
 * can dismiss with a swipe-down or the secondary button without
 * losing their place in the tab stack.
 */
export default function PaywallScreen() {
  const router = useRouter();
  const { tokens } = useTheme();
  const [opening, setOpening] = useState(false);

  // Phase 3a — surface in-app subscribe as the primary CTA on iOS
  // when the build-time IAP flag is on. "Continue on web" is
  // demoted to the secondary slot but stays visible per 3.1.3(b).
  const showInAppSubscribe = Platform.OS === "ios" && isIapEnabled();

  const openSubscribe = () => {
    router.replace("/subscribe");
  };

  const openUpgrade = async () => {
    setOpening(true);
    try {
      await WebBrowser.openBrowserAsync(
        `${api.baseUrl()}/upgrade?src=mobile`,
        {
          toolbarColor: tokens.bg,
          controlsColor: tokens.primary,
          dismissButtonStyle: "close",
        }
      );
    } finally {
      setOpening(false);
      router.back();
    }
  };

  return (
    <SafeAreaView
      className="flex-1"
      style={{ backgroundColor: tokens.bg }}
      edges={["top", "bottom"]}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: 24, paddingBottom: 40 }}
      >
        {/* Close button top-right */}
        <View className="flex-row justify-end mb-4">
          <Pressable
            onPress={() => router.back()}
            hitSlop={16}
            className="h-8 w-8 items-center justify-center rounded-full"
            style={{ backgroundColor: tokens.bgInset }}
          >
            <Ionicons name="close" size={18} color={tokens.textTer} />
          </Pressable>
        </View>

        {/* Symbolic mark — not a lock icon (too gate-y), a small
            continuation arrow pair */}
        <View
          className="h-14 w-14 rounded-2xl items-center justify-center mb-6 border"
          style={{
            backgroundColor: `${tokens.primary}33`,
            borderColor: `${tokens.primary}55`,
          }}
        >
          <Ionicons name="arrow-forward" size={26} color={tokens.primary} />
        </View>

        <Text
          className="text-3xl font-bold leading-tight"
          style={{ color: tokens.text }}
        >
          Month two is where the pattern deepens.
        </Text>

        <Text
          className="mt-5 text-base leading-relaxed"
          style={{ color: tokens.textTer }}
        >
          Your trial reached its end. Your entries, your Life Matrix, and
          your Day 7 Audit are still right where you left them — they
          don&rsquo;t go anywhere.
        </Text>

        <Text
          className="mt-4 text-base leading-relaxed"
          style={{ color: tokens.textTer }}
        >
          A subscription keeps new recordings, new weekly reports, and
          new insights flowing. Without one, the dashboard freezes
          where it is — no data loss, no cliff.
        </Text>

        {/* Value recap — short, no feature-matrix vibe */}
        <View
          className="mt-8 rounded-2xl border p-4 gap-3"
          style={{ borderColor: tokens.line, backgroundColor: tokens.cardBg }}
        >
          <ValueRow
            icon="mic-outline"
            text="Record new entries every night"
            tokens={tokens}
          />
          <ValueRow
            icon="analytics-outline"
            text="Weekly reports + Life Matrix refreshes"
            tokens={tokens}
          />
          <ValueRow
            icon="sparkles-outline"
            text="Quarterly Life Audits after month three"
            tokens={tokens}
          />
        </View>

        <View className="mt-auto pt-10 gap-3">
          {showInAppSubscribe ? (
            <>
              {/* Primary — in-app StoreKit purchase. Phase 3a. */}
              <Pressable
                onPress={openSubscribe}
                disabled={opening}
                className="rounded-full py-4 items-center"
                style={[
                  { backgroundColor: tokens.primary },
                  tokens.glowPrimary,
                ]}
              >
                <Text
                  className="text-sm font-semibold"
                  style={{ color: "#FFFFFF" }}
                >
                  Subscribe in app
                </Text>
              </Pressable>

              {/* Secondary — external Safari to /upgrade. */}
              <Pressable
                onPress={openUpgrade}
                disabled={opening}
                className="rounded-full border py-4 items-center"
                style={{ borderColor: `${tokens.primary}66` }}
              >
                {opening ? (
                  <ActivityIndicator color={tokens.primary} />
                ) : (
                  <Text
                    className="text-sm font-semibold"
                    style={{ color: tokens.primary }}
                  >
                    Continue on web
                  </Text>
                )}
              </Pressable>
            </>
          ) : (
            <Pressable
              onPress={openUpgrade}
              disabled={opening}
              className="rounded-full py-4 items-center"
              style={[
                {
                  backgroundColor: tokens.primary,
                  opacity: opening ? 0.85 : 1,
                },
                tokens.glowPrimary,
              ]}
            >
              {opening ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text
                  className="text-sm font-semibold"
                  style={{ color: "#FFFFFF" }}
                >
                  Continue on web
                </Text>
              )}
            </Pressable>
          )}

          <Pressable
            onPress={() => router.back()}
            disabled={opening}
            className="py-3 items-center"
          >
            <Text className="text-sm" style={{ color: tokens.textTer }}>
              Remind me later
            </Text>
          </Pressable>

          {/* Restore Purchases — Apple-required affordance. */}
          <RestorePurchasesButton onRestored={() => router.back()} />

          {showInAppSubscribe && (
            <>
              <Text
                className="text-[11px] text-center mt-6 leading-relaxed"
                style={{ color: tokens.textTer }}
              >
                Payment will be charged to your Apple ID account at
                the confirmation of purchase. Subscription
                automatically renews unless it is canceled at least
                24 hours before the end of the current period. Your
                account will be charged for renewal within 24 hours
                prior to the end of the current period at $4.99
                /month. You can manage and cancel your subscriptions
                by going to your account settings on the App Store
                after purchase.
              </Text>
              <View className="flex-row justify-center gap-3 mt-3">
                <Text
                  className="text-[11px] underline"
                  style={{ color: tokens.primary }}
                  onPress={() =>
                    void WebBrowser.openBrowserAsync(
                      "https://getacuity.io/terms"
                    )
                  }
                >
                  Terms of Use
                </Text>
                <Text
                  className="text-[11px]"
                  style={{ color: tokens.textTer }}
                >
                  ·
                </Text>
                <Text
                  className="text-[11px] underline"
                  style={{ color: tokens.primary }}
                  onPress={() =>
                    void WebBrowser.openBrowserAsync(
                      "https://getacuity.io/privacy"
                    )
                  }
                >
                  Privacy Policy
                </Text>
              </View>
            </>
          )}

          <Text
            className="text-[10px] text-center mt-4 leading-snug"
            style={{ color: tokens.textSec }}
          >
            {showInAppSubscribe
              ? "Subscribe in the app or on the web. Either path unlocks the same Pro features across all your devices."
              : "Subscriptions are managed through your Ripple web account. Manage or cancel any time at getacuity.io."}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ValueRow({
  icon,
  text,
  tokens,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  text: string;
  tokens: AcuityTokens;
}) {
  return (
    <View className="flex-row items-center gap-3">
      <Ionicons name={icon} size={18} color={tokens.primary} />
      <Text
        className="text-sm flex-1"
        style={{ color: tokens.text }}
      >
        {text}
      </Text>
    </View>
  );
}
