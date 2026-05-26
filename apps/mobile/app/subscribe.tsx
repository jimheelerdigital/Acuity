import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { RestorePurchasesButton } from "@/components/restore-purchases-button";
import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";
import {
  getMonthlyProduct,
  initIap,
  purchaseMonthly,
  recoverPurchasesIfNeeded,
  verifyAndFinish,
  type IapProduct,
} from "@/lib/iap";
import { isIapEnabled } from "@/lib/iap-config";
import type { AcuityTokens } from "@/lib/theme/tokens";

/**
 * Phase 3a — Subscribe screen. Modal-style native paywall that
 * presents the Apple Pro Monthly product, calls into StoreKit, and
 * routes the verify-receipt outcome to the right UX state.
 *
 * Flow:
 *   1. Mount → initIap → getMonthlyProduct.
 *   2. User taps Subscribe → present Apple sheet.
 *   3. On StoreKit success → POST receipt to /api/iap/verify-receipt.
 *   4. On 200 → refresh user state → nav back to home (Pro unlocked).
 *   5. On 409 ACTIVE_STRIPE_SUB → "manage on web" with link.
 *   6. On 409 ANOTHER_USER_OWNS_TRANSACTION → "contact support".
 *   7. On 502 / network → "try again or contact support".
 *
 * 3.1.3(b) compliance: this screen is the IN-APP option. The
 * existing "Continue on web" affordances on the locked-state cards
 * (slice 4-mobile) MUST stay. Apple's rule is "you can't remove
 * external links to your subscription"; offering both is fine.
 *
 * Feature-flag guard: when isIapEnabled() returns false (current
 * default in production), the screen renders an "unavailable" state
 * with a "Continue on web" CTA. This is the safe production posture
 * before SBP enrollment + IAP product creation.
 */

