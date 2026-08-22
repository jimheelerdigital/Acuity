import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { GradientCheckbox } from "@/components/acuity";
import { ProLockedCard } from "@/components/pro-locked-card";
import { Skeleton, SkeletonCard } from "@/components/skeleton";
import { Confetti } from "@/components/tasks/confetti";
import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";
import { cachedGet, getCached } from "@/lib/cache";
import { isFreeTierUser } from "@/lib/free-tier";
import { dueDateToneColor, priorityToneColor } from "@/lib/tone-colors";

// Q8 — finish-day confetti throttle. AsyncStorage stores YYYY-MM-DD;
// burst only fires when the stored value !== today.
const CONFETTI_LAST_FIRE_KEY = "acuity.last_finish_confetti";

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type Task = {
  id: string;
  title: string | null;
  text: string | null;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  snoozedUntil: string | null;
  groupId: string | null;
  createdAt: string;
  entry?: { entryDate: string } | null;
};

type TaskGroup = {
  id: string;
  name: string;
  icon: string;
  color: string;
  order: number;
  isDefault: boolean;
  isAIGenerated: boolean;
  taskCount: number;
};

type Tab = "open" | "snoozed" | "completed";

type VisitSnapshot = {
  open: Set<string>;
  snoozed: Set<string>;
  completed: Set<string>;
};

const UNGROUPED_KEY = "__ungrouped__";

const TASKS_CACHE_KEY = "/api/tasks?all=1";
const GROUPS_CACHE_KEY = "/api/task-groups";

function naturalTab(t: Task, now: number): Tab {
  if (t.status === "DONE") return "completed";
  if (
    t.status === "SNOOZED" &&
    t.snoozedUntil &&
    new Date(t.snoozedUntil).getTime() > now
  ) {
    return "snoozed";
  }
  return "open";
}

function makeVisitSnapshot(list: Task[]): VisitSnapshot {
  const open = new Set<string>();
  const snoozed = new Set<string>();
  const completed = new Set<string>();
  const now = Date.now();
  for (const t of list) {
    const tab = naturalTab(t, now);
    if (tab === "open") open.add(t.id);
    else if (tab === "snoozed") snoozed.add(t.id);
    else completed.add(t.id);
  }
  return { open, snoozed, completed };
}

