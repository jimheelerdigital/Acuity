import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";

import { formatRelativeDate } from "@acuity/shared";

import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";
import { WARN_AMBER } from "@/lib/tone-colors";

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
  const { tokens } = useTheme();
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
    <View
      className="mt-6 rounded-2xl border p-4"
      style={{
        borderColor: `${tokens.primary}55`,
        backgroundColor: `${tokens.primary}14`,
      }}
    >
      <View className="flex-row items-center gap-2 mb-3">
        <Ionicons name="sparkles-outline" size={14} color={tokens.primary} />
        <Text
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: tokens.primary }}
        >
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
              className="rounded-xl border p-3"
              style={{
                borderColor: tokens.line,
                backgroundColor: tokens.cardBg,
              }}
            >
              <Text
                className="text-sm leading-relaxed"
                style={{ color: tokens.textSec }}
              >
                {s.rationale}
              </Text>
              {s.sourceEntryAt && (
                <Text
                  className="mt-1.5 text-xs"
                  style={{ color: tokens.textTer }}
                >
                  From your {formatRelativeDate(s.sourceEntryAt)} entry
                </Text>
              )}
              <View className="mt-2 flex-row items-baseline gap-2">
                <Text
                  className="text-sm"
                  style={{ color: tokens.textSec }}
                >
                  {s.currentProgressPct}%
                </Text>
                <Text style={{ color: tokens.textTer }}>→</Text>
                {isEditing ? (
                  <TextInput
                    value={editDraft}
                    onChangeText={setEditDraft}
                    keyboardType="number-pad"
                    maxLength={3}
                    autoFocus
                    className="w-14 rounded-md border px-2 py-0.5 text-base font-semibold"
                    style={{
                      borderColor: tokens.line,
                      backgroundColor: tokens.bgInset,
                      color: tokens.text,
                    }}
                  />
                ) : (
                  <Text
                    className="text-lg font-semibold"
                    style={{ color: tokens.text }}
                  >
                    {s.suggestedProgressPct}%
                  </Text>
                )}
                {!isEditing && delta !== 0 && (
                  <Text
                    className="text-xs font-medium"
                    style={{ color: delta > 0 ? tokens.good : WARN_AMBER }}
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
                      className="rounded-lg px-3 py-1.5"
                      style={{ backgroundColor: tokens.primary }}
                    >
                      <Text
                        className="text-xs font-semibold"
                        style={{ color: "#FFFFFF" }}
                      >
                        Save {editDraft || 0}%
                      </Text>
                    </Pressable>
                    <Pressable
                      disabled={busy}
                      onPress={() => setEditingId(null)}
                      className="rounded-lg px-3 py-1.5"
                    >
                      <Text
                        className="text-xs font-medium"
                        style={{ color: tokens.textSec }}
                      >
                        Cancel
                      </Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Pressable
                      disabled={busy}
                      onPress={() => accept(s)}
                      className="rounded-lg px-3 py-1.5"
                      style={{ backgroundColor: tokens.text }}
                    >
                      <Text
                        className="text-xs font-semibold"
                        style={{ color: tokens.bg }}
                      >
                        Accept {s.suggestedProgressPct}%
                      </Text>
                    </Pressable>
                    <Pressable
                      disabled={busy}
                      onPress={() => {
                        setEditDraft(String(s.suggestedProgressPct));
                        setEditingId(s.id);
                      }}
                      className="rounded-lg border px-3 py-1.5"
                      style={{ borderColor: tokens.line }}
                    >
                      <Text
                        className="text-xs font-medium"
                        style={{ color: tokens.textSec }}
                      >
                        Edit
                      </Text>
                    </Pressable>
                    <Pressable
                      disabled={busy}
                      onPress={() => dismiss(s)}
                      className="rounded-lg px-3 py-1.5"
                    >
                      <Text
                        className="text-xs font-medium"
                        style={{ color: tokens.textSec }}
                      >
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
