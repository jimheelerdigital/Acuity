import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

import { GradientCheckbox } from "@/components/acuity";
import { SwipeRow } from "@/components/swipe-row";
import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";
import { cachedGet, getCached, setCached } from "@/lib/cache";
import { fireHaptic } from "@/lib/haptics";
import {
  TODAY_LIMIT,
  selectTodayTasks,
  taskLabel,
  type TodayBucket,
  type TodayTaskInput,
} from "@/lib/today-tasks";
import { WARN_AMBER } from "@/lib/tone-colors";
import { publishTodayToWidget } from "@/lib/widget-data";

/**
 * Home "TODAY" card (1.9.1, Keenan's list). The most pressing open tasks:
 * overdue → due today → high priority with no date; snoozed hidden; top 5.
 * Rule lives in lib/today-tasks.ts.
 *
 * Data: the same cached /api/tasks?all=1 list the Tasks tab uses (one
 * shared request; the Tasks tab writes its optimistic edits back to that
 * cache). Revalidates on focus when the cache is older than 30s.
 *
 * Rows behave like Tasks-tab rows: check to complete, tap to open the
 * editor, swipe for Edit / Delete (Delete confirms).
 *
 * Renders nothing until loaded, and nothing for people with no open
 * tasks at all, so empty accounts don't get a permanent empty card.
 */

const TASKS_CACHE_KEY = "/api/tasks?all=1";

type Task = TodayTaskInput & { [k: string]: unknown };

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function shortDate(ymd: string): string {
  const m = Number(ymd.slice(5, 7));
  const d = Number(ymd.slice(8, 10));
  return `${MONTHS[m - 1] ?? ""} ${d}`;
}

export function TodayList() {
  const router = useRouter();
  const { tokens } = useTheme();
  const [tasks, setTasks] = useState<Task[] | null>(
    () => getCached<{ tasks: Task[] }>(TASKS_CACHE_KEY)?.tasks ?? null
  );

  useFocusEffect(
    useCallback(() => {
      // Pick up whatever the Tasks tab / editor left in the cache first,
      // then revalidate if stale (cachedGet is a no-op when fresh).
      const cached = getCached<{ tasks: Task[] }>(TASKS_CACHE_KEY)?.tasks;
      if (cached) setTasks(cached);
      let cancelled = false;
      cachedGet<{ tasks: Task[] }>(TASKS_CACHE_KEY)
        .then((res) => {
          if (cancelled) return;
          const list = res.tasks ?? [];
          setTasks(list);
          publishTodayToWidget(list);
        })
        .catch(() => {
          // Keep what we have; the card just doesn't update.
        });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  // Apply a local change everywhere it shows: this card, the shared cache
  // (Tasks tab), and the widget.
  const applyLocal = useCallback((update: (prev: Task[]) => Task[]) => {
    setTasks((prev) => {
      const next = update(prev ?? []);
      setCached(TASKS_CACHE_KEY, { tasks: next });
      publishTodayToWidget(next);
      return next;
    });
  }, []);

  const complete = useCallback(
    (task: Task) => {
      fireHaptic("light");
      applyLocal((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: "DONE" } : t))
      );
      api.patch("/api/tasks", { id: task.id, action: "complete" }).catch(() => {
        applyLocal((prev) =>
          prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t))
        );
        Alert.alert("Couldn't update", "Please try again.");
      });
    },
    [applyLocal]
  );

  const confirmDelete = useCallback(
    (task: Task) => {
      Alert.alert("Delete task?", `"${taskLabel(task)}" will be deleted.`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            applyLocal((prev) => prev.filter((t) => t.id !== task.id));
            api
              .patch("/api/tasks", { id: task.id, action: "dismiss" })
              .catch(() => {
                applyLocal((prev) => [...prev, task]);
                Alert.alert("Couldn't delete", "Please try again.");
              });
          },
        },
      ]);
    },
    [applyLocal]
  );

  const openEditor = useCallback(
    (task: Task) => router.push(`/task/${task.id}`),
    [router]
  );

  const pressing = useMemo(() => selectTodayTasks(tasks ?? []), [tasks]);
  const hasOpen = useMemo(
    () => (tasks ?? []).some((t) => t.status !== "DONE"),
    [tasks]
  );

  if (!tasks || !hasOpen) return null;

  const shown = pressing.slice(0, TODAY_LIMIT);
  const more = pressing.length - shown.length;

  const subtitle = (bucket: TodayBucket, dueYmd: string | null) => {
    if (bucket === "overdue")
      return { text: `Overdue · ${dueYmd ? shortDate(dueYmd) : ""}`, color: tokens.bad };
    if (bucket === "today") return { text: "Due today", color: WARN_AMBER };
    return { text: "High priority", color: tokens.primary };
  };

  return (
    <View style={{ marginBottom: 16 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <Text
          style={{
            fontFamily: tokens.fontMono,
            fontSize: 10,
            fontWeight: "700",
            letterSpacing: 1.4,
            color: tokens.textTer,
            textTransform: "uppercase",
          }}
        >
          Today{pressing.length > 0 ? ` · ${pressing.length}` : ""}
        </Text>
        <Pressable
          onPress={() => router.push("/(tabs)/tasks")}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="See all tasks"
        >
          <Text style={{ fontFamily: tokens.fontSans, fontSize: 13, color: tokens.primary }}>
            {more > 0 ? `+${more} more` : "All tasks"}
          </Text>
        </Pressable>
      </View>

      <View
        style={{
          borderRadius: tokens.radius.lg,
          backgroundColor: tokens.cardBg,
          borderWidth: 0.5,
          borderColor: tokens.cardBorder,
          overflow: "hidden",
        }}
      >
        {shown.length === 0 ? (
          <Text
            style={{
              fontFamily: tokens.fontSans,
              fontSize: 14,
              color: tokens.textSec,
              paddingHorizontal: 16,
              paddingVertical: 14,
            }}
          >
            Nothing overdue or due today. You're clear.
          </Text>
        ) : (
          shown.map(({ task, bucket, dueYmd }, i) => {
            const sub = subtitle(bucket, dueYmd);
            const label = taskLabel(task);
            return (
              <View
                key={task.id}
                style={
                  i === 0 ? undefined : { borderTopWidth: 0.5, borderTopColor: tokens.line }
                }
              >
                <SwipeRow
                  variant="flush"
                  itemName={label}
                  onEdit={() => openEditor(task)}
                  onDelete={() => confirmDelete(task)}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "flex-start",
                      paddingVertical: 12,
                      paddingHorizontal: 16,
                      backgroundColor: tokens.cardBg,
                    }}
                  >
                    <GradientCheckbox checked={false} onPress={() => complete(task)} />
                    <Pressable
                      onPress={() => openEditor(task)}
                      style={{ flex: 1, marginLeft: 12 }}
                      accessibilityRole="button"
                      accessibilityLabel={`${label}, ${sub.text}`}
                    >
                      <Text
                        numberOfLines={2}
                        style={{
                          fontFamily: tokens.fontSans,
                          fontSize: 15,
                          lineHeight: 21,
                          color: tokens.text,
                        }}
                      >
                        {label}
                      </Text>
                      <Text
                        style={{
                          fontFamily: tokens.fontSans,
                          fontSize: 12,
                          fontWeight: "600",
                          color: sub.color,
                          marginTop: 2,
                        }}
                      >
                        {sub.text}
                      </Text>
                    </Pressable>
                  </View>
                </SwipeRow>
              </View>
            );
          })
        )}
      </View>
    </View>
  );
}
