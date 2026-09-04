import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/contexts/theme-context";
import {
  FREE_BANNER,
  PINNED_AFTER_FIRST,
  PINNED_AFTER_SECOND,
  pinnedCardFor,
  showsFreeLocks,
  trialCardFor,
  trialCardLine,
} from "@/lib/onboarding-v10/home-state";

/**
 * Screen 9 (Home) surfaces for v10.
 *
 * ── Why these are components, not a new Home screen ──────────────────
 * Home is the shared main tab. Everyone lands here — v10 arrivals, users
 * from the v2 flow, and the people already using the app today. Forking it
 * behind the v10 flag would mean two dashboards to keep correct forever,
 * and the flag-OFF contract (spec §9) would be carrying a second copy of a
 * screen that is already the most-changed file in the app.
 *
 * So v10's Home requirements land as additive pieces driven by REAL state
 * — debrief count, subscription status — rather than by which onboarding
 * someone happened to see. A user with two debriefs gets the pinned card
 * whether they arrived through v10 or not, which is also just correct:
 * the card is about where they are, not how they got here.
 *
 * All decision logic lives in lib/onboarding-v10/home-state.ts so it can be
 * tested without React Native. These render its output.
 */

/**
 * Pinned card. Shows after debrief #1 and #2, then disappears.
 *
 * `entryCount` must be the user's REAL total, not a page length — passing
 * a paginated count would make the card reappear as someone scrolled.
 */
export function V10PinnedCard({ entryCount }: { entryCount: number }) {
  const { tokens } = useTheme();
  const kind = pinnedCardFor(entryCount);
  if (!kind) return null;

  const copy = kind === "after_first" ? PINNED_AFTER_FIRST : PINNED_AFTER_SECOND;

  return (
    <View
      accessibilityRole="summary"
      style={{
        borderWidth: 1,
        borderColor: tokens.line,
        borderRadius: 14,
        paddingVertical: 14,
        paddingHorizontal: 16,
        backgroundColor: tokens.bgInset,
        marginBottom: 16,
      }}
    >
      <Text
        style={{
          fontFamily: tokens.fontSans,
          fontSize: 15,
          lineHeight: 22,
          color: tokens.text,
        }}
      >
        {copy}
      </Text>
    </View>
  );
}

/**
 * Compact trial-status card — exact renewal date, and the price ONLY when
 * the store rules permit it.
 *
 * See home-state.ts::trialCardFor for why the price is conditional. Short
 * version: a native IAP trial must disclose the renewal price in-app, and a
 * web-purchased subscription must not show prices in-app at all. The
 * difference is which store the user bought through.
 */
export function V10TrialCard({
  localizedPrice,
}: {
  localizedPrice?: string | null;
}) {
  const { tokens } = useTheme();
  const { user } = useAuth();

  const line = useMemo(() => {
    if (!user) return null;
    return trialCardLine(
      trialCardFor({
        subscriptionStatus: user.subscriptionStatus ?? "FREE",
        trialEndsAt: user.trialEndsAt ?? null,
        subscriptionSource: user.subscriptionSource ?? null,
        localizedPrice: localizedPrice ?? null,
      })
    );
  }, [user, localizedPrice]);

  if (!line) return null;

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: tokens.line,
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 14,
        marginBottom: 16,
      }}
    >
      <Text
        style={{
          fontFamily: tokens.fontMono,
          fontSize: 10,
          fontWeight: "700",
          letterSpacing: 1.4,
          textTransform: "uppercase",
          color: tokens.textTer,
          marginBottom: 4,
        }}
      >
        Trial
      </Text>
      <Text
        style={{
          fontFamily: tokens.fontSans,
          fontSize: 14,
          lineHeight: 20,
          color: tokens.text,
        }}
      >
        {line}
      </Text>
    </View>
  );
}

/**
 * Free-tier banner.
 *
 * Leads with what free KEEPS before what it costs. The audience is people
 * already carrying too much; a banner that opens by listing what they can't
 * have reads as a demand, and they close the app.
 *
 * ⚠️ SECOND FREE-TIER SURFACE ON THIS SCREEN. Home already renders
 * <ProLockedCard surfaceId="pro_pulse_home"> mid-scroll for the same
 * population (isFreeTierUser covers FREE + expired trials, which is exactly
 * who sees this banner).
 *
 * Spec §4 Screen 9 asks for both — "locked previews (blurred, tappable →
 * paywall); banner '...'" — and they do different jobs: this is orientation
 * at the top, that is a contextual CTA further down. But it IS two upgrade
 * surfaces on one screen for one user, which sits close to §5's "each
 * capped, never spam" line. Worth a design decision rather than assuming
 * the spec anticipated the existing card.
 */
export function V10FreeBanner() {
  const { tokens } = useTheme();
  const { user } = useAuth();
  const router = useRouter();

  if (!user || !showsFreeLocks(user.subscriptionStatus ?? "FREE")) return null;

  return (
    <Pressable
      onPress={() => router.push("/paywall")}
      accessibilityRole="button"
      accessibilityHint="Opens upgrade options"
      style={{
        borderWidth: 1,
        borderColor: tokens.line,
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 14,
        marginBottom: 16,
      }}
    >
      <Text
        style={{
          fontFamily: tokens.fontSans,
          fontSize: 14,
          lineHeight: 20,
          color: tokens.textSec,
        }}
      >
        {FREE_BANNER}
      </Text>
    </Pressable>
  );
}
