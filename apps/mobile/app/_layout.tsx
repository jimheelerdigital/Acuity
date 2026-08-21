import "../global.css";

import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";

import { decideColdStartRoute } from "@/lib/onboarding-v10/entry-routing";
import { markV10Offered } from "@/lib/onboarding-v10/state";
import { useColdStartFacts } from "@/lib/onboarding-v10/use-cold-start-facts";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppState, Text as RNText } from "react-native";
import * as Sentry from "@sentry/react-native";
import {
  useFonts,
  Manrope_300Light,
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from "@expo-google-fonts/manrope";
import {
  GeistMono_400Regular,
  GeistMono_500Medium,
  GeistMono_600SemiBold,
} from "@expo-google-fonts/geist-mono";

import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { api } from "@/lib/api";
import { LockProvider } from "@/contexts/lock-context";
import { ThemeProvider, useTheme } from "@/contexts/theme-context";
import { LockScreenOverlay } from "@/components/lock-screen-overlay";
import { UniversalLinkHandler } from "@/components/universal-link-handler";
import { UpdatePromptOverlay } from "@/components/UpdatePromptOverlay";
import { CelebrationModal } from "@/components/achievements/CelebrationModal";
import { TourProvider } from "@/components/tour/TourProvider";
import { useAchievementQueue } from "@/hooks/use-achievement-queue";
import { initMetaSdk, setMetaUserId } from "@/lib/meta-sdk";
import { reapplyRemindersIfNeeded } from "@/lib/notifications-boot";
import { refreshPushTokenOnLaunch } from "@/lib/push-token";
import {
  handleColdStartNotificationTap,
  registerNotificationTapRouting,
} from "@/lib/notification-routing";
import { initSentry, setSentryUser } from "@/lib/sentry";

// Sentry init at module scope — idempotent on re-import.
initSentry();

// Slice H typography (2026-05-18): cap Dynamic Type scaling at 1.5×
// so iOS "Larger Accessibility" sizes don't blow out our layouts.
// allowFontScaling stays at its RN default (true) so users with
// reduced/larger text settings see scaled text. The 1.5 cap matches
// the iOS HIG recommendation for non-text-primary surfaces (1.3 for
// chrome-heavy, 1.7+ for reading-focused). 1.5 is the right middle
// for an app that mixes nav chrome, lists, and reading content.
//
// Text.defaultProps mutation is the React Native idiom for this —
// no per-component prop sprinkling required. Set once at module
// scope so it applies to every <Text/> instance the route tree
// renders.
(RNText as unknown as { defaultProps?: Record<string, unknown> })
  .defaultProps ||= {};
(RNText as unknown as { defaultProps: Record<string, unknown> })
  .defaultProps.maxFontSizeMultiplier = 1.5;

// Keep the native splash up until auth + theme have hydrated. Without
// this, Expo auto-hides the splash as soon as React mounts, which
// lands the user on the AuthGate's <ActivityIndicator> spinner — the
// "white spinner flash between splash and content" the audit flagged.
SplashScreen.preventAutoHideAsync().catch(() => {});

function AuthGate() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const { facts, ready: factsReady } = useColdStartFacts();
  // Tracks the userId we've already run once-per-session boot effects
  // for (push-token refresh, Meta SDK init), so user-object churn from
  // refresh() doesn't re-fire them. See the effect below.
  const pushBootedForRef = useRef<string | null>(null);

  // Hide the native splash once auth has resolved AND the routing facts
  // are in. We block on `loading` rather than `user` because a signed-out
  // user should see the sign-in screen, not a spinner. Paired with
  // `SplashScreen.preventAutoHideAsync()` at module scope, this turns the
  // boot sequence into: splash → sign-in/home/funnel (no spinner flash).
  //
  // `factsReady` is part of the condition because the routing effect below
  // waits for it too. Hiding earlier would show the user the pre-redirect
  // screen — a signed-out first-run installer would see sign-in flash
  // before being sent into the funnel, which is the exact flash this gate
  // was built to remove. Both signals are local reads, so the added wait
  // is milliseconds and is dominated by the network call behind `loading`.
  useEffect(() => {
    if (!loading && factsReady) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [loading, factsReady]);

  // Tag Sentry with the current user id as soon as auth resolves.
  useEffect(() => {
    if (loading) return;
    setSentryUser(
      user ? { id: user.id, subscriptionStatus: user.subscriptionStatus } : null
    );
  }, [user, loading]);

  // Reminder boot self-heal (Slice P2, 2026-05-19). Runs once after
  // auth resolves and again on every foreground transition. Internally
  // throttled (6h) and idempotent, so this is safe to call freely.
  // Skipped when the user is signed out — the API call would 401 and
  // the local schedule should already be empty.
  useEffect(() => {
    // Clear the Meta SDK user id on sign-out so a subsequent
    // sign-in by a different user doesn't inherit the previous
    // identity in conversion events. Cheap, idempotent.
    if (!loading && !user) {
      setMetaUserId(null);
      return;
    }
    if (loading || !user) return;
    const userId = user.id;
    void reapplyRemindersIfNeeded(userId);
    // Run the once-per-session boot side effects only when the signed-in
    // userId actually changes — NOT on every `user` object-identity churn.
    // auth-context's refresh() allocates a new user object on each
    // /api/user/me (and refresh fires on mount, foreground, IAP check),
    // so without this guard refreshPushTokenOnLaunch() re-POSTed
    // /api/user/push-token 3x per login. Keyed on userId so a genuine
    // user switch (sign out → sign in as someone else) still re-runs.
    if (pushBootedForRef.current !== userId) {
      pushBootedForRef.current = userId;
      // Slice 9b — refresh Expo push token on authenticated launch.
      // No-op when never registered or permission denied; only writes
      // when Expo's current token differs from the device-local marker.
      void refreshPushTokenOnLaunch();
      // Meta SDK (2026-05-25, Keenan request) — initialize on first
      // authenticated render so the ATT prompt appears with context.
      // Idempotent — subsequent calls are no-ops.
      void initMetaSdk();
      // Phase 2/3 (v1.3.3): if the app was cold-launched by tapping an
      // entry completion/failure push, route to it now that auth resolved.
      void handleColdStartNotificationTap((entryId) =>
        router.push(`/entry/${entryId}`)
      );
    }
    setMetaUserId(userId);
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        void reapplyRemindersIfNeeded(userId);
      }
    });
    return () => {
      sub.remove();
    };
  }, [user, loading]);

  // Phase 2/3 (v1.3.3): route taps on entry completion/failure pushes to
  // the entry detail. Registered once; cold-start taps are handled in the
  // boot effect above.
  useEffect(() => {
    return registerNotificationTapRouting((entryId) =>
      router.push(`/entry/${entryId}`)
    );
  }, [router]);

  useEffect(() => {
    if (loading) return;
    // Device facts gate the signed-out branch. See use-cold-start-facts:
    // every one of them can only PREVENT a redirect, so acting before they
    // load would fire the wrong redirect and the right answer would arrive
    // after the user is already looking at sign-in.
    if (!factsReady) return;

    // String() bypasses expo-router's typed-routes segment union — the
    // /onboarding-new folder exists in the file tree but the generated
    // union omits it until the next `expo start`. Runtime is unchanged.
    const segment = String(segments[0] ?? "");

    const route = decideColdStartRoute({
      v10Enabled: facts.v10Enabled,
      signedIn: !!user,
      onboardingCompleted: !!user?.onboardingCompleted,
      subscriptionStatus: user?.subscriptionStatus ?? null,
      isGuest: facts.isGuest,
      v10Offered: facts.v10Offered,
      v10Dismissed: facts.v10Dismissed,
      hasAppHistory: facts.hasAppHistory,
      segment,
    });

    switch (route) {
      case "stay":
        return;

      case "signin":
        router.replace("/(auth)/sign-in");
        return;

      case "home":
        // Covers the PRO bypass (Guideline 3.1.3(b) — a user who already
        // paid, typically via web Stripe, is never routed through mobile
        // onboarding), v10 arrivals who must not get the legacy
        // post-signup flow on top of the one they just finished, and a
        // completed user sitting on an auth/onboarding route.
        //
        // Deliberately does NOT POST /api/onboarding/complete. That
        // endpoint is for an explicit action on the final onboarding
        // step; firing it here (twice, on every AuthGate tick) used to
        // force-complete onboarding rows a user had just reset.
        router.replace("/(tabs)");
        return;

      case "v10":
        // Mark at ROUTING time so a force-quit on Screen 1 resumes the
        // funnel instead of being read as a brand-new install forever.
        void markV10Offered();
        router.replace("/onboarding-new/pain");
        return;

      case "legacy-onboarding": {
        // Fresh signup, or a user predating the onboarding schema (no row
        // → completedAt falsy). Resume at the step they last reached.
        const step = Math.max(1, user?.onboardingStep ?? 1);
        router.replace(`/onboarding?step=${step}`);
        return;
      }
    }
  }, [user, loading, segments, router, facts, factsReady]);

  return null;
}

