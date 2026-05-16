import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { DeleteAccountModal } from "@/components/delete-account-modal";
import { RestorePurchasesButton } from "@/components/restore-purchases-button";
import { useAuth } from "@/contexts/auth-context";
import { useLock } from "@/contexts/lock-context";
import { useTheme, type ThemeChoice } from "@/contexts/theme-context";
import {
  authenticate,
  isLocalAuthCapable,
  isLockEnabled,
  setLockEnabled,
} from "@/lib/app-lock";
import { isIapEnabled } from "@/lib/iap-config";
import { openSubscriptionPortal } from "@/lib/subscription";

export default function ProfileTab() {
  const router = useRouter();
  const { user, signOut, deleteAccount, refresh } = useAuth();
  const { lockNow } = useLock();
  const [signingOut, setSigningOut] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
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

  const handleToggleLock = async () => {
    if (lockEnabled === null) return;
    if (lockEnabled) {
      // Turning OFF — confirm so users don't tap it by accident.
      Alert.alert(
        "Turn off app lock?",
        "Your entries will no longer require Face ID to view.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Turn off",
            style: "destructive",
            onPress: async () => {
              await setLockEnabled(false);
              setLockEnabledLocal(false);
            },
          },
        ]
      );
      return;
    }
    // Turning ON — require the user to authenticate first so we
    // never enable the lock for a stolen unlocked phone.
    const res = await authenticate("Confirm to enable app lock");
    if (!res.success) {
      Alert.alert(
        "Couldn't enable lock",
        "Face ID / passcode wasn't confirmed. Try again."
      );
      return;
    }
    await setLockEnabled(true);
    setLockEnabledLocal(true);
    // Refresh the in-memory lock cache + engage immediately so the
    // user sees the lock take effect.
    void lockNow();
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
    <SafeAreaView className="flex-1 bg-white dark:bg-[#1E1E2E] dark:bg-[#0B0B12]" edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <View className="mb-2">
          <Text className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Profile</Text>
          <Text className="text-sm text-zinc-400 dark:text-zinc-500 mt-1">
            Account &amp; settings
          </Text>
        </View>

        {/* Avatar */}
        <View className="items-center mt-6 mb-8">
          {user?.image ? (
            <View className="h-20 w-20 rounded-full overflow-hidden border border-violet-600/40">
              {/* RN Image would go here; using initials as fallback */}
              <View className="h-20 w-20 bg-violet-600/20 items-center justify-center">
                <Text className="text-2xl font-bold text-violet-400">
                  {initials}
                </Text>
              </View>
            </View>
          ) : (
            <View className="h-20 w-20 rounded-full bg-violet-600/20 items-center justify-center border border-violet-600/40">
              <Text className="text-2xl font-bold text-violet-400">
                {initials}
              </Text>
            </View>
          )}
          <Text className="text-zinc-800 dark:text-zinc-100 font-semibold text-lg mt-3">
            {name}
          </Text>
          <Text className="text-zinc-500 dark:text-zinc-400 text-sm">{email}</Text>

          {/* Subscription badge */}
          <View
            className={`mt-3 rounded-full px-3 py-1 ${
              subStatus === "PRO"
                ? "bg-violet-600/20"
                : "bg-zinc-800"
            }`}
          >
            <Text
              className={`text-xs font-semibold ${
                subStatus === "PRO"
                  ? "text-violet-400"
                  : "text-zinc-500 dark:text-zinc-400"
              }`}
            >
              {subStatus === "PRO" ? "Pro" : "Free Plan"}
            </Text>
          </View>
        </View>

        {/* Menu */}
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

          <ThemeMenuItem />

          <MenuItem
            icon="time-outline"
            label="Reminders"
            sublabel="When to nudge you to journal"
            onPress={() => router.push("/reminders")}
          />

          {/* App lock toggle — only renders on iOS devices with
              biometry or passcode enrolled. Default OFF. Tapping
              requires the user to authenticate before flipping on
              (prevents enabling on a stolen unlocked phone). */}
          {lockCapable && lockEnabled !== null && (
            <MenuItem
              icon="lock-closed-outline"
              label={lockEnabled ? "App lock: On" : "Require Face ID to open"}
              sublabel={
                lockEnabled
                  ? "Face ID required after 30s in background"
                  : "Lock Acuity with Face ID, Touch ID, or device passcode"
              }
              onPress={() => void handleToggleLock()}
            />
          )}

          <MenuItem
            icon="calendar-outline"
            label="Calendar"
            sublabel="Send tasks to your iOS calendar"
            onPress={() => router.push("/integrations")}
          />

          <MenuItem
            icon="heart-outline"
            label="Connect Apple Health"
            sublabel={
              Platform.OS === "ios"
                ? "Arriving in the next app update"
                : "iOS only"
            }
            onPress={() => {
              if (Platform.OS === "ios") {
                Alert.alert(
                  "Coming soon",
                  "Apple Health integration ships in the next mobile release. The data model + Insights correlation card are already running on web — you'll see correlations once sync is live."
                );
              } else {
                Alert.alert(
                  "iOS only",
                  "Apple Health is an iOS-only feature. Android support is on the roadmap."
                );
              }
            }}
          />

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
        </View>
      </ScrollView>

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
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-2xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-[#13131F] dark:bg-[#1E1E2E] px-4 py-3.5"
    >
      <Ionicons
        name={icon}
        size={20}
        color={destructive ? "#EF4444" : "#71717A"}
      />
      <View className="flex-1">
        <Text
          className={`text-sm ${
            destructive ? "text-red-400" : "text-zinc-700 dark:text-zinc-200"
          }`}
        >
          {label}
        </Text>
        {sublabel && (
          <Text className="text-xs text-zinc-600 dark:text-zinc-300 mt-0.5">{sublabel}</Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={16} color="#52525B" />
    </Pressable>
  );
}

/**
 * Three-state theme segmented control embedded into the profile menu.
 * Mirrors the web /account Appearance section. Persistence is handled
 * by ThemeProvider — picking an option fires a fire-and-forget POST to
 * /api/user/theme so the choice follows the user across devices.
 */
function ThemeMenuItem() {
  const { preference, setPreference } = useTheme();
  const options: { value: ThemeChoice; label: string }[] = [
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
    { value: "system", label: "System" },
  ];
  return (
    <View className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3.5 dark:border-white/10 dark:bg-[#1E1E2E]">
      <View className="flex-row items-center gap-3 mb-3">
        <Ionicons name="contrast-outline" size={20} color="#71717A" />
        <View className="flex-1">
          <Text className="text-sm text-zinc-200 dark:text-zinc-200">
            Appearance
          </Text>
          <Text className="text-xs text-zinc-600 dark:text-zinc-300 mt-0.5 dark:text-zinc-500">
            Light, dark, or follow your system
          </Text>
        </View>
      </View>
      <View className="flex-row rounded-full bg-zinc-800 p-0.5 dark:bg-white/10">
        {options.map((opt) => {
          const selected = preference === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => setPreference(opt.value)}
              className={`flex-1 items-center justify-center rounded-full px-3 py-2 ${
                selected ? "bg-zinc-700 dark:bg-white/20" : ""
              }`}
            >
              <Text
                className={`text-xs font-medium ${
                  selected
                    ? "text-zinc-800 dark:text-zinc-100"
                    : "text-zinc-400 dark:text-zinc-500"
                }`}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
