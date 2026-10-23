import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { KeyboardScroll } from "@/components/keyboard/keyboard-scroll";
import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";
import { getCached, invalidate, setCached } from "@/lib/cache";
import { goBackOr } from "@/lib/navigation";
import {
  GROUP_ICONS,
  GROUP_NAME_MAX,
  moveGroup,
  nextGroupColor,
  type ManagedGroup,
} from "@/lib/task-groups";

const GROUPS_CACHE_KEY = "/api/task-groups";
const TASKS_CACHE_KEY = "/api/tasks?all=1";

type Draft = { id: string | null; name: string; icon: string };

/**
 * Manage task groups (Jimmy, 2026-10-22: "preconfigured tags set in the
 * app ... personal, work, health, etc"). Add, rename, change icon,
 * reorder and delete. The server API already existed
 * (/api/task-groups, /api/task-groups/[id]); nothing on the phone used it,
 * so everyone was stuck with the five seeded groups.
 *
 * These groups are also the choices the Add a Task card offers from Siri
 * and the Action Button (iOS 26+), and the set the AI files tasks into.
 *
 * Mobile chrome doesn't show group colors (tasks.tsx Q11c.3), so this
 * screen only edits name + icon; new groups get a palette color so the
 * web and the API's required `color` stay valid.
 */
