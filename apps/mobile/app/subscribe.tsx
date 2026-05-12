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

  // Subscribe-screen mount recovery. If the user arrived here despite
  // not being PRO, give Apple a chance to tell us about an existing
  // sub before they re-tap Subscribe. Forces past the session-once
  // debounce because the user explicitly navigated to a purchase
  // surface — we want fresh-Apple state, not a stale earlier read.
  // Same shape as AuthProvider's recovery hook; the inner re-entrancy
  // guard prevents both from racing.
  useEffect(() => {
    if (!flagOn || !isIos) return;
    if (user?.subscriptionStatus === "PRO") return;
    let cancelled = false;
    (async () => {
      const outcome = await recoverPurchasesIfNeeded({ force: true });
      if (cancelled) return;
      if (outcome.kind === "restored") {
        await refresh();
        // Fire the same "Welcome to Pro" confirmation the post-
        // purchase happy path shows — same user-visible result, just
        // restored from prior purchase rather than freshly bought.
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
        // Silent kinds (user-cancelled) leave errorMsg null and
        // the user just stays on the screen; that's the intended
        // pattern per Apple's HIG.
        return;
      }
      const verify = await verifyAndFinish({
        transactionId: result.transactionId,
        receipt: result.receipt,
      });
      if (verify.kind === "success" || verify.kind === "idempotent-success") {
        // Defensive clear: even though the entry-of-handlePurchase
        // setErrorMsg(null) at line ~96 already cleared any prior
        // error before this attempt, clearing on success too avoids
        // any future code path that might set an error mid-purchase
        // (e.g., a transient retry inside verifyAndFinish) from
        // bleeding through to the post-success UI. The user's
        // build-34 paywall report flagged a stuck red banner; this
        // belt-and-suspenders close-out is part of the fix.
        setErrorMsg(null);
        // Refresh user state so the dashboard reflects PRO.
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
      // transient-error
      setErrorMsg(verify.message);
    } finally {
      setPurchasing(false);
    }
  };

  // ── Feature-flag-off / non-iOS fallback ─────────────────────
  if (!flagOn || !isIos) {
    return (
      <UnavailableScreen
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
      className="flex-1 bg-white dark:bg-[#0B0B12]"
      edges={["top", "bottom"]}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: 24, paddingBottom: 40 }}
      >
        {/* Close button top-right. Respecting the top safe-area edge
            on the wrapping SafeAreaView keeps this pressable below the
            iOS status bar — without "top" in edges the X overlapped
            wifi/signal/battery icons and was mostly untappable on
            build 38 TestFlight. */}
        <View className="flex-row justify-end mb-4">
          <Pressable
            onPress={() => router.back()}
            hitSlop={16}
            className="h-8 w-8 items-center justify-center rounded-full bg-zinc-50 dark:bg-[#1E1E2E]"
          >
            <Ionicons name="close" size={18} color="#A1A1AA" />
          </Pressable>
        </View>

        <View className="h-14 w-14 rounded-2xl bg-violet-600/20 items-center justify-center mb-6 border border-violet-600/30">
          <Ionicons name="sparkles" size={26} color="#A78BFA" />
        </View>

        <Text className="text-3xl font-bold text-zinc-900 dark:text-zinc-50 leading-tight">
          Acuity Pro
        </Text>

        <Text className="mt-3 text-base text-zinc-500 dark:text-zinc-400 leading-relaxed">
          Full debriefs on every recording. Themes, weekly reports,
          Life Matrix, calendar — all the patterns under your nightly
          entries, surfaced.
        </Text>

        {/* Product card */}
        <View className="mt-8 rounded-2xl border border-violet-600/30 bg-violet-600/5 p-5">
          {loadState === "loading" && (
            <View className="flex-row items-center justify-center py-3">
              <ActivityIndicator color="#A78BFA" />
            </View>
          )}
          {loadState === "error" && (
            <View>
              <Text className="text-sm text-zinc-700 dark:text-zinc-200">
                Couldn&apos;t load Acuity Pro. The App Store may be
                temporarily unreachable.
              </Text>
              <Pressable
                onPress={loadProduct}
                className="mt-3 self-start rounded-md bg-violet-600/30 px-3 py-1.5"
              >
                <Text className="text-xs font-semibold text-violet-100">
                  Retry
                </Text>
              </Pressable>
            </View>
          )}
          {loadState === "idle" && product && (
            <View>
              <Text className="text-xs font-semibold uppercase tracking-widest text-violet-400">
                Monthly
              </Text>
              <Text className="mt-1 text-3xl font-bold text-zinc-900 dark:text-zinc-50">
                {product.localizedPrice}
                <Text className="text-base font-normal text-zinc-500 dark:text-zinc-400">
                  {" "}/ month
                </Text>
              </Text>
              <Text className="mt-3 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
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
          />
          <ValueRow
            icon="calendar-outline"
            text="Sunday weekly reports with mood + theme arcs"
          />
          <ValueRow
            icon="grid-outline"
            text="Life Matrix radar refreshed as you record"
          />
          <ValueRow
            icon="link-outline"
            text="Calendar sync — tasks land where you plan"
          />
          <ValueRow
            icon="time-outline"
            text="Quarterly Life Audits + memoir export"
          />
        </View>

        {errorMsg && (
          <View className="mt-6 rounded-md bg-rose-500/10 px-3 py-2">
            <Text className="text-sm text-rose-300">{errorMsg}</Text>
          </View>
        )}

        <View className="mt-auto pt-10 gap-3">
          <Pressable
            onPress={handlePurchase}
            disabled={purchasing || loadState !== "idle" || !product}
            className="rounded-full bg-violet-600 py-4 items-center"
            style={{
              opacity: purchasing || !product ? 0.6 : 1,
              shadowColor: "#7C3AED",
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.35,
              shadowRadius: 12,
            }}
          >
            {purchasing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white text-sm font-semibold">
                Subscribe — {product?.localizedPrice ?? "$12.99"}/month
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
            <Text className="text-zinc-500 dark:text-zinc-400 text-sm">
              Continue on web
            </Text>
          </Pressable>

          <RestorePurchasesButton onRestored={async () => {
            await refresh();
            router.back();
          }} />

          {/* App Store Guideline 3.1.2(a) — auto-renewing subscription
              disclosure. The four-sentence boilerplate below is
              Apple's required verbatim copy for every screen that
              commits an auto-renewing IAP. Removing or paraphrasing
              any of it is a reliable rejection cause. Functional
              Terms + Privacy links are also mandated and must open
              the actual policy pages (not in-app screens).
              See: developer.apple.com/app-store/review/guidelines/#3.1.2 */}
          <Text className="text-[11px] text-zinc-500 dark:text-zinc-400 text-center mt-6 leading-relaxed">
            Payment will be charged to your Apple ID account at the
            confirmation of purchase. Subscription automatically
            renews unless it is canceled at least 24 hours before the
            end of the current period. Your account will be charged
            for renewal within 24 hours prior to the end of the
            current period at {product?.localizedPrice ?? "$12.99"}
            /month. You can manage and cancel your subscriptions by
            going to your account settings on the App Store after
            purchase.
          </Text>
          <View className="flex-row justify-center gap-3 mt-3">
            <Text
              className="text-[11px] text-violet-400 underline"
              onPress={() =>
                void WebBrowser.openBrowserAsync(
                  "https://getacuity.io/terms"
                )
              }
            >
              Terms of Use
            </Text>
            <Text className="text-[11px] text-zinc-500 dark:text-zinc-400">
              ·
            </Text>
            <Text
              className="text-[11px] text-violet-400 underline"
              onPress={() =>
                void WebBrowser.openBrowserAsync(
                  "https://getacuity.io/privacy"
                )
              }
            >
              Privacy Policy
            </Text>
          </View>

          <Text className="text-[10px] text-zinc-500 dark:text-zinc-400 text-center mt-4 leading-snug">
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
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  text: string;
}) {
  return (
    <View className="flex-row items-center gap-3">
      <Ionicons name={icon} size={18} color="#A78BFA" />
      <Text className="text-sm text-zinc-700 dark:text-zinc-200 flex-1">
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
  onClose,
  onContinueOnWeb,
}: {
  onClose: () => void;
  onContinueOnWeb: () => Promise<void> | void;
}) {
  return (
    <SafeAreaView
      className="flex-1 bg-white dark:bg-[#0B0B12]"
      edges={["top", "bottom"]}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: 24, paddingBottom: 40 }}
      >
        <View className="flex-row justify-end mb-4">
          <Pressable
            onPress={onClose}
            hitSlop={16}
            className="h-8 w-8 items-center justify-center rounded-full bg-zinc-50 dark:bg-[#1E1E2E]"
          >
            <Ionicons name="close" size={18} color="#A1A1AA" />
          </Pressable>
        </View>

        <Text className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          Acuity Pro
        </Text>
        <Text className="mt-3 text-base text-zinc-500 dark:text-zinc-400 leading-relaxed">
          Full debriefs, weekly reports, calendar sync, and more.
          Subscribe on the web — your access works on iOS the same
          way.
        </Text>

        <View className="mt-auto pt-10 gap-3">
          <Pressable
            onPress={() => void onContinueOnWeb()}
            className="rounded-full bg-violet-600 py-4 items-center"
          >
            <Text className="text-white text-sm font-semibold">
              Continue on web
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
