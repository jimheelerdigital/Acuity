import { useEffect, useMemo, useState } from "react";
import { Alert, Text, View } from "react-native";
import { CircleCheck } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { useAuth } from "@/contexts/auth-context";

import { Body, Card, FunnelHeader, Heading, IconTile, LightScreen, PROGRESS, PrimaryButton, RippleAppIcon, V11 } from "../_v11/ui";
import {
  resolveObservationFallback,
  type V10Branch,
} from "@/lib/onboarding-v10/branches";
import {
  V10_COMPOUNDING_CARDS,
  V10_COMPOUNDING_FOOTER,
  V10_COMPOUNDING_HEADING,
} from "@/lib/onboarding-v10/compounding";
import { trackV10 } from "@/lib/onboarding-v10/analytics";
import { getV10Branch } from "@/lib/onboarding-v10/state";
import { getStoredTryExtraction } from "@/lib/try-session";
import { GradientCheckbox } from "@/components/acuity";
import { SwipeRow } from "@/components/swipe-row";
import { api } from "@/lib/api";
import { cachedGet, setCached } from "@/lib/cache";

/**
 * Screen 5 — Reveal + what compounds (light; the Ripple wordmark appears
 * here for the first time — spec §1 bans any brand mark before this point).
 *
 * ── Nothing on this screen may be invented ───────────────────────────
 * Spec §1: "No invented metrics, fake progress, synthetic testimonials, or
 * insight not supported by the transcript." Every section below renders ONLY
 * what the extraction actually produced, and omits itself when it has
 * nothing — an empty section is honest, a filled-in one is not.
 *
 * Three specific rules:
 *   - Tasks: the claim (right after processing) puts every extracted task on
 *     the user's real list. 1.9.1 shows them as exactly that — their real
 *     to-dos, checkable, swipe to edit/delete — instead of the old
 *     "Add / Dismiss" buttons, which never wrote anything and so misstated
 *     what had happened. Falls back to the extraction (read-only) if the
 *     claim hasn't landed.
 *   - The observation is HEDGED ("sounds like / seems / may"), and when the
 *     extraction gives us nothing worth hedging about, it falls back to the
 *     branch line — which claims nothing about the transcript at all.
 *   - The compounding strip reads its thresholds from lib/onboarding-v10/
 *     compounding.ts, where Life Matrix is structurally incapable of
 *     claiming a gate it doesn't have.
 */

interface RevealTask {
  title: string;
  description?: string | null;
}

interface RevealData {
  pullQuote: string | null;
  /** The extraction's own summary (shown once, under "What it was about"). */
  summary: string | null;
  themes: string[];
  tasks: RevealTask[];
}

const MAX_TASKS = 5;

/** A real task row from /api/tasks (claimed from this debrief). */
interface ListTask {
  id: string;
  title: string | null;
  text: string | null;
  status: string;
  entryId?: string | null;
}

const TASKS_CACHE_KEY = "/api/tasks?all=1";

/** Words that make a sentence a hedge rather than a claim. */
const HEDGES = ["sounds like", "seems", "may", "might", "looks like"];

function normalize(raw: Record<string, unknown> | null): RevealData {
  if (!raw) return { pullQuote: null, summary: null, themes: [], tasks: [] };

  const themes = Array.isArray(raw.themes)
    ? raw.themes.filter((t): t is string => typeof t === "string" && t.length > 0)
    : [];

  const tasks = Array.isArray(raw.tasks)
    ? raw.tasks
        .filter(
          (t): t is RevealTask =>
            typeof t === "object" &&
            t !== null &&
            typeof (t as RevealTask).title === "string" &&
            (t as RevealTask).title.trim().length > 0
        )
        .slice(0, MAX_TASKS)
    : [];

  const summary =
    typeof raw.summary === "string" && raw.summary.trim().length > 0
      ? raw.summary.trim()
      : null;
  // Only a REAL pull quote — never the summary again. The old fallback made
  // "What seems to matter" and "Ripple noticed" print the same paragraph.
  const pullQuote =
    typeof raw.pullQuote === "string" &&
    raw.pullQuote.trim().length > 0 &&
    raw.pullQuote.trim() !== summary
      ? raw.pullQuote.trim()
      : null;

  return { pullQuote, summary, themes, tasks };
}

