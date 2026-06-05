import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Avatar, SubscriptionPill } from "@/components/acuity";
import { fetchCatalog, type CatalogResponse } from "@/lib/achievements-api";
import { api } from "@/lib/api";
import { AppearanceCard } from "@/components/appearance/appearance-card";
import { TrialStatusCard } from "@/components/TrialStatusCard";
import { HapticsRow } from "@/components/appearance/haptics-row";
import { DeleteAccountModal } from "@/components/delete-account-modal";
import { FeedbackModal } from "@/components/feedback-modal";
import { RestorePurchasesButton } from "@/components/restore-purchases-button";
import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/contexts/theme-context";
import {
  isLocalAuthCapable,
  isLockEnabled,
} from "@/lib/app-lock";
import { TOUR_FORCE_REPLAY_KEY } from "@/hooks/use-tour-trigger";
import { isIapEnabled } from "@/lib/iap-config";
import { openSubscriptionPortal } from "@/lib/subscription";

export default function ProfileTab() {
  const router = useRouter();
  const { user, signOut, deleteAccount, refresh } = useAuth();
  const { tokens } = useTheme();
  const [signingOut, setSigningOut] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  // Just-enough state to drive the Security row's sublabel + visibility.
  // The actual toggle + auto-lock picker live on /security.
  const [lockEnabled, setLockEnabledLocal] = useState<boolean | null>(null);
  const [lockCapable, setLockCapable] = useState<boolean>(false);

  // Read current lock state + device capability on mount.
  useEffect(() => {
    let cancelled = false;
    void Promise.all([isLockEnabled(), isLocalAuthCapable()]).then(
      ([enabled, capable]) => {
        if (cancelled) return;
        setLockEnabledLocal(enabled);
        setLockCapable(capable);
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const handleReplayTour = async () => {
    // 1. Set the force-replay flag + clear the local completion marker
    //    FIRST. The Home tab's focus trigger (use-tour-trigger) reads
    //    this flag on focus and fires the tour, bypassing the
    //    first-login gates (totalRecordings/tourCompletedAt).
    await AsyncStorage.setItem(TOUR_FORCE_REPLAY_KEY, "1").catch(() => {});
    await AsyncStorage.removeItem("acuity.tour.completed").catch(() => {});
    // 2. Navigate to Home NOW — synchronously, before any network await.
    //    The previous version awaited refresh() first, so a slow/failed
    //    /me call blocked navigation entirely (no nav, no tour). Landing
    //    on Home focuses it → the focus trigger fires the walkthrough.
    router.replace("/(tabs)" as never);
    // 3. Reset server state + refresh in the background — non-blocking,
    //    so it can't prevent navigation or the tour. Keeps /me's
    //    tourCompletedAt honest for the next session.
    void api
      .post("/api/user/tour-reset", {})
      .catch(() => {})
      .finally(() => {
        void refresh();
      });
  };

  const handleSignOut = () => {
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          setSigningOut(true);
          await signOut();
          router.replace("/(auth)/sign-in");
        },
      },
    ]);
  };

  const name = user?.name ?? "Acuity User";
  const email = user?.email ?? "—";
  const subStatus = user?.subscriptionStatus ?? "FREE";
  const subSource = user?.subscriptionSource ?? null;
  const isPro = subStatus === "PRO";

  // Slice 6 — urgency inputs for SubscriptionPill. Match the same
  // logic as TrialStatusCard so the pill + card stay in sync. The
  // SubscriptionPill renders the gradMix variant at 4-7d and the
  // bad-tint at 1-3d when daysRemaining is supplied; trialEnded
  // wins over status for FREE-post-expiry within the 14-day window.
  const TRIAL_PILL_POST_EXPIRY_DAYS = 14;
  let pillDaysRemaining: number | undefined;
  let pillTrialEnded = false;
  if (subStatus === "TRIAL" && user?.trialEndsAt) {
    const ms = new Date(user.trialEndsAt).getTime() - Date.now();
    pillDaysRemaining = Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
  } else if (subStatus === "FREE" && user?.trialExpiredAt) {
    const daysSince =
      (Date.now() - new Date(user.trialExpiredAt).getTime()) /
      (24 * 60 * 60 * 1000);
    if (daysSince >= 0 && daysSince <= TRIAL_PILL_POST_EXPIRY_DAYS) {
      pillTrialEnded = true;
    }
  }
  const isAppleSub = subSource === "apple";
  const isStripeSub = subSource === "stripe";
  // Only show Stripe "Manage subscription" when the user actually
  // has a Stripe customer behind their PRO status. Comped / reviewer
  // accounts are PRO without a Stripe row — the portal call would
  // 400 NoSubscription, surfacing as a confusing dead-end Alert.
  const canManageStripeSubscription =
    isPro && isStripeSub && user?.hasStripeCustomer === true;
  // Phase 3a — show in-app Subscribe entry point for FREE users on
  // iOS when the build-time IAP flag is on. Falls back to the web
  // "Manage plan on web" link when the flag is off OR on Android.
  const showInAppSubscribe =
    !isPro && Platform.OS === "ios" && isIapEnabled();
  // For Apple-source PRO users, route Manage to iOS Settings
  // (Apple's deep link). For Stripe-source PRO users, the existing
  // openSubscriptionPortal flow handles it.
  const handleManageAppleSubscription = () => {
    void Linking.openURL("https://apps.apple.com/account/subscriptions");
  };

  // Days remaining on the current paid period — used by the delete
  // modal to spell out forfeiture. Null on non-PRO users, missing
  // field, or a calculation that doesn't make sense (negative, NaN).
  const daysRemaining: number | null = (() => {
    if (!isPro) return null;
    const iso = user?.stripeCurrentPeriodEnd;
    if (!iso) return null;
    const end = new Date(iso).getTime();
    if (!Number.isFinite(end)) return null;
    const now = Date.now();
    const days = Math.ceil((end - now) / (24 * 60 * 60 * 1000));
    if (!Number.isFinite(days) || days < 0) return null;
    return days;
  })();
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <SafeAreaView
      className="flex-1"
      edges={["top"]}
      style={{ backgroundColor: tokens.bg }}
    >
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <View className="mb-2">
          <Text
            className="text-2xl font-bold"
            style={{ color: tokens.text }}
          >
            Profile
          </Text>
          <Text
            className="text-sm mt-1"
            style={{ color: tokens.textTer }}
          >
            Account &amp; settings
          </Text>
        </View>

        {/* Avatar + name + email + subscription pill. Q11 Phase B:
            uses the shared Avatar primitive (same source as Home's
            44px identity hero, here at 64px per spec) and the new
            SubscriptionPill primitive (PRO renders gradMix +
            sparkle; FREE renders quiet bgSub). */}
        <View className="items-center mt-6 mb-8">
          <Avatar initials={initials} size={64} />
          <Text
            className="font-semibold text-lg mt-3"
            style={{ color: tokens.text }}
          >
            {name}
          </Text>
          <Text
            className="text-sm"
            style={{ color: tokens.textSec }}
          >
            {email}
          </Text>
          <View style={{ marginTop: 12 }}>
            <SubscriptionPill
              status={subStatus as never}
              daysRemaining={pillDaysRemaining}
              trialEnded={pillTrialEnded}
            />
          </View>
        </View>

        {/* Trial countdown / post-expiry card — slice 5 (2026-05-25).
            Mobile parity for the web /account TrialStatusCard. Renders
            null for PRO + long-dormant FREE; otherwise shows one of
            four state-aware compositions. */}
        <TrialStatusCard
          subscriptionStatus={subStatus}
          trialEndsAt={user?.trialEndsAt ?? null}
          trialExpiredAt={user?.trialExpiredAt ?? null}
        />

        {/* Subscription block — stays at top, not grouped under a
            settings label. The visual refresh's full Subscription
            card ships in a later slice; for Q2 we keep the existing
            row-based rendering with the same conditional rules. */}
        <View className="gap-2">
          {/* Phase 3a — FREE users see "Subscribe" (in-app, iOS only,
              flag-on) AND "Manage plan on web" (3.1.3(b) requires the
              external link to remain alongside any IAP entry point). */}
          {showInAppSubscribe && (
            <MenuItem
              icon="sparkles-outline"
              label="Subscribe"
              sublabel="Acuity Pro — full debriefs, weekly reports, calendar"
              onPress={() => router.push("/subscribe")}
            />
          )}
          {!isPro && (
            // 3.1.3(b) Multiplatform Service compliance. Opens Safari
            // (external browser), never an in-app WebView. Stays
            // visible alongside the in-app Subscribe option above.
            <MenuItem
              icon="globe-outline"
              label="Manage plan on web"
              sublabel="Opens your account in a browser"
              onPress={() => {
                const url = `${process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000"}/upgrade?src=mobile_profile`;
                void Linking.openURL(url);
              }}
            />
          )}

          {/* Phase 3a — Apple-source PRO users get the iOS Settings
              deep-link instead of the Stripe Portal. Apple's only
              supported subscription-management surface for IAP. */}
          {isPro && isAppleSub && (
            <MenuItem
              icon="settings-outline"
              label="Manage in iOS Settings"
              sublabel="Cancel, change plan, view in Apple ID"
              onPress={handleManageAppleSubscription}
            />
          )}

          {canManageStripeSubscription && (
            // Apple Guideline 3.1.2 — in-app subscription management
            // for Stripe-sourced subs. Opens the Stripe Customer
            // Portal in SafariViewController. Customer is looked up
            // server-side by user.id, not email, so this works for
            // Apple private-relay accounts. Hidden on PRO-without-
            // customer accounts (App Store reviewer seed, comped
            // accounts) to avoid the dead-end portal call.
            <MenuItem
              icon="card-outline"
              label="Manage subscription"
              sublabel="Cancel, change payment, view invoices"
              onPress={() => {
                void openSubscriptionPortal();
              }}
            />
          )}

          {/* Apple App Review requires a Restore Purchases affordance
              on every screen that presents subscription state. The
              button self-hides on Android + flag-off builds. */}
          <RestorePurchasesButton onRestored={refresh} />
        </View>

        {/* ACTIVITY group — v1.3 achievements entry point. The summary
            row reads count + total points from /api/achievements so
            the visible state stays accurate without a second polled
            counter on this screen. */}
        <SettingsGroup label="Activity">
          <AchievementsRow />
        </SettingsGroup>

        {/* PREFERENCES group */}
        <SettingsGroup label="Preferences">
          <AppearanceCard />
          <HapticsRow />
          <MenuItem
            icon="time-outline"
            label="Reminders"
            sublabel="When to nudge you to journal"
            onPress={() => router.push("/reminders")}
          />
          {/* Replay product tour — clears User.tourCompletedAt + the
              local AsyncStorage marker, then bounces to home so the
              tour fires on the next mount. Keeps the guided_start
              achievement (once earned, stays earned). v1.3.x. */}
          <MenuItem
            icon="compass-outline"
            label="Replay product tour"
            sublabel="Walk through the app again from the beginning"
            onPress={() => void handleReplayTour()}
          />
          {/* Security — Face ID / app lock + auto-lock interval.
              Lives on its own screen so the picker (Immediately /
              1m / 2m / 5m / 15m / Never) has room. The picker was
              the v1.3.x ask — users hated the 30s in-app re-lock
              the v1.3 build shipped with. Self-hides on devices
              without biometry or passcode enrolled. */}
          {lockCapable && (
            <MenuItem
              icon="lock-closed-outline"
              label="Security"
              sublabel={
                lockEnabled === null
                  ? "Face ID, app lock, auto-lock interval"
                  : lockEnabled
                    ? "App lock on"
                    : "Lock Acuity with Face ID or device passcode"
              }
              onPress={() => router.push("/security" as never)}
            />
          )}
          <MenuItem
            icon="calendar-outline"
            label="Calendar"
            sublabel="Send tasks to your iOS calendar"
            onPress={() => router.push("/integrations")}
          />
          {/* Privacy — product-analytics opt-out + withdraw the
              special-category (Art. 9) consent given at onboarding.
              v1.4 GDPR slice. */}
          <MenuItem
            icon="shield-checkmark-outline"
            label="Privacy"
            sublabel="Product analytics + data-processing consent"
            onPress={() => router.push("/privacy" as never)}
          />
          {/* Slice 7 v1.2 Calendar Integration (inbound) — opens
              Acuity on web to complete the Google Calendar OAuth
              flow. We open the web /account#calendar anchor so the
              user signs in via web if needed and lands directly on
              the connect card. Distinct from the iOS EventKit
              outbound row above. */}
          <MenuItem
            icon="link-outline"
            label="Connect Google Calendar"
            sublabel="Acuity reads your day to ground reflections — opens on web"
            onPress={() => {
              const base =
                process.env.EXPO_PUBLIC_API_URL ?? "https://getacuity.io";
              void Linking.openURL(`${base}/account#calendar`);
            }}
          />
        </SettingsGroup>

        {/* SUPPORT group */}
        <SettingsGroup label="Support">
          {/* Slice O — feedback intake. Opens a textarea + type
              picker modal; submits to /api/feedback/submit which
              forwards a Block-Kit message to the #acuity-feedback
              Slack channel; Make.com → Monday from there. */}
          <MenuItem
            icon="chatbox-ellipses-outline"
            label="Send feedback"
            sublabel="Bugs, feature ideas, or anything else"
            onPress={() => setShowFeedbackModal(true)}
          />
        </SettingsGroup>

        {/* ACCOUNT group — sign-out + danger-tinted delete. The
            design's "Manage account" lives here in the Data group;
            Acuity has a dedicated delete flow + sign-out which we
            keep distinct rather than rolling into one row. */}
        <SettingsGroup label="Account">
          <MenuItem
            icon="log-out-outline"
            label={signingOut ? "Signing out..." : "Sign out"}
            destructive
            onPress={handleSignOut}
          />
          {/* In-app account deletion — required by App Store
              Guideline 5.1.1(v). Opens a type-to-confirm modal that
              calls POST /api/user/delete and signs the user out on
              success. */}
          <MenuItem
            icon="trash-outline"
            label="Delete account"
            sublabel="Permanently remove all your data"
            destructive
            onPress={() => setShowDeleteModal(true)}
          />
        </SettingsGroup>
      </ScrollView>

      <FeedbackModal
        visible={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
      />

      <DeleteAccountModal
        visible={showDeleteModal}
        isPro={isPro}
        daysRemaining={daysRemaining}
        onClose={() => setShowDeleteModal(false)}
        onDelete={deleteAccount}
        onDeleted={() => {
          setShowDeleteModal(false);
          router.replace("/(auth)/sign-in");
        }}
        onCancelSubscription={() => {
          // Close the modal first so the in-app browser overlay
          // doesn't mount on top of a dismissed sheet — then open the
          // portal. The user lands back on the profile screen when
          // they finish in Stripe.
          setShowDeleteModal(false);
          void openSubscriptionPortal();
        }}
      />
    </SafeAreaView>
  );
}