export default function TasksTab() {
  const router = useRouter();
  const { user } = useAuth();
  const { tokens } = useTheme();
  const isLocked = isFreeTierUser(user);
  const [tasks, setTasks] = useState<Task[]>(
    () => getCached<{ tasks: Task[] }>(TASKS_CACHE_KEY)?.tasks ?? []
  );
  const [groups, setGroups] = useState<TaskGroup[]>(
    () => getCached<{ groups: TaskGroup[] }>(GROUPS_CACHE_KEY)?.groups ?? []
  );
  const [loading, setLoading] = useState(
    () => !getCached<{ tasks: Task[] }>(TASKS_CACHE_KEY)
  );
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("open");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set()
  );

  const [visitSnapshot, setVisitSnapshot] = useState<VisitSnapshot | null>(
    null
  );
  const tasksRef = useRef<Task[]>(tasks);
  tasksRef.current = tasks;
  const isFocusedRef = useRef(false);
  // Tracks pending mutations so focus-driven refetches don't clobber
  // optimistic UI before the server has acknowledged the write.
  const pendingMutationsRef = useRef<Set<string>>(new Set());

  const fetchAll = useCallback(async (silent: boolean, force = false) => {
    if (!silent) setLoading(true);
    try {
      // Shared cache + in-flight dedupe (cachedGet writes the cache).
      // Collapses the repeated /api/task-groups + /api/tasks calls seen
      // on login; pull-to-refresh passes force to bypass the TTL.
      const [tasksData, groupsData] = await Promise.all([
        cachedGet<{ tasks: Task[] }>(TASKS_CACHE_KEY, { force }),
        cachedGet<{ groups: TaskGroup[] }>(GROUPS_CACHE_KEY, { force }),
      ]);
      // Merge server response with any locally-pending optimistic
      // overrides. Without this, a focus-driven refetch that returns
      // mid-mutation would revert the user's just-toggled task.
      setTasks((prev) => {
        const server = tasksData.tasks ?? [];
        if (pendingMutationsRef.current.size === 0) return server;
        const byId = new Map(prev.map((t) => [t.id, t]));
        return server.map((t) =>
          pendingMutationsRef.current.has(t.id)
            ? (byId.get(t.id) ?? t)
            : t
        );
      });
      setGroups(groupsData.groups ?? []);
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // Initial fetch — silent if cache is already hydrated.
    fetchAll(tasks.length > 0 || groups.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFocusEffect(
    useCallback(() => {
      isFocusedRef.current = true;
      if (tasksRef.current.length > 0) {
        setVisitSnapshot(makeVisitSnapshot(tasksRef.current));
      }
      // Silent revalidation on focus. Cached UI stays visible.
      fetchAll(true);
      return () => {
        isFocusedRef.current = false;
        setVisitSnapshot(null);
      };
    }, [fetchAll])
  );

  useEffect(() => {
    if (
      isFocusedRef.current &&
      !visitSnapshot &&
      !loading &&
      tasks.length > 0
    ) {
      setVisitSnapshot(makeVisitSnapshot(tasks));
    }
  }, [tasks, loading, visitSnapshot]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchAll(true, true);
  }, [fetchAll]);

  const act = useCallback(
    (id: string, action: string, extra?: Record<string, unknown>) => {
      // Optimistic update — applies synchronously, UI is instant.
      if (action === "complete" || action === "reopen") {
        if (action === "complete" && Platform.OS === "ios") {
          // Fire-and-forget haptic; never await.
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
            () => {}
          );
        }
        setTasks((prev) =>
          prev.map((t) =>
            t.id === id
              ? { ...t, status: action === "complete" ? "DONE" : "OPEN" }
              : t
          )
        );
      } else {
        setVisitSnapshot((prev) => {
          if (!prev) return prev;
          if (
            !prev.open.has(id) &&
            !prev.snoozed.has(id) &&
            !prev.completed.has(id)
          ) {
            return prev;
          }
          const open = new Set(prev.open);
          const snoozed = new Set(prev.snoozed);
          const completed = new Set(prev.completed);
          open.delete(id);
          snoozed.delete(id);
          completed.delete(id);
          return { open, snoozed, completed };
        });
      }

      // Fire the PATCH in the background. No await, no refetch, no
      // busy-state visual on the checkbox. The optimistic state stands
      // until the next focus-driven revalidation. This is the single
      // biggest perceived-latency fix: taps were waiting on a
      // round-trip to the server + a full tasks+groups refetch before
      // the checkbox's disabled state cleared.
      pendingMutationsRef.current.add(id);
      api
        .patch("/api/tasks", { id, action, ...extra })
        .catch(() => {
          // On failure, invalidate cache so next focus pulls fresh
          // truth from the server. The optimistic local state may be
          // out of sync with the DB — fetching corrects it.
        })
        .finally(() => {
          pendingMutationsRef.current.delete(id);
        });
    },
    []
  );

  const openTaskEditor = useCallback(
    (task: Task) => {
      router.push(`/task/${task.id}`);
    },
    [router]
  );

  const openMoveSheet = useCallback(
    (task: Task) => {
      if (Platform.OS !== "ios") return;
      const options = [...groups.map((g) => g.name), "Ungrouped", "Cancel"];
      const cancelIndex = options.length - 1;
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: cancelIndex,
          title: "Move task to…",
        },
        (selected) => {
          if (selected === cancelIndex) return;
          if (selected === groups.length) {
            act(task.id, "move", { groupId: null });
            return;
          }
          const target = groups[selected];
          if (!target) return;
          if (target.id === task.groupId) return;
          act(task.id, "move", { groupId: target.id });
        }
      );
    },
    [groups, act]
  );

  const openRowMenu = useCallback(
    (task: Task) => {
      if (Platform.OS !== "ios") return;
      const actions: {
        label: string;
        run: () => void;
        destructive?: boolean;
      }[] = [];
      if (task.status === "DONE") {
        actions.push({ label: "Reopen", run: () => act(task.id, "reopen") });
      } else if (task.status === "SNOOZED") {
        actions.push({ label: "Reopen", run: () => act(task.id, "reopen") });
        actions.push({
          label: "Mark complete",
          run: () => act(task.id, "complete"),
        });
      } else {
        actions.push({
          label: "Snooze 24h",
          run: () => act(task.id, "snooze"),
        });
        actions.push({
          label: "Mark complete",
          run: () => act(task.id, "complete"),
        });
      }
      actions.push({ label: "Move to…", run: () => openMoveSheet(task) });
      actions.push({
        label: "Delete",
        destructive: true,
        run: () => act(task.id, "dismiss"),
      });
      actions.push({ label: "Cancel", run: () => {} });

      const labels = actions.map((a) => a.label);
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: labels,
          cancelButtonIndex: labels.length - 1,
          destructiveButtonIndex: actions.findIndex((a) => a.destructive),
        },
        (selected) => {
          const chosen = actions[selected];
          if (chosen) chosen.run();
        }
      );
    },
    [act, openMoveSheet]
  );

  // Snapshot grouping once per tasks/snapshot change. The previous
  // implementation recomputed on every render because `now` was a
  // fresh Date.now() each render, invalidating useMemo's deps.
  const grouped = useMemo(() => {
    const open: Task[] = [];
    const snoozed: Task[] = [];
    const completed: Task[] = [];
    const now = Date.now();
    for (const t of tasks) {
      let tab: Tab;
      if (visitSnapshot?.open.has(t.id)) tab = "open";
      else if (visitSnapshot?.snoozed.has(t.id)) tab = "snoozed";
      else if (visitSnapshot?.completed.has(t.id)) tab = "completed";
      else tab = naturalTab(t, now);

      if (tab === "open") open.push(t);
      else if (tab === "snoozed") snoozed.push(t);
      else completed.push(t);
    }
    return { open, snoozed, completed };
  }, [tasks, visitSnapshot]);

  const current = grouped[activeTab];

  const tasksByGroup = useMemo(() => {
    const byGroup = new Map<string, Task[]>();
    for (const t of current) {
      const key = t.groupId ?? UNGROUPED_KEY;
      const arr = byGroup.get(key) ?? [];
      arr.push(t);
      byGroup.set(key, arr);
    }
    return byGroup;
  }, [current]);

  const sortedGroups = useMemo(
    () => [...groups].sort((a, b) => a.order - b.order),
    [groups]
  );

  const toggleGroup = useCallback((id: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Q8 — finish-day confetti latch. Set true to spawn the burst;
  // <Confetti onComplete> flips it back to false when the 1400ms
  // timing finishes. Visible-only state — no impact on task data.
  const [confettiVisible, setConfettiVisible] = useState(false);

  /**
   * Fire the finish-day confetti once per day. Throttled via
   * AsyncStorage so multiple complete→reopen→complete cycles in the
   * same day only celebrate once. Per Slice Q8 directive.
   */
  const maybeFireFinishDayConfetti = useCallback(() => {
    void AsyncStorage.getItem(CONFETTI_LAST_FIRE_KEY)
      .then((stored) => {
        const today = todayYmd();
        if (stored === today) return;
        AsyncStorage.setItem(CONFETTI_LAST_FIRE_KEY, today).catch(() => {});
        setConfettiVisible(true);
      })
      .catch(() => {
        // AsyncStorage rarely throws. If it does, skip the burst
        // rather than risk firing on every subsequent check.
      });
  }, []);

  const handleToggleComplete = useCallback(
    (task: Task) => {
      const willComplete = task.status !== "DONE";
      act(task.id, task.status === "DONE" ? "reopen" : "complete");
      if (!willComplete) return;
      // Count how many tasks WOULD remain open after this toggle
      // commits. Reads from the current `tasks` closure — same
      // snapshot `act()` reads for its optimistic update, so the
      // counts can't desync.
      const remainingOpen = tasks.filter(
        (t) =>
          t.id !== task.id &&
          t.status !== "DONE" &&
          t.status !== "DISMISSED"
      ).length;
      if (remainingOpen === 0) {
        maybeFireFinishDayConfetti();
      }
    },
    [act, tasks, maybeFireFinishDayConfetti]
  );

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "open", label: "Open", count: grouped.open.length },
    { key: "snoozed", label: "Snoozed", count: grouped.snoozed.length },
    { key: "completed", label: "Done", count: grouped.completed.length },
  ];

  if (loading) {
    // Skeleton instead of a centered spinner — content takes >100ms
    // and a spinner-then-list swap reads as two separate screens.
    // Six placeholder rows match the typical loaded layout footprint.
    return (
      <SafeAreaView
        className="flex-1"
        edges={["top"]}
        style={{ backgroundColor: tokens.bg }}
      >
        <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
          <Skeleton width={120} height={28} radius={6} style={{ marginBottom: 6 }} />
          <Skeleton width={180} height={14} style={{ marginBottom: 16 }} />
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
            <Skeleton width={70} height={28} radius={14} />
            <Skeleton width={88} height={28} radius={14} />
            <Skeleton width={76} height={28} radius={14} />
          </View>
          <View style={{ gap: 10 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} style={{ padding: 14 }}>
                <Skeleton width="60%" height={14} />
                <Skeleton width="40%" height={11} style={{ marginTop: 8 }} />
              </SkeletonCard>
            ))}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      className="flex-1"
      edges={["top"]}
      style={{ backgroundColor: tokens.bg }}
    >
      <ScrollView
        contentContainerStyle={{ paddingTop: 4, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={tokens.primary}
          />
        }
      >
        <View className="px-5 pt-4 pb-2">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-baseline gap-2 flex-1">
              <Text
                className="text-4xl font-bold"
                style={{ color: tokens.text }}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
                Tasks
              </Text>
              {grouped.open.length > 0 && (
                <Text className="text-sm" style={{ color: tokens.textSec }}>
                  {grouped.open.length} open
                </Text>
              )}
            </View>
            {/* Manual task creation — opens the /task/new create modal. */}
            <Pressable
              onPress={() => router.push("/task/new")}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Add task"
              className="ml-3 h-11 w-11 items-center justify-center rounded-full"
              style={{ backgroundColor: tokens.primary }}
            >
              <Ionicons name="add" size={26} color="#FFFFFF" />
            </Pressable>
          </View>
          <Text
            className="text-sm mt-1"
            style={{ color: tokens.textTer }}
          >
            Tap the circle to complete, tap text to edit, long-press for more
          </Text>
        </View>

        <View
          className="flex-row mx-5 mt-2 mb-3 rounded-xl p-1"
          style={{ backgroundColor: tokens.bgInset }}
        >
          {tabs.map((tab) => (
            <Pressable
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              className="flex-1 rounded-lg py-2 items-center"
              style={{
                backgroundColor:
                  activeTab === tab.key ? tokens.cardBg : "transparent",
              }}
            >
              <Text
                className="text-sm font-medium"
                style={{
                  color:
                    activeTab === tab.key ? tokens.text : tokens.textSec,
                }}
              >
                {tab.label}
                {tab.count > 0 ? ` ${tab.count}` : ""}
              </Text>
            </Pressable>
          ))}
        </View>

        {current.length === 0 ? (
          <EmptyState tab={activeTab} isLocked={isLocked} />
        ) : (
          <View>
            {sortedGroups.map((group) => {
              const groupTasks = tasksByGroup.get(group.id) ?? [];
              if (groupTasks.length === 0) return null;
              const collapsed = collapsedGroups.has(group.id);
              return (
                <GroupSection
                  key={group.id}
                  group={group}
                  tasks={groupTasks}
                  collapsed={collapsed}
                  onToggle={toggleGroup}
                  tab={activeTab}
                  onOpenEditor={openTaskEditor}
                  onToggleComplete={handleToggleComplete}
                  onLongPress={openRowMenu}
                />
              );
            })}

            {(() => {
              const ungroupedTasks = tasksByGroup.get(UNGROUPED_KEY) ?? [];
              if (ungroupedTasks.length === 0) return null;
              const collapsed = collapsedGroups.has(UNGROUPED_KEY);
              return (
                <GroupSection
                  key={UNGROUPED_KEY}
                  group={UNGROUPED_GROUP}
                  tasks={ungroupedTasks}
                  collapsed={collapsed}
                  onToggle={toggleGroup}
                  tab={activeTab}
                  onOpenEditor={openTaskEditor}
                  onToggleComplete={handleToggleComplete}
                  onLongPress={openRowMenu}
                />
              );
            })()}
          </View>
        )}
      </ScrollView>
      {/* Q8 finish-day confetti overlay. Lives outside the
          ScrollView so it can render on top regardless of scroll
          position. pointerEvents="none" inside the component so
          taps still reach the task list underneath. */}
      <Confetti
        visible={confettiVisible}
        onComplete={() => setConfettiVisible(false)}
      />
    </SafeAreaView>
  );
}

