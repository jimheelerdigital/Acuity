import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  bestStreak,
  completionRate,
  currentStreak,
  dayOfWeek,
  isExpectedOn,
  shiftDate,
} from "@acuity/shared";

import { StickyBackButton } from "@/components/back-button";
import {
  ReminderTimePicker,
  useLocalTimezoneLabel,
} from "@/components/reminders/time-picker";
import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";
import {
  archiveHabit,
  checksByHabit,
  clearHabitReminder,
  fetchHabitReminders,
  fetchHabits,
  setHabitReminder,
  todayLocalDate,
  updateHabit,
  type Habit,
} from "@/lib/habits-api";
import {
  getPermissionStatus,
  requestNotificationPermission,
} from "@/lib/notifications";
import { resyncAllReminders } from "@/lib/habit-reminders-sync";

const DAY_LABELS = [
  { i: 0, label: "S" },
  { i: 1, label: "M" },
  { i: 2, label: "T" },
  { i: 3, label: "W" },
  { i: 4, label: "T" },
  { i: 5, label: "F" },
  { i: 6, label: "S" },
];
// Rolling calendar: last N weeks (Sun→Sat rows), current week at the bottom.
// 5 weeks covers the 30-day window the completion-rate stat uses.
const HEATMAP_WEEKS = 5;

