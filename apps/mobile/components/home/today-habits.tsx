import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/contexts/theme-context";
import { isHabitsEnabled } from "@/lib/feature-flags";
import {
  checksByHabit,
  fetchHabits,
  setHabitCheck,
  streakFor,
  todayLocalDate,
  type Habit,
  type HabitCheckRow,
} from "@/lib/habits-api";
import { habitsForToday } from "@acuity/shared";

/**
 * Today's habits on Home.
 *
 * ── What this deliberately does not do ───────────────────────────────
 * No completion percentage, no "3 of 5 done" progress bar, no red state
 * for an unchecked habit. The audience is people already carrying a heavy
 * mental load; a dashboard that scores their day is another thing to fail
 * at. A streak is shown only once it exists — a "0 day streak" label is a
 * reminder of nothing.
 *
 * Renders nothing at all when the flag is off or the user has no habits
 * due today, so Home is unchanged for everyone not using the feature.
 */
export function TodayHabits() {
  const { tokens } = useTheme();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [checks, setChecks] = useState<HabitCheckRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const today = todayLocalDate();

  useEffect(() => {
    if (!isHabitsEnabled()) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetchHabits();
        if (cancelled) return;
        setHabits(res.habits);
        setChecks(res.checks);
      } catch {
        // Non-fatal: Home must render without habits. A failed fetch shows
        // nothing rather than an error card competing with the day's real
        // content.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const byHabit = useMemo(() => checksByHabit(checks), [checks]);
  const due = useMemo(() => habitsForToday(habits, today), [habits, today]);

  const toggle = useCallback(
    async (habit: Habit) => {
      const done = byHabit.get(habit.id)?.has(today) ?? false;
      const next = !done;

      // Optimistic: a check-off must feel instant. Reverted on failure so
      // the UI never claims a check the server did not record.
      setChecks((prev) =>
        next
          ? [...prev, { habitId: habit.id, localDate: today }]
          : prev.filter((c) => !(c.habitId === habit.id && c.localDate === today))
      );
      Haptics.selectionAsync().catch(() => {});

      const ok = await setHabitCheck(habit.id, next, today).catch(() => false);
      if (!ok) {
        setChecks((prev) =>
          next
            ? prev.filter((c) => !(c.habitId === habit.id && c.localDate === today))
            : [...prev, { habitId: habit.id, localDate: today }]
        );
      }
    },
    [byHabit, today]
  );

  if (!isHabitsEnabled() || !loaded || due.length === 0) return null;

  return (
    <View style={{ marginBottom: 16 }}>
      <Text
        style={{
          fontFamily: tokens.fontMono,
          fontSize: 10,
          fontWeight: "700",
          letterSpacing: 1.4,
          textTransform: "uppercase",
          color: tokens.textTer,
          marginBottom: 10,
        }}
      >
        Today
      </Text>

      <View style={{ gap: 8 }}>
        {due.map((habit) => {
          const done = byHabit.get(habit.id)?.has(today) ?? false;
          const streak = streakFor(habit, byHabit, today);
          return (
            <Pressable
              key={habit.id}
              onPress={() => void toggle(habit)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: done }}
              accessibilityLabel={habit.name}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                borderWidth: 1,
                borderColor: tokens.line,
                borderRadius: 12,
                paddingVertical: 14,
                paddingHorizontal: 14,
                backgroundColor: pressed ? tokens.bgInset : "transparent",
              })}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  borderWidth: done ? 0 : 1.5,
                  borderColor: tokens.line,
                  backgroundColor: done ? tokens.primary : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {done ? (
                  <Text style={{ color: "#ffffff", fontSize: 13 }}>✓</Text>
                ) : null}
              </View>

              <Text
                style={{
                  flex: 1,
                  fontFamily: tokens.fontSans,
                  fontSize: 15,
                  color: tokens.text,
                  // Struck through rather than faded: done is an
                  // accomplishment, not a de-emphasis.
                  textDecorationLine: done ? "line-through" : "none",
                }}
              >
                {habit.name}
              </Text>

              {/* Only once a streak actually exists. "0 days" is a
                  reminder of nothing. */}
              {streak > 0 ? (
                <Text
                  style={{
                    fontFamily: tokens.fontMono,
                    fontSize: 12,
                    color: tokens.textTer,
                  }}
                >
                  {streak}d
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
