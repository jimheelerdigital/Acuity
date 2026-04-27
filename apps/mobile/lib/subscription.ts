import { Alert } from "react-native";
import * as WebBrowser from "expo-web-browser";

import { api } from "@/lib/api";

/**
 * Open the Stripe Customer Portal for the signed-in user. Used by:
 *   - Profile → Manage subscription (PRO users)
 *   - Delete-account modal → "Cancel subscription instead" alt CTA
 *
 * Hits POST /api/stripe/portal which looks up the user's
 * stripeCustomerId by user.id (NOT by email — important for Apple
 * private-relay accounts where the email isn't stable). Returns the
 * portal URL; we open it in the system in-app browser tab so when
 * the user dismisses they bounce back to the app, and the
 * AppState→active hook in auth-context refreshes their
 * subscriptionStatus.
 *
 * Errors:
 *   - 400 NoSubscription → user has no Stripe customer yet (free or
 *     pre-checkout). Surface a clear "you don't have a subscription"
 *     instead of silently dead-ending.
 *   - 401 → session expired; nudge to sign back in.
 *   - 500 / network → generic retry copy.
 */
export async function openSubscriptionPortal(): Promise<void> {
  try {
    const res = await api.post<{ url?: string; error?: string }>(
      "/api/stripe/portal",
      {}
    );
    if (!res.url) {
      Alert.alert(
        "Couldn't open subscription",
        "We couldn't reach Stripe just now. Please try again in a moment."
      );
      return;
    }
    await WebBrowser.openBrowserAsync(res.url, {
      // Use the system in-app browser tab (SafariViewController on
      // iOS) so the user can dismiss back to the app cleanly.
      dismissButtonStyle: "done",
    });
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 400) {
      Alert.alert(
        "No subscription",
        "You don't have an active subscription to manage."
      );
      return;
    }
    if (status === 401) {
      Alert.alert(
        "Session expired",
        "Please sign out and back in, then try again."
      );
      return;
    }
    Alert.alert(
      "Couldn't open subscription",
      "We couldn't reach Stripe just now. Please try again in a moment."
    );
  }
}