// Base state of one cell in the history calendar. "Today" is tracked
// separately (isToday) so the today ring can layer on top of ANY state —
// including a completed today — instead of being mutually exclusive with it.
//  done      — a completion was recorded (accent fill)
//  off       — a non-scheduled day (solid grey fill)
//  untracked — a scheduled day with no completion (past OR future): left
//              blank, just the day number. One neutral state, no "missed"
//              shaming and no future-specific styling.
type CellState = "done" | "off" | "untracked";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export default function HabitDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { tokens } = useTheme();
  const tzLabel = useLocalTimezoneLabel();
  const today = todayLocalDate();

  const [habit, setHabit] = useState<Habit | null>(null);
  const [checkSet, setCheckSet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Reminder local state (committed via "Save reminder").
  const [reminderOn, setReminderOn] = useState(false);
  const [reminderTime, setReminderTime] = useState("08:00");
  const [savedReminder, setSavedReminder] = useState<{
    on: boolean;
    time: string;
  }>({ on: false, time: "08:00" });
  const [savingReminder, setSavingReminder] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [{ habits, checks }, { reminders }] = await Promise.all([
        fetchHabits(),
        fetchHabitReminders(),
      ]);
      const found = habits.find((h) => h.id === id) ?? null;
      setHabit(found);
      const set = checksByHabit(checks).get(id) ?? new Set<string>();
      setCheckSet(set);
      const r = reminders.find((x) => x.habitId === id);
      if (r) {
        setReminderOn(true);
        setReminderTime(r.time);
        setSavedReminder({ on: true, time: r.time });
      } else {
        setReminderOn(false);
        setSavedReminder({ on: false, time: "08:00" });
      }
    } catch {
      setHabit((prev) => prev ?? null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    if (!habit)
      return { current: 0, best: 0, rate: { done: 0, expected: 0, pct: 0 } };
    return {
      current: currentStreak(habit, checkSet, today),
      best: bestStreak(habit, checkSet, today),
      rate: completionRate(habit, checkSet, today, 30),
    };
  }, [habit, checkSet, today]);

  // Heatmap: HEATMAP_WEEKS columns (Sun→Sat), oldest → newest, ending today.
  const weeks = useMemo(() => {
    const todayDow = dayOfWeek(today);
    const start = shiftDate(today, -((HEATMAP_WEEKS - 1) * 7 + todayDow));
    const cols: Array<
      Array<{ date: string; day: number; state: CellState; isToday: boolean }>
    > = [];
    let cursor = start;
    for (let w = 0; w < HEATMAP_WEEKS; w += 1) {
      const col: Array<{
        date: string;
        day: number;
        state: CellState;
        isToday: boolean;
      }> = [];
      for (let d = 0; d < 7; d += 1) {
        const isToday = cursor === today;
        let state: CellState;
        if (checkSet.has(cursor)) state = "done";
        // Scheduled-but-not-done reads the same whether past or future:
        // blank. Only genuinely non-scheduled days get the grey "off" fill.
        else if (habit && isExpectedOn(habit, cursor)) state = "untracked";
        else state = "off";
        // Day-of-month for the in-cell label; "2026-09-07" → 7.
        const day = Number(cursor.slice(8, 10));
        col.push({ date: cursor, day, state, isToday });
        cursor = shiftDate(cursor, 1);
      }
      cols.push(col);
    }
    return cols;
  }, [habit, checkSet, today]);

  const rename = useCallback(() => {
    if (!habit) return;
    Alert.prompt(
      "Rename habit",
      undefined,
      async (text) => {
        const next = (text ?? "").trim();
        if (!next || next === habit.name) return;
        const updated = await updateHabit(habit.id, { name: next }).catch(
          () => null
        );
        if (updated) setHabit((h) => (h ? { ...h, ...updated } : h));
      },
      "plain-text",
      habit.name
    );
  }, [habit]);

  const toggleDay = useCallback(
    async (dayIndex: number) => {
      if (!habit) return;
      const has = habit.daysActive.includes(dayIndex);
      const daysActive = has
        ? habit.daysActive.filter((d) => d !== dayIndex)
        : [...habit.daysActive, dayIndex].sort();
      const updated = await updateHabit(habit.id, { daysActive }).catch(
        () => null
      );
      if (updated) {
        setHabit((h) => (h ? { ...h, ...updated } : h));
        if (savedReminder.on) {
          // Keep an existing nudge aligned to the habit's new schedule.
          await setHabitReminder(habit.id, savedReminder.time).catch(() => null);
          await resyncAllReminders().catch(() => {});
        }
      }
    },
    [habit, savedReminder]
  );

  const reminderDirty =
    reminderOn !== savedReminder.on ||
    (reminderOn && reminderTime !== savedReminder.time);

  const saveReminder = useCallback(async () => {
    if (!habit) return;
    setSavingReminder(true);
    try {
      if (reminderOn) {
        const perm = await getPermissionStatus();
        if (perm !== "granted") {
          const next = await requestNotificationPermission();
          if (next !== "granted") {
            Alert.alert(
              "Notifications are off",
              "Turn on notifications in Settings to get habit nudges. Your choice is saved and will start firing once they're enabled."
            );
          }
        }
        // A habit nudge is a notification the user asked for; make sure the
        // app-level notifications switch is on, or the unified scheduler
        // (gated on it) would store the reminder but never fire it.
        await api
          .post("/api/account/notifications", { notificationsEnabled: true })
          .catch(() => {});
        const ok = await setHabitReminder(habit.id, reminderTime).catch(
          () => null
        );
        if (!ok) {
          Alert.alert("Couldn't save", "Please try again.");
          return;
        }
        setSavedReminder({ on: true, time: reminderTime });
      } else {
        await clearHabitReminder(habit.id).catch(() => false);
        setSavedReminder({ on: false, time: reminderTime });
      }
      await resyncAllReminders().catch(() => {});
    } finally {
      setSavingReminder(false);
    }
  }, [habit, reminderOn, reminderTime]);

  const remove = useCallback(() => {
    if (!habit) return;
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
              await resyncAllReminders().catch(() => {});
              router.back();
            } else {
              Alert.alert("Couldn't delete", "Please try again.");
            }
          },
        },
      ]
    );
  }, [habit, router]);

  if (loading) {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: tokens.bg }}
      >
        <ActivityIndicator color={tokens.primary} />
      </SafeAreaView>
    );
  }

  if (!habit) {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center p-6"
        style={{ backgroundColor: tokens.bg }}
      >
        <Text style={{ color: tokens.textSec }}>Habit not found.</Text>
        <Pressable
          onPress={() => router.back()}
          className="mt-4 rounded-full px-4 py-2"
          style={{ backgroundColor: tokens.primary }}
        >
          <Text style={{ color: "#FFFFFF", fontWeight: "600" }}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const hour = Number(reminderTime.split(":")[0]) || 8;
  const minute = Number(reminderTime.split(":")[1]) || 0;

  // Fill: done is the accent; off is the one solid grey chip; untracked days
  // are left blank (just their number).
  const cellBg = (state: CellState): string => {
    switch (state) {
      case "done":
        return tokens.primary;
      case "off":
        return tokens.bgInsetStrong;
      default:
        return "transparent";
    }
  };
  // Day-of-month label color, tuned for contrast against each fill.
  const cellText = (state: CellState): string =>
    state === "done" ? "#FFFFFF" : tokens.textTer;

  return (
    <SafeAreaView
      edges={["top"]}
      className="flex-1"
      style={{ backgroundColor: tokens.bg }}
    >
      <StickyBackButton accessibilityLabel="Back to Growth" />
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingTop: 60, paddingBottom: 80 }}
      >
        {/* Title */}
        <Pressable onPress={rename}>
          <Text
            style={{
              color: tokens.text,
              fontSize: 28,
              fontWeight: "700",
              letterSpacing: -0.4,
            }}
          >
            {habit.name}
          </Text>
          <Text style={{ color: tokens.textTer, fontSize: 12, marginTop: 4 }}>
            Tap to rename
          </Text>
        </Pressable>

        {/* Stat row */}
        <View style={{ flexDirection: "row", gap: 12, marginTop: 24 }}>
          <StatCard label="Current" value={`${stats.current}`} unit="day streak" tokens={tokens} />
          <StatCard label="Best" value={`${stats.best}`} unit="day streak" tokens={tokens} />
          <StatCard
            label="Last 30 days"
            value={`${stats.rate.pct}%`}
            unit={`${stats.rate.done}/${stats.rate.expected} done`}
            tokens={tokens}
          />
        </View>

        {/* Heatmap */}
        <Text style={sectionLabel(tokens)}>History</Text>
        <View style={{ marginTop: 4, gap: 5 }}>
          {/* Weekday header — Sun→Sat, aligned with the columns below. */}
          <View style={{ flexDirection: "row", gap: 5 }}>
            {DAY_LABELS.map((d, i) => (
              <Text
                key={i}
                style={{
                  flex: 1,
                  textAlign: "center",
                  color: tokens.textTer,
                  fontSize: 11,
                  fontWeight: "700",
                }}
              >
                {d.label}
              </Text>
            ))}
          </View>
          {/* One row per week, oldest at top, current week at the bottom. */}
          {weeks.map((week, wi) => (
            <View key={wi} style={{ flexDirection: "row", gap: 5 }}>
              {week.map((c) => (
                <View
                  key={c.date}
                  style={{
                    flex: 1,
                    aspectRatio: 1,
                    borderRadius: 6,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: cellBg(c.state),
                    // The only ring is "today" — in the palette's SECONDARY
                    // accent so it stands out even on a completed (accent-fill)
                    // day and never blends with "done". Everything else is
                    // borderless: a fill or a blank numbered cell.
                    borderWidth: c.isToday ? 2 : 0,
                    borderColor: c.isToday ? tokens.secondary : "transparent",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: "700",
                      color:
                        c.isToday && c.state !== "done"
                          ? tokens.secondary
                          : cellText(c.state),
                    }}
                  >
                    {c.day}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            flexWrap: "wrap",
            columnGap: 6,
            rowGap: 6,
            marginTop: 10,
          }}
        >
          <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: tokens.primary }} />
          <Text style={{ color: tokens.textTer, fontSize: 12 }}>Done</Text>
          <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: "transparent", borderWidth: 2, borderColor: tokens.secondary, marginLeft: 12 }} />
          <Text style={{ color: tokens.textTer, fontSize: 12 }}>Today</Text>
          <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: "transparent", borderWidth: 1, borderColor: tokens.line, marginLeft: 12 }} />
          <Text style={{ color: tokens.textTer, fontSize: 12 }}>Not tracked</Text>
          <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: tokens.bgInsetStrong, marginLeft: 12 }} />
          <Text style={{ color: tokens.textTer, fontSize: 12 }}>Off day</Text>
        </View>

        {/* Active days */}
        <Text style={sectionLabel(tokens)}>Active days</Text>
        <Text style={{ color: tokens.textSec, fontSize: 13, marginBottom: 12 }}>
          Turn all off to pause the habit.
        </Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {DAY_LABELS.map((d) => {
            const on = habit.daysActive.includes(d.i);
            return (
              <Pressable
                key={d.i}
                onPress={() => toggleDay(d.i)}
                style={{
                  height: 40,
                  width: 40,
                  borderRadius: 20,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: on ? tokens.primary : tokens.bgInset,
                }}
              >
                <Text style={{ color: on ? "#FFFFFF" : tokens.textTer, fontSize: 14, fontWeight: "600" }}>
                  {d.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Reminder */}
        <Text style={sectionLabel(tokens)}>Reminder</Text>
        <View
          style={{
            borderRadius: 16,
            backgroundColor: tokens.bgInset,
            borderWidth: 1,
            borderColor: tokens.lineStrong,
            padding: 16,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: tokens.text, fontSize: 16 }}>
              {reminderOn ? "Nudge me" : "No reminder"}
            </Text>
            <Pressable
              onPress={() => setReminderOn((v) => !v)}
              className="rounded-full justify-center"
              style={{ height: 30, width: 52, backgroundColor: reminderOn ? tokens.primary : tokens.bgSub }}
            >
              <View style={{ backgroundColor: "#FFFFFF", height: 26, width: 26, borderRadius: 13, transform: [{ translateX: reminderOn ? 24 : 2 }] }} />
            </Pressable>
          </View>

          {reminderOn ? (
            <View style={{ marginTop: 16 }}>
              <ReminderTimePicker
                hour24={hour}
                minute={minute}
                onChangeHour24={(h: number) => setReminderTime(`${pad(h)}:${pad(minute)}`)}
                onChangeMinute={(m: number) => setReminderTime(`${pad(hour)}:${pad(m)}`)}
                size="md"
              />
              <Text style={{ color: tokens.textSec, fontSize: 12, marginTop: 10 }}>
                {tzLabel} · fires on this habit's active days
              </Text>
            </View>
          ) : null}

          {reminderDirty ? (
            <Pressable
              onPress={saveReminder}
              disabled={savingReminder}
              className="rounded-xl items-center justify-center"
              style={{ backgroundColor: tokens.primary, height: 46, marginTop: 16, opacity: savingReminder ? 0.7 : 1 }}
            >
              <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "600" }}>
                {savingReminder ? "Saving…" : "Save reminder"}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {/* Delete */}
        <View className="mt-8 pt-6 border-t" style={{ borderColor: tokens.line }}>
          <Pressable onPress={remove} className="flex-row items-center" style={{ gap: 8 }}>
            <Ionicons name="trash-outline" size={16} color={tokens.bad} />
            <Text style={{ color: tokens.bad, fontSize: 14, fontWeight: "500" }}>Delete habit</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({
  label,
  value,
  unit,
  tokens,
}: {
  label: string;
  value: string;
  unit: string;
  tokens: ReturnType<typeof useTheme>["tokens"];
}) {
  return (
    <View style={{ flex: 1, borderRadius: 16, backgroundColor: tokens.bgInset, padding: 14 }}>
      <Text style={{ color: tokens.textTer, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </Text>
      <Text style={{ color: tokens.text, fontSize: 26, fontWeight: "700", marginTop: 6 }}>{value}</Text>
      <Text style={{ color: tokens.textTer, fontSize: 12, marginTop: 2 }}>{unit}</Text>
    </View>
  );
}

function sectionLabel(tokens: ReturnType<typeof useTheme>["tokens"]) {
  return {
    color: tokens.textSec,
    fontSize: 13,
    fontWeight: "700" as const,
    textTransform: "uppercase" as const,
    letterSpacing: 1.2,
    marginTop: 28,
    marginBottom: 12,
  };
}
