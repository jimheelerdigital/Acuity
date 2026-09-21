import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { Swipeable } from "react-native-gesture-handler";

import { useTheme } from "@/contexts/theme-context";
import {
  archiveHabit,
  checksByHabit,
  createHabit,
  fetchHabits,
  setHabitCheck,
  streakFor,
  todayLocalDate,
  updateHabit,
  type Habit,
  type HabitCheckRow,
} from "@/lib/habits-api";
import type { AcuityTokens } from "@/lib/theme/tokens";
import { MAX_ACTIVE_HABITS, isExpectedOn, isPaused } from "@acuity/shared";

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

/**
 * Habits pane of the Growth tab. Content-only (the Growth tab owns the safe
 * area, title, and the Habits|Goals toggle).
 *
 * Row interactions:
 *   - tap the checkbox  → check / uncheck today
 *   - tap the row       → open the habit detail (history, insights, manage)
 *   - swipe left        → Edit (rename) + Delete (archive)
 *   - long-press        → quick action menu
 */
export function HabitsPane() {
  const { tokens } = useTheme();
  const router = useRouter();
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

  const rename = useCallback((habit: Habit) => {
    // Alert.prompt is iOS-only; on Android the detail screen owns rename.
    if (Platform.OS !== "ios") {
      router.push(`/habit/${habit.id}`);
      return;
    }
    Alert.prompt(
      "Rename habit",
      undefined,
      async (text) => {
        const next = (text ?? "").trim();
        if (!next || next === habit.name) return;
        const updated = await updateHabit(habit.id, { name: next }).catch(
          () => null
        );
        if (updated) {
          setHabits((prev) =>
            prev.map((h) => (h.id === habit.id ? { ...h, ...updated } : h))
          );
        }
      },
      "plain-text",
      habit.name
    );
  }, [router]);

  const setPaused = useCallback(async (habit: Habit, paused: boolean) => {
    const daysActive = paused ? [] : ALL_DAYS;
    const updated = await updateHabit(habit.id, { daysActive }).catch(
      () => null
    );
    if (updated) {
      setHabits((prev) =>
        prev.map((h) => (h.id === habit.id ? { ...h, ...updated } : h))
      );
    }
  }, []);

  const remove = useCallback((habit: Habit) => {
    Alert.alert(
      "Delete habit?",
      `"${habit.name}" will be removed. Your history is kept and it stops nudging.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const ok = await archiveHabit(habit.id).catch(() => false);
            if (ok) {
              setHabits((prev) => prev.filter((h) => h.id !== habit.id));
            } else {
              Alert.alert("Couldn't delete", "Please try again.");
            }
          },
        },
      ]
    );
  }, []);

  const openMenu = useCallback(
    (habit: Habit) => {
      const paused = isPaused(habit);
      Alert.alert(habit.name, undefined, [
        {
          text: "View history",
          onPress: () => router.push(`/habit/${habit.id}`),
        },
        { text: "Rename", onPress: () => rename(habit) },
        {
          text: paused ? "Resume" : "Pause",
          onPress: () => setPaused(habit, !paused),
        },
        { text: "Delete", style: "destructive", onPress: () => remove(habit) },
        { text: "Cancel", style: "cancel" },
      ]);
    },
    [router, rename, setPaused, remove]
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
          {habits.map((habit) => (
            <HabitRow
              key={habit.id}
              habit={habit}
              done={byHabit.get(habit.id)?.has(today) ?? false}
              streak={streakFor(habit, byHabit, today)}
              dueToday={isExpectedOn(habit, today)}
              paused={isPaused(habit)}
              tokens={tokens}
              onToggle={() => toggle(habit)}
              onOpen={() => router.push(`/habit/${habit.id}`)}
              onEdit={() => rename(habit)}
              onDelete={() => remove(habit)}
              onLongPress={() => openMenu(habit)}
            />
          ))}
          <Text
            style={{
              fontFamily: tokens.fontSans,
              fontSize: 12,
              color: tokens.textTer,
              marginTop: 8,
              textAlign: "center",
            }}
          >
            Tap a habit for history · swipe for edit &amp; delete
          </Text>
        </View>
      )}
    </View>
  );
}

function HabitRow({
  habit,
  done,
  streak,
  dueToday,
  paused,
  tokens,
  onToggle,
  onOpen,
  onEdit,
  onDelete,
  onLongPress,
}: {
  habit: Habit;
  done: boolean;
  streak: number;
  dueToday: boolean;
  paused: boolean;
  tokens: AcuityTokens;
  onToggle: () => void;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onLongPress: () => void;
}) {
  const swipeRef = useRef<Swipeable | null>(null);

  const renderRightActions = () => (
    <View style={{ flexDirection: "row", alignItems: "stretch" }}>
      <Pressable
        onPress={() => {
          swipeRef.current?.close();
          onEdit();
        }}
        style={{
          width: 76,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: tokens.bgInset,
          borderRadius: 12,
          marginLeft: 8,
        }}
        accessibilityLabel={`Edit ${habit.name}`}
      >
        <Ionicons name="pencil" size={18} color={tokens.textSec} />
        <Text style={{ fontFamily: tokens.fontSans, fontSize: 12, color: tokens.textSec, marginTop: 4 }}>
          Edit
        </Text>
      </Pressable>
      <Pressable
        onPress={() => {
          swipeRef.current?.close();
          onDelete();
        }}
        style={{
          width: 76,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: tokens.bad,
          borderRadius: 12,
          marginLeft: 8,
        }}
        accessibilityLabel={`Delete ${habit.name}`}
      >
        <Ionicons name="trash" size={18} color="#ffffff" />
        <Text style={{ fontFamily: tokens.fontSans, fontSize: 12, color: "#ffffff", marginTop: 4 }}>
          Delete
        </Text>
      </Pressable>
    </View>
  );

  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={renderRightActions}
      overshootRight={false}
      rightThreshold={40}
    >
      <Pressable
        onPress={onOpen}
        onLongPress={onLongPress}
        delayLongPress={300}
        accessibilityRole="button"
        accessibilityLabel={`${habit.name}, open details`}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          borderWidth: 1,
          borderColor: tokens.line,
          borderRadius: 12,
          paddingVertical: 14,
          paddingHorizontal: 14,
          backgroundColor: tokens.cardBg,
          opacity: dueToday ? 1 : 0.55,
        }}
      >
        <Pressable
          onPress={dueToday ? onToggle : undefined}
          disabled={!dueToday}
          hitSlop={10}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: done, disabled: !dueToday }}
          accessibilityLabel={`Mark ${habit.name} done`}
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            borderWidth: done ? 0 : 1.5,
            borderColor: tokens.line,
            backgroundColor: done ? tokens.primary : "transparent",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {done ? <Text style={{ color: "#ffffff", fontSize: 14 }}>✓</Text> : null}
        </Pressable>

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
            <Text style={{ fontFamily: tokens.fontSans, fontSize: 12, color: tokens.textTer, marginTop: 2 }}>
              Paused
            </Text>
          ) : !dueToday ? (
            <Text style={{ fontFamily: tokens.fontSans, fontSize: 12, color: tokens.textTer, marginTop: 2 }}>
              Not today
            </Text>
          ) : null}
        </View>

        {streak > 0 ? (
          <Text style={{ fontFamily: tokens.fontMono, fontSize: 12, color: tokens.textTer }}>
            {streak}d
          </Text>
        ) : null}
        <Ionicons name="chevron-forward" size={16} color={tokens.textTer} />
      </Pressable>
    </Swipeable>
  );
}