export default function V10Reveal() {
  const { user } = useAuth();
  const firstName = user?.name?.trim().split(/\s+/)[0] || null;

  const [branch, setBranch] = useState<V10Branch>("open");
  const [data, setData] = useState<RevealData>({
    pullQuote: null,
    summary: null,
    themes: [],
    tasks: [],
  });
  const params = useLocalSearchParams<{ entryId?: string }>();
  const entryId = typeof params.entryId === "string" ? params.entryId : null;
  // Real tasks the claim created for this debrief (null = not loaded / none).
  const [listTasks, setListTasks] = useState<ListTask[] | null>(null);

  useEffect(() => {
    if (!entryId) return;
    let cancelled = false;
    void cachedGet<{ tasks: ListTask[] }>(TASKS_CACHE_KEY, { force: true })
      .then((res) => {
        if (cancelled) return;
        const mine = (res.tasks ?? []).filter((t) => t.entryId === entryId);
        if (mine.length > 0) setListTasks(mine);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [entryId]);

  const updateList = (fn: (prev: ListTask[]) => ListTask[]) => {
    setListTasks((prev) => {
      const next = fn(prev ?? []);
      return next;
    });
    // Keep the shared cache honest for Tasks / Home TODAY.
    void cachedGet<{ tasks: ListTask[] }>(TASKS_CACHE_KEY)
      .then((res) => setCached(TASKS_CACHE_KEY, { tasks: fn(res.tasks ?? []) }))
      .catch(() => {});
  };

  const toggleDone = (t: ListTask) => {
    const done = t.status === "DONE";
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    updateList((prev) =>
      prev.map((x) => (x.id === t.id ? { ...x, status: done ? "OPEN" : "DONE" } : x))
    );
    api.patch("/api/tasks", { id: t.id, action: done ? "reopen" : "complete" }).catch(() => {
      updateList((prev) =>
        prev.map((x) => (x.id === t.id ? { ...x, status: t.status } : x))
      );
    });
  };

  const confirmDelete = (t: ListTask) => {
    const label = t.title ?? t.text ?? "this to-do";
    Alert.alert("Delete to-do?", `"${label}" will be removed from your Tasks.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          updateList((prev) => prev.filter((x) => x.id !== t.id));
          api.patch("/api/tasks", { id: t.id, action: "dismiss" }).catch(() => {
            updateList((prev) => [...prev, t]);
            Alert.alert("Couldn't delete", "Please try again.");
          });
        },
      },
    ]);
  };

  const pulse = useSharedValue(1);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [b, raw] = await Promise.all([
        getV10Branch(),
        getStoredTryExtraction(),
      ]);
      if (cancelled) return;

      const nextBranch = b ?? "open";
      const next = normalize(raw);
      setBranch(nextBranch);
      setData(next);

      // Restrained celebration: coral pulse + haptic. No confetti — spec §0
      // is explicit that a vulnerable moment isn't a party.
      void Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success
      ).catch(() => {});
      pulse.value = withSequence(
        withTiming(1.12, { duration: 220 }),
        withTiming(1, { duration: 260 })
      );

      trackV10("v10_reveal_viewed", {
        task_count: next.tasks.length,
        observation_type: observationTypeFor(next),
        branch: nextBranch,
      });
      trackV10("v10_compounding_viewed", { branch: nextBranch });
    })();
    return () => {
      cancelled = true;
    };
  }, [pulse]);

  const observation = useMemo(
    () => buildObservation(data, branch),
    [data, branch]
  );

  // Rows to show: the real claimed tasks when we have them, otherwise the
  // extraction's titles (read-only).
  const rows: { key: string; label: string; real: ListTask | null }[] =
    listTasks && listTasks.length > 0
      ? listTasks.slice(0, MAX_TASKS).map((t) => ({
          key: t.id,
          label: t.title ?? t.text ?? "Untitled",
          real: t,
        }))
      : data.tasks.map((t, i) => ({ key: `x-${i}`, label: t.title, real: null }));
  const totalTodos = listTasks && listTasks.length > 0 ? listTasks.length : data.tasks.length;
  const onList = !!(listTasks && listTasks.length > 0);

  return (
    <LightScreen>
      <FunnelHeader progress={PROGRESS.reveal} />
      <Body
        footer={
          <PrimaryButton
            label={user ? "Keep building my Ripple" : "Save my results"}
            onPress={() => {
              trackV10("v10_keep_building_tapped", { branch, signed_in: !!user });
              // Account comes here (2026-10-15): save the results, then the
              // paywall. A signed-in user (resumed funnel) goes straight on.
              router.push(user ? "/onboarding-new/paywall" : "/onboarding-new/account");
            }}
          />
        }
      >
        <Animated.View style={[{ alignSelf: "center", marginBottom: 14 }, pulseStyle]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#ffffff", borderRadius: 999, borderWidth: 1, borderColor: V11.lineStrong, paddingHorizontal: 12, paddingVertical: 6 }}>
            <CircleCheck size={15} color={V11.good} />
            <Text style={{ fontSize: 13, fontWeight: "700", color: V11.ink }}>First debrief complete</Text>
          </View>
        </Animated.View>
        <Heading eyebrow="Your results" title={firstName ? `Here's what Ripple heard, ${firstName}.` : "Here's what Ripple heard."} />

        {/* ── YOUR TO-DOS — real tasks on their list (1.9.1) ────────── */}
        {rows.length > 0 && (
          <Animated.View entering={FadeInDown.delay(80).duration(420)}>
            <Card style={{ marginBottom: 14, overflow: "hidden" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 }}>
                <IconTile name="list" on size={42} radius={12} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: V11.display, fontSize: 17, color: V11.ink }}>
                    {totalTodos} {totalTodos === 1 ? "to-do" : "to-dos"} from what you said
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                    {onList ? <CircleCheck size={13} color={V11.good} /> : null}
                    <Text style={{ fontSize: 13, fontWeight: "600", color: onList ? V11.good : V11.sec }}>
                      {onList ? "Already on your Tasks list" : user ? "Going on your Tasks list" : "Saved to your Tasks when you create your account"}
                    </Text>
                  </View>
                </View>
              </View>

              {rows.map((row) => {
                const t = row.real;
                const done = t?.status === "DONE";
                const line = (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      paddingHorizontal: 16,
                      paddingVertical: 14,
                      backgroundColor: "#ffffff",
                      borderTopWidth: 1,
                      borderTopColor: V11.line,
                    }}
                  >
                    {t ? (
                      <GradientCheckbox checked={done} onPress={() => toggleDone(t)} />
                    ) : (
                      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: V11.quiet }} />
                    )}
                    <Text
                      style={{
                        flex: 1,
                        fontSize: 16,
                        lineHeight: 22,
                        fontWeight: "500",
                        color: done ? V11.ter : V11.ink,
                        textDecorationLine: done ? "line-through" : "none",
                      }}
                    >
                      {row.label}
                    </Text>
                  </View>
                );
                return t ? (
                  <SwipeRow
                    key={row.key}
                    variant="flush"
                    itemName={row.label}
                    onEdit={() => router.push(`/task/${t.id}`)}
                    onDelete={() => confirmDelete(t)}
                  >
                    {line}
                  </SwipeRow>
                ) : (
                  <View key={row.key}>{line}</View>
                );
              })}

              {onList ? (
                <Text style={{ fontSize: 12, color: V11.ter, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: V11.line }}>
                  {totalTodos > rows.length ? `+${totalTodos - rows.length} more in Tasks · ` : ""}
                  Tap to check off · swipe left to edit or delete
                </Text>
              ) : null}
            </Card>
          </Animated.View>
        )}

        {/* ── WHAT IT WAS ABOUT — the summary once + theme chips ─────── */}
        {(data.summary || data.themes.length > 0) && (
          <Animated.View entering={FadeInDown.delay(160).duration(420)}>
            <Card style={{ padding: 18, marginBottom: 14 }}>
              <Text style={{ fontSize: 12, fontWeight: "800", letterSpacing: 0.8, color: V11.coral, marginBottom: 8 }}>WHAT IT WAS ABOUT</Text>
              {data.summary ? (
                <Text style={{ fontSize: 16, lineHeight: 24, color: V11.ink, marginBottom: data.themes.length > 0 ? 14 : 0 }}>
                  {data.summary}
                </Text>
              ) : null}
              {data.themes.length > 0 ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {data.themes.slice(0, 4).map((theme) => (
                    <View key={theme} style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: V11.coralSoft }}>
                      <Text style={{ fontSize: 13, fontWeight: "600", color: V11.coralDeep }}>{theme}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </Card>
          </Animated.View>
        )}

        {/* ── RIPPLE NOTICED — only a real, distinct observation, or the
            branch fallback when there's nothing else to show. ──────────── */}
        {(data.pullQuote || !data.summary) && (
          <Animated.View entering={FadeInDown.delay(240).duration(420)}>
            <Card selected style={{ padding: 18, marginBottom: 14, flexDirection: "row", gap: 12 }}>
              <RippleAppIcon size={34} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: "800", letterSpacing: 0.8, color: V11.coral, marginBottom: 6 }}>RIPPLE NOTICED</Text>
                <Text style={{ fontSize: 16, lineHeight: 24, color: V11.ink }}>{observation}</Text>
              </View>
            </Card>
          </Animated.View>
        )}

        {/* ── WHAT RIPPLE CAN SEE FROM MORE ───────────────────────── */}
        <Text style={{ marginTop: 10, marginBottom: 10, fontFamily: V11.heading, fontSize: 20, letterSpacing: -0.4, color: V11.ink }}>
          {V10_COMPOUNDING_HEADING}
        </Text>
        <Card style={{ padding: 16, gap: 14, marginBottom: 12 }}>
          {V10_COMPOUNDING_CARDS.map((card, i) => (
            <View key={card.key} style={{ flexDirection: "row", gap: 12 }}>
              <IconTile name={COMPOUND_ICONS[i % COMPOUND_ICONS.length]} on={false} size={38} radius={12} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: V11.display, fontSize: 16, color: V11.ink }}>{card.title}</Text>
                {/* Subline comes straight from the verified-threshold config. */}
                <Text style={{ marginTop: 2, fontSize: 14, lineHeight: 20, color: V11.sec }}>{card.subline}</Text>
              </View>
            </View>
          ))}
        </Card>
        <Text style={{ fontSize: 14, lineHeight: 21, color: V11.sec, textAlign: "center" }}>{V10_COMPOUNDING_FOOTER}</Text>
      </Body>
    </LightScreen>
  );
}