/**
 * Settings group — uppercase eyebrow label + vertical stack of rows.
 * Light visual-grammar polish (Slice Q2): groups inherit token colors
 * so they look at home next to the Appearance card in either mode.
 */
function SettingsGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const { tokens } = useTheme();
  return (
    <View style={{ marginTop: 28, gap: 8 }}>
      <Text
        style={{
          fontFamily: tokens.fontMono,
          fontSize: 10,
          fontWeight: "700",
          letterSpacing: 1.4,
          color: tokens.textTer,
          paddingHorizontal: 4,
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
      <View style={{ gap: 8 }}>{children}</View>
    </View>
  );
}

function MenuItem({
  icon,
  label,
  sublabel,
  destructive = false,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  sublabel?: string;
  destructive?: boolean;
  onPress?: () => void;
}) {
  const { tokens } = useTheme();
  const labelColor = destructive ? tokens.bad : tokens.text;
  const sublabelColor = destructive ? tokens.bad : tokens.textTer;
  const iconColor = destructive ? tokens.bad : tokens.textSec;
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        borderRadius: tokens.radius.lg,
        backgroundColor: tokens.cardBg,
        borderWidth: 1,
        borderColor: tokens.cardBorder,
        paddingHorizontal: 16,
        paddingVertical: 14,
      }}
    >
      <Ionicons name={icon} size={20} color={iconColor} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={{
            fontFamily: tokens.fontSans,
            fontSize: 15,
            fontWeight: "500",
            color: labelColor,
          }}
        >
          {label}
        </Text>
        {sublabel && (
          <Text
            style={{
              fontFamily: tokens.fontSans,
              fontSize: 13,
              fontWeight: "400",
              color: sublabelColor,
            }}
          >
            {sublabel}
          </Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={16} color={tokens.textTer} />
    </Pressable>
  );
}

