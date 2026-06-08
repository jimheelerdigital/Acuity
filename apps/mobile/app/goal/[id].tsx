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

import { formatRelativeDate, lifeAreaDisplayLabel } from "@acuity/shared";

import { StickyBackButton } from "@/components/back-button";
import { DueDateField } from "@/components/due-date-field";
import { ProgressSuggestionBanner } from "@/components/progress-suggestion-banner";
import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";
import { getCached, isStale, setCached } from "@/lib/cache";
import { statusToneColor } from "@/lib/tone-colors";
import type { StatusTone } from "@/lib/tone-colors";

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

// Q11 Phase D.1: dropped hardcoded `color` field. Each option now
// carries a semantic `tone` that resolves to a palette token via
// statusToneColor(option.value, tokens) at render time. Same
// tone vocabulary as the goals tab STATUS_STYLES constant.
const STATUS_OPTIONS: Array<{ value: string; label: string; tone: StatusTone }> = [
  { value: "NOT_STARTED", label: "Not started", tone: "muted" },
  { value: "IN_PROGRESS", label: "In progress", tone: "good" },
  { value: "ON_HOLD", label: "On hold", tone: "warning" },
  { value: "ARCHIVED", label: "Archived", tone: "quiet" },
  { value: "COMPLETE", label: "Complete", tone: "accent" },
];

// Phase D (2026-05-21): label resolution lifted to shared
// `lifeAreaDisplayLabel`. Tolerates both 10-axis canonical and
// 6-axis legacy vocab; falls through to raw enum for unknown values.

