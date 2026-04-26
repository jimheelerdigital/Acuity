import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
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

import { formatRelativeDate } from "@acuity/shared";

import { StickyBackButton } from "@/components/back-button";
import { ProgressSuggestionBanner } from "@/components/progress-suggestion-banner";
import { api } from "@/lib/api";
import { getCached, isStale, setCached } from "@/lib/cache";

type GoalDetailResponse = { goal: Goal; linkedEntries: LinkedEntry[] };

function goalDetailKey(id: string): string {
  return `/api/goals/${id}`;
}

/**
 * Mobile goal detail screen. Parity with apps/web/src/app/goals/[id]/page.tsx —
 * inline title edit, status picker (bottom-row pills), progress slider, notes
 * textarea, linked-entries list, "Add reflection" CTA that opens /record with
 * the goal name as a hint.
 */

type Goal = {
  id: string;
  title: string;
  description: string | null;
  lifeArea: string;
  status: string;
  progress: number;
  notes: string | null;
  targetDate: string | null;
  lastMentionedAt: string | null;
  createdAt: string;
  entryRefs?: string[];
};

type LinkedEntry = {
  id: string;
  summary: string | null;
  mood: string | null;
  createdAt: string;
};

const STATUS_OPTIONS: Array<{ value: string; label: string; color: string }> = [
  { value: "NOT_STARTED", label: "Not started", color: "#71717A" },
  { value: "IN_PROGRESS", label: "In progress", color: "#34D399" },
  { value: "ON_HOLD", label: "On hold", color: "#FBBF24" },
  { value: "ARCHIVED", label: "Archived", color: "#52525B" },
  { value: "COMPLETE", label: "Complete", color: "#A78BFA" },
];

const LIFE_AREA_LABELS: Record<string, string> = {
  CAREER: "Career",
  HEALTH: "Health",
  RELATIONSHIPS: "Relationships",
  FINANCES: "Finances",
  PERSONAL: "Personal Growth",
  OTHER: "Other",
};