export default function SubscribeScreen() {
  const router = useRouter();
  const { tokens } = useTheme();
  const { user, refresh } = useAuth();
  const [product, setProduct] = useState<IapProduct | null>(null);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "error">(
    "loading"
  );
  const [purchasing, setPurchasing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const flagOn = isIapEnabled();
  const isIos = Platform.OS === "ios";

  const loadProduct = useCallback(async () => {
    setLoadState("loading");
    setErrorMsg(null);
    try {
      const ok = await initIap();
      if (!ok) {
        setLoadState("error");
        return;
      }
      const p = await getMonthlyProduct();
      if (!p) {
        setLoadState("error");
        return;
      }
      setProduct(p);
      setLoadState("idle");
    } catch (err) {
      console.warn("[subscribe] load failed:", err);
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    if (!flagOn || !isIos) return;
    void loadProduct();
  }, [flagOn, isIos, loadProduct]);

  useEffect(() => {
    if (!flagOn || !isIos) return;
    if (user?.subscriptionStatus === "PRO") return;
    let cancelled = false;
    (async () => {
      const outcome = await recoverPurchasesIfNeeded({ force: true });
      if (cancelled) return;
      if (outcome.kind === "restored") {
        await refresh();
        Alert.alert(
          "Welcome back to Acuity Pro",
          "Your existing subscription was restored. New entries will get the full debrief.",
          [{ text: "OK", onPress: () => router.back() }]
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [flagOn, isIos, user?.subscriptionStatus, refresh, router]);

  const handlePurchase = async () => {
    if (purchasing) return;
    setPurchasing(true);
    setErrorMsg(null);
    try {
      const result = await purchaseMonthly();
      if (result.kind === "error") {
        if (result.message) setErrorMsg(result.message);
        return;
      }
      const verify = await verifyAndFinish({
        transactionId: result.transactionId,
        receipt: result.receipt,
      });
      if (verify.kind === "success" || verify.kind === "idempotent-success") {
        setErrorMsg(null);
        await refresh();
        Alert.alert(
          "Welcome to Acuity Pro",
          "Your subscription is active. New entries will get the full debrief.",
          [
            {
              text: "OK",
              onPress: () => router.back(),
            },
          ]
        );
        return;
      }
      if (verify.kind === "ux-conflict") {
        if (verify.route === "manage-on-web") {
          Alert.alert("Active subscription on web", verify.message, [
            {
              text: "Continue on web",
              onPress: () => {
                void WebBrowser.openBrowserAsync(
                  `${api.baseUrl()}/account?src=mobile_iap_active_stripe`
                );
              },
            },
            { text: "Dismiss", style: "cancel" },
          ]);
          return;
        }
        if (verify.route === "contact-support") {
          Alert.alert(
            "Already attached to another account",
            verify.message,
            [
              {
                text: "Contact support",
                onPress: () => {
                  void WebBrowser.openBrowserAsync(
                    "mailto:jim@heelerdigital.com?subject=Acuity%20IAP%20transfer"
                  );
                },
              },
              { text: "Dismiss", style: "cancel" },
            ]
          );
          return;
        }
        setErrorMsg(verify.message);
        return;
      }
      setErrorMsg(verify.message);
    } finally {
      setPurchasing(false);
    }
  };

  if (!flagOn || !isIos) {
    return (
      <UnavailableScreen
        tokens={tokens}
        onClose={() => router.back()}
        onContinueOnWeb={async () => {
          await WebBrowser.openBrowserAsync(
            `${api.baseUrl()}/upgrade?src=mobile_subscribe_unavailable`
          );
          router.back();
        }}
      />
    );
  }

  return (
    <SafeAreaView
      className="flex-1"
      style={{ backgroundColor: tokens.bg }}
      edges={["top", "bottom"]}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: 24, paddingBottom: 40 }}
      >
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

        <View
          className="h-14 w-14 rounded-2xl items-center justify-center mb-6 border"
          style={{
            backgroundColor: `${tokens.primary}33`,
            borderColor: `${tokens.primary}55`,
          }}
        >
          <Ionicons name="sparkles" size={26} color={tokens.primary} />
        </View>

        <Text
          className="text-3xl font-bold leading-tight"
          style={{ color: tokens.text }}
        >
          Acuity Pro
        </Text>

        <Text
          className="mt-3 text-base leading-relaxed"
          style={{ color: tokens.textTer }}
        >
          Full debriefs on every recording. Themes, weekly reports,
          Life Matrix, calendar — all the patterns under your nightly
          entries, surfaced.
        </Text>

        {/* Product card */}
        <View
          className="mt-8 rounded-2xl border p-5"
          style={{
            borderColor: `${tokens.primary}55`,
            backgroundColor: `${tokens.primary}0D`,
          }}
        >
          {loadState === "loading" && (
            <View className="flex-row items-center justify-center py-3">
              <ActivityIndicator color={tokens.primary} />
            </View>
          )}
          {loadState === "error" && (
            <View>
              <Text className="text-sm" style={{ color: tokens.text }}>
                Couldn&apos;t load Acuity Pro. The App Store may be
                temporarily unreachable.
              </Text>
              <Pressable
                onPress={loadProduct}
                className="mt-3 self-start rounded-md px-3 py-1.5"
                style={{ backgroundColor: `${tokens.primary}55` }}
              >
                <Text
                  className="text-xs font-semibold"
                  style={{ color: tokens.primaryHi }}
                >
                  Retry
                </Text>
              </Pressable>
            </View>
          )}
          {loadState === "idle" && product && (
            <View>
              <Text
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: tokens.primary }}
              >
                Monthly
              </Text>
              <Text
                className="mt-1 text-3xl font-bold"
                style={{ color: tokens.text }}
              >
                {product.localizedPrice}
                <Text
                  className="text-base font-normal"
                  style={{ color: tokens.textTer }}
                >
                  {" "}/ month
                </Text>
              </Text>
              <Text
                className="mt-3 text-xs leading-relaxed"
                style={{ color: tokens.textTer }}
              >
                Auto-renews monthly. Cancel any time in iOS Settings →
                Apple ID → Subscriptions.
              </Text>
            </View>
          )}
        </View>

        {/* Feature list */}
        <View className="mt-8 gap-3">
          <ValueRow
            icon="analytics-outline"
            text="Themes, wins, blockers extracted from every recording"
            tokens={tokens}
          />
          <ValueRow
            icon="calendar-outline"
            text="Sunday weekly reports with mood + theme arcs"
            tokens={tokens}
          />
          <ValueRow
            icon="grid-outline"
            text="Life Matrix radar refreshed as you record"
            tokens={tokens}
          />
          <ValueRow
            icon="link-outline"
            text="Calendar sync — tasks land where you plan"
            tokens={tokens}
          />
          <ValueRow
            icon="time-outline"
            text="Quarterly Life Audits + memoir export"
            tokens={tokens}
          />
        </View>

        {errorMsg && (
          <View
            className="mt-6 rounded-md px-3 py-2"
            style={{ backgroundColor: `${tokens.bad}1A` }}
          >
            <Text className="text-sm" style={{ color: tokens.bad }}>
              {errorMsg}
            </Text>
          </View>
        )}

        <View className="mt-auto pt-10 gap-3">
          <Pressable
            onPress={handlePurchase}
            disabled={purchasing || loadState !== "idle" || !product}
            className="rounded-full py-4 items-center"
            style={[
              {
                backgroundColor: tokens.primary,
                opacity: purchasing || !product ? 0.6 : 1,
              },
              tokens.glowPrimary,
            ]}
          >
            {purchasing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text
                className="text-sm font-semibold"
                style={{ color: "#FFFFFF" }}
              >
                Subscribe — {product?.localizedPrice ?? "$4.99"}/month
              </Text>
            )}
          </Pressable>

          <Pressable
            onPress={async () => {
              await WebBrowser.openBrowserAsync(
                `${api.baseUrl()}/upgrade?src=mobile_subscribe_screen`
              );
            }}
            disabled={purchasing}
            className="py-3 items-center"
          >
            <Text className="text-sm" style={{ color: tokens.textTer }}>
              Continue on web
            </Text>
          </Pressable>

          <RestorePurchasesButton onRestored={async () => {
            await refresh();
            router.back();
          }} />

          {/* App Store Guideline 3.1.2(a) disclosure — verbatim. */}
          <Text
            className="text-[11px] text-center mt-6 leading-relaxed"
            style={{ color: tokens.textTer }}
          >
            Payment will be charged to your Apple ID account at the
            confirmation of purchase. Subscription automatically
            renews unless it is canceled at least 24 hours before the
            end of the current period. Your account will be charged
            for renewal within 24 hours prior to the end of the
            current period at {product?.localizedPrice ?? "$4.99"}
            /month. You can manage and cancel your subscriptions by
            going to your account settings on the App Store after
            purchase.
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
            <Text className="text-[11px]" style={{ color: tokens.textTer }}>
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

          <Text
            className="text-[10px] text-center mt-4 leading-snug"
            style={{ color: tokens.textTer }}
          >
            Your existing entries stay free. Acuity Pro unlocks the
            AI debrief layer on every new recording. Cross-platform —
            sign in on the web with the same account to use Pro
            there too.
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

/**
 * Rendered when isIapEnabled() is false (production default until
 * SBP + IAP product + env vars are all live) OR on a non-iOS device.
 * Falls back to the existing /upgrade-on-web flow with no surprise.
 */
function UnavailableScreen({
  tokens,
  onClose,
  onContinueOnWeb,
}: {
  tokens: AcuityTokens;
  onClose: () => void;
  onContinueOnWeb: () => Promise<void> | void;
}) {
  return (
    <SafeAreaView
      className="flex-1"
      style={{ backgroundColor: tokens.bg }}
      edges={["top", "bottom"]}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: 24, paddingBottom: 40 }}
      >
        <View className="flex-row justify-end mb-4">
          <Pressable
            onPress={onClose}
            hitSlop={16}
            className="h-8 w-8 items-center justify-center rounded-full"
            style={{ backgroundColor: tokens.bgInset }}
          >
            <Ionicons name="close" size={18} color={tokens.textTer} />
          </Pressable>
        </View>

        <Text
          className="text-2xl font-bold"
          style={{ color: tokens.text }}
        >
          Acuity Pro
        </Text>
        <Text
          className="mt-3 text-base leading-relaxed"
          style={{ color: tokens.textTer }}
        >
          Full debriefs, weekly reports, calendar sync, and more.
          Subscribe on the web — your access works on iOS the same
          way.
        </Text>

        <View className="mt-auto pt-10 gap-3">
          <Pressable
            onPress={() => void onContinueOnWeb()}
            className="rounded-full py-4 items-center"
            style={{ backgroundColor: tokens.primary }}
          >
            <Text
              className="text-sm font-semibold"
              style={{ color: "#FFFFFF" }}
            >
              Continue on web
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
