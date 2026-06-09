import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
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
import { getCached, invalidate, setCached } from "@/lib/cache";
import { useTheme } from "@/contexts/theme-context";
import { DueDateField } from "@/components/due-date-field";

const TASKS_CACHE_KEY = "/api/tasks?all=1";
const GROUPS_CACHE_KEY = "/api/task-groups";

type TaskGroup = {
  id: string;
  name: string;
  color: string;
};

const PRIORITIES = ["URGENT", "HIGH", "MEDIUM", "LOW"] as const;

/**
 * Manual task creation as an Expo Router modal — the create counterpart
 * to task/[id].tsx (which is edit-only). Same field layout (title,
 * description, priority chips, due-date text field, group) but POSTs a
 * new task to /api/tasks instead of PATCHing. Opened from the "+" in the
 * Tasks tab header. Registered as `presentation: "modal"` in
 * app/_layout.tsx.
 *
 * Tasks were previously only creatable via AI extraction from a
 * recording; this adds manual entry (v1.3.1).
 */
export default function TaskCreateScreen() {
  const router = useRouter();
  const { tokens } = useTheme();

  const [groups, setGroups] = useState<TaskGroup[]>(
    () => getCached<{ groups: TaskGroup[] }>(GROUPS_CACHE_KEY)?.groups ?? []
  );
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<string>("MEDIUM");
  const [due, setDue] = useState("");
  const [groupId, setGroupId] = useState<string | null>(null);

  // Load groups if the cache was cold (direct deep link / cold start).
  useEffect(() => {
    if (groups.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<{ groups: TaskGroup[] }>(GROUPS_CACHE_KEY);
        if (cancelled) return;
        setCached(GROUPS_CACHE_KEY, res);
        setGroups(res.groups ?? []);
      } catch {
        /* non-fatal — user can still create an ungrouped task */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [groups.length]);

  const save = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      Alert.alert("Title required");
      return;
    }
    setSaving(true);
    try {
      await api.post("/api/tasks", {
        title: trimmed,
        description: description.trim() || null,
        priority,
        dueDate: due || null,
        groupId,
      });
      // Bust the tasks cache so the Tasks tab refetches and shows the
      // new task when this modal closes.
      invalidate(TASKS_CACHE_KEY);
      router.back();
    } catch (err) {
      Alert.alert(
        "Couldn't add task",
        err instanceof Error ? err.message : "Try again."
      );
    } finally {
      setSaving(false);
    }
  };

  const canSave = title.trim().length > 0 && !saving;

  return (
    <SafeAreaView
      className="flex-1"
      edges={["top"]}
      style={{ backgroundColor: tokens.bg }}
    >
      <View
        className="flex-row items-center justify-between px-5 pt-2 pb-3 border-b"
        style={{ borderColor: tokens.line }}
      >
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text className="text-sm" style={{ color: tokens.textSec }}>
            Cancel
          </Text>
        </Pressable>
        <Text className="text-base font-semibold" style={{ color: tokens.text }}>
          New task
        </Text>
        <Pressable onPress={save} disabled={!canSave} hitSlop={10}>
          <Text
            className="text-sm font-semibold"
            style={{ color: canSave ? tokens.primary : tokens.textTer }}
          >
            {saving ? "Adding…" : "Add"}
          </Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
          {/* Title */}
          <Text
            className="text-xs font-medium mb-1"
            style={{ color: tokens.textSec }}
          >
            Title
          </Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            autoFocus
            placeholder="What needs doing?"
            placeholderTextColor={tokens.textTer}
            selectionColor={tokens.primary}
            className="rounded-lg border px-3 py-2.5 text-sm mb-4"
            style={{
              borderColor: tokens.line,
              backgroundColor: tokens.bgInset,
              color: tokens.text,
              minHeight: 42,
            }}
          />

          {/* Description */}
          <Text
            className="text-xs font-medium mb-1"
            style={{ color: tokens.textSec }}
          >
            Description
          </Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            selectionColor={tokens.primary}
            className="rounded-lg border px-3 py-2.5 text-sm mb-4"
            style={{
              borderColor: tokens.line,
              backgroundColor: tokens.bgInset,
              color: tokens.text,
              minHeight: 80,
              textAlignVertical: "top",
            }}
          />

          {/* Priority chips */}
          <Text
            className="text-xs font-medium mb-1.5"
            style={{ color: tokens.textSec }}
          >
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
                    backgroundColor: active ? tokens.primary : tokens.bgInset,
                    borderWidth: 1,
                    borderColor: active ? tokens.primary : tokens.line,
                  }}
                >
                  <Text
                    className="text-xs font-semibold"
                    style={{ color: active ? "#FFFFFF" : tokens.textSec }}
                  >
                    {p}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Due date — native iOS calendar picker, US-format display. */}
          <Text
            className="text-xs font-medium mb-1"
            style={{ color: tokens.textSec }}
          >
            Due date (optional)
          </Text>
          <View className="mb-4">
            <DueDateField value={due} onChange={setDue} />
          </View>

          {/* Group picker */}
          <Text
            className="text-xs font-medium mb-1.5"
            style={{ color: tokens.textSec }}
          >
            Group
          </Text>
          <View className="flex-row flex-wrap gap-2">
            <Pressable
              onPress={() => setGroupId(null)}
              className="rounded-lg px-3 py-2 flex-row items-center gap-2"
              style={{
                backgroundColor:
                  groupId === null ? `${tokens.textTer}33` : "transparent",
                borderWidth: 1,
                borderColor: groupId === null ? tokens.textTer : tokens.line,
              }}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: tokens.textTer,
                }}
              />
              <Text className="text-xs" style={{ color: tokens.textSec }}>
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
                      ? `${tokens.primary}22`
                      : "transparent",
                    borderWidth: 1,
                    borderColor: active ? tokens.primary : tokens.line,
                  }}
                >
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: tokens.primary,
                    }}
                  />
                  <Text className="text-xs" style={{ color: tokens.textSec }}>
                    {g.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