function RootLayout() {
  // Slice Q1 (2026-05-19): bundle Manrope (display family) + Geist
  // Mono (numerals). Splash screen stays up until both load — without
  // this, the first paint shows system-default fonts then flips to
  // Manrope, which is visually jarring on hero screens.
  const [fontsLoaded] = useFonts({
    Manrope_300Light,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
    GeistMono_400Regular,
    GeistMono_500Medium,
    GeistMono_600SemiBold,
  });
  if (!fontsLoaded) {
    // Splash is already held open by preventAutoHideAsync above.
    // Returning null keeps the splash visible until fonts arrive.
    return null;
  }
  return (
    // GestureHandlerRootView is required for react-native-gesture-
    // handler to work — added 2026-04-23 for the FocusCardStack
    // swipe gesture on Home. Wraps the entire tree so any descendant
    // that uses GestureDetector / PanGestureHandler picks up the
    // required root context.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <LockProvider>
              {/* TourProvider wraps the Stack so a single CopilotProvider
                  sees every CopilotStep registered across tab screens.
                  Above ThemedApp = above <Stack/>. Below LockProvider so
                  a locked app's overlay covers any in-flight tour. */}
              <TourProvider>
                <ThemedApp />
              </TourProvider>
            </LockProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// Sentry.wrap installs the React error boundary and auto-instruments
// navigation breadcrumbs. Without this, uncaught render-tree errors
// never make it to Sentry and silent white-screen crashes stay silent.
export default Sentry.wrap(RootLayout);

function ThemedApp() {
  const { resolved } = useTheme();
  const isDark = resolved === "dark";
  // Stack-screen header colors are one of the few places NativeWind
  // className won't help — native header is styled by JS objects.
  // Flip based on resolved theme so the chrome matches content.
  const headerBg = isDark ? "#0B0B12" : "#FAFAF7";
  const headerFg = isDark ? "#FAFAFA" : "#18181B";
  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} />
      <AuthGate />
      <Stack
        screenOptions={{
          headerShown: false,
          // Show just the chevron on native back buttons — no parent
          // route label. Default behavior leaks "(tabs)" as the back
          // label on detail screens pushed from a tab route.
          headerBackButtonDisplayMode: "minimal",
          headerBackTitle: "Back",
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="auth-callback" options={{ headerShown: false }} />
        <Stack.Screen
          name="entry/[id]"
          options={{
            headerShown: true,
            headerStyle: { backgroundColor: headerBg },
            headerTintColor: headerFg,
            headerTitleStyle: { fontWeight: "600" },
            title: "Entry",
          }}
        />
        <Stack.Screen
          name="record"
          options={{
            headerShown: true,
            headerStyle: { backgroundColor: headerBg },
            headerTintColor: headerFg,
            headerTitleStyle: { fontWeight: "600" },
            title: "Recording",
            presentation: "modal",
          }}
        />
        <Stack.Screen
          name="dimension/[key]"
          options={{
            headerShown: false,
            presentation: "modal",
          }}
        />
        <Stack.Screen
          name="task/[id]"
          options={{
            headerShown: false,
            presentation: "modal",
          }}
        />
        <Stack.Screen
          name="task/new"
          options={{
            headerShown: false,
            presentation: "modal",
          }}
        />
        <Stack.Screen
          name="goal/new"
          options={{
            headerShown: false,
            presentation: "modal",
          }}
        />
        <Stack.Screen
          name="paywall"
          options={{
            headerShown: false,
            presentation: "modal",
          }}
        />
        <Stack.Screen
          name="insights/theme/[themeId]"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="insights/ask"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="insights/state-of-me"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="achievements"
          options={{ headerShown: true }}
        />
        <Stack.Screen
          name="privacy"
          options={{
            headerShown: true,
            headerStyle: { backgroundColor: headerBg },
            headerTintColor: headerFg,
            headerTitleStyle: { fontWeight: "600" },
            title: "Privacy",
          }}
        />
      </Stack>
      {/* Universal Links handler — listens for incoming verify-email
          deep-links and routes them to the existing endpoint. Render
          inside <AuthProvider> via parent — uses useAuth. */}
      <UniversalLinkHandler />
      {/* In-app update prompt. Server-driven version check fires on
          launch; if the server's `recommendedVersion` is higher than
          the running build the modal renders. Force-update mode
          (minimumVersion gate) hides the dismiss button. Sits ABOVE
          the Stack so it covers any route, BELOW the lock overlay so
          a locked app can't be bypassed by tapping through. */}
      <UpdatePromptOverlay />
      {/* v1.3 achievements celebration. Polls /pending on app
          foreground + cold launch; renders the CelebrationModal
          sequentially for each unseen UserAchievement row. Sits
          inside <AuthProvider> via parent — the hook gates on auth
          to avoid 401-polling on the sign-in screen. */}
      <AchievementsCelebrationMount />
      {/* App-level lock overlay. Mounted AFTER <Stack/> so its
          absolute-positioned full-screen view sits above the route
          tree's content. Renders nothing when lock is disabled or
          user is signed out. */}
      <LockScreenOverlay />
    </>
  );
}

/**
 * Glues the achievement queue hook to the CelebrationModal. Gated
 * on auth so it doesn't 401-poll on the sign-in screen. Re-fetches
 * pending on AppState foreground transitions inside the hook
 * itself; mounting here puts the modal above every screen, including
 * (tabs) routes.
 */
function AchievementsCelebrationMount() {
  const { user, loading } = useAuth();
  const queue = useAchievementQueue({ enabled: !loading && !!user });
  if (!queue.current) return null;
  const a = queue.current.achievement;
  return (
    <CelebrationModal
      visible
      slug={a.slug}
      title={a.title}
      description={a.description}
      onContinue={queue.dismiss}
    />
  );
}
