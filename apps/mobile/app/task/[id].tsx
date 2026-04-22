import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/lib/api";
import { useTheme } from "@/contexts/theme-context";

type Task = {
  id: string;
  title: string | null;
  text: string | null;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  groupId: string | null;
  createdAt: string;
};

type TaskGroup = {
  id: string;
  name: string;
  color: string;
};

const PRIORITIES = ["URGENT", "HIGH", "MEDIUM", "LOW"] as const;

/**
 * Full task editor as an Expo Router modal. Presented when the user
 * taps the title text on the Tasks tab — same form fields the web's
 * TaskEditModal exposes (title, description, priority, due date,
 * group). Registered as `presentation: "modal"` in app/_layout.tsx.
 */
export default function TaskEditScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { resolved } = useTheme();
  const isDark = resolved === "dark";

  const [task, setTask] = useState<Task | null>(null);
  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<string>("MEDIUM");
  const [due, setDue] = useState("");
  const [groupId, setGroupId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const [tasksRes, groupsRes] = await Promise.all([
          api.get<{ tasks: Task[] }>("/api/tasks?all=1"),
          api.get<{ groups: TaskGroup[] }>("/api/task-groups"),
        ]);
        if (cancelled) return;
        const found = (tasksRes.tasks ?? []).find((t) => t.id === id);
        if (!found) {
          Alert.alert("Not found", "Couldn't load this task.");
          router.back();
          return;
        }
        setTask(found);
        setTitle(found.title ?? found.text ?? "");
        setDescription(found.description ?? "");
        setPriority(found.priority);
        setDue(
          found.dueDate
            ? new Date(found.dueDate).toISOString().slice(0, 10)
            : ""
        );
        setGroupId(found.groupId);
        setGroups(groupsRes.groups ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  const save = async () => {
    if (!task) return;
    setSaving(true);
    try {
      const trimmed = title.trim();
      if (!trimmed) {
        Alert.alert("Title required");
        setSaving(false);
        return;
      }
      await api.patch("/api/tasks", {
        id: task.id,
        action: "edit",
        fields: {
          title: trimmed,
          description: description.trim() || null,
          priority,
          dueDate: due || null,
        },
      });
      if ((groupId ?? null) !== (task.groupId ?? null)) {
        await api.patch("/api/tasks", {
          id: task.id,
          action: "move",
          groupId: groupId ?? null,
        });
      }
      router.back();
    } catch (err) {
      Alert.alert(
        "Couldn't save",
        err instanceof Error ? err.message : "Try again."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView
      className="flex-1 bg-white dark:bg-[#0B0B12]"
      edges={["top"]}
    >
      <View className="flex-row items-center justify-between px-5 pt-2 pb-3 border-b border-zinc-100 dark:border-white/5">
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text className="text-sm text-zinc-500 dark:text-zinc-400">Cancel</Text>
        </Pressable>
        <Text className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Task details
        </Text>
        <Pressable onPress={save} disabled={saving || loading} hitSlop={10}>
          <Text
            className={`text-sm font-semibold ${
              saving || loading
                ? "text-zinc-400 dark:text-zinc-600"
                : "text-violet-600 dark:text-violet-400"
            }`}
          >
            {saving ? "Saving…" : "Save"}
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#7C3AED" />
        </View>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
            {/* Title */}
            <Text className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
              Title
            </Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              selectionColor="#7C3AED"
              className="rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#13131F] px-3 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 mb-4"
              style={{ minHeight: 42 }}
            />

            {/* Description */}
            <Text className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
              Description
            </Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
              selectionColor="#7C3AED"
              className="rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#13131F] px-3 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 mb-4"
              style={{ minHeight: 80, textAlignVertical: "top" }}
            />

            {/* Priority chips */}
            <Text className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">
              Priority
            </Text>
            <View className="flex-row gap-2 mb-4">
              {PRIORITIES.map((p) => {
                const active = priority === p;
                return (
                  <Pressable
                    key={p}
                    onPress={() => setPriority(p)}
                    className="flex-1 rounded-lg py-2 items-center"
                    style={{
                      backgroundColor: active
                        ? "#7C3AED"
                        : isDark
                          ? "#13131F"
                          : "#F4F4F5",
                      borderWidth: 1,
                      borderColor: active
                        ? "#7C3AED"
                        : isDark
                          ? "rgba(255,255,255,0.08)"
                          : "#E4E4E7",
                    }}
                  >
                    <Text
                      className={`text-xs font-semibold ${
                        active
                          ? "text-white"
                          : "text-zinc-700 dark:text-zinc-200"
                      }`}
                    >
                      {p}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Due date — simple YYYY-MM-DD text input. A native date
                picker is nicer but needs @react-native-community/datetimepicker
                which isn't in the bundle; this ships with what's here. */}
            <Text className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
              Due date (optional, YYYY-MM-DD)
            </Text>
            <TextInput
              value={due}
              onChangeText={setDue}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#A1A1AA"
              autoCapitalize="none"
              autoCorrect={false}
              className="rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#13131F] px-3 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 mb-4"
              style={{ minHeight: 42 }}
            />

            {/* Group picker */}
            <Text className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">
              Group
            </Text>
            <View className="flex-row flex-wrap gap-2">
              <Pressable
                onPress={() => setGroupId(null)}
                className="rounded-lg px-3 py-2 flex-row items-center gap-2"
                style={{
                  backgroundColor:
                    groupId === null ? "rgba(161,161,170,0.22)" : "transparent",
                  borderWidth: 1,
                  borderColor:
                    groupId === null
                      ? "#A1A1AA"
                      : isDark
                        ? "rgba(255,255,255,0.08)"
                        : "#E4E4E7",
                }}
              >
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: "#A1A1AA",
                  }}
                />
                <Text className="text-xs text-zinc-700 dark:text-zinc-200">
                  Ungrouped
                </Text>
              </Pressable>
              {groups.map((g) => {
                const active = groupId === g.id;
                return (
                  <Pressable
                    key={g.id}
                    onPress={() => setGroupId(g.id)}
                    className="rounded-lg px-3 py-2 flex-row items-center gap-2"
                    style={{
                      backgroundColor: active
                        ? g.color + "22"
                        : "transparent",
                      borderWidth: 1,
                      borderColor: active
                        ? g.color
                        : isDark
                          ? "rgba(255,255,255,0.08)"
                          : "#E4E4E7",
                    }}
                  >
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: g.color,
                      }}
                    />
                    <Text className="text-xs text-zinc-700 dark:text-zinc-200">
                      {g.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Delete at the bottom */}
            <Pressable
              onPress={() => {
                if (!task) return;
                Alert.alert(
                  "Delete task?",
                  "This can't be undone.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Delete",
                      style: "destructive",
                      onPress: async () => {
                        try {
                          await api.patch("/api/tasks", {
                            id: task.id,
                            action: "dismiss",
                          });
                          router.back();
                        } catch {
                          Alert.alert("Couldn't delete — try again.");
                        }
                      },
                    },
                  ]
                );
              }}
              className="mt-8 rounded-lg py-3 items-center border border-red-500/40"
            >
              <Text className="text-sm font-medium text-red-500">
                Delete task
              </Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

