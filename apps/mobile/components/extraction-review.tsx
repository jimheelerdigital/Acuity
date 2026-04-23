import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";

import { PRIORITY_LABELS } from "@acuity/shared";

import { api } from "@/lib/api";

type ReviewTask = {
  tempId: string;
  title: string;
  description: string | null;
  priority: string;
  dueDate: string | null;
  groupName: string | null;
};
type ReviewGoal = {
  tempId: string;
  title: string;
  description: string | null;
  targetDate: string | null;
  lifeArea: string | null;
  alreadyExists: boolean;
};

/**
 * Mobile counterpart to apps/web/src/app/entries/[id]/extraction-review.tsx.
 * Same data source (/api/entries/[id]/extraction), same Commit / Skip
 * actions. Renders on the entry detail screen until the user commits
 * or skips, then disappears.
 */
export function ExtractionReview({
  entryId,
  onCommitted,
}: {
  entryId: string;
  onCommitted?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<(ReviewTask & { selected: boolean })[]>([]);
  const [goals, setGoals] = useState<(ReviewGoal & { selected: boolean })[]>([]);
  const [hidden, setHidden] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<{
          committedAt: string | null;
          tasks: ReviewTask[];
          goals: ReviewGoal[];
        }>(`/api/entries/${encodeURIComponent(entryId)}/extraction`);
        if (cancelled) return;
        if (res.committedAt) {
          setHidden(true);
          return;
        }
        setTasks((res.tasks ?? []).map((t) => ({ ...t, selected: true })));
        setGoals(
          (res.goals ?? []).map((g) => ({ ...g, selected: !g.alreadyExists }))
        );
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entryId]);

  if (loading || hidden) return null;
  if (tasks.length === 0 && goals.length === 0) return null;

  const commit = async () => {
    setSubmitting(true);
    try {
      await api.post(`/api/entries/${encodeURIComponent(entryId)}/extraction`, {
        action: "commit",
        tasks: tasks
          .filter((t) => t.selected)
          .map((t) => ({
            title: t.title,
            description: t.description,
            priority: t.priority,
            dueDate: t.dueDate,
            groupName: t.groupName,
          })),
        goals: goals
          .filter((g) => g.selected)
          .map((g) => ({
            title: g.title,
            description: g.description,
            targetDate: g.targetDate,
            lifeArea: g.lifeArea,
          })),
      });
      setHidden(true);
      onCommitted?.();
    } catch {
      Alert.alert("Couldn't commit", "Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const skip = async () => {
    setSubmitting(true);
    try {
      await api.post(`/api/entries/${encodeURIComponent(entryId)}/extraction`, {
        action: "skip",
      });
      setHidden(true);
      onCommitted?.();
    } catch {
      Alert.alert("Couldn't save", "Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const selectedTasks = tasks.filter((t) => t.selected).length;
  const selectedGoals = goals.filter((g) => g.selected).length;

  return (
    <View className="mb-6 rounded-2xl border border-violet-200 dark:border-violet-900/30 bg-violet-50/60 dark:bg-violet-950/20 p-4">
      <View className="flex-row items-center gap-2 mb-3">
        <Ionicons name="sparkles-outline" size={14} color="#7C3AED" />
        <Text className="text-xs font-semibold uppercase tracking-widest text-violet-700 dark:text-violet-300">
          Review what Acuity extracted
        </Text>
      </View>
      <Text className="mb-4 text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
        Tick what to keep, then commit. Items you don&apos;t select are
        discarded.
      </Text>

      {tasks.length > 0 && (
        <View className="mb-4">
          <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Tasks Acuity extracted ({tasks.length})
          </Text>
          <View className="gap-2">
            {tasks.map((t) => (
              <ReviewRow
                key={t.tempId}
                selected={t.selected}
                onToggle={() =>
                  setTasks((prev) =>
                    prev.map((x) =>
                      x.tempId === t.tempId
                        ? { ...x, selected: !x.selected }
                        : x
                    )
                  )
                }
                title={t.title}
                onTitleChange={(v) =>
                  setTasks((prev) =>
                    prev.map((x) =>
                      x.tempId === t.tempId ? { ...x, title: v } : x
                    )
                  )
                }
                chips={[
                  PRIORITY_LABELS[t.priority] ?? t.priority,
                  ...(t.groupName ? [t.groupName] : []),
                ]}
                subline={t.description ?? undefined}
              />
            ))}
          </View>
        </View>
      )}

      {goals.length > 0 && (
        <View className="mb-4">
          <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Goals Acuity suggested ({goals.length})
          </Text>
          <View className="gap-2">
            {goals.map((g) => (
              <ReviewRow
                key={g.tempId}
                selected={g.selected}
                onToggle={() =>
                  setGoals((prev) =>
                    prev.map((x) =>
                      x.tempId === g.tempId
                        ? { ...x, selected: !x.selected }
                        : x
                    )
                  )
                }
                title={g.title}
                onTitleChange={(v) =>
                  setGoals((prev) =>
                    prev.map((x) =>
                      x.tempId === g.tempId ? { ...x, title: v } : x
                    )
                  )
                }
                chips={g.alreadyExists ? ["Already tracked"] : []}
                subline={g.description ?? undefined}
                dimmed={g.alreadyExists && !g.selected}
              />
            ))}
          </View>
        </View>
      )}

      <View className="flex-row items-center gap-3 flex-wrap">
        <Pressable
          disabled={submitting}
          onPress={commit}
          className="rounded-lg bg-zinc-900 dark:bg-white px-4 py-2"
        >
          <Text className="text-sm font-semibold text-white dark:text-zinc-900">
            Commit
            {selectedTasks + selectedGoals > 0
              ? ` (${selectedTasks} task${selectedTasks === 1 ? "" : "s"}, ${selectedGoals} goal${selectedGoals === 1 ? "" : "s"})`
              : ""}
          </Text>
        </Pressable>
        <Pressable disabled={submitting} onPress={skip} className="px-3 py-2">
          <Text className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Skip all
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function ReviewRow({
  selected,
  onToggle,
  title,
  onTitleChange,
  chips,
  subline,
  dimmed,
}: {
  selected: boolean;
  onToggle: () => void;
  title: string;
  onTitleChange: (v: string) => void;
  chips: string[];
  subline?: string;
  dimmed?: boolean;
}) {
  return (
    <View
      className={`flex-row items-start gap-3 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] px-3 py-2.5 ${dimmed ? "opacity-60" : ""}`}
    >
      <Pressable
        onPress={onToggle}
        hitSlop={8}
        className={`mt-1 h-5 w-5 items-center justify-center rounded border-2 ${
          selected
            ? "border-violet-600 bg-violet-600"
            : "border-zinc-300 dark:border-white/20"
        }`}
      >
        {selected && <Ionicons name="checkmark" size={14} color="#fff" />}
      </Pressable>
      <View className="flex-1">
        <TextInput
          value={title}
          onChangeText={onTitleChange}
          className="text-sm text-zinc-900 dark:text-zinc-50 p-0"
        />
        {subline && (
          <Text
            className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400"
            numberOfLines={2}
          >
            {subline}
          </Text>
        )}
        {chips.length > 0 && (
          <View className="mt-1.5 flex-row flex-wrap gap-1.5">
            {chips.map((c) => (
              <View
                key={c}
                className="rounded-full bg-zinc-100 dark:bg-white/10 px-2 py-0.5"
              >
                <Text className="text-[10px] font-medium text-zinc-600 dark:text-zinc-300">
                  {c}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}
