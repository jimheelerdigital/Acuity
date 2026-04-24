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

import { PRIORITY_COLOR } from "@acuity/shared";
import { api } from "@/lib/api";
import { getCached, setCached } from "@/lib/cache";

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

  const fetchAll = useCallback(async (silent: boolean) => {
    if (!silent) setLoading(true);
    try {
      const [tasksData, groupsData] = await Promise.all([
        api.get<{ tasks: Task[] }>(TASKS_CACHE_KEY),
        api.get<{ groups: TaskGroup[] }>(GROUPS_CACHE_KEY),
      ]);
      setCached(TASKS_CACHE_KEY, tasksData);
      setCached(GROUPS_CACHE_KEY, groupsData);
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
    fetchAll(true);
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

  const handleToggleComplete = useCallback(
    (task: Task) => {
      act(task.id, task.status === "DONE" ? "reopen" : "complete");
    },
    [act]
  );

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "open", label: "Open", count: grouped.open.length },
    { key: "snoozed", label: "Snoozed", count: grouped.snoozed.length },
    { key: "completed", label: "Done", count: grouped.completed.length },
  ];

  if (loading) {
    return (
      <SafeAreaView
        className="flex-1 bg-white dark:bg-[#0B0B12] items-center justify-center"
        edges={["top"]}
      >
        <ActivityIndicator color="#7C3AED" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      className="flex-1 bg-white dark:bg-[#0B0B12]"
      edges={["top"]}
    >
      <ScrollView
        contentContainerStyle={{ paddingTop: 4, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#7C3AED"
          />
        }
      >
        <View className="px-5 pt-4 pb-2">
          <View className="flex-row items-baseline gap-2">
            <Text className="text-4xl font-bold text-zinc-900 dark:text-zinc-50">
              Tasks
            </Text>
            {grouped.open.length > 0 && (
              <Text className="text-sm text-zinc-500 dark:text-zinc-400">
                {grouped.open.length} open
              </Text>
            )}
          </View>
          <Text className="text-sm text-zinc-400 dark:text-zinc-500 mt-1">
            Tap the circle to complete, tap text to edit, long-press for more
          </Text>
        </View>

        <View className="flex-row mx-5 mt-2 mb-3 rounded-xl bg-zinc-100 dark:bg-[#13131F] p-1">
          {tabs.map((tab) => (
            <Pressable
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              className={`flex-1 rounded-lg py-2 items-center ${
                activeTab === tab.key ? "bg-white dark:bg-[#1E1E2E]" : ""
              }`}
            >
              <Text
                className={`text-sm font-medium ${
                  activeTab === tab.key
                    ? "text-zinc-900 dark:text-zinc-50"
                    : "text-zinc-500 dark:text-zinc-400"
                }`}
              >
                {tab.label}
                {tab.count > 0 ? ` ${tab.count}` : ""}
              </Text>
            </Pressable>
          ))}
        </View>

        {current.length === 0 ? (
          <EmptyState tab={activeTab} />
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
  return (
    <View>
      <Pressable
        onPress={() => onToggle(group.id)}
        className="flex-row items-center justify-between px-4 py-2 mt-2 mb-0.5 bg-zinc-50 dark:bg-[#13131F]"
      >
        <View className="flex-row items-center gap-2">
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: group.color,
            }}
          />
          <Ionicons
            name={group.icon as never}
            size={14}
            color={group.color}
          />
          <Text className="text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
            {group.name}
          </Text>
          <Text className="text-xs text-zinc-400 dark:text-zinc-500">
            {tasks.length}
          </Text>
        </View>
        <Ionicons
          name={collapsed ? "chevron-forward" : "chevron-down"}
          size={14}
          color="#A1A1AA"
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
                    borderTopColor: "rgba(161,161,170,0.12)",
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
    const label = task.title ?? task.text ?? "Untitled task";
    const isDone = task.status === "DONE";
    const priorityColor = PRIORITY_COLOR[task.priority] ?? "#71717A";
    const showPriorityChip =
      task.priority === "URGENT" || task.priority === "HIGH";
    const dueDate = task.dueDate
      ? new Date(task.dueDate).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
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
        <Checkbox
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
            }}
            className={
              isDone
                ? "text-zinc-400 dark:text-zinc-500"
                : "text-zinc-800 dark:text-zinc-100"
            }
          >
            {label}
          </Text>
          {(showPriorityChip || dueDate) && (
            <View className="flex-row items-center gap-2 mt-1">
              {showPriorityChip && (
                <View
                  className="rounded-full px-2 py-0.5"
                  style={{ backgroundColor: priorityColor + "20" }}
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
              {dueDate && (
                <Text className="text-xs text-amber-500">Due {dueDate}</Text>
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

function Checkbox({
  checked,
  muted,
  onPress,
}: {
  checked: boolean;
  muted?: boolean;
  onPress: () => void;
}) {
  const size = 22;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={
        checked ? "Mark task incomplete" : "Mark task complete"
      }
      style={{
        width: size,
        height: size,
        borderRadius: 4,
        borderWidth: 2,
        borderStyle: muted ? "dashed" : "solid",
        borderColor: checked ? "#7C3AED" : "#A1A1AA",
        backgroundColor: checked ? "#7C3AED" : "transparent",
        alignItems: "center",
        justifyContent: "center",
        marginTop: 1,
      }}
    >
      {checked ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}
    </Pressable>
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  const config = {
    open: {
      icon: "checkmark-done-outline" as const,
      title: "No tasks yet",
      desc: "Record a session and Acuity will extract them for you.",
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
      <Ionicons name={config.icon} size={48} color="#52525B" />
      <Text className="text-base font-semibold text-zinc-600 dark:text-zinc-300 mt-3">
        {config.title}
      </Text>
      <Text className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 text-center px-8">
        {config.desc}
      </Text>
    </View>
  );
}
