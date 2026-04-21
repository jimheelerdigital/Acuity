import "../global.css";

import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { ThemeProvider, useTheme } from "@/contexts/theme-context";

function AuthGate() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

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

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <ThemedApp />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

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
      <Stack screenOptions={{ headerShown: false }}>
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
          name="paywall"
          options={{
            headerShown: false,
            presentation: "modal",
          }}
        />
      </Stack>
    </>
  );
}
