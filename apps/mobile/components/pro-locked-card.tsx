import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";

import {
  FREE_TIER_LOCKED_COPY,
  freeTierUpgradeUrl,
  type FreeTierLockedSurfaceId,
} from "@acuity/shared";

/**
 * Mobile mirror of `apps/web/src/components/pro-locked-card.tsx`.
 * Renders the v1.1 free-tier conversion surfaces from §B.2 of
 * `docs/v1-1/free-tier-phase2-plan.md` using React Native primitives.
 *
 * Apple Review compliance (Option C — `docs/APPLE_IAP_DECISION.md`):
 *   - "Pro" eyebrow makes the gate explicit (not a broken feature).
 *   - CTA opens Safari via `WebBrowser.openBrowserAsync` so we
 *     stay outside the app's surface (§3.1.3(b)).
 *   - No "$", "/mo", "Subscribe", or "Upgrade" tokens — enforced
 *     by `apps/web/src/lib/free-tier-copy.test.ts`.
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
  const copy = FREE_TIER_LOCKED_COPY[surfaceId];
  const href = freeTierUpgradeUrl(API_BASE_URL, surfaceId);

  const onPress = async () => {
    try {
      await WebBrowser.openBrowserAsync(href, {
        // Match the system's interface style so Safari chrome
        // doesn't jarringly flip from dark → light. Same options
        // shape as `apps/mobile/lib/subscription.ts`.
        toolbarColor: "#09090B",
        controlsColor: "#A78BFA",
        dismissButtonStyle: "close",
      });
    } catch {
      // WebBrowser failure is non-fatal — user can tap again.
    }
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
      <Pressable
        onPress={onPress}
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
    </View>
  );
}

/**
 * Inline footer variant for entry-detail (§B.2.6). Single-line copy
 * that ends with "Continue on web →"; the entire body is the tap
 * target.
 */
export function ProLockedFooter({ style }: { style?: object }) {
  const copy = FREE_TIER_LOCKED_COPY.entry_detail_footer;
  const href = freeTierUpgradeUrl(API_BASE_URL, "entry_detail_footer");
  const onPress = async () => {
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
  return (
    <Pressable onPress={onPress} style={style}>
      <Text className="text-xs text-zinc-500 dark:text-zinc-400">
        {copy.body}
      </Text>
    </Pressable>
  );
}
