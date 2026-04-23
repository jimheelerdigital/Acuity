import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";

import { formatRelativeDate } from "@acuity/shared";

import { api } from "@/lib/api";

type Suggestion = {
  id: string;
  goalId: string;
  goalTitle: string | null;
  currentProgressPct: number;
  priorProgressPct: number;
  suggestedProgressPct: number;
  rationale: string;
  sourceEntryId: string | null;
  sourceEntrySummary: string | null;
  sourceEntryAt: string | null;
  createdAt: string;
};

/**
 * Mobile counterpart to apps/web/src/app/goals/[id]/progress-suggestion-
 * banner.tsx. Renders PENDING progress suggestions on the goal detail
 * screen. Accept/Edit/Dismiss mirror the web flow; onProgressUpdated
 * lets the parent refresh the slider + goal data after accept.
 */
export function ProgressSuggestionBanner({
  goalId,
  onProgressUpdated,
}: {
  goalId: string;
  onProgressUpdated: (newProgressPct: number) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [acting, setActing] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<{ suggestions: Suggestion[] }>(
          `/api/goals/progress-suggestions?goalId=${encodeURIComponent(goalId)}`
        );
        if (!cancelled) setSuggestions(res.suggestions ?? []);
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [goalId]);

  const remove = (id: string) =>
    setSuggestions((prev) => prev.filter((s) => s.id !== id));

  const accept = async (s: Suggestion, editedPct?: number) => {
    setActing(s.id);
    try {
      const body =
        editedPct != null
          ? { action: "edit-accept", id: s.id, editedPct }
          : { action: "accept", id: s.id };
      const res = await api.post<{ goalProgress: number }>(
        "/api/goals/progress-suggestions",
        body
      );
      if (typeof res?.goalProgress === "number") {
        onProgressUpdated(res.goalProgress);
        remove(s.id);
      }
    } catch {
      Alert.alert("Couldn't update", "Please try again.");
    } finally {
      setActing(null);
      setEditingId(null);
    }
  };

  const dismiss = async (s: Suggestion) => {
    setActing(s.id);
    try {
      await api.post("/api/goals/progress-suggestions", {
        action: "dismiss",
        id: s.id,
      });
      remove(s.id);
    } catch {
      // silent
    } finally {
      setActing(null);
    }
  };

  if (loading || suggestions.length === 0) return null;

  return (
    <View className="mt-6 rounded-2xl border border-violet-200 dark:border-violet-900/30 bg-violet-50/60 dark:bg-violet-950/20 p-4">
      <View className="flex-row items-center gap-2 mb-3">
        <Ionicons name="sparkles-outline" size={14} color="#7C3AED" />
        <Text className="text-xs font-semibold uppercase tracking-widest text-violet-700 dark:text-violet-300">
          Acuity noticed progress
        </Text>
      </View>
      <View className="gap-3">
        {suggestions.map((s) => {
          const isEditing = editingId === s.id;
          const busy = acting === s.id;
          const delta = s.suggestedProgressPct - s.currentProgressPct;
          return (
            <View
              key={s.id}
              className="rounded-xl border border-violet-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] p-3"
            >
              <Text className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-200">
                {s.rationale}
              </Text>
              {s.sourceEntryAt && (
                <Text className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                  From your {formatRelativeDate(s.sourceEntryAt)} entry
                </Text>
              )}
              <View className="mt-2 flex-row items-baseline gap-2">
                <Text className="text-sm text-zinc-500 dark:text-zinc-400">
                  {s.currentProgressPct}%
                </Text>
                <Text className="text-zinc-400">→</Text>
                {isEditing ? (
                  <TextInput
                    value={editDraft}
                    onChangeText={setEditDraft}
                    keyboardType="number-pad"
                    maxLength={3}
                    autoFocus
                    className="w-14 rounded-md border border-zinc-300 dark:border-white/15 bg-white dark:bg-[#13131F] px-2 py-0.5 text-base font-semibold text-zinc-900 dark:text-zinc-50"
                  />
                ) : (
                  <Text className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                    {s.suggestedProgressPct}%
                  </Text>
                )}
                {!isEditing && delta !== 0 && (
                  <Text
                    className={`text-xs font-medium ${delta > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}
                  >
                    {delta > 0 ? `+${delta}` : delta}
                  </Text>
                )}
              </View>
              <View className="mt-3 flex-row flex-wrap gap-2">
                {isEditing ? (
                  <>
                    <Pressable
                      disabled={busy}
                      onPress={() => {
                        const n = Number(editDraft);
                        if (Number.isFinite(n) && n >= 0 && n <= 100) {
                          accept(s, Math.round(n));
                        }
                      }}
                      className="rounded-lg bg-violet-600 px-3 py-1.5"
                    >
                      <Text className="text-xs font-semibold text-white">
                        Save {editDraft || 0}%
                      </Text>
                    </Pressable>
                    <Pressable
                      disabled={busy}
                      onPress={() => setEditingId(null)}
                      className="rounded-lg px-3 py-1.5"
                    >
                      <Text className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        Cancel
                      </Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Pressable
                      disabled={busy}
                      onPress={() => accept(s)}
                      className="rounded-lg bg-zinc-900 dark:bg-white px-3 py-1.5"
                    >
                      <Text className="text-xs font-semibold text-white dark:text-zinc-900">
                        Accept {s.suggestedProgressPct}%
                      </Text>
                    </Pressable>
                    <Pressable
                      disabled={busy}
                      onPress={() => {
                        setEditDraft(String(s.suggestedProgressPct));
                        setEditingId(s.id);
                      }}
                      className="rounded-lg border border-zinc-200 dark:border-white/10 px-3 py-1.5"
                    >
                      <Text className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
                        Edit
                      </Text>
                    </Pressable>
                    <Pressable
                      disabled={busy}
                      onPress={() => dismiss(s)}
                      className="rounded-lg px-3 py-1.5"
                    >
                      <Text className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        Dismiss
                      </Text>
                    </Pressable>
                  </>
                )}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}
