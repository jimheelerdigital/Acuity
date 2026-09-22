import { Ionicons } from "@expo/vector-icons";
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

import { StickyBackButton } from "@/components/back-button";
import { useTheme } from "@/contexts/theme-context";
import {
  checksByHabit,
  fetchArchivedHabits,
  unarchiveHabit,
  type Habit,
  type HabitCheckRow,
} from "@/lib/habits-api";

/** "2026-09-22T..." → "Sep 22, 2026". Empty string if unparseable. */
function formatArchivedAt(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ArchivedHabitsScreen() {
  const { tokens } = useTheme();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [checks, setChecks] = useState<HabitCheckRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetchArchivedHabits();
      setHabits(res.habits);
      setChecks(res.checks);
    } catch {
      // Leave as-is; the empty state reads better than an error.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const byHabit = useMemo(() => checksByHabit(checks), [checks]);

  const restore = useCallback(
    async (habit: Habit) => {
      if (restoringId) return;
      setRestoringId(habit.id);
      try {
        const restored = await unarchiveHabit(habit.id);
        if (restored) {
          setHabits((prev) => prev.filter((h) => h.id !== habit.id));
        } else {
          Alert.alert("Couldn't restore", "Please try again.");
        }
      } catch (err) {
        Alert.alert(
          "Couldn't restore",
          err instanceof Error ? err.message : "Please try again."
        );
      } finally {
        setRestoringId(null);
      }
    },
    [restoringId]
  );

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
        <Text
          style={{
            color: tokens.text,
            fontSize: 28,
            fontWeight: "700",
            letterSpacing: -0.4,
          }}
        >
          Archived habits
        </Text>
        <Text
          style={{
            color: tokens.textSec,
            fontSize: 14,
            lineHeight: 20,
            marginTop: 6,
            marginBottom: 24,
          }}
        >
          Deleted habits keep their history. Restore one to bring it back to
          your list.
        </Text>

        {loading ? (
          <ActivityIndicator color={tokens.textSec} />
        ) : habits.length === 0 ? (
          <Text style={{ color: tokens.textTer, fontSize: 15, lineHeight: 22 }}>
            Nothing here. When you delete a habit it lands here, with its
            history kept in case you want it back.
          </Text>
        ) : (
          <View style={{ gap: 8 }}>
            {habits.map((habit) => {
              const tracked = byHabit.get(habit.id)?.size ?? 0;
              const deleted = formatArchivedAt(habit.archivedAt);
              const busy = restoringId === habit.id;
              return (
                <View
                  key={habit.id}
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
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontFamily: tokens.fontSans,
                        fontSize: 15,
                        color: tokens.text,
                      }}
                    >
                      {habit.name}
                    </Text>
                    <Text
                      style={{
                        fontFamily: tokens.fontSans,
                        fontSize: 12,
                        color: tokens.textTer,
                        marginTop: 2,
                      }}
                    >
                      {tracked} {tracked === 1 ? "day" : "days"} tracked
                      {deleted ? ` · deleted ${deleted}` : ""}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => void restore(habit)}
                    disabled={busy}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Restore ${habit.name}`}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      paddingHorizontal: 14,
                      paddingVertical: 9,
                      borderRadius: 10,
                      backgroundColor: tokens.primary,
                      opacity: busy ? 0.5 : 1,
                    }}
                  >
                    <Ionicons name="arrow-undo" size={15} color="#ffffff" />
                    <Text
                      style={{
                        fontFamily: tokens.fontDisplay,
                        fontSize: 14,
                        color: "#ffffff",
                      }}
                    >
                      {busy ? "…" : "Restore"}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
