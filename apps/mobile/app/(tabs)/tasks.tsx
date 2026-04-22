import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PRIORITY_COLOR } from "@acuity/shared";
import { api } from "@/lib/api";

type Task = {
  id: string;
  title: string | null;
  text: string | null;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  snoozedUntil: string | null;
  createdAt: string;
  entry?: { entryDate: string } | null;
};

type Tab = "open" | "snoozed" | "completed";

export default function TasksTab() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("open");
  const [acting, setActing] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  const fetchTasks = useCallback(async () => {
    try {
      const data = await api.get<{ tasks: Task[] }>("/api/tasks?all=1");
      setTasks(data.tasks ?? []);
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchTasks();
  }, [fetchTasks]);

  const act = useCallback(
    async (id: string, action: string) => {
      // Optimistic toggle for complete/reopen so the check lands instantly.
      // The subsequent refetch reconciles with server truth.
      if (action === "complete" || action === "reopen") {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === id
              ? { ...t, status: action === "complete" ? "DONE" : "OPEN" }
              : t
          )
        );
      }
      setActing((prev) => new Set(prev).add(id));
      try {
        await api.patch("/api/tasks", { id, action });
        await fetchTasks();
      } finally {
        setActing((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [fetchTasks]
  );

  const saveEdit = useCallback(
    async (id: string, nextTitle: string) => {
      const trimmed = nextTitle.trim();
      setEditingId(null);
      setEditingText("");
      const task = tasks.find((t) => t.id === id);
      const original = task?.title ?? task?.text ?? "";
      if (!trimmed || trimmed === original) return;
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, title: trimmed } : t))
      );
      try {
        await api.patch("/api/tasks", {
          id,
          action: "edit",
          fields: { title: trimmed },
        });
        await fetchTasks();
      } catch {
        // fetch on failure will restore server truth
        await fetchTasks();
      }
    },
    [tasks, fetchTasks]
  );

  const beginEdit = useCallback((task: Task) => {
    setEditingId(task.id);
    setEditingText(task.title ?? task.text ?? "");
  }, []);

  const openRowMenu = useCallback(
    (task: Task) => {
      if (Platform.OS !== "ios") return;
      const options =
        task.status === "DONE"
          ? ["Reopen", "Delete", "Cancel"]
          : task.status === "SNOOZED"
            ? ["Reopen", "Mark complete", "Delete", "Cancel"]
            : ["Snooze 24h", "Mark complete", "Delete", "Cancel"];
      const cancelIndex = options.length - 1;
      const destructiveIndex = options.indexOf("Delete");
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: cancelIndex,
          destructiveButtonIndex: destructiveIndex,
        },
        (selected) => {
          const choice = options[selected];
          if (!choice || choice === "Cancel") return;
          if (choice === "Delete") return act(task.id, "dismiss");
          if (choice === "Reopen") return act(task.id, "reopen");
          if (choice === "Mark complete") return act(task.id, "complete");
          if (choice === "Snooze 24h") return act(task.id, "snooze");
        }
      );
    },
    [act]
  );

  const now = Date.now();
  const grouped = useMemo(() => {
    const open: Task[] = [];
    const snoozed: Task[] = [];
    const completed: Task[] = [];
    for (const t of tasks) {
      if (t.status === "DONE") {
        completed.push(t);
      } else if (
        t.status === "SNOOZED" &&
        t.snoozedUntil &&
        new Date(t.snoozedUntil).getTime() > now
      ) {
        snoozed.push(t);
      } else {
        open.push(t);
      }
    }
    return { open, snoozed, completed };
  }, [tasks, now]);

  const current = grouped[activeTab];

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
      {/* Header */}
      <View className="px-5 pt-4 pb-2">
        <View className="flex-row items-baseline gap-2">
          <Text className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            Tasks
          </Text>
          {grouped.open.length > 0 && (
            <Text className="text-sm text-zinc-500 dark:text-zinc-400">
              {grouped.open.length} open
            </Text>
          )}
        </View>
        <Text className="text-sm text-zinc-400 dark:text-zinc-500 mt-1">
          Tap a task to edit, tap the circle to complete
        </Text>
      </View>

      {/* Tabs */}
      <View className="flex-row mx-5 mt-2 mb-2 rounded-xl bg-zinc-100 dark:bg-[#13131F] p-1">
        {tabs.map((tab) => (
          <Pressable
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            className={`flex-1 rounded-lg py-2 items-center ${
              activeTab === tab.key
                ? "bg-white dark:bg-[#1E1E2E]"
                : ""
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

      {/* Task list — flat, dividers between rows (no cards) */}
      <FlatList
        data={current}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ paddingTop: 4, paddingBottom: 24 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#7C3AED"
          />
        }
        ItemSeparatorComponent={() => (
          <View className="h-px bg-zinc-100 dark:bg-white/5 ml-14" />
        )}
        ListEmptyComponent={<EmptyState tab={activeTab} />}
        renderItem={({ item }) => (
          <TaskRow
            task={item}
            tab={activeTab}
            busy={acting.has(item.id)}
            isEditing={editingId === item.id}
            editText={editingText}
            onEditChange={setEditingText}
            onEditBegin={() => beginEdit(item)}
            onEditEnd={() => saveEdit(item.id, editingText)}
            onToggle={() =>
              act(item.id, item.status === "DONE" ? "reopen" : "complete")
            }
            onLongPress={() => openRowMenu(item)}
          />
        )}
      />
    </SafeAreaView>
  );
}

function TaskRow({
  task,
  tab,
  busy,
  isEditing,
  editText,
  onEditChange,
  onEditBegin,
  onEditEnd,
  onToggle,
  onLongPress,
}: {
  task: Task;
  tab: Tab;
  busy: boolean;
  isEditing: boolean;
  editText: string;
  onEditChange: (next: string) => void;
  onEditBegin: () => void;
  onEditEnd: () => void;
  onToggle: () => void;
  onLongPress: () => void;
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
  const inputRef = useRef<TextInput | null>(null);

  useEffect(() => {
    if (isEditing) {
      // Next tick so the TextInput is mounted before focus.
      const id = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(id);
    }
  }, [isEditing]);

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
        busy={busy}
        onPress={onToggle}
        muted={tab === "snoozed"}
      />

      <Pressable
        onPress={isEditing ? undefined : onEditBegin}
        onLongPress={onLongPress}
        delayLongPress={350}
        style={{ flex: 1, marginLeft: 12 }}
      >
        {isEditing ? (
          <TextInput
            ref={inputRef}
            value={editText}
            onChangeText={onEditChange}
            onBlur={onEditEnd}
            onSubmitEditing={onEditEnd}
            returnKeyType="done"
            blurOnSubmit
            selectionColor="#7C3AED"
            style={{
              fontSize: 15,
              lineHeight: 20,
              color: "#18181B",
              padding: 0,
              margin: 0,
            }}
            className="dark:text-zinc-50"
          />
        ) : (
          <Text
            style={{
              fontSize: 15,
              lineHeight: 20,
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
        )}
        {(showPriorityChip || dueDate) && !isEditing && (
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
}

/**
 * 22px circle, 2px border. Empty when unchecked, purple fill + white
 * check when checked. Muted (dashed) for snoozed items.
 */
function Checkbox({
  checked,
  busy,
  muted,
  onPress,
}: {
  checked: boolean;
  busy: boolean;
  muted?: boolean;
  onPress: () => void;
}) {
  const size = 22;
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      hitSlop={10}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: busy }}
      accessibilityLabel={checked ? "Mark task incomplete" : "Mark task complete"}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 2,
        borderStyle: muted ? "dashed" : "solid",
        borderColor: checked ? "#7C3AED" : "#A1A1AA",
        backgroundColor: checked ? "#7C3AED" : "transparent",
        alignItems: "center",
        justifyContent: "center",
        marginTop: 1,
        opacity: pressed || busy ? 0.5 : 1,
      })}
    >
      {checked ? (
        <Ionicons name="checkmark" size={14} color="#FFFFFF" />
      ) : null}
    </Pressable>
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  const config = {
    open: {
      icon: "checkmark-done-outline" as const,
      title: "No tasks yet",
      desc: "Record a session and they'll appear.",
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
