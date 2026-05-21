import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { PRIORITY_LABELS } from "@acuity/shared";

import {
  GlassPill,
  GradientCheckbox,
  GradientText,
  HeroCard,
} from "@/components/acuity";
import { useTheme } from "@/contexts/theme-context";
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
 *
 * Q10 (2026-05-21) — visual refresh to v2 visual language:
 * HeroCard wrapper, GlassPill stat row, GradientText section headers,
 * GradientCheckbox per row, palette-tinted TASK/GOAL type pills,
 * gradient CTA + mono secondary footer. Empty state renders a
 * friendly v2 card with a Skip affordance instead of returning null.
 * Logic untouched — the fetch, commit, and skip handlers below are
 * byte-identical to pre-Q10.
 */
export function ExtractionReview({
  entryId,
  onCommitted,
}: {
  entryId: string;
  onCommitted?: () => void;
}) {
  const { tokens } = useTheme();
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
  const isEmpty = tasks.length === 0 && goals.length === 0;

  // ─── Empty state ─────────────────────────────────────────────────
  // Q10 replaces the prior `return null` with a friendly card so the
  // user gets confirmation that processing finished + a way to clear
  // the surface. Skip persists the same `action: "skip"` payload as
  // the populated-case Skip button below.
  if (isEmpty) {
    return (
      <HeroCard variant="primary" style={{ marginBottom: 24 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons name="sparkles-outline" size={14} color={tokens.primary} />
          <Text
            style={{
              fontFamily: tokens.fontMono,
              fontSize: 10,
              fontWeight: "700",
              letterSpacing: 1.4,
              textTransform: "uppercase",
              color: tokens.primary,
            }}
          >
            Acuity reviewed your entry
          </Text>
        </View>
        <Text
          style={{
            marginTop: 10,
            fontFamily: tokens.fontSans,
            fontSize: 14,
            lineHeight: 20,
            color: tokens.textSec,
          }}
        >
          No action items in this one — pure reflection. Nothing to
          commit.
        </Text>
        <View style={{ marginTop: 14, flexDirection: "row" }}>
          <Pressable
            disabled={submitting}
            onPress={skip}
            hitSlop={6}
            style={{ paddingHorizontal: 4, paddingVertical: 6 }}
          >
            <Text
              style={{
                fontFamily: tokens.fontMono,
                fontSize: 11,
                fontWeight: "600",
                letterSpacing: 1.2,
                textTransform: "uppercase",
                color: tokens.textSec,
              }}
            >
              Dismiss
            </Text>
          </Pressable>
        </View>
      </HeroCard>
    );
  }

  // ─── Populated review ────────────────────────────────────────────
  return (
    <HeroCard variant="primary" style={{ marginBottom: 24 }}>
      {/* Eyebrow */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Ionicons name="sparkles-outline" size={14} color={tokens.primary} />
        <Text
          style={{
            fontFamily: tokens.fontMono,
            fontSize: 10,
            fontWeight: "700",
            letterSpacing: 1.4,
            textTransform: "uppercase",
            color: tokens.primary,
          }}
        >
          Review what Acuity extracted
        </Text>
      </View>

      {/* Stat pill — item count */}
      <View style={{ marginTop: 10, flexDirection: "row" }}>
        <GlassPill padding={[6, 12]}>
          <Text
            style={{
              fontFamily: tokens.fontMono,
              fontSize: 11,
              fontWeight: "600",
              letterSpacing: 1.1,
              color: tokens.textSec,
            }}
          >
            {tasks.length} {tasks.length === 1 ? "task" : "tasks"} ·{" "}
            {goals.length} {goals.length === 1 ? "goal" : "goals"}
          </Text>
        </GlassPill>
      </View>

      <Text
        style={{
          marginTop: 12,
          fontFamily: tokens.fontSans,
          fontSize: 13,
          lineHeight: 19,
          color: tokens.textSec,
        }}
      >
        Tick what to keep, then commit. Items you don&apos;t select are
        discarded.
      </Text>

      {tasks.length > 0 && (
        <View style={{ marginTop: 18 }}>
          <GradientText
            colors={[tokens.primaryHi, tokens.primary]}
            style={{
              fontFamily: tokens.fontMono,
              fontSize: 11,
              fontWeight: "700",
              letterSpacing: 1.3,
              textTransform: "uppercase",
            }}
          >
            Tasks Acuity extracted ({tasks.length})
          </GradientText>
          <View style={{ marginTop: 10, gap: 8 }}>
            {tasks.map((t) => (
              <ReviewRow
                key={t.tempId}
                kind="task"
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
        <View style={{ marginTop: 18 }}>
          <GradientText
            colors={[tokens.secondaryHi, tokens.secondary]}
            style={{
              fontFamily: tokens.fontMono,
              fontSize: 11,
              fontWeight: "700",
              letterSpacing: 1.3,
              textTransform: "uppercase",
            }}
          >
            Goals Acuity suggested ({goals.length})
          </GradientText>
          <View style={{ marginTop: 10, gap: 8 }}>
            {goals.map((g) => (
              <ReviewRow
                key={g.tempId}
                kind="goal"
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

      {/* Footer — gradient Commit CTA + mono Skip text. */}
      <View
        style={{
          marginTop: 20,
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <Pressable
          disabled={submitting}
          onPress={commit}
          accessibilityRole="button"
          style={{
            borderRadius: 999,
            overflow: "hidden",
            opacity: submitting ? 0.4 : 1,
            shadowColor: tokens.glowPrimary.color,
            shadowOffset: { width: 0, height: 4 },
            shadowRadius: tokens.glowPrimary.radius,
            shadowOpacity:
              Platform.OS === "ios" && !submitting
                ? tokens.glowPrimary.opacity
                : 0,
            elevation: 4,
          }}
        >
          <LinearGradient
            colors={tokens.gradPrimary.colors}
            locations={tokens.gradPrimary.locations}
            start={tokens.gradPrimary.start}
            end={tokens.gradPrimary.end}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingHorizontal: 22,
              paddingVertical: 11,
            }}
          >
            {submitting && <ActivityIndicator size="small" color="#FFFFFF" />}
            <Text
              style={{
                fontFamily: tokens.fontMono,
                fontSize: 12,
                fontWeight: "700",
                letterSpacing: 1.4,
                textTransform: "uppercase",
                color: "#ffffff",
              }}
            >
              {selectedTasks + selectedGoals > 0
                ? `Commit (${selectedTasks + selectedGoals})`
                : "Commit"}
            </Text>
          </LinearGradient>
        </Pressable>

        <Pressable
          disabled={submitting}
          onPress={skip}
          hitSlop={6}
          style={{ paddingHorizontal: 4, paddingVertical: 6 }}
        >
          <Text
            style={{
              fontFamily: tokens.fontMono,
              fontSize: 11,
              fontWeight: "600",
              letterSpacing: 1.2,
              textTransform: "uppercase",
              color: tokens.textSec,
            }}
          >
            Skip all
          </Text>
        </Pressable>
      </View>
    </HeroCard>
  );
}

function ReviewRow({
  kind,
  selected,
  onToggle,
  title,
  onTitleChange,
  chips,
  subline,
  dimmed,
}: {
  kind: "task" | "goal";
  selected: boolean;
  onToggle: () => void;
  title: string;
  onTitleChange: (v: string) => void;
  chips: string[];
  subline?: string;
  dimmed?: boolean;
}) {
  const { tokens } = useTheme();
  // Type-tag color: tasks tint primary, goals tint secondary.
  const tagColor = kind === "task" ? tokens.primary : tokens.secondary;
  const tagLabel = kind === "task" ? "Task" : "Goal";
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 12,
        borderRadius: tokens.radius.md,
        borderWidth: 0.5,
        borderColor: tokens.line,
        backgroundColor: tokens.cardBg,
        paddingHorizontal: 12,
        paddingVertical: 10,
        opacity: dimmed ? 0.6 : 1,
      }}
    >
      <View style={{ marginTop: 2 }}>
        <GradientCheckbox
          checked={selected}
          onPress={onToggle}
          size={20}
          accessibilityLabel={`${selected ? "Deselect" : "Select"} ${title}`}
        />
      </View>
      <View style={{ flex: 1 }}>
        <TextInput
          value={title}
          onChangeText={onTitleChange}
          style={{
            fontFamily: tokens.fontSans,
            fontSize: 14,
            color: tokens.text,
            padding: 0,
          }}
        />
        {subline && (
          <Text
            numberOfLines={2}
            style={{
              marginTop: 2,
              fontFamily: tokens.fontSans,
              fontSize: 12,
              color: tokens.textTer,
            }}
          >
            {subline}
          </Text>
        )}
        {chips.length > 0 && (
          <View
            style={{
              marginTop: 6,
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 6,
            }}
          >
            {chips.map((c) => (
              <View
                key={c}
                style={{
                  borderRadius: 999,
                  backgroundColor: tokens.bgInset,
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                }}
              >
                <Text
                  style={{
                    fontFamily: tokens.fontMono,
                    fontSize: 10,
                    fontWeight: "600",
                    letterSpacing: 0.4,
                    color: tokens.textSec,
                  }}
                >
                  {c}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
      {/* Type-tag pill — palette-tinted, palette-tinted text. */}
      <View
        style={{
          borderRadius: 999,
          borderWidth: 0.5,
          borderColor: `${tagColor}55`,
          backgroundColor: `${tagColor}1f`,
          paddingHorizontal: 8,
          paddingVertical: 3,
          alignSelf: "flex-start",
          marginTop: 2,
        }}
      >
        <Text
          style={{
            fontFamily: tokens.fontMono,
            fontSize: 9,
            fontWeight: "700",
            letterSpacing: 1.2,
            textTransform: "uppercase",
            color: tagColor,
          }}
        >
          {tagLabel}
        </Text>
      </View>
    </View>
  );
}
