import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { useTheme } from "@/contexts/theme-context";
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
 * Habits pane of the Growth tab. Content-only (no SafeAreaView / no page
 * title): the Growth tab owns the safe area, the title, and the
 * Habits|Goals toggle. Extracted from the former standalone app/habits.tsx.
 */
export function HabitsPane() {
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
          : prev.filter(
              (c) => !(c.habitId === habit.id && c.localDate === today)
            )
      );
      const ok = await setHabitCheck(habit.id, next, today).catch(() => false);
      if (!ok) {
        setChecks((prev) =>
          next
            ? prev.filter(
                (c) => !(c.habitId === habit.id && c.localDate === today)
              )
            : [...prev, { habitId: habit.id, localDate: today }]
        );
      }
    },
    [byHabit, today]
  );

  const atCap = habits.length >= MAX_ACTIVE_HABITS;

  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 }}>
      <Text
        style={{
          fontFamily: tokens.fontSans,
          fontSize: 15,
          lineHeight: 22,
          color: tokens.textSec,
          marginBottom: 20,
        }}
      >
        Small things you want to keep doing. Check them off when they happen.
      </Text>

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
          <Text style={{ fontFamily: tokens.fontDisplay, fontSize: 15, color: "#ffffff" }}>
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
    </View>
  );
}
