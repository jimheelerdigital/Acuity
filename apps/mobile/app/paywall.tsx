import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/lib/api";

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
  const [opening, setOpening] = useState(false);

  const openUpgrade = async () => {
    setOpening(true);
    try {
      await WebBrowser.openBrowserAsync(
        `${api.baseUrl()}/upgrade?src=mobile`,
        {
          // Match the system's current interface style so the
          // Safari chrome doesn't jarringly flip from dark → light.
          toolbarColor: "#09090B",
          controlsColor: "#A78BFA",
          dismissButtonStyle: "close",
        }
      );
    } finally {
      setOpening(false);
      // Close the modal after the browser dismisses. The auth-context
      // AppState listener has already fired a /api/user/me refresh by
      // this point, so the dashboard reflects the new state.
      router.back();
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-zinc-950" edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: 24, paddingBottom: 40 }}
      >
        {/* Close button top-right — a standard modal-dismiss
            affordance in addition to the "Remind me later" button
            below. Belt + suspenders. */}
        <View className="flex-row justify-end mb-4">
          <Pressable
            onPress={() => router.back()}
            hitSlop={16}
            className="h-8 w-8 items-center justify-center rounded-full bg-zinc-900"
          >
            <Ionicons name="close" size={18} color="#A1A1AA" />
          </Pressable>
        </View>

        {/* Symbolic mark — not a lock icon (too gate-y), a small
            continuation arrow pair */}
        <View className="h-14 w-14 rounded-2xl bg-violet-600/20 items-center justify-center mb-6 border border-violet-600/30">
          <Ionicons name="arrow-forward" size={26} color="#A78BFA" />
        </View>

        <Text className="text-3xl font-bold text-zinc-50 leading-tight">
          Month two is where the pattern deepens.
        </Text>

        <Text className="mt-5 text-base leading-relaxed text-zinc-400">
          Your trial reached its end. Your entries, your Life Matrix, and
          your Day 14 Audit are still right where you left them — they
          don&rsquo;t go anywhere.
        </Text>

        <Text className="mt-4 text-base leading-relaxed text-zinc-400">
          A subscription keeps new recordings, new weekly reports, and
          new insights flowing. Without one, the dashboard freezes
          where it is — no data loss, no cliff.
        </Text>

        {/* Value recap — short, no feature-matrix vibe */}
        <View className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 gap-3">
          <ValueRow icon="mic-outline" text="Record new entries every night" />
          <ValueRow
            icon="analytics-outline"
            text="Weekly reports + Life Matrix refreshes"
          />
          <ValueRow
            icon="sparkles-outline"
            text="Quarterly Life Audits after month three"
          />
        </View>

        <View className="mt-auto pt-10 gap-3">
          <Pressable
            onPress={openUpgrade}
            disabled={opening}
            className="rounded-full bg-violet-600 py-4 items-center"
            style={({ pressed }) => ({
              opacity: pressed || opening ? 0.85 : 1,
              shadowColor: "#7C3AED",
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.35,
              shadowRadius: 12,
            })}
          >
            {opening ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white text-sm font-semibold">
                Continue on web
              </Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => router.back()}
            disabled={opening}
            className="py-3 items-center"
          >
            <Text className="text-zinc-500 text-sm">Remind me later</Text>
          </Pressable>

          {/* Apple Review 3.1.3(b) Multiplatform Services compliance.
              We are allowed to reference the web, but we must not
              direct users to a specific purchase flow in IAP terms.
              "Continue on web" reads as a navigation affordance, not
              a sale. docs/APPLE_IAP_DECISION.md §6. */}
          <Text className="text-[10px] text-zinc-600 text-center mt-4 leading-snug">
            Subscriptions are managed through your Acuity web account.
            Manage or cancel any time at getacuity.io.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ValueRow({
  icon,
  text,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  text: string;
}) {
  return (
    <View className="flex-row items-center gap-3">
      <Ionicons name={icon} size={18} color="#A78BFA" />
      <Text className="text-sm text-zinc-200 flex-1">{text}</Text>
    </View>
  );
}