const COMPOUND_ICONS = ["eye", "target", "waves", "sprout"] as const;

/**
 * Which kind of observation we ended up showing — reported so we can measure
 * how often the generator has nothing groundable to say.
 */
export function observationTypeFor(data: RevealData): "grounded" | "fallback" {
  return data.pullQuote && data.pullQuote.trim().length > 0
    ? "grounded"
    : "fallback";
}

/**
 * Build the observation sentence.
 *
 * Grounded case: hedge an echo of the transcript. The hedge is not decorative
 * — it is the difference between "you are avoiding this" (a claim about a
 * person from one recording) and "it sounds like this is sitting with you"
 * (an observation about what was said). We only ever have the latter.
 *
 * Fallback case: the branch line, which makes NO claim about the transcript.
 * That is the honest thing to show when there is nothing to ground an
 * observation in, and it is why the fallbacks were written to be true of
 * anyone who has just finished a debrief.
 */
export function buildObservation(data: RevealData, branch: V10Branch): string {
  const quote = data.pullQuote?.trim();
  if (!quote) {
    return resolveObservationFallback(branch, data.tasks.length);
  }

  // Already hedged by the extraction — don't double-hedge into mush.
  const lower = quote.toLowerCase();
  if (HEDGES.some((h) => lower.includes(h))) return quote;

  const first = quote.charAt(0).toLowerCase() + quote.slice(1);
  return `It sounds like ${first}`;
}

/** Re-exported for tests. */
export type { RevealData };
