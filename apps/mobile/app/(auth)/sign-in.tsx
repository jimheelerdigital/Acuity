import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/auth-context";
import { useGoogleSignIn } from "@/lib/auth";

/**
 * Mobile sign-in screen. Google is the only path — magic-link email
 * was removed with the expo-auth-session migration (the NextAuth
 * email flow issues a web cookie + expects the user to click a link
 * back to the web; it can't cleanly hand off to a native JWT).
 *
 * If Jim decides magic-link is worth keeping on mobile later, the
 * pattern is: POST the email to a new /api/auth/mobile-magic-link
 * endpoint that emails a deep-link-flavored URL
 * (acuity://auth-callback?code=…), the app catches it via
 * expo-linking, exchanges code for JWT at /api/auth/mobile-magic-link
 * /complete. Not cheap; not worth it until Google-only shows real
 * friction.
 */
export default function SignInScreen() {
  const { refresh } = useAuth();
  const { signIn, ready, hasClientId } = useGoogleSignIn();
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    if (!ready) {
      Alert.alert(
        "Not ready",
        hasClientId
          ? "Google SDK is still loading. Try again in a second."
          : "Google sign-in is not configured. Contact support."
      );
      return;
    }
    setLoading(true);
    const result = await signIn();
    setLoading(false);

    if (!result.ok) {
      if (result.reason === "cancelled") return; // user tapped Cancel, no alert
      const headline =
        result.reason === "no_token"
          ? "Google didn't return a session"
          : result.detail ?? "Something went wrong";
      // Temporary: dump the full diagnostic snapshot into the alert.
      // TestFlight doesn't surface console.log anywhere we can read,
      // so the only way to see what the flow actually produced is to
      // put it on-screen. Pull this out once auth is stable.
      const debugLines: string[] = [];
      if (result.debug) {
        const d = result.debug;
        if (d.redirectUri) debugLines.push(`redirectUri: ${d.redirectUri}`);
        if (d.responseType) debugLines.push(`responseType: ${d.responseType}`);
        if (d.paramsKeys)
          debugLines.push(`paramsKeys: [${d.paramsKeys.join(", ")}]`);
        if (d.hasAuthentication !== undefined)
          debugLines.push(`hasAuthentication: ${d.hasAuthentication}`);
        if (d.hasAuthenticationIdToken !== undefined)
          debugLines.push(
            `hasAuthentication.idToken: ${d.hasAuthenticationIdToken}`
          );
        if (d.hasParamsIdToken !== undefined)
          debugLines.push(`hasParams.id_token: ${d.hasParamsIdToken}`);
        if (d.exchangeAttempted !== undefined)
          debugLines.push(`exchangeAttempted: ${d.exchangeAttempted}`);
        if (d.exchangeSuccess !== undefined)
          debugLines.push(`exchangeSuccess: ${d.exchangeSuccess}`);
        if (d.exchangeHasIdToken !== undefined)
          debugLines.push(`exchange.hasIdToken: ${d.exchangeHasIdToken}`);
        if (d.exchangeError)
          debugLines.push(`exchangeError: ${d.exchangeError}`);
        if (d.idTokenSource)
          debugLines.push(`idTokenSource: ${d.idTokenSource}`);
        if (d.callbackStatus !== undefined)
          debugLines.push(`callbackStatus: ${d.callbackStatus}`);
        if (d.callbackError)
          debugLines.push(`callbackError: ${d.callbackError}`);
      }
      const message =
        debugLines.length > 0
          ? `${headline}\n\n${debugLines.join("\n")}`
          : headline;
      Alert.alert("Sign-in failed", message);
      return;
    }

    // Token already stored by signIn(); refresh AuthContext so the
    // root layout's AuthGate routes us to (tabs).
    await refresh();
  }

  return (
    <SafeAreaView className="flex-1 bg-zinc-950 items-center justify-center px-6">
      <View className="h-16 w-16 rounded-2xl bg-violet-600 items-center justify-center mb-8">
        <Text className="text-3xl" style={{ color: "white" }}>
          A
        </Text>
      </View>

      <Text className="text-2xl font-bold text-zinc-50 mb-1">
        Sign in to Acuity
      </Text>
      <Text className="text-sm text-zinc-400 mb-10 text-center">
        Your nightly brain dump, pattern recognition across your own words.
      </Text>

      <Pressable
        onPress={handleSignIn}
        disabled={loading}
        className="w-full flex-row items-center justify-center gap-3 rounded-xl bg-white px-4 py-3.5"
        style={({ pressed }) => ({ opacity: pressed || loading ? 0.7 : 1 })}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#18181B" />
        ) : (
          <Ionicons name="logo-google" size={18} color="#18181B" />
        )}
        <Text className="text-sm font-semibold text-zinc-900">
          {loading ? "Signing in…" : "Continue with Google"}
        </Text>
      </Pressable>

      {!hasClientId && (
        <Text className="text-xs text-amber-400 mt-6 text-center leading-relaxed">
          Google client ID not set. Development build only — populate
          `extra.googleIosClientId` in app.json before TestFlight.
        </Text>
      )}

      <Text className="text-xs text-zinc-500 mt-10 text-center leading-relaxed">
        By continuing you agree to the{"\n"}
        <Text className="text-zinc-400">Terms of Service</Text> and{" "}
        <Text className="text-zinc-400">Privacy Policy</Text>.
      </Text>
    </SafeAreaView>
  );
}
