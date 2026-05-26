import "../global.css";

import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
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
import { LockProvider } from "@/contexts/lock-context";
import { ThemeProvider, useTheme } from "@/contexts/theme-context";
import { LockScreenOverlay } from "@/components/lock-screen-overlay";
import { UniversalLinkHandler } from "@/components/universal-link-handler";
import { UpdatePromptOverlay } from "@/components/UpdatePromptOverlay";
import { initMetaSdk, setMetaUserId } from "@/lib/meta-sdk";
import { reapplyRemindersIfNeeded } from "@/lib/notifications-boot";
import { refreshPushTokenOnLaunch } from "@/lib/push-token";
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

  // Hide the native splash once auth has resolved. We block on
  // `loading` rather than `user` because a signed-out user should see
  // the sign-in screen, not a spinner. Paired with
  // `SplashScreen.preventAutoHideAsync()` at module scope, this turns
  // the boot sequence into: splash → sign-in/home (no spinner flash).
  useEffect(() => {
    if (!loading) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [loading]);

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
    // Slice 9b — refresh Expo push token on every authenticated cold
    // launch. No-op when the user has never registered or permission
    // is currently denied; only writes when Expo's current token
    // differs from whatever's on the device-local registered marker.
    void refreshPushTokenOnLaunch();
    // Meta SDK (2026-05-25, Keenan request) — initialize on the
    // first authenticated render so the ATT prompt appears with
    // context (the user has signed in, has seen the app's value,
    // and the iOS system prompt now reads as "this app you just
    // used wants to attribute its install" rather than a cold
    // demand at splash. Idempotent — subsequent calls are no-ops.
    void initMetaSdk();
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

  useEffect(() => {
    if (loading) return;

    const inAuth = segments[0] === "(auth)";
    const inOnboarding = segments[0] === "onboarding";
    // Deep-link handoff from the magic-link email. AuthGate must
    // let the user stay on /auth-callback while the token-exchange
    // runs — bouncing them back to sign-in mid-exchange would lose
    // the token and drop them into an infinite loop.
    const inAuthCallback = segments[0] === "auth-callback";

    if (!user && !inAuth && !inAuthCallback) {
      router.replace("/(auth)/sign-in");
      return;
    }

    if (user && !user.onboardingCompleted && !inOnboarding && !inAuthCallback) {
      // Fresh signup OR a user who existed before the onboarding
      // schema landed (no row → completedAt is falsy). Drop them at
      // the step they last reached so re-launches resume cleanly.
      const step = Math.max(1, user.onboardingStep ?? 1);
      router.replace(`/onboarding?step=${step}`);
      return;
    }

    if (user && user.onboardingCompleted && (inAuth || inOnboarding)) {
      router.replace("/(tabs)");
    }
  }, [user, loading, segments, router]);

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
              <ThemedApp />
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
            title: "Brain dump",
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
      {/* App-level lock overlay. Mounted AFTER <Stack/> so its
          absolute-positioned full-screen view sits above the route
          tree's content. Renders nothing when lock is disabled or
          user is signed out. */}
      <LockScreenOverlay />
    </>
  );
}
