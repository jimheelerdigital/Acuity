import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/auth-context";
import { completeMobileMagicLink } from "@/lib/auth";

/**
 * Deep-link handler for magic-link sign-in.
 *
 * The flow:
 *   1. User requests a magic link from /(auth)/sign-in → app posts
 *      to /api/auth/mobile-magic-link → email goes out with a link
 *      to https://getacuity.io/auth/mobile-complete?token=X.
 *   2. User taps the email link on their phone → Safari opens → the
 *      web page redirects to acuity://auth-callback?token=X.
 *   3. iOS routes that URL to this app; Expo Router maps
 *      /auth-callback → this screen.
 *   4. We pull the token from the route params, exchange it for a
 *      session JWT at /api/auth/mobile-complete, then refresh the
 *      AuthContext. The root AuthGate routes to (tabs) on success.
 *
 * Scheme "acuity" is registered in app.json's iOS
 * CFBundleURLTypes — updating it there requires a native rebuild
 * (eas build or expo prebuild + run:ios). The scheme predates this
 * file (it was already present for Google PKCE redirect), so no
 * rebuild is required if a TestFlight build exists.
 */
export default function AuthCallbackScreen() {
  const router = useRouter();
  const { refresh } = useAuth();
  const params = useLocalSearchParams<{ token?: string }>();
  const [status, setStatus] = useState<"working" | "error">("working");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    const token = typeof params.token === "string" ? params.token : "";
    if (!token) {
      setStatus("error");
      setErrorMessage("Missing or invalid link.");
      return;
    }
    let cancelled = false;
    (async () => {
      const result = await completeMobileMagicLink(token);
      if (cancelled) return;
      if (!result.ok) {
        setStatus("error");
        setErrorMessage(
          result.detail === "ExpiredToken"
            ? "This link has expired. Request a new one."
            : result.detail === "InvalidToken"
            ? "This link is no longer valid."
            : "Couldn't complete sign-in. Try requesting a new link."
        );
        return;
      }
      await refresh();
      // AuthGate in the root _layout.tsx will route to (tabs) once
      // user becomes non-null. Nudge to /(tabs) explicitly in case
      // we're still mounted when the auth state resolves.
      router.replace("/(tabs)");
    })();
    return () => {
      cancelled = true;
    };
  }, [params.token, refresh, router]);

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-[#0B0B12] items-center justify-center px-6">
      {status === "working" ? (
        <View className="items-center">
          <ActivityIndicator size="large" color="#A1A1AA" />
          <Text className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
            Signing you in…
          </Text>
        </View>
      ) : (
        <View className="items-center">
          <Text className="text-4xl mb-4">⚠️</Text>
          <Text className="text-xl font-bold text-zinc-900 dark:text-zinc-50 mb-2 text-center">
            Sign-in failed
          </Text>
          <Text className="text-sm text-zinc-500 dark:text-zinc-400 text-center leading-relaxed mb-6">
            {errorMessage}
          </Text>
          <Pressable
            onPress={() => router.replace("/(auth)/sign-in")}
            className="px-4 py-3 rounded-xl bg-zinc-900 dark:bg-zinc-50"
          >
            <Text className="text-sm font-semibold text-white dark:text-zinc-900">
              Back to sign in →
            </Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}
