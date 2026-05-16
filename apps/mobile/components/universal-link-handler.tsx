import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { useEffect } from "react";

import { useAuth } from "@/contexts/auth-context";

/**
 * Mounted invisibly at the root layout. Listens for incoming
 * Universal Link URLs and routes the verify-email pattern to the
 * existing POST /api/auth/verify-email endpoint, then navigates the
 * user to the right place based on auth state.
 *
 * Slice B Stage 1 (2026-05-15): only the verify-email URL is
 * intercepted. AASA at apps/web/src/app/.well-known/apple-app-site-
 * association/route.ts declares the matching path. associatedDomains
 * in app.json wires the bundle to getacuity.io.
 *
 * Flow:
 *   User taps https://getacuity.io/api/auth/verify-email?token=X
 *   → iOS Universal Links: intercepted by Acuity app (when installed)
 *   → Linking event fires here with the URL
 *   → Extract token
 *   → POST /api/auth/verify-email with { token }
 *   → On success:
 *       - User signed in → /(tabs)
 *       - User not signed in → /(auth)/sign-in?verified=1
 *   → On failure: route to /(auth)/sign-in with error
 *
 * Server endpoint behavior is UNCHANGED (still 302s the GET path for
 * users without the app installed — they'll see the existing web
 * sign-in landing). Purely additive on the mobile side.
 */

const VERIFY_EMAIL_PATH = "/api/auth/verify-email";
const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ?? "https://getacuity.io";

async function handleUrl(
  url: string,
  router: ReturnType<typeof useRouter>,
  signedIn: boolean
): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return;
  }
  if (parsed.pathname !== VERIFY_EMAIL_PATH) return;
  const token = parsed.searchParams.get("token");
  if (!token) return;

  // Hit the existing endpoint (POST form) — same handler that the
  // GET-path uses for verification, just invoked from the app
  // instead of via 302 redirect.
  try {
    const res = await fetch(`${API_BASE}${VERIFY_EMAIL_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (res.ok) {
      // Success: routing depends on auth state. Signed-in users go
      // to the main app; signed-out users land at sign-in with a
      // verification confirmation so they can sign in immediately
      // with their now-verified credentials.
      if (signedIn) {
        router.replace("/(tabs)");
      } else {
        router.replace("/(auth)/sign-in?verified=1");
      }
    } else {
      // Token expired / invalid / user not found. Server returns
      // 400 { error: "ExpiredToken" | "InvalidToken" | "UserNotFound" }.
      const body = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      const reason = body?.error ?? "Unknown";
      router.replace(`/(auth)/sign-in?error=Verify-${reason}`);
    }
  } catch {
    // Network error — route to sign-in so the user has a clear next
    // step rather than a silent no-op.
    router.replace("/(auth)/sign-in?error=Verify-NetworkError");
  }
}

export function UniversalLinkHandler() {
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    // Cold launch: app opened via Universal Link.
    void Linking.getInitialURL().then((url) => {
      if (url) void handleUrl(url, router, !!user);
    });

    // Warm: app already running when URL tapped.
    const sub = Linking.addEventListener("url", (event) => {
      void handleUrl(event.url, router, !!user);
    });
    return () => sub.remove();
    // Intentionally re-subscribe when user signs in/out so the
    // routing branch picks up fresh auth state.
  }, [router, user]);

  return null;
}