export default function GoalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { tokens } = useTheme();

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
      <SafeAreaView
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: tokens.bg }}
      >
        <ActivityIndicator color={tokens.primary} />
      </SafeAreaView>
    );
  }

  if (!goal) {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center p-6"
        style={{ backgroundColor: tokens.bg }}
      >
        <Text style={{ color: tokens.textSec }}>Goal not found.</Text>
        <Pressable
          onPress={() => router.back()}
          className="mt-4 rounded-full px-4 py-2"
          style={{ backgroundColor: tokens.primary }}
        >
          <Text className="text-sm font-semibold" style={{ color: "#FFFFFF" }}>
            Go back
          </Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const delta = goal; // alias

  return (
    <SafeAreaView
      edges={["top"]}
      className="flex-1"
      style={{ backgroundColor: tokens.bg }}
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
          <Text
            className="text-xs font-semibold uppercase tracking-widest mb-2"
            style={{ color: tokens.textTer }}
          >
            {lifeAreaDisplayLabel(delta.lifeArea)}
          </Text>

          {/* Title */}
          {editingTitle ? (
            <View className="flex-row items-center gap-2 mb-3">
              <TextInput
                value={titleDraft}
                onChangeText={setTitleDraft}
                autoFocus
                className="flex-1 rounded-lg border px-3 py-2 text-lg font-semibold"
                style={{
                  borderColor: tokens.line,
                  backgroundColor: tokens.cardBg,
                  color: tokens.text,
                }}
              />
              <Pressable
                disabled={saving}
                onPress={async () => {
                  const next = titleDraft.trim();
                  if (next && next !== delta.title) await patch({ title: next });
                  setEditingTitle(false);
                }}
                className="rounded-lg px-3 py-2"
                style={{ backgroundColor: tokens.primary }}
              >
                <Text className="text-sm font-semibold" style={{ color: "#FFFFFF" }}>
                  Save
                </Text>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={() => setEditingTitle(true)}>
              <Text
                className="text-2xl font-semibold"
                style={{ color: tokens.text }}
              >
                {delta.title}
              </Text>
              <Text
                className="mt-1 text-xs"
                style={{ color: tokens.textTer }}
              >
                Tap to edit
              </Text>
            </Pressable>
          )}

          {/* First / last mentioned */}
          <Text
            className="mt-3 text-xs"
            style={{ color: tokens.textTer }}
          >
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
            <Text
              className="text-xs font-semibold uppercase tracking-widest mb-2"
              style={{ color: tokens.textTer }}
            >
              Status
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {STATUS_OPTIONS.map((opt) => {
                const active = goal.status === opt.value;
                const optColor = statusToneColor(opt.value, tokens);
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => patch({ status: opt.value })}
                    style={{
                      backgroundColor: active ? optColor : "transparent",
                      borderColor: active ? optColor : tokens.line,
                    }}
                    className="rounded-full border px-3 py-1.5"
                  >
                    <Text
                      style={{
                        color: active ? "#FFFFFF" : optColor,
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

          {/* Target date — native calendar picker, US-format display.
              Net-new editor (was display-only); PATCHes targetDate. */}
          <View className="mt-6">
            <Text
              className="text-xs font-semibold uppercase tracking-widest mb-2"
              style={{ color: tokens.textTer }}
            >
              Target date
            </Text>
            <DueDateField
              value={
                goal.targetDate
                  ? new Date(goal.targetDate).toISOString().slice(0, 10)
                  : ""
              }
              onChange={(v) => {
                // Optimistic UI; store as UTC-midnight ISO to mirror the
                // server (new Date("YYYY-MM-DD")). patch() reconciles from
                // the response.
                const iso = v ? new Date(v).toISOString() : null;
                setGoal((g) => (g ? { ...g, targetDate: iso } : g));
                void patch({ targetDate: v || null });
              }}
            />
          </View>

          {/* Progress — tap-to-step. Slider would need an extra dep and
              expo's built-in is shipped separately; 5 quick buttons cover
              the realistic use cases (new, quarter, half, most, done) and
              the detail screen's -/+ nudges the value by 5. */}
          <View className="mt-6">
            <View className="flex-row justify-between items-center mb-2">
              <Text
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: tokens.textTer }}
              >
                Progress
              </Text>
              <Text
                className="text-sm font-medium"
                style={{ color: tokens.textSec }}
              >
                {progressDraft}%
              </Text>
            </View>
            <View
              className="h-2 rounded-full mb-3 overflow-hidden"
              style={{ backgroundColor: tokens.bgInset }}
            >
              <View
                className="h-full rounded-full"
                style={{
                  width: `${progressDraft}%`,
                  backgroundColor: tokens.primary,
                }}
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
                  className="h-9 w-9 rounded-full border items-center justify-center"
                  style={{ borderColor: tokens.line }}
                >
                  <Ionicons name="remove" size={18} color={tokens.textTer} />
                </Pressable>
                <Pressable
                  onPress={() => {
                    const next = Math.min(100, progressDraft + 5);
                    setProgressDraft(next);
                    patch({ progress: next });
                  }}
                  className="h-9 w-9 rounded-full border items-center justify-center"
                  style={{ borderColor: tokens.line }}
                >
                  <Ionicons name="add" size={18} color={tokens.textTer} />
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
                    className="rounded-full px-2.5 py-1 border"
                    style={{
                      borderColor:
                        progressDraft === v ? tokens.primary : tokens.line,
                      backgroundColor:
                        progressDraft === v ? tokens.primary : "transparent",
                    }}
                  >
                    <Text
                      className="text-xs font-semibold"
                      style={{
                        color:
                          progressDraft === v ? "#FFFFFF" : tokens.textSec,
                      }}
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
              <Text
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: tokens.textTer }}
              >
                Notes
              </Text>
              {!editingNotes && (
                <Pressable
                  onPress={() => {
                    setNotesDraft(delta.notes ?? "");
                    setEditingNotes(true);
                  }}
                >
                  <Text
                    className="text-xs font-semibold"
                    style={{ color: tokens.primary }}
                  >
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
                  placeholderTextColor={tokens.textTer}
                  className="rounded-xl border px-4 py-3 text-sm"
                  style={{
                    borderColor: tokens.line,
                    backgroundColor: tokens.cardBg,
                    color: tokens.text,
                    minHeight: 100,
                    textAlignVertical: "top",
                  }}
                />
                <View className="flex-row justify-end gap-2 mt-2">
                  <Pressable onPress={() => setEditingNotes(false)} className="px-3 py-1.5">
                    <Text
                      className="text-xs"
                      style={{ color: tokens.textSec }}
                    >
                      Cancel
                    </Text>
                  </Pressable>
                  <Pressable
                    disabled={saving}
                    onPress={async () => {
                      await patch({ notes: notesDraft || null });
                      setEditingNotes(false);
                    }}
                    className="rounded-lg px-3 py-1.5"
                    style={{ backgroundColor: tokens.primary }}
                  >
                    <Text
                      className="text-xs font-semibold"
                      style={{ color: "#FFFFFF" }}
                    >
                      Save
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : delta.notes ? (
              <Text
                className="rounded-xl border px-4 py-3 text-sm"
                style={{
                  borderColor: tokens.line,
                  backgroundColor: tokens.bgInset,
                  color: tokens.textSec,
                }}
              >
                {delta.notes}
              </Text>
            ) : (
              <Text
                className="text-sm italic"
                style={{ color: tokens.textTer }}
              >
                No notes yet.
              </Text>
            )}
          </View>

          {/* Add reflection CTA */}
          <Pressable
            onPress={() => router.push(`/record?goalId=${encodeURIComponent(delta.id)}`)}
            className="mt-6 rounded-2xl border px-4 py-4"
            style={{
              borderColor: `${tokens.primary}55`,
              backgroundColor: `${tokens.primary}14`,
            }}
          >
            <Text
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: tokens.primary }}
            >
              Add a reflection
            </Text>
            <Text
              className="mt-1 text-sm font-medium"
              style={{ color: tokens.text }}
            >
              Record a short update on this goal →
            </Text>
          </Pressable>

          {/* Linked entries */}
          {linked.length > 0 && (
            <View className="mt-6">
              <Text
                className="text-xs font-semibold uppercase tracking-widest mb-2"
                style={{ color: tokens.textTer }}
              >
                Linked entries
              </Text>
              <View className="gap-2">
                {linked.map((e) => (
                  <Pressable
                    key={e.id}
                    onPress={() => router.push(`/entry/${e.id}`)}
                    className="rounded-xl border px-4 py-3"
                    style={{
                      borderColor: tokens.line,
                      backgroundColor: tokens.cardBg,
                    }}
                  >
                    <Text
                      className="text-xs mb-1"
                      style={{ color: tokens.textTer }}
                    >
                      {formatRelativeDate(e.createdAt)}
                      {e.mood && <> · {e.mood.toLowerCase()}</>}
                    </Text>
                    <Text
                      className="text-sm"
                      numberOfLines={2}
                      style={{ color: tokens.textSec }}
                    >
                      {e.summary ?? "(no summary)"}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {/* Delete */}
          <View
            className="mt-8 pt-6 border-t"
            style={{ borderColor: tokens.line }}
          >
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
              <Text
                className="text-xs font-medium"
                style={{ color: tokens.bad }}
              >
                Delete goal
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