export default function GoalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const cacheKey = id ? goalDetailKey(id) : null;
  const initialCached = cacheKey
    ? getCached<GoalDetailResponse>(cacheKey)
    : undefined;

  const [goal, setGoal] = useState<Goal | null>(
    () => initialCached?.goal ?? null
  );
  const [linked, setLinked] = useState<LinkedEntry[]>(
    () => initialCached?.linkedEntries ?? []
  );
  const [loading, setLoading] = useState(() => !initialCached);
  const [saving, setSaving] = useState(false);

  const [titleDraft, setTitleDraft] = useState(
    () => initialCached?.goal.title ?? ""
  );
  const [editingTitle, setEditingTitle] = useState(false);
  const [notesDraft, setNotesDraft] = useState(
    () => initialCached?.goal.notes ?? ""
  );
  const [editingNotes, setEditingNotes] = useState(false);
  const [progressDraft, setProgressDraft] = useState(
    () => initialCached?.goal.progress ?? 0
  );

  const load = useCallback(async () => {
    if (!id || !cacheKey) return;
    try {
      const data = await api.get<GoalDetailResponse>(cacheKey);
      setCached(cacheKey, data);
      setGoal(data.goal);
      setLinked(data.linkedEntries);
      setTitleDraft(data.goal.title);
      setNotesDraft(data.goal.notes ?? "");
      setProgressDraft(data.goal.progress);
    } catch {
      // Keep cached state on failure; only null out if we never had
      // content (cold miss).
      setGoal((prev) => prev ?? null);
    } finally {
      setLoading(false);
    }
  }, [id, cacheKey]);

  useEffect(() => {
    if (!cacheKey) return;
    if (!initialCached || isStale(cacheKey)) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  const patch = async (fields: Record<string, unknown>) => {
    if (!goal) return;
    setSaving(true);
    try {
      const res = await api.patch<{ goal: Goal }>("/api/goals", {
        id: goal.id,
        action: "edit",
        fields,
      });
      if (res?.goal) {
        setGoal((g) => (g ? { ...g, ...res.goal } : g));
        if (cacheKey) {
          // Keep the detail cache in sync so a back-and-forward nav
          // lands on the just-saved state, not stale pre-edit data.
          setCached(cacheKey, {
            goal: { ...goal, ...res.goal },
            linkedEntries: linked,
          });
        }
      }
    } catch (err) {
      const msg =
        err instanceof Error && /network|fetch|offline/i.test(err.message)
          ? "You're offline. We'll save once you're back online."
          : err instanceof Error && /4\d\d/.test(err.message)
            ? "We couldn't accept that — please check your input and retry."
            : "Something went wrong on our end. Please try again.";
      Alert.alert("Couldn't save", msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-white dark:bg-[#0B0B12] items-center justify-center">
        <ActivityIndicator color="#7C3AED" />
      </SafeAreaView>
    );
  }

  if (!goal) {
    return (
      <SafeAreaView className="flex-1 bg-white dark:bg-[#0B0B12] items-center justify-center p-6">
        <Text className="text-zinc-600 dark:text-zinc-300">Goal not found.</Text>
        <Pressable
          onPress={() => router.back()}
          className="mt-4 rounded-full bg-violet-600 px-4 py-2"
        >
          <Text className="text-white text-sm font-semibold">Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const delta = goal; // alias

  return (
    <SafeAreaView
      edges={["top"]}
      className="flex-1 bg-white dark:bg-[#0B0B12]"
    >
      <StickyBackButton accessibilityLabel="Back to Goals" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{
            padding: 20,
            paddingTop: 60,
            paddingBottom: 80,
          }}
        >
          {/* Area label */}
          <Text className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2">
            {LIFE_AREA_LABELS[delta.lifeArea] ?? delta.lifeArea}
          </Text>

          {/* Title */}
          {editingTitle ? (
            <View className="flex-row items-center gap-2 mb-3">
              <TextInput
                value={titleDraft}
                onChangeText={setTitleDraft}
                autoFocus
                className="flex-1 rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-[#1E1E2E] px-3 py-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50"
              />
              <Pressable
                disabled={saving}
                onPress={async () => {
                  const next = titleDraft.trim();
                  if (next && next !== delta.title) await patch({ title: next });
                  setEditingTitle(false);
                }}
                className="rounded-lg bg-violet-600 px-3 py-2"
              >
                <Text className="text-white text-sm font-semibold">Save</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={() => setEditingTitle(true)}>
              <Text className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                {delta.title}
              </Text>
              <Text className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                Tap to edit
              </Text>
            </Pressable>
          )}

          {/* First / last mentioned */}
          <Text className="mt-3 text-xs text-zinc-400 dark:text-zinc-500">
            First mentioned {formatRelativeDate(delta.createdAt)}
            {delta.lastMentionedAt && delta.lastMentionedAt !== delta.createdAt && (
              <> · last mentioned {formatRelativeDate(delta.lastMentionedAt)}</>
            )}
          </Text>

          <ProgressSuggestionBanner
            goalId={goal.id}
            onProgressUpdated={(newPct) => {
              setGoal((g) => (g ? { ...g, progress: newPct } : g));
              setProgressDraft(newPct);
              load();
            }}
          />

          {/* Status pills */}
          <View className="mt-6">
            <Text className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2">
              Status
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {STATUS_OPTIONS.map((opt) => {
                const active = goal.status === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => patch({ status: opt.value })}
                    style={{
                      backgroundColor: active ? opt.color : "transparent",
                      borderColor: active ? opt.color : "#3f3f46",
                    }}
                    className="rounded-full border px-3 py-1.5"
                  >
                    <Text
                      style={{
                        color: active ? "#fff" : opt.color,
                        fontSize: 12,
                        fontWeight: "600",
                      }}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Progress — tap-to-step. Slider would need an extra dep and
              expo's built-in is shipped separately; 5 quick buttons cover
              the realistic use cases (new, quarter, half, most, done) and
              the detail screen's -/+ nudges the value by 5. */}
          <View className="mt-6">
            <View className="flex-row justify-between items-center mb-2">
              <Text className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                Progress
              </Text>
              <Text className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                {progressDraft}%
              </Text>
            </View>
            <View className="h-2 rounded-full bg-zinc-200 dark:bg-white/10 mb-3 overflow-hidden">
              <View
                className="h-full rounded-full bg-violet-500"
                style={{ width: `${progressDraft}%` }}
              />
            </View>
            <View className="flex-row items-center justify-between">
              <View className="flex-row gap-2">
                <Pressable
                  onPress={() => {
                    const next = Math.max(0, progressDraft - 5);
                    setProgressDraft(next);
                    patch({ progress: next });
                  }}
                  className="h-9 w-9 rounded-full border border-zinc-300 dark:border-white/15 items-center justify-center"
                >
                  <Ionicons name="remove" size={18} color="#A1A1AA" />
                </Pressable>
                <Pressable
                  onPress={() => {
                    const next = Math.min(100, progressDraft + 5);
                    setProgressDraft(next);
                    patch({ progress: next });
                  }}
                  className="h-9 w-9 rounded-full border border-zinc-300 dark:border-white/15 items-center justify-center"
                >
                  <Ionicons name="add" size={18} color="#A1A1AA" />
                </Pressable>
              </View>
              <View className="flex-row gap-1.5">
                {[0, 25, 50, 75, 100].map((v) => (
                  <Pressable
                    key={v}
                    onPress={() => {
                      setProgressDraft(v);
                      patch({ progress: v });
                    }}
                    className={`rounded-full px-2.5 py-1 border ${
                      progressDraft === v
                        ? "border-violet-500 bg-violet-500"
                        : "border-zinc-300 dark:border-white/15"
                    }`}
                  >
                    <Text
                      className={`text-xs font-semibold ${
                        progressDraft === v
                          ? "text-white"
                          : "text-zinc-500 dark:text-zinc-400"
                      }`}
                    >
                      {v}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>

          {/* Notes */}
          <View className="mt-6">
            <View className="flex-row justify-between items-center mb-2">
              <Text className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                Notes
              </Text>
              {!editingNotes && (
                <Pressable
                  onPress={() => {
                    setNotesDraft(delta.notes ?? "");
                    setEditingNotes(true);
                  }}
                >
                  <Text className="text-xs font-semibold text-violet-600 dark:text-violet-400">
                    {delta.notes ? "Edit" : "Add notes"}
                  </Text>
                </Pressable>
              )}
            </View>
            {editingNotes ? (
              <View>
                <TextInput
                  value={notesDraft}
                  onChangeText={setNotesDraft}
                  autoFocus
                  multiline
                  placeholder="Reflections, blockers, next steps…"
                  placeholderTextColor="#71717A"
                  className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] px-4 py-3 text-sm text-zinc-800 dark:text-zinc-100"
                  style={{ minHeight: 100, textAlignVertical: "top" }}
                />
                <View className="flex-row justify-end gap-2 mt-2">
                  <Pressable onPress={() => setEditingNotes(false)} className="px-3 py-1.5">
                    <Text className="text-xs text-zinc-500 dark:text-zinc-400">Cancel</Text>
                  </Pressable>
                  <Pressable
                    disabled={saving}
                    onPress={async () => {
                      await patch({ notes: notesDraft || null });
                      setEditingNotes(false);
                    }}
                    className="rounded-lg bg-violet-600 px-3 py-1.5"
                  >
                    <Text className="text-white text-xs font-semibold">Save</Text>
                  </Pressable>
                </View>
              </View>
            ) : delta.notes ? (
              <Text className="rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-[#13131F] px-4 py-3 text-sm text-zinc-700 dark:text-zinc-200">
                {delta.notes}
              </Text>
            ) : (
              <Text className="text-sm italic text-zinc-400 dark:text-zinc-500">
                No notes yet.
              </Text>
            )}
          </View>

          {/* Add reflection CTA */}
          <Pressable
            onPress={() => router.push(`/record?goalId=${encodeURIComponent(delta.id)}`)}
            className="mt-6 rounded-2xl border border-violet-900/30 bg-violet-950/20 px-4 py-4"
          >
            <Text className="text-xs font-semibold uppercase tracking-widest text-violet-400">
              Add a reflection
            </Text>
            <Text className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-50">
              Record a short update on this goal →
            </Text>
          </Pressable>

          {/* Linked entries */}
          {linked.length > 0 && (
            <View className="mt-6">
              <Text className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2">
                Linked entries
              </Text>
              <View className="gap-2">
                {linked.map((e) => (
                  <Pressable
                    key={e.id}
                    onPress={() => router.push(`/entry/${e.id}`)}
                    className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] px-4 py-3"
                  >
                    <Text className="text-xs text-zinc-400 dark:text-zinc-500 mb-1">
                      {formatRelativeDate(e.createdAt)}
                      {e.mood && <> · {e.mood.toLowerCase()}</>}
                    </Text>
                    <Text
                      className="text-sm text-zinc-700 dark:text-zinc-200"
                      numberOfLines={2}
                    >
                      {e.summary ?? "(no summary)"}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {/* Delete */}
          <View className="mt-8 pt-6 border-t border-zinc-200 dark:border-white/10">
            <Pressable
              onPress={() => {
                Alert.alert("Delete goal?", "This can't be undone.", [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                      try {
                        await api.del(`/api/goals/${delta.id}`);
                        router.back();
                      } catch {
                        Alert.alert("Couldn't delete", "Please try again.");
                      }
                    },
                  },
                ]);
              }}
            >
              <Text className="text-xs font-medium text-red-500">Delete goal</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
