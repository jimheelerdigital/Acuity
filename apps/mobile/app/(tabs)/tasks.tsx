import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
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
      <SafeAreaView className="flex-1 bg-white dark:bg-[#1E1E2E] dark:bg-[#0B0B12] items-center justify-center" edges={["top"]}>
        <ActivityIndicator color="#7C3AED" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-[#1E1E2E] dark:bg-[#0B0B12]" edges={["top"]}>
      {/* Header */}
      <View className="px-5 pt-4 pb-2">
        <View className="flex-row items-baseline gap-2">
          <Text className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Tasks</Text>
          {grouped.open.length > 0 && (
            <Text className="text-sm text-zinc-500 dark:text-zinc-400">
              {grouped.open.length} open
            </Text>
          )}
        </View>
        <Text className="text-sm text-zinc-400 dark:text-zinc-500 mt-1">
          Actions extracted from your sessions
        </Text>
      </View>

      {/* Tabs */}
      <View className="flex-row mx-5 mt-2 mb-3 rounded-xl bg-zinc-50 dark:bg-[#13131F] dark:bg-[#1E1E2E] p-1">
        {tabs.map((tab) => (
          <Pressable
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            className={`flex-1 rounded-lg py-2 items-center ${
              activeTab === tab.key ? "bg-zinc-800" : ""
            }`}
          >
            <Text
              className={`text-sm font-medium ${
                activeTab === tab.key ? "text-zinc-900 dark:text-zinc-50" : "text-zinc-500 dark:text-zinc-400"
              }`}
            >
              {tab.label}
              {tab.count > 0 ? ` ${tab.count}` : ""}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Task list */}
      <FlatList
        data={current}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ padding: 20, paddingTop: 0, gap: 10 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#7C3AED"
          />
        }
        ListEmptyComponent={
          <EmptyState tab={activeTab} />
        }
        renderItem={({ item }) => (
          <TaskCard
            task={item}
            tab={activeTab}
            busy={acting.has(item.id)}
            onAction={act}
          />
        )}
      />
    </SafeAreaView>
  );
}

function TaskCard({
  task,
  tab,
  busy,
  onAction,
}: {
  task: Task;
  tab: Tab;
  busy: boolean;
  onAction: (id: string, action: string) => void;
}) {
  const label = task.title ?? task.text ?? "Untitled task";
  const color = PRIORITY_COLOR[task.priority] ?? "#71717A";
  const dueDate = task.dueDate
    ? new Date(task.dueDate).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <View className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-[#13131F] dark:bg-[#1E1E2E] p-4">
      <View className="flex-row items-start gap-3">
        {/* 26px check bubble — on Open tab, bubble IS the primary
            complete action (bigger tap target than an icon button). */}
        <TaskBubble
          tab={tab}
          color={color}
          busy={busy}
          onComplete={() => onAction(task.id, "complete")}
          onReopen={() => onAction(task.id, "reopen")}
        />
        <View className="flex-1">
          <Text
            className={`text-sm leading-snug ${
              tab === "completed"
                ? "text-zinc-500 dark:text-zinc-400 line-through"
                : "text-zinc-700 dark:text-zinc-200"
            }`}
          >
            {label}
          </Text>
          <View className="flex-row items-center gap-2 mt-1.5">
            <View
              className="rounded-full px-2 py-0.5"
              style={{ backgroundColor: color + "20" }}
            >
              <Text style={{ color, fontSize: 11, fontWeight: "600" }}>
                {task.priority}
              </Text>
            </View>
            {dueDate && (
              <Text className="text-xs text-amber-500">Due {dueDate}</Text>
            )}
          </View>
        </View>
      </View>

      {/* Secondary actions — complete lives on the bubble. */}
      {tab === "open" && (
        <View className="flex-row justify-end gap-2 mt-3 pt-3 border-t border-zinc-200 dark:border-white/10">
          <ActionButton
            label="Snooze"
            icon="time-outline"
            color="#60A5FA"
            busy={busy}
            onPress={() => onAction(task.id, "snooze")}
          />
          <ActionButton
            label="Dismiss"
            icon="close"
            color="#71717A"
            busy={busy}
            onPress={() => onAction(task.id, "dismiss")}
          />
        </View>
      )}
      {tab === "snoozed" && (
        <View className="flex-row justify-end gap-2 mt-3 pt-3 border-t border-zinc-200 dark:border-white/10">
          <ActionButton
            label="Reopen"
            icon="arrow-undo"
            color="#7C3AED"
            busy={busy}
            onPress={() => onAction(task.id, "reopen")}
          />
        </View>
      )}
    </View>
  );
}

function TaskBubble({
  tab,
  color,
  busy,
  onComplete,
  onReopen,
}: {
  tab: Tab;
  color: string;
  busy: boolean;
  onComplete: () => void;
  onReopen: () => void;
}) {
  if (tab === "completed") {
    return (
      <Pressable
        onPress={onReopen}
        disabled={busy}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel="Reopen task"
        style={({ pressed }) => ({
          width: 26,
          height: 26,
          borderRadius: 13,
          backgroundColor: color,
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed || busy ? 0.6 : 1,
          marginTop: 2,
        })}
      >
        <Ionicons name="checkmark" size={16} color="#FFFFFF" />
      </Pressable>
    );
  }

  if (tab === "snoozed") {
    return (
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          borderWidth: 2,
          borderStyle: "dashed",
          borderColor: color + "80",
          marginTop: 2,
        }}
      />
    );
  }

  return (
    <Pressable
      onPress={onComplete}
      disabled={busy}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Mark task complete"
      style={({ pressed }) => ({
        width: 26,
        height: 26,
        borderRadius: 13,
        borderWidth: 2,
        borderColor: color,
        backgroundColor: pressed ? color + "20" : "transparent",
        alignItems: "center",
        justifyContent: "center",
        opacity: busy ? 0.4 : 1,
        marginTop: 2,
      })}
    >
      {({ pressed }) =>
        pressed ? (
          <Ionicons name="checkmark" size={16} color={color} />
        ) : null
      }
    </Pressable>
  );
}

function ActionButton({
  label,
  icon,
  color,
  busy,
  onPress,
}: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  color: string;
  busy: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      className="flex-row items-center gap-1.5 rounded-lg px-3 py-1.5"
      style={({ pressed }) => ({
        backgroundColor: color + "15",
        opacity: pressed || busy ? 0.5 : 1,
      })}
    >
      <Ionicons name={icon} size={14} color={color} />
      <Text style={{ color, fontSize: 12, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  const config = {
    open: {
      icon: "checkmark-done-outline" as const,
      title: "No open tasks",
      desc: "Record a brain dump to extract tasks automatically.",
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