/**
 * v1.3 Achievements entry point in the Activity group on Profile.
 * Polls /api/achievements on mount for the sublabel counts so the
 * row reads "5 of 26 earned · 180 pts" even on first render. Falls
 * back to a generic sublabel while loading. Tap routes to the full
 * grid screen at /achievements.
 */
function AchievementsRow() {
  const router = useRouter();
  const [totals, setTotals] = useState<CatalogResponse["totals"] | null>(null);
  // Refetch on FOCUS, not just mount — the Settings tab is kept alive, so a
  // mount-only fetch showed a stale "0 of 27" after the user earned
  // guided_start mid-session. Focus refetch picks up new achievements when
  // the user returns to Settings. (fetchCatalog is uncached, so this is
  // always fresh.)
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      fetchCatalog()
        .then((res) => {
          if (!cancelled) setTotals(res.totals);
        })
        .catch(() => {
          /* sublabel just shows the generic copy */
        });
      return () => {
        cancelled = true;
      };
    }, [])
  );
  const sublabel = totals
    ? `${totals.earned} of ${totals.total} earned · ${totals.points} pts`
    : "Badges for streaks, depth, and special moments";
  return (
    <MenuItem
      icon="medal-outline"
      label="Achievements"
      sublabel={sublabel}
      // expo-router's typed-routes union doesn't include the new
      // /achievements route until the next `expo start` regenerates
      // expo-env.d.ts. `as never` is the established escape hatch
      // used elsewhere in the codebase for the same situation.
      onPress={() => router.push("/achievements" as never)}
    />
  );
}