// Stable singleton so the ungrouped GroupSection receives an unchanged
// `group` prop across renders (memo wins).
const UNGROUPED_GROUP: TaskGroup = {
  id: UNGROUPED_KEY,
  name: "Ungrouped",
  icon: "help-circle-outline",
  color: "#A1A1AA",
  order: 999,
  isDefault: false,
  isAIGenerated: false,
  taskCount: 0,
};

const GroupSection = memo(function GroupSection({
  group,
  tasks,
  collapsed,
  onToggle,
  tab,
  onToggleComplete,
  onLongPress,
  onOpenEditor,
}: {
  group: TaskGroup;
  tasks: Task[];
  collapsed: boolean;
  onToggle: (id: string) => void;
  tab: Tab;
  onToggleComplete: (task: Task) => void;
  onLongPress: (task: Task) => void;
  onOpenEditor: (task: Task) => void;
}) {
  const { tokens } = useTheme();
  return (
    <View>
      {/* Q11c.3: group.color (server-side task-group data color) no
          longer drives the group header tint. Switched to tokens.primary
          for palette consistency (same convention as Q11a-1 area pill,
          Q11c-1 goals group headers, Q11c-2 insights area-detail
          stripe). The group.color field stays in the API response;
          we just stop reading it for mobile chrome. */}
      <Pressable
        onPress={() => onToggle(group.id)}
        style={{
          marginTop: 16,
          marginBottom: 6,
          paddingHorizontal: 16,
          paddingVertical: 10,
          // Section-header accent (design polish 2026-06-08, strengthened
          // after QA): 4px primary left-border + soft primary background
          // tint + primary-tinted name (below) so the header clearly reads
          // as colored. Replaces the old glowing dot (glow is ceremonial-
          // only per design-system §4.4). `${primary}1A` = ~10% alpha
          // (tokens are hex at runtime).
          borderLeftWidth: 4,
          borderLeftColor: tokens.primary,
          backgroundColor: `${tokens.primary}1A`,
          borderTopWidth: 0.5,
          borderTopColor: tokens.line,
          borderBottomWidth: 1,
          borderBottomColor: tokens.line,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View className="flex-row items-center gap-2.5">
          <Ionicons
            name={group.icon as never}
            size={14}
            color={tokens.primary}
          />
          <Text
            style={{
              fontSize: 13,
              fontWeight: "700",
              letterSpacing: 1.6,
              textTransform: "uppercase",
              color: tokens.primary,
            }}
          >
            {group.name}
          </Text>
          <Text
            style={{
              fontSize: 13,
              color: tokens.textTer,
              fontWeight: "500",
            }}
          >
            {tasks.length}
          </Text>
        </View>
        <Ionicons
          name={collapsed ? "chevron-forward" : "chevron-down"}
          size={16}
          color={tokens.textTer}
        />
      </Pressable>
      {!collapsed &&
        tasks.map((task, i) => (
          <View
            key={task.id}
            style={
              i === 0
                ? undefined
                : {
                    borderTopWidth: 1,
                    borderTopColor: tokens.line,
                  }
            }
          >
            <TaskRow
              task={task}
              tab={tab}
              onToggle={onToggleComplete}
              onLongPress={onLongPress}
              onOpenEditor={onOpenEditor}
            />
          </View>
        ))}
    </View>
  );
});

const TaskRow = memo(
  function TaskRow({
    task,
    tab,
    onToggle,
    onLongPress,
    onOpenEditor,
  }: {
    task: Task;
    tab: Tab;
    onToggle: (task: Task) => void;
    onLongPress: (task: Task) => void;
    onOpenEditor: (task: Task) => void;
  }) {
    const { tokens } = useTheme();
    const label = task.title ?? task.text ?? "Untitled task";
    const isDone = task.status === "DONE";
    // Q11c.3: PRIORITY_COLOR (per-priority hex from @acuity/shared)
    // resolved via priorityToneColor() so the chip tints with palette
    // tokens. The shared constant stays in @acuity/shared as data
    // (web consumers may still want the original hues); mobile no
    // longer reads from it directly.
    const priorityColor = priorityToneColor(task.priority, tokens);
    const showPriorityChip =
      task.priority === "URGENT" || task.priority === "HIGH";
    const dueDate = task.dueDate
      ? new Date(task.dueDate).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          // dueDate is stored as UTC midnight; render in UTC so users
          // behind UTC don't see the day BEFORE the one they set.
          timeZone: "UTC",
        })
      : null;

    const handleToggle = useCallback(() => onToggle(task), [onToggle, task]);
    const handleLongPress = useCallback(
      () => onLongPress(task),
      [onLongPress, task]
    );
    const handleOpenEditor = useCallback(
      () => onOpenEditor(task),
      [onOpenEditor, task]
    );

    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          paddingVertical: 12,
          paddingHorizontal: 16,
          opacity: isDone ? 0.55 : 1,
        }}
      >
        <GradientCheckbox
          checked={isDone}
          muted={tab === "snoozed"}
          onPress={handleToggle}
        />
        <Pressable
          onPress={handleOpenEditor}
          onLongPress={handleLongPress}
          delayLongPress={350}
          style={{ flex: 1, marginLeft: 12 }}
        >
          <Text
            style={{
              fontSize: 16,
              lineHeight: 22,
              textDecorationLine: isDone ? "line-through" : "none",
              color: isDone ? tokens.textTer : tokens.text,
            }}
          >
            {label}
          </Text>
          {(showPriorityChip || dueDate) && (
            <View className="flex-row items-center gap-2 mt-1">
              {showPriorityChip && (
                <View
                  className="rounded-full px-2 py-0.5"
                  style={{ backgroundColor: `${priorityColor}20` }}
                >
                  <Text
                    style={{
                      color: priorityColor,
                      fontSize: 10,
                      fontWeight: "600",
                    }}
                  >
                    {task.priority}
                  </Text>
                </View>
              )}
              {/* Due-date label tone: overdue → bad (red), today/tomorrow
                  → amber, future → textSec. Semibold for contrast.
                  Single source: dueDateToneColor in lib/tone-colors. */}
              {dueDate && (
                <Text
                  className="text-xs font-semibold"
                  style={{ color: dueDateToneColor(task.dueDate, tokens) }}
                >
                  Due {dueDate}
                </Text>
              )}
            </View>
          )}
        </Pressable>
      </View>
    );
  },
  (prev, next) =>
    prev.task === next.task &&
    prev.tab === next.tab &&
    prev.onToggle === next.onToggle &&
    prev.onLongPress === next.onLongPress &&
    prev.onOpenEditor === next.onOpenEditor
);

