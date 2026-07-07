import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Alert, Pressable, Text } from "react-native";

import { useGoogleSignIn, type User } from "@/lib/auth";
import type { AcuityTokens } from "@/lib/theme/tokens";

/**
 * "Continue with Google" button. Isolates the expo-auth-session
 * `Google.useAuthRequest` hook (inside `useGoogleSignIn`) so it is ONLY
 * mounted when the current platform's Google client id is defined.
 *
 * Why a child component (2026-07-07 Android crash fix): `Google.useAuthRequest`
 * THROWS on render when the platform's clientId is undefined — on Android with
 * `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` unset it threw *"Client Id property
 * `androidClientId` must be defined to use Google auth on this platform"* on
 * SignInScreen mount, killing the app on every signed-out launch (Play
 * rejection, vc26). React hooks can't be called conditionally, so SignInScreen
 * gates by conditionally RENDERING this child (`{hasGoogleClientId && <...>}`) —
 * the hook then never runs with an undefined clientId, and the screen falls
 * back to email (+ Apple) sign-in.
 */
export function GoogleSignInButton({
  loading,
  setLoading,
  onAuthenticated,
  tokens,
}: {
  loading: "google" | "apple" | "password" | "magic" | null;
  setLoading: (v: "google" | null) => void;
  onAuthenticated: (user: User, sessionToken: string) => void;
  tokens: AcuityTokens;
}) {
  const { signIn: googleSignIn, ready } = useGoogleSignIn();

  async function handleGoogle() {
    if (!ready) {
      Alert.alert(
        "Not ready",
        "Google SDK is still loading. Try again in a second."
      );
      return;
    }
    setLoading("google");
    const result = await googleSignIn();
    setLoading(null);

    if (!result.ok) {
      if (result.reason === "cancelled") return;
      Alert.alert(
        "Sign-in failed",
        result.detail ?? "Please try again or use email."
      );
      return;
    }
    // See handleApple — same SecureStore race avoidance + build-29 tokenBridge
    // hand-off; the parent passes setAuthenticatedUser as onAuthenticated.
    onAuthenticated(result.user, result.sessionToken);
  }

  return (
    <Pressable
      onPress={handleGoogle}
      disabled={loading !== null}
      className="w-full flex-row items-center justify-center gap-3 rounded-xl border px-4 py-3.5 mb-4"
      style={{
        borderColor: tokens.line,
        backgroundColor: tokens.cardBg,
        opacity: loading ? 0.7 : 1,
      }}
    >
      {loading === "google" ? (
        <ActivityIndicator size="small" color={tokens.textTer} />
      ) : (
        <Ionicons name="logo-google" size={18} color={tokens.textTer} />
      )}
      <Text className="text-sm font-semibold" style={{ color: tokens.text }}>
        {loading === "google" ? "Signing in…" : "Continue with Google"}
      </Text>
    </Pressable>
  );
}
