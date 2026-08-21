import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";
import { makeAcuityTokens } from "@/lib/theme/tokens";
import { trackV10 } from "@/lib/onboarding-v10/analytics";
import {
  REMINDER_PRIMER,
  REMINDER_SLOTS,
  headlineFor,
  localTimeFor,
  shouldPromptForPush,
  type ReminderSlot,
} from "@/lib/onboarding-v10/reminders";
import { registerPushTokenForReminderSlot } from "@/lib/push-token";

/**
 * Screen 8 — Check-in time (light, signed-in only).
 *
 * ── The primer exists to protect a one-shot resource ─────────────────
 * iOS and Android give an app exactly ONE chance to ask for notification
 * permission. If the user denies it, the only recovery is a trip to
 * Settings that essentially nobody makes. So the OS prompt fires only
 * after the user has picked a slot and read the primer — by then they have
 * already said yes to the idea, and the system dialog is a formality
 * rather than an interruption.
 *
 * ── "No reminders" never triggers the prompt ─────────────────────────
 * Spec §9 acceptance, and it is the whole reason the option exists.
 * Prompting someone who just declined reminders spends the one-shot on a
 * guaranteed denial and reads as not listening.
 *
 * ── Wording ──────────────────────────────────────────────────────────
 * Slots name a part of the day, never a routine or a bedtime. See
 * lib/onboarding-v10/reminders.ts for why, and for the test that enforces
 * it against the banned-vocabulary list.
 */

export default function V10Reminders() {
  const { palette } = useTheme();
  const tokens = useMemo(
    () => makeAcuityTokens({ dark: false, accent: palette }),
    [palette]
  );
  const { user } = useAuth();

  const [selected, setSelected] = useState<ReminderSlot | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    trackV10("v10_reminder_viewed", {});
  }, []);

  const finish = useCallback(() => {
    router.replace("/(tabs)");
  }, []);

  const onSelect = useCallback((slot: ReminderSlot) => {
    setSelected(slot);
    trackV10("v10_reminder_selected", { slot });
  }, []);

  const onConfirm = useCallback(async () => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      // Persist BEFORE prompting. If the user backgrounds the app at the
      // OS dialog, their choice of slot is already saved — losing it would
      // mean asking again on next launch, which is exactly the nagging the
      // copy promises not to do.
      //
      // Writes through the EXISTING reminders API rather than a v10-only
      // endpoint. UserReminder rows are what the scheduler already reads,
      // so a slot chosen here fires through the same path as one set in
      // Settings. A parallel v10 store would have needed its own cron and
      // would drift the moment either side changed.
      const time = localTimeFor(selected);
      try {
        await api.put("/api/account/reminders", {
          reminders: time
            ? [{ time, daysActive: [0, 1, 2, 3, 4, 5, 6], enabled: true }]
            : // "No reminders" — an empty list disables rather than
              // deleting the concept, matching what Settings does.
              [],
        });
      } catch {
        // Non-fatal. A failed preference write must not strand the user in
        // onboarding — they can set it later in Settings.
      }

      if (shouldPromptForPush(selected)) {
        const result = await registerPushTokenForReminderSlot();
        trackV10("v10_os_push_prompt", { result });
      }

      finish();
    } finally {
      setBusy(false);
    }
  }, [selected, busy, finish]);

  const showPrimer = selected !== null && shouldPromptForPush(selected);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.bg }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 32 }}>
        <Text
          style={{
            fontFamily: tokens.fontDisplay,
            fontSize: 26,
            lineHeight: 32,
            color: tokens.text,
            marginBottom: 24,
          }}
        >
          {headlineFor(user?.name ?? null)}
        </Text>

        <View style={{ gap: 10, marginBottom: 20 }}>
          {REMINDER_SLOTS.map((slot) => {
            const isSelected = selected === slot.key;
            return (
              <Pressable
                key={slot.key}
                onPress={() => onSelect(slot.key)}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                style={{
                  borderWidth: isSelected ? 2 : 1,
                  borderColor: isSelected ? tokens.primary : tokens.line,
                  borderRadius: 14,
                  paddingVertical: 16,
                  paddingHorizontal: 18,
                  backgroundColor: isSelected ? tokens.bgInset : "transparent",
                }}
              >
                <Text
                  style={{
                    fontFamily: tokens.fontSans,
                    fontSize: 16,
                    color: tokens.text,
                  }}
                >
                  {slot.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {showPrimer ? (
          <Text
            style={{
              fontFamily: tokens.fontSans,
              fontSize: 15,
              lineHeight: 22,
              color: tokens.textSec,
              marginBottom: 20,
            }}
          >
            {REMINDER_PRIMER}
          </Text>
        ) : null}

        {selected ? (
          <Pressable
            onPress={onConfirm}
            disabled={busy}
            accessibilityRole="button"
            style={({ pressed }) => ({
              backgroundColor: tokens.primary,
              borderRadius: 999,
              paddingVertical: 18,
              alignItems: "center",
              opacity: busy ? 0.6 : 1,
              transform: [{ scale: pressed ? 0.99 : 1 }],
            })}
          >
            <Text
              style={{
                fontFamily: tokens.fontDisplay,
                fontSize: 17,
                color: "#ffffff",
              }}
            >
              {shouldPromptForPush(selected) ? "Sounds good" : "Continue"}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
