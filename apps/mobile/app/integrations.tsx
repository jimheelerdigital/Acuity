import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { StickyBackButton } from "@/components/back-button";
import { ProLockedCard } from "@/components/pro-locked-card";
import { useAuth } from "@/contexts/auth-context";
import { isFreeTierUser } from "@/lib/free-tier";

/**
 * Calendar integrations placeholder — slice C5b mobile.
 *
 * Three states (mirrors apps/web/src/app/account/integrations-section.tsx):
 *   1. FREE post-trial → ProLockedCard for `calendar_connect_locked`
 *   2. PRO/TRIAL/PAST_DUE not yet connected → "Coming in next update"
 *      placeholder. Real EventKit connect flow ships in slice C6.
 *   3. PRO/TRIAL/PAST_DUE already connected → not yet rendered.
 *      Connection-state visibility lands once the C3 prisma db push
 *      migration completes; pre-migration any connection-state fetch
 *      would P2022. Deferred to follow-up.
 *
 * No EventKit code in this slice — that's C6. This screen is the
 * route stub the Profile tab links to so the navigation is wired
 * before the real flow arrives.
 */
export default function IntegrationsScreen() {
  const { user } = useAuth();
  const isProLocked = isFreeTierUser(user);

  return (
    <SafeAreaView
      className="flex-1 bg-white dark:bg-[#0B0B12]"
      edges={["top"]}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <StickyBackButton accessibilityLabel="Back to Profile" />

        <View className="mb-6 mt-6">
          <Text className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            Integrations
          </Text>
          <Text className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Connect a calendar to send Acuity tasks where you already
            plan your day.
          </Text>
        </View>

        {isProLocked ? (
          <ProLockedCard surfaceId="calendar_connect_locked" />
        ) : (
          <ConnectPlaceholderCard />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ConnectPlaceholderCard() {
  return (
    <View className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-[#1E1E2E]">
      <View className="flex-row items-start gap-3">
        <View className="h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/30">
          <Ionicons name="calendar-outline" size={18} color="#7C3AED" />
        </View>
        <View className="flex-1">
          <Text className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Apple Calendar
          </Text>
          <Text className="mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
            Reads your iOS calendar (which already aggregates your
            Google and Outlook calendars) so Acuity can send tasks to
            your real calendar and reference your meeting load in
            reflections.
          </Text>
        </View>
      </View>

      <View className="mt-4 rounded-lg bg-amber-500/10 px-3 py-2">
        <Text className="text-xs font-semibold uppercase tracking-widest text-amber-600 dark:text-amber-400">
          Coming in next update
        </Text>
        <Text className="mt-1 text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
          Calendar connect ships in the next mobile release. Acuity
          will request iOS calendar access only when you tap Connect
          here — never at app launch.
        </Text>
      </View>

      <Text className="mt-4 text-[11px] leading-relaxed text-zinc-400 dark:text-zinc-500">
        Acuity reads only event titles, times, and attendee counts.
        Never location, notes, or attendee email addresses. Tasks
        you send to your calendar use the &ldquo;Acuity:&rdquo; title
        prefix so they&apos;re always identifiable.
      </Text>
    </View>
  );
}
