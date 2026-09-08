import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { StickyBackButton } from "@/components/back-button";
import { useTheme } from "@/contexts/theme-context";
import { isHabitsEnabled } from "@/lib/feature-flags";
import {
  checksByHabit,
  createHabit,
  fetchHabits,
  setHabitCheck,
  streakFor,
  todayLocalDate,
  type Habit,
  type HabitCheckRow,
} from "@/lib/habits-api";
import { MAX_ACTIVE_HABITS, isExpectedOn, isPaused } from "@acuity/shared";

/**
 * Habits — create, check off, see a streak.
 *
 * ── v1 is manual on purpose ──────────────────────────────────────────
 * The extraction pipeline could plausibly propose habits from a debrief,
 * and that is a real future hook. It is NOT this version, because a habit
 * the user never chose — appearing on their Home with a streak attached —
 * is an obligation the product invented for them. When it lands, the shape
 * should be: extraction proposes, the user confirms, and only then does a
 * Habit row exist.
 */
export default function HabitsScreen() {
  const { tokens } = useTheme();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [checks, setChecks] = useState<HabitCheckRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const today = todayLocalDate();

  const load = useCallback(async () => {
    try {
      const res = await fetchHabits();
      setHabits(res.habits);
      setChecks(res.checks);
    } catch {
      // Leave the list as-is; the empty state reads better than an error.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isHabitsEnabled()) {
      router.replace("/(tabs)");
      return;
    }
    void load();
  }, [load]);

  const byHabit = useMemo(() => checksByHabit(checks), [checks]);

  const onCreate = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      const habit = await createHabit(trimmed);
      if (habit) {
        setHabits((prev) => [...prev, habit]);
        setName("");
      }
    } catch (err) {
      Alert.alert(
        "Couldn't add that",
        err instanceof Error ? err.message : "Please try again."
      );
    } finally {
      setCreating(false);
    }
  }, [name, creating]);

  const toggle = useCallback(
    async (habit: Habit) => {
      const done = byHabit.get(habit.id)?.has(today) ?? false;
      const next = !done;
      setChecks((prev) =>
        next
          ? [...prev, { habitId: habit.id, localDate: today }]
          : prev.filter((c) => !(c.habitId === habit.id && c.localDate === today))
      );
      const ok = await setHabitCheck(habit.id, next, today).catch(() => false);
      if (!ok) {
        // Revert: never show a check the server did not record.
        setChecks((prev) =>
          next
            ? prev.filter((c) => !(c.habitId === habit.id && c.localDate === today))
            : [...prev, { habitId: habit.id, localDate: today }]
        );
      }
    },
    [byHabit, today]
  );

  const atCap = habits.length >= MAX_ACTIVE_HABITS;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.bg }} edges={["top"]}>
      <StickyBackButton onPress={() => router.back()} />
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingTop: 56, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text
          style={{
            fontFamily: tokens.fontDisplay,
            fontSize: 26,
            color: tokens.text,
            marginBottom: 6,
          }}
        >
          Habits
        </Text>
        <Text
          style={{
            fontFamily: tokens.fontSans,
            fontSize: 15,
            lineHeight: 22,
            color: tokens.textSec,
            marginBottom: 24,
          }}
        >
          Small things you want to keep doing. Check them off when they happen.
        </Text>

        {/* Create */}
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 24 }}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={atCap ? `Up to ${MAX_ACTIVE_HABITS} at once` : "Add a habit"}
            placeholderTextColor={tokens.textTer}
            editable={!atCap}
            maxLength={80}
            onSubmitEditing={() => void onCreate()}
            returnKeyType="done"
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: tokens.line,
              borderRadius: 12,
              paddingHorizontal: 14,
              paddingVertical: 12,
              fontFamily: tokens.fontSans,
              fontSize: 15,
              color: tokens.text,
              opacity: atCap ? 0.5 : 1,
            }}
          />
          <Pressable
            onPress={() => void onCreate()}
            disabled={!name.trim() || creating || atCap}
            accessibilityRole="button"
            accessibilityLabel="Add habit"
            style={{
              paddingHorizontal: 18,
              justifyContent: "center",
              borderRadius: 12,
              backgroundColor: tokens.primary,
              opacity: !name.trim() || creating || atCap ? 0.4 : 1,
            }}
          >
            <Text
              style={{ fontFamily: tokens.fontDisplay, fontSize: 15, color: "#ffffff" }}
            >
              Add
            </Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color={tokens.textSec} />
        ) : habits.length === 0 ? (
          <Text
            style={{
              fontFamily: tokens.fontSans,
              fontSize: 15,
              lineHeight: 22,
              color: tokens.textTer,
            }}
          >
            Nothing here yet. Add one above — one is plenty to start.
          </Text>
        ) : (
          <View style={{ gap: 8 }}>
            {habits.map((habit) => {
              const done = byHabit.get(habit.id)?.has(today) ?? false;
              const streak = streakFor(habit, byHabit, today);
              const dueToday = isExpectedOn(habit, today);
              const paused = isPaused(habit);
              return (
                <Pressable
                  key={habit.id}
                  onPress={() => dueToday && void toggle(habit)}
                  disabled={!dueToday}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: done, disabled: !dueToday }}
                  accessibilityLabel={habit.name}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    borderWidth: 1,
                    borderColor: tokens.line,
                    borderRadius: 12,
                    paddingVertical: 14,
                    paddingHorizontal: 14,
                    opacity: dueToday ? 1 : 0.55,
                  }}
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
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontFamily: tokens.fontSans,
                        fontSize: 15,
                        color: tokens.text,
                        textDecorationLine: done ? "line-through" : "none",
                      }}
                    >
                      {habit.name}
                    </Text>
                    {/* Paused is named explicitly. A habit that silently
                        never appears reads as a bug. */}
                    {paused ? (
                      <Text
                        style={{
                          fontFamily: tokens.fontSans,
                          fontSize: 12,
                          color: tokens.textTer,
                          marginTop: 2,
                        }}
                      >
                        Paused
                      </Text>
                    ) : !dueToday ? (
                      <Text
                        style={{
                          fontFamily: tokens.fontSans,
                          fontSize: 12,
                          color: tokens.textTer,
                          marginTop: 2,
                        }}
                      >
                        Not today
                      </Text>
                    ) : null}
                  </View>
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
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
