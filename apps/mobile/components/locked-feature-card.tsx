import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";

import {
  lockedFeatureCopy,
  type UnlockKey,
  type UserProgression,
} from "@acuity/shared";

import { useTheme } from "@/contexts/theme-context";

/**
 * Mobile counterpart to apps/web/src/components/locked-feature-card.tsx.
 * Shared copy via lockedFeatureCopy() from @acuity/shared so the
 * phrasing on both platforms is identical.
 *
 * Renders when a feature is experientially locked (data thresholds
 * not met). This is NOT a paywall — paid users with low data see it
 * the same way trial users do.
 */
export function LockedFeatureCard({
  unlockKey,
  progression,
  recordHref = "/record",
}: {
  unlockKey: UnlockKey;
  progression: UserProgression;
  /** Route the "Record now" CTA sends the user to. Defaults to the
   *  modal `/record` screen so the user can record without leaving
   *  the feature page. The parent tab's useFocusEffect re-fetches
   *  progression when the modal dismisses, so the counter updates. */
  recordHref?: string;
}) {
  const router = useRouter();
  const { tokens } = useTheme();
  const copy = lockedFeatureCopy(unlockKey, progression);
  const pct = copy.progress
    ? Math.min(
        100,
        Math.round((copy.progress.current / Math.max(1, copy.progress.target)) * 100)
      )
    : null;

  return (
    <View
      className="rounded-2xl border p-5"
      style={{ borderColor: tokens.line, backgroundColor: tokens.cardBg }}
    >
      <View className="flex-row items-start gap-3">
        <View
          className="h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: `${tokens.primary}1f` }}
        >
          <Ionicons name="lock-closed-outline" size={18} color={tokens.primary} />
        </View>
        <View className="flex-1">
          <Text
            className="text-base font-semibold"
            style={{ color: tokens.text }}
          >
            {copy.headline}
          </Text>
          <Text
            className="mt-1.5 text-sm leading-relaxed"
            style={{ color: tokens.textSec }}
          >
            {copy.body}
          </Text>
        </View>
      </View>

      {copy.progress && pct !== null && (
        <View className="mt-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs" style={{ color: tokens.textSec }}>
              {copy.progress.current} of {copy.progress.target}
            </Text>
            <Text
              className="text-xs font-medium"
              style={{ color: tokens.textSec }}
            >
              {pct}%
            </Text>
          </View>
          <View
            className="mt-1.5 h-1.5 rounded-full overflow-hidden"
            style={{ backgroundColor: tokens.bgInset }}
          >
            <View
              className="h-full rounded-full"
              style={{ width: `${pct}%`, backgroundColor: tokens.primary }}
            />
          </View>
        </View>
      )}

      <Pressable
        onPress={() => router.push(recordHref as never)}
        className="mt-5 flex-row items-center gap-1.5 self-start rounded-full px-4 py-2"
        style={{ backgroundColor: tokens.text }}
      >
        <Text
          className="text-sm font-semibold"
          style={{ color: tokens.bg }}
        >
          Record now
        </Text>
        <Ionicons
          name="chevron-forward"
          size={14}
          color={tokens.bg}
        />
      </Pressable>
    </View>
  );
}