// Local <Checkbox> removed in Slice Q8 — see <GradientCheckbox> in
// apps/mobile/components/acuity/GradientCheckbox.tsx. Visual swap
// only; toggle behavior unchanged.

function EmptyState({ tab, isLocked }: { tab: Tab; isLocked: boolean }) {
  const { tokens } = useTheme();
  // §B.2.4 — FREE post-trial users on the open tab see the
  // ProLockedCard variant. Other tabs (snoozed/completed) keep the
  // generic empty state since they're not the primary conversion
  // moment. Same precedence as web TaskList.
  if (isLocked && tab === "open") {
    return (
      <View className="mt-12 px-4">
        <ProLockedCard surfaceId="tasks_empty_state" />
      </View>
    );
  }

  const config = {
    open: {
      icon: "checkmark-done-outline" as const,
      title: "No tasks yet",
      desc: "Record a session and Ripple will extract them for you.",
    },
    snoozed: {
      icon: "time-outline" as const,
      title: "No snoozed tasks",
      desc: "Snoozed tasks will appear here.",
    },
    completed: {
      icon: "trophy-outline" as const,
      title: "No completed tasks yet",
      desc: "Complete a task and it will show up here.",
    },
  }[tab];

  return (
    <View className="mt-20 items-center">
      <Ionicons name={config.icon} size={48} color={tokens.textQuiet} />
      <Text
        className="text-base font-semibold mt-3"
        style={{ color: tokens.textSec }}
      >
        {config.title}
      </Text>
      <Text
        className="text-sm mt-1 text-center px-8"
        style={{ color: tokens.textTer }}
      >
        {config.desc}
      </Text>
    </View>
  );
}
