import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Platform, Pressable, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";

import {
  FREE_TIER_LOCKED_COPY,
  freeTierUpgradeUrl,
  type FreeTierLockedSurfaceId,
} from "@acuity/shared";

import { isIapEnabled } from "@/lib/iap-config";

/**
 * Mobile mirror of `apps/web/src/components/pro-locked-card.tsx`.
 * Renders the v1.1 free-tier conversion surfaces from §B.2 of
 * `docs/v1-1/free-tier-phase2-plan.md` using React Native primitives.
 *
 * Phase 3b (2026-05-03): when `isIapEnabled() && Platform.OS === "ios"`,
 * surfaces a SECOND CTA — "Subscribe in app" — alongside the existing
 * "Continue on web →" link. Apple's 3.1.3(b) requires the external
 * link to STAY visible alongside any IAP option; this component
 * keeps both. Build-time flag (Constants.expoConfig.extra.iapEnabled)
 * controls visibility — see `apps/mobile/lib/iap-config.ts`.
 *
 * Apple Review compliance (Option C — `docs/APPLE_IAP_DECISION.md`):
 *   - "Pro" eyebrow makes the gate explicit (not a broken feature).
 *   - "Continue on web →" CTA opens Safari via
 *     `WebBrowser.openBrowserAsync` (§3.1.3(b)).
 *   - "Subscribe in app" CTA pushes the in-app /subscribe screen
 *     (§3.1.3(b) IAP option, when flag-on).
 *   - No "$", "/mo", "Upgrade" tokens — enforced by
 *     `apps/web/src/lib/free-tier-copy.test.ts`.
 *
 * NOT the same component as `LockedFeatureCard` (which gates on
 * EXPERIENTIAL unlocks — "record more to see this"). This card
 * gates on BILLING. A FREE post-trial user with insufficient data
 * sees this card; a TRIAL user with insufficient data sees the
 * existing experiential `LockedFeatureCard`.
 */

const API_BASE_URL =
  (process.env.EXPO_PUBLIC_API_URL as string | undefined) ??
  "https://app.getacuity.io";

export function ProLockedCard({
  surfaceId,
  style,
}: {
  surfaceId: Exclude<FreeTierLockedSurfaceId, "entry_detail_footer">;
  style?: object;
}) {
  const router = useRouter();
  const copy = FREE_TIER_LOCKED_COPY[surfaceId];
  const href = freeTierUpgradeUrl(API_BASE_URL, surfaceId);
  const showInAppSubscribe = Platform.OS === "ios" && isIapEnabled();

  const onContinueOnWeb = async () => {
    try {
      await WebBrowser.openBrowserAsync(href, {
        // Match the system's interface style so Safari chrome
        // doesn't jarringly flip from dark → light.
        toolbarColor: "#09090B",
        controlsColor: "#A78BFA",
        dismissButtonStyle: "close",
      });
    } catch {
      // WebBrowser failure is non-fatal — user can tap again.
    }
  };

  const onSubscribeInApp = () => {
    router.push("/subscribe");
  };

  return (
    <View
      className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-[#1E1E2E]"
      style={style}
    >
      {copy.eyebrow && (
        <Text className="text-xs font-semibold uppercase tracking-widest text-violet-600 dark:text-violet-400">
          {copy.eyebrow}
        </Text>
      )}
      {copy.title && (
        <Text className="mt-2 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          {copy.title}
        </Text>
      )}
      <Text className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
        {copy.body}
      </Text>

      {showInAppSubscribe ? (
        // Dual-CTA layout (Phase 3b). "Subscribe in app" is the
        // primary; "Continue on web" stays as a visible secondary.
        // Both flows are entry points; users get the choice.
        <View className="mt-5 flex-row flex-wrap gap-2">
          <Pressable
            onPress={onSubscribeInApp}
            className="flex-row items-center gap-1.5 rounded-full bg-violet-600 px-4 py-2"
          >
            <Text className="text-sm font-semibold text-white">
              Subscribe in app
            </Text>
          </Pressable>
          <Pressable
            onPress={onContinueOnWeb}
            className="flex-row items-center gap-1.5 rounded-full border border-zinc-300 px-4 py-2 dark:border-white/20"
          >
            <Text className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              {copy.ctaLabel}
            </Text>
          </Pressable>
        </View>
      ) : (
        // Flag-off / Android — original single-CTA layout. No
        // visible regression for users who don't have IAP available.
        <Pressable
          onPress={onContinueOnWeb}
          className="mt-5 self-start flex-row items-center gap-1.5 rounded-full bg-zinc-900 px-4 py-2 dark:bg-white"
        >
          <Text className="text-sm font-semibold text-white dark:text-zinc-900">
            {copy.ctaLabel}
          </Text>
          <Ionicons
            name="chevron-forward"
            size={14}
            color="currentColor"
            style={{ color: "#fff" }}
          />
        </Pressable>
      )}
    </View>
  );
}

/**
 * Inline footer variant for entry-detail (§B.2.6). Single-line copy
 * that ends with "Continue on web →"; the entire body is the tap
 * target.
 *
 * Phase 3b: when flag-on iOS, gain a second tap target — a small
 * "Subscribe in app" link below the original copy. Both stay
 * visible. Footer surface is space-constrained (it sits inline at
 * the bottom of an entry-detail page) so the secondary link is
 * compact.
 */
export function ProLockedFooter({ style }: { style?: object }) {
  const router = useRouter();
  const copy = FREE_TIER_LOCKED_COPY.entry_detail_footer;
  const href = freeTierUpgradeUrl(API_BASE_URL, "entry_detail_footer");
  const showInAppSubscribe = Platform.OS === "ios" && isIapEnabled();

  const onContinueOnWeb = async () => {
    try {
      await WebBrowser.openBrowserAsync(href, {
        toolbarColor: "#09090B",
        controlsColor: "#A78BFA",
        dismissButtonStyle: "close",
      });
    } catch {
      // non-fatal
    }
  };

  if (!showInAppSubscribe) {
    // Flag-off / Android — original single-tap-target layout.
    return (
      <Pressable onPress={onContinueOnWeb} style={style}>
        <Text className="text-xs text-zinc-500 dark:text-zinc-400">
          {copy.body}
        </Text>
      </Pressable>
    );
  }

  // Phase 3b — dual links, both visible. Stack vertically because
  // the footer sits at the bottom of a long scroll and horizontal
  // gap reads as "two unrelated affordances" rather than "two ways
  // to do the same thing."
  return (
    <View style={style}>
      <Pressable onPress={() => router.push("/subscribe")}>
        <Text className="text-xs font-medium text-violet-600 dark:text-violet-400">
          Subscribe in app
        </Text>
      </Pressable>
      <Pressable onPress={onContinueOnWeb} className="mt-1">
        <Text className="text-xs text-zinc-500 dark:text-zinc-400">
          {copy.body}
        </Text>
      </Pressable>
    </View>
  );
}
