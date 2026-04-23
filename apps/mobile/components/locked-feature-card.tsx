import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";

import {
  lockedFeatureCopy,
  type UnlockKey,
  type UserProgression,
} from "@acuity/shared";

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
  recordHref = "/",
}: {
  unlockKey: UnlockKey;
  progression: UserProgression;
  /** Route the "Record now" CTA sends the user to. Defaults to the
   *  home tab (where the record button lives). */
  recordHref?: string;
}) {
  const router = useRouter();
  const copy = lockedFeatureCopy(unlockKey, progression);
  const pct = copy.progress
    ? Math.min(
        100,
        Math.round((copy.progress.current / Math.max(1, copy.progress.target)) * 100)
      )
    : null;

  return (
    <View className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] p-5">
      <View className="flex-row items-start gap-3">
        <View className="h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/30">
          <Ionicons name="lock-closed-outline" size={18} color="#7C3AED" />
        </View>
        <View className="flex-1">
          <Text className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            {copy.headline}
          </Text>
          <Text className="mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
            {copy.body}
          </Text>
        </View>
      </View>

      {copy.progress && pct !== null && (
        <View className="mt-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs text-zinc-500 dark:text-zinc-400">
              {copy.progress.current} of {copy.progress.target}
            </Text>
            <Text className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {pct}%
            </Text>
          </View>
          <View className="mt-1.5 h-1.5 rounded-full bg-zinc-100 dark:bg-white/10 overflow-hidden">
            <View
              className="h-full rounded-full bg-violet-500"
              style={{ width: `${pct}%` }}
            />
          </View>
        </View>
      )}

      <Pressable
        onPress={() => router.push(recordHref as never)}
        className="mt-5 flex-row items-center gap-1.5 self-start rounded-full bg-zinc-900 dark:bg-white px-4 py-2"
      >
        <Text className="text-sm font-semibold text-white dark:text-zinc-900">
          Record now
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