export default function TaskGroupsScreen() {
  const { tokens } = useTheme();
  const [groups, setGroups] = useState<ManagedGroup[]>(
    () => getCached<{ groups: ManagedGroup[] }>(GROUPS_CACHE_KEY)?.groups ?? []
  );
  const [loading, setLoading] = useState(groups.length === 0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const publish = (next: ManagedGroup[]) => {
    const sorted = [...next].sort((a, b) => a.order - b.order);
    setGroups(sorted);
    setCached(GROUPS_CACHE_KEY, { groups: sorted });
  };

  const reload = async () => {
    try {
      const res = await api.get<{ groups: ManagedGroup[] }>(GROUPS_CACHE_KEY);
      publish(res.groups ?? []);
    } catch {
      /* keep what we have */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const startNew = () => setDraft({ id: null, name: "", icon: GROUP_ICONS[0] });
  const startEdit = (g: ManagedGroup) => setDraft({ id: g.id, name: g.name, icon: g.icon });

  const saveDraft = async () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) return;
    setBusy(true);
    try {
      if (draft.id) {
        const res = await api.patch<{ group: ManagedGroup }>(`/api/task-groups/${draft.id}`, {
          name,
          icon: draft.icon,
        });
        publish(groups.map((g) => (g.id === draft.id ? { ...g, ...res.group } : g)));
      } else {
        const res = await api.post<{ group: ManagedGroup }>("/api/task-groups", {
          name,
          icon: draft.icon,
          color: nextGroupColor(groups),
        });
        publish([...groups, { ...res.group, taskCount: 0 }]);
      }
      setDraft(null);
    } catch (err) {
      Alert.alert("Couldn't save group", err instanceof Error ? err.message : "Try again.");
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = (g: ManagedGroup) => {
    if (groups.length <= 1) {
      Alert.alert("Keep at least one group", "Add another group before deleting this one.");
      return;
    }
    // Tasks move to "Other" when there is one (and it isn't the group
    // going away); otherwise they become ungrouped.
    const other = groups.find((x) => x.id !== g.id && x.name.toLowerCase() === "other");
    const where = other ? `They'll move to ${other.name}.` : "They'll stay in your list, ungrouped.";
    const count = g.taskCount ?? 0;
    Alert.alert(
      `Delete ${g.name}?`,
      count > 0 ? `${count} task${count === 1 ? " is" : "s are"} in this group. ${where}` : "No tasks are in this group.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              await api.del(`/api/task-groups/${g.id}`, {
                body: JSON.stringify(other ? { moveTasksTo: other.id } : {}),
              });
              publish(
                groups
                  .filter((x) => x.id !== g.id)
                  .map((x) => (other && x.id === other.id ? { ...x, taskCount: (x.taskCount ?? 0) + count } : x))
              );
              // Tasks changed group server-side; make the Tasks tab refetch.
              invalidate(TASKS_CACHE_KEY);
              setDraft(null);
            } catch (err) {
              Alert.alert("Couldn't delete group", err instanceof Error ? err.message : "Try again.");
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  const move = async (index: number, delta: -1 | 1) => {
    const next = moveGroup(groups, index, delta);
    if (!next) return;
    const changed = next.filter((g) => groups.find((o) => o.id === g.id)?.order !== g.order);
    const before = groups;
    publish(next);
    try {
      await Promise.all(changed.map((g) => api.patch(`/api/task-groups/${g.id}`, { order: g.order })));
    } catch {
      publish(before);
      Alert.alert("Couldn't reorder", "Try again.");
    }
  };

  return (
    <SafeAreaView className="flex-1" edges={["top"]} style={{ backgroundColor: tokens.bg }}>
      <View
        className="flex-row items-center justify-between px-5 pt-2 pb-3 border-b"
        style={{ borderColor: tokens.line }}
      >
        <Pressable onPress={() => goBackOr("/(tabs)/tasks")} hitSlop={10} accessibilityRole="button">
          <Text className="text-sm font-semibold" style={{ color: tokens.primary }}>
            Done
          </Text>
        </Pressable>
        <Text className="text-base font-semibold" style={{ color: tokens.text }}>
          Task groups
        </Text>
        <Pressable
          onPress={startNew}
          disabled={busy || draft !== null}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="New group"
        >
          <Ionicons name="add" size={24} color={draft ? tokens.textTer : tokens.primary} />
        </Pressable>
      </View>

      <KeyboardScroll style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        <Text className="text-sm mb-4" style={{ color: tokens.textSec, lineHeight: 20 }}>
          Groups sort your tasks. Ripple files new tasks into them, and you can pick one when you add a
          task from Siri or the Action Button.
        </Text>

        {draft && draft.id === null ? (
          <GroupEditor
            draft={draft}
            busy={busy}
            onChange={setDraft}
            onCancel={() => setDraft(null)}
            onSave={saveDraft}
          />
        ) : null}

        {loading ? <ActivityIndicator color={tokens.primary} style={{ marginTop: 24 }} /> : null}

        {groups.map((g, i) =>
          draft && draft.id === g.id ? (
            <GroupEditor
              key={g.id}
              draft={draft}
              busy={busy}
              onChange={setDraft}
              onCancel={() => setDraft(null)}
              onSave={saveDraft}
              onDelete={() => confirmDelete(g)}
            />
          ) : (
            <View
              key={g.id}
              className="flex-row items-center rounded-xl border px-3 py-3 mb-2"
              style={{ borderColor: tokens.line, backgroundColor: tokens.cardBg }}
            >
              <Pressable
                onPress={() => startEdit(g)}
                disabled={busy || draft !== null}
                className="flex-1 flex-row items-center gap-3"
                accessibilityRole="button"
                accessibilityLabel={`Edit ${g.name}`}
              >
                <Ionicons name={g.icon as never} size={18} color={tokens.primary} />
                <Text className="text-base font-medium" style={{ color: tokens.text }} numberOfLines={1}>
                  {g.name}
                </Text>
                <Text className="text-sm" style={{ color: tokens.textTer }}>
                  {g.taskCount ?? 0}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => move(i, -1)}
                disabled={i === 0 || busy || draft !== null}
                hitSlop={8}
                accessibilityLabel={`Move ${g.name} up`}
                style={{ padding: 6, opacity: i === 0 ? 0.3 : 1 }}
              >
                <Ionicons name="chevron-up" size={18} color={tokens.textSec} />
              </Pressable>
              <Pressable
                onPress={() => move(i, 1)}
                disabled={i === groups.length - 1 || busy || draft !== null}
                hitSlop={8}
                accessibilityLabel={`Move ${g.name} down`}
                style={{ padding: 6, opacity: i === groups.length - 1 ? 0.3 : 1 }}
              >
                <Ionicons name="chevron-down" size={18} color={tokens.textSec} />
              </Pressable>
            </View>
          )
        )}
      </KeyboardScroll>
    </SafeAreaView>
  );
}

function GroupEditor({
  draft,
  busy,
  onChange,
  onCancel,
  onSave,
  onDelete,
}: {
  draft: Draft;
  busy: boolean;
  onChange: (d: Draft) => void;
  onCancel: () => void;
  onSave: () => void;
  onDelete?: () => void;
}) {
  const { tokens } = useTheme();
  const canSave = draft.name.trim().length > 0 && !busy;
  return (
    <View
      className="rounded-xl border p-4 mb-3"
      style={{ borderColor: tokens.primary, backgroundColor: tokens.cardBg }}
    >
      <Text className="text-xs font-medium mb-1" style={{ color: tokens.textSec }}>
        Name
      </Text>
      <TextInput
        value={draft.name}
        onChangeText={(name) => onChange({ ...draft, name })}
        autoFocus
        maxLength={GROUP_NAME_MAX}
        placeholder="e.g. Work, Kids, Side project"
        placeholderTextColor={tokens.textTer}
        selectionColor={tokens.primary}
        returnKeyType="done"
        onSubmitEditing={canSave ? onSave : undefined}
        className="rounded-lg border px-3 py-2.5 text-sm mb-3"
        style={{ borderColor: tokens.line, backgroundColor: tokens.bgInset, color: tokens.text, minHeight: 42 }}
      />
      <Text className="text-xs font-medium mb-1.5" style={{ color: tokens.textSec }}>
        Icon
      </Text>
      <View className="flex-row flex-wrap gap-2 mb-4">
        {GROUP_ICONS.map((icon) => {
          const active = draft.icon === icon;
          return (
            <Pressable
              key={icon}
              onPress={() => onChange({ ...draft, icon })}
              accessibilityRole="button"
              accessibilityLabel={`Icon ${icon}`}
              accessibilityState={{ selected: active }}
              className="items-center justify-center rounded-lg"
              style={{
                width: 40,
                height: 40,
                borderWidth: 1,
                borderColor: active ? tokens.primary : tokens.line,
                backgroundColor: active ? `${tokens.primary}22` : "transparent",
              }}
            >
              <Ionicons name={icon as never} size={18} color={active ? tokens.primary : tokens.textSec} />
            </Pressable>
          );
        })}
      </View>
      <View className="flex-row items-center justify-between">
        {onDelete ? (
          <Pressable onPress={onDelete} disabled={busy} hitSlop={8} accessibilityRole="button">
            <Text className="text-sm font-semibold" style={{ color: tokens.bad }}>
              Delete group
            </Text>
          </Pressable>
        ) : (
          <View />
        )}
        <View className="flex-row items-center gap-5">
          <Pressable onPress={onCancel} disabled={busy} hitSlop={8} accessibilityRole="button">
            <Text className="text-sm" style={{ color: tokens.textSec }}>
              Cancel
            </Text>
          </Pressable>
          <Pressable onPress={onSave} disabled={!canSave} hitSlop={8} accessibilityRole="button">
            <Text className="text-sm font-semibold" style={{ color: canSave ? tokens.primary : tokens.textTer }}>
              {busy ? "Saving…" : "Save"}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
