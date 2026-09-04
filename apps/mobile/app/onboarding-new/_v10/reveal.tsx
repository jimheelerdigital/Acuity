import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { useTheme } from "@/contexts/theme-context";
import { makeAcuityTokens } from "@/lib/theme/tokens";
import {
  V10_BRANCHES,
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
 *   - Tasks are never auto-added. They render UNCHECKED, and the user opts
 *     in. An uncertain task silently added to someone's list is the fastest
 *     way to lose their trust in everything else here.
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
  themes: string[];
  tasks: RevealTask[];
}

const MAX_TASKS = 3;

/** Words that make a sentence a hedge rather than a claim. */
const HEDGES = ["sounds like", "seems", "may", "might", "looks like"];

function normalize(raw: Record<string, unknown> | null): RevealData {
  if (!raw) return { pullQuote: null, themes: [], tasks: [] };

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

  const summary = typeof raw.summary === "string" ? raw.summary : null;
  const pullQuote =
    typeof raw.pullQuote === "string" && raw.pullQuote.length > 0
      ? raw.pullQuote
      : summary;

  return { pullQuote, themes, tasks };
}

export default function V10Reveal() {
  const { palette } = useTheme();
  const tokens = makeAcuityTokens({ dark: false, accent: palette });

  const [branch, setBranch] = useState<V10Branch>("open");
  const [data, setData] = useState<RevealData>({
    pullQuote: null,
    themes: [],
    tasks: [],
  });
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [added, setAdded] = useState<Set<number>>(new Set());

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

  const visibleTasks = data.tasks
    .map((t, i) => ({ task: t, index: i }))
    .filter(({ index }) => !dismissed.has(index));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* First appearance of the wordmark in the entire flow. */}
        <Text
          style={{
            fontFamily: tokens.fontDisplay,
            fontSize: 15,
            letterSpacing: 0.5,
            color: tokens.textTer,
            marginBottom: 8,
          }}
        >
          ripple
        </Text>

        <Text
          accessibilityRole="header"
          style={{
            fontFamily: tokens.fontDisplay,
            fontSize: 26,
            lineHeight: 34,
            color: tokens.text,
            marginBottom: 28,
          }}
        >
          Here's what Ripple heard.
        </Text>

        {/* ── TASKS — never auto-added ─────────────────────────────── */}
        {visibleTasks.length > 0 && (
          <Section title="Tasks" tokens={tokens}>
            {visibleTasks.map(({ task, index }) => (
              <View
                key={`${task.title}-${index}`}
                style={{
                  borderWidth: 1,
                  borderColor: tokens.line,
                  borderRadius: 14,
                  padding: 14,
                  marginBottom: 10,
                }}
              >
                <Text
                  style={{
                    fontFamily: tokens.fontSans,
                    fontSize: 16,
                    lineHeight: 23,
                    color: tokens.text,
                  }}
                >
                  {task.title}
                </Text>

                <View style={{ flexDirection: "row", gap: 16, marginTop: 12 }}>
                  <Pressable
                    onPress={() => {
                      const next = new Set(added);
                      // Explicit opt-in, and reversible. Nothing reaches the
                      // user's real task list until they say so.
                      next.has(index) ? next.delete(index) : next.add(index);
                      setAdded(next);
                    }}
                    accessibilityRole="button"
                  >
                    <Text
                      style={{
                        fontFamily: tokens.fontSans,
                        fontSize: 14,
                        color: added.has(index) ? tokens.good : tokens.primary,
                      }}
                    >
                      {added.has(index) ? "✓ Added" : "Add"}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => setDismissed(new Set(dismissed).add(index))}
                    accessibilityRole="button"
                  >
                    <Text
                      style={{
                        fontFamily: tokens.fontSans,
                        fontSize: 14,
                        color: tokens.textTer,
                      }}
                    >
                      Dismiss
                    </Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </Section>
        )}

        {/* ── WHAT SEEMS TO MATTER — echoes the transcript ─────────── */}
        {(data.pullQuote || data.themes.length > 0) && (
          <Section title="What seems to matter" tokens={tokens}>
            {data.pullQuote && (
              <Text
                style={{
                  fontFamily: tokens.fontSans,
                  fontSize: 16,
                  lineHeight: 24,
                  color: tokens.textSec,
                  marginBottom: data.themes.length > 0 ? 12 : 0,
                }}
              >
                {data.pullQuote}
              </Text>
            )}
            {data.themes.length > 0 && (
              <Text
                style={{
                  fontFamily: tokens.fontSans,
                  fontSize: 15,
                  lineHeight: 22,
                  color: tokens.textTer,
                }}
              >
                {data.themes.slice(0, 3).join(" · ")}
              </Text>
            )}
          </Section>
        )}

        {/* ── SOMETHING WORTH NOTICING — hedged, or branch fallback ── */}
        <View
          style={{
            borderWidth: 1,
            borderColor: tokens.line,
            backgroundColor: tokens.cardBgTint,
            borderRadius: 16,
            padding: 16,
            marginBottom: 28,
          }}
        >
          <Text
            style={{
              fontFamily: tokens.fontSans,
              fontSize: 12,
              letterSpacing: 1,
              textTransform: "uppercase",
              color: tokens.textTer,
              marginBottom: 8,
            }}
          >
            Something worth noticing
          </Text>
          <Text
            style={{
              fontFamily: tokens.fontSans,
              fontSize: 16,
              lineHeight: 24,
              color: tokens.text,
            }}
          >
            {observation}
          </Text>
        </View>

        {/* ── First debrief complete — pulse + haptic, no confetti ─── */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            marginBottom: 32,
          }}
        >
          <Animated.View
            style={[
              {
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: tokens.primary,
              },
              pulseStyle,
            ]}
          />
          <Text
            style={{
              fontFamily: tokens.fontSans,
              fontSize: 15,
              color: tokens.textSec,
            }}
          >
            First debrief complete
          </Text>
        </View>

        {/* ── WHAT RIPPLE CAN SEE FROM MORE ───────────────────────── */}
        <Text
          style={{
            fontFamily: tokens.fontSans,
            fontSize: 12,
            letterSpacing: 1,
            textTransform: "uppercase",
            color: tokens.textTer,
            marginBottom: 12,
          }}
        >
          {V10_COMPOUNDING_HEADING}
        </Text>

        <View style={{ gap: 10, marginBottom: 16 }}>
          {V10_COMPOUNDING_CARDS.map((card) => (
            <View
              key={card.key}
              style={{
                borderWidth: 1,
                borderColor: tokens.line,
                borderRadius: 14,
                paddingVertical: 14,
                paddingHorizontal: 16,
                backgroundColor: tokens.bgInset,
              }}
            >
              <Text
                style={{
                  fontFamily: tokens.fontDisplay,
                  fontSize: 16,
                  color: tokens.text,
                  marginBottom: 4,
                }}
              >
                {card.title}
              </Text>
              {/* Subline comes straight from the verified-threshold config.
                  Life Matrix says "already here" because it exists at zero
                  entries; claiming a gate would be a fabricated lock. */}
              <Text
                style={{
                  fontFamily: tokens.fontSans,
                  fontSize: 14,
                  lineHeight: 20,
                  color: tokens.textSec,
                }}
              >
                {card.subline}
              </Text>
            </View>
          ))}
        </View>

        <Text
          style={{
            fontFamily: tokens.fontSans,
            fontSize: 14,
            lineHeight: 21,
            color: tokens.textTer,
            marginBottom: 32,
          }}
        >
          {V10_COMPOUNDING_FOOTER}
        </Text>

        <Pressable
          onPress={() => {
            trackV10("v10_keep_building_tapped", { branch });
            router.push("/onboarding-new/paywall");
          }}
          accessibilityRole="button"
          style={({ pressed }) => ({
            backgroundColor: tokens.primary,
            borderRadius: 999,
            paddingVertical: 18,
            alignItems: "center",
            transform: [{ scale: pressed ? 0.99 : 1 }],
          })}
        >
          <Text
            style={{ fontFamily: tokens.fontDisplay, fontSize: 17, color: "#ffffff" }}
          >
            Keep building my Ripple
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({
  title,
  tokens,
  children,
}: {
  title: string;
  tokens: ReturnType<typeof makeAcuityTokens>;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginBottom: 28 }}>
      <Text
        style={{
          fontFamily: tokens.fontSans,
          fontSize: 12,
          letterSpacing: 1,
          textTransform: "uppercase",
          color: tokens.textTer,
          marginBottom: 10,
        }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

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
