import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { MOOD_LABELS } from "@acuity/shared";

import { GradientCheckbox, HeroCard, ThemePill } from "@/components/acuity";
import type { ThemeKey } from "@/components/acuity";
import { useTheme } from "@/contexts/theme-context";
import { makeAcuityTokens } from "@/lib/theme/tokens";
import { trackOnboardingEvent } from "@/lib/onboarding-events";
import { getStoredTryExtraction } from "@/lib/try-session";

/**
 * Screen 12 — Reveal. Slice 10 (2026-05-26).
 *
 * The wow moment. Reads the extraction persisted by slice 8/9
 * (getStoredTryExtraction → AsyncStorage acuity.try_session_extraction)
 * and staggers it onto the screen field by field — pull-quote
 * first, then mood + energy, then themes, then tasks, then goals,
 * then a sub line, then Continue. The cascade lets each card land
 * before the next appears, which IS the felt magic — the user
 * watches the system unpack what they just said.
 *
 * Checkboxes on tasks default UNCHECKED per the recent extraction-
 * review fix (monday 12095841949). Tap state is local to this
 * screen and does NOT persist — the post-signup extraction-review
 * banner on the entry-detail page (which lands after the slice 11
 * claim) is the real commit surface. The checkboxes here are
 * engagement scaffolding, not behavioral state.
 *
 * Reduced-motion path: every section renders synchronously at
 * full opacity — no cascade, no slide-up. Identical content,
 * zero stagger.
 *
 * Missing-extraction guard: if AsyncStorage was cleared between
 * record and reveal (rare — app restart mid-flow), or the upload
 * resolved with a malformed payload, we render a soft "Something
 * went wrong" with a Try again CTA back to /record. Better than
 * a blank stagger of nothing.
 *
 * Continue routes to /onboarding-new/account (signup screen,
 * shipped in slice 11). On nav we fire funnel_extraction_viewed.
 */

const SECTION_DURATION_MS = 500;
const EASE_CUBIC_OUT = Easing.bezier(0.215, 0.61, 0.355, 1);
const PURPLE = "#7C5CFC";

// Stagger delays per spec (in ms relative to mount).
const DELAY_PULL_QUOTE = 0;
const DELAY_MOOD = 300;
const DELAY_THEMES = 600;
const DELAY_TASKS = 900;
const DELAY_GOALS = 1200;
const DELAY_SUB = 1800;
const DELAY_CTA = 2100;

// Caps per spec — keep the reveal scannable; users can see the
// full extraction on the entry-detail page after signup.
const MAX_THEMES = 3;
const MAX_TASKS = 3;
const MAX_GOALS = 2;

interface NormalizedExtraction {
  pullQuote: string;
  mood: string | null;
  moodLabel: string | null;
  energy: number | null;
  themes: string[];
  tasks: Array<{ title: string; description?: string | null }>;
  goals: Array<{ title: string; description?: string | null }>;
}

const CANONICAL_THEME_KEYS: ReadonlyArray<ThemeKey> = [
  "career",
  "family",
  "health",
  "avoidance",
  "money",
  "relationships",
  "sleep",
  "growth",
  "solitude",
];

// Mobile ThemePill is strict (9 canonical keys, no "other" catch-
// all unlike web's variant). Non-canonical themes don't get a pill
// — they still land on Entry.themes via the slice 11 claim, so
// the user sees the full list on the entry-detail page post-
// signup. Filtering here keeps the reveal from rendering a
// runtime-broken pill.
function themeKeyForOrNull(name: string): ThemeKey | null {
  const k = name.toLowerCase().trim();
  return (CANONICAL_THEME_KEYS as readonly string[]).includes(k)
    ? (k as ThemeKey)
    : null;
}

/**
 * Pull a single-sentence excerpt from the summary. Falls back to
 * the first 180 chars cleanly truncated on a word boundary if no
 * sentence punctuation is found.
 */
function pullQuoteFromSummary(summary: string): string {
  const trimmed = summary.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 140) return trimmed;
  const firstSentence = trimmed.match(/^[^.!?]+[.!?]/);
  if (firstSentence && firstSentence[0].length <= 200) {
    return firstSentence[0].trim();
  }
  const head = trimmed.slice(0, 180);
  const lastSpace = head.lastIndexOf(" ");
  return `${head.slice(0, lastSpace > 0 ? lastSpace : 180).trim()}…`;
}

function normalize(
  raw: Record<string, unknown> | null
): NormalizedExtraction | null {
  if (!raw) return null;
  const summary = typeof raw.summary === "string" ? raw.summary : "";
  const pullQuote = pullQuoteFromSummary(summary);
  if (!pullQuote) return null; // missing critical field

  const mood = typeof raw.mood === "string" ? raw.mood : null;
  const moodLabel = mood ? MOOD_LABELS[mood] ?? null : null;
  const energy =
    typeof raw.energy === "number" && Number.isFinite(raw.energy)
      ? raw.energy
      : null;

  const themesRaw = Array.isArray(raw.themes) ? raw.themes : [];
  const themes = themesRaw
    .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
    .slice(0, MAX_THEMES);

  const tasksRaw = Array.isArray(raw.tasks) ? raw.tasks : [];
  const tasks = tasksRaw
    .map((t): { title: string; description?: string | null } | null => {
      if (typeof t !== "object" || t === null) return null;
      const obj = t as { title?: unknown; description?: unknown };
      if (typeof obj.title !== "string" || !obj.title.trim()) return null;
      return {
        title: obj.title.trim(),
        description:
          typeof obj.description === "string" ? obj.description : null,
      };
    })
    .filter((x): x is { title: string; description?: string | null } => x !== null)
    .slice(0, MAX_TASKS);

  const goalsRaw = Array.isArray(raw.goals) ? raw.goals : [];
  const goals = goalsRaw
    .map((g): { title: string; description?: string | null } | null => {
      if (typeof g !== "object" || g === null) return null;
      const obj = g as { title?: unknown; description?: unknown };
      if (typeof obj.title !== "string" || !obj.title.trim()) return null;
      return {
        title: obj.title.trim(),
        description:
          typeof obj.description === "string" ? obj.description : null,
      };
    })
    .filter((x): x is { title: string; description?: string | null } => x !== null)
    .slice(0, MAX_GOALS);

  return { pullQuote, mood, moodLabel, energy, themes, tasks, goals };
}

export default function RevealScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  const tokens = makeAcuityTokens({ dark: false, accent: palette });

  const [extraction, setExtraction] = useState<NormalizedExtraction | null>(
    null
  );
  const [loadState, setLoadState] = useState<"loading" | "ready" | "missing">(
    "loading"
  );
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);

  // One shared value per cascading section so each can be driven
  // independently. translateY pairs with opacity for a fade-up.
  const sections = {
    pullQuote: useSharedValue(0),
    mood: useSharedValue(0),
    themes: useSharedValue(0),
    tasks: useSharedValue(0),
    goals: useSharedValue(0),
    sub: useSharedValue(0),
    cta: useSharedValue(0),
  };

  // Load extraction + reduce-motion preference on mount.
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      getStoredTryExtraction(),
      AccessibilityInfo.isReduceMotionEnabled(),
    ]).then(([raw, rm]) => {
      if (cancelled) return;
      const normalized = normalize(raw);
      setReduceMotion(rm);
      if (!normalized) {
        setLoadState("missing");
        return;
      }
      setExtraction(normalized);
      setLoadState("ready");
      void trackOnboardingEvent("funnel_extraction_viewed", {
        hasMood: normalized.mood !== null,
        themeCount: normalized.themes.length,
        taskCount: normalized.tasks.length,
        goalCount: normalized.goals.length,
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Kick the cascade once we have both pieces of state.
  useEffect(() => {
    if (loadState !== "ready" || reduceMotion === null) return;

    if (reduceMotion) {
      sections.pullQuote.value = 1;
      sections.mood.value = 1;
      sections.themes.value = 1;
      sections.tasks.value = 1;
      sections.goals.value = 1;
      sections.sub.value = 1;
      sections.cta.value = 1;
      return;
    }

    const fadeUp = (
      value: ReturnType<typeof useSharedValue<number>>,
      delay: number
    ) => {
      value.value = withDelay(
        delay,
        withTiming(1, {
          duration: SECTION_DURATION_MS,
          easing: EASE_CUBIC_OUT,
        })
      );
    };

    fadeUp(sections.pullQuote, DELAY_PULL_QUOTE);
    fadeUp(sections.mood, DELAY_MOOD);
    fadeUp(sections.themes, DELAY_THEMES);
    fadeUp(sections.tasks, DELAY_TASKS);
    fadeUp(sections.goals, DELAY_GOALS);
    fadeUp(sections.sub, DELAY_SUB);
    fadeUp(sections.cta, DELAY_CTA);
    // sections shareValue refs are stable per Reanimated contract.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadState, reduceMotion]);

  if (loadState === "loading") {
    return (
      <View style={{ flex: 1, backgroundColor: tokens.bg }}>
        <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]} />
      </View>
    );
  }

  if (loadState === "missing") {
    return <MissingExtractionView tokens={tokens} onRetry={() => router.replace("/onboarding-new/record" as never)} />;
  }

  // ready
  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <StatusBar style="dark" />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingTop: 32,
            paddingBottom: 24,
            flexGrow: 1,
          }}
        >
          <Text
            style={{
              fontFamily: tokens.fontDisplay,
              fontSize: 28,
              lineHeight: 34,
              fontWeight: "700",
              letterSpacing: -0.3,
              color: tokens.text,
              marginBottom: 24,
            }}
          >
            That&apos;s what 60 seconds gets you.
          </Text>

          {/* Pull quote — HeroCard primary variant, gradient corner blob */}
          <CascadeBlock progress={sections.pullQuote}>
            <HeroCard variant="primary" padding={20}>
              <Text
                style={{
                  fontFamily: tokens.fontMono,
                  fontSize: 10,
                  fontWeight: "700",
                  letterSpacing: 1.4,
                  color: tokens.textTer,
                  textTransform: "uppercase",
                  marginBottom: 12,
                }}
              >
                You said
              </Text>
              <Text
                style={{
                  fontFamily: tokens.fontDisplay,
                  fontSize: 20,
                  lineHeight: 28,
                  fontWeight: "600",
                  color: tokens.text,
                }}
              >
                &ldquo;{extraction!.pullQuote}&rdquo;
              </Text>
            </HeroCard>
          </CascadeBlock>

          {/* Mood + energy */}
          {(extraction!.moodLabel || extraction!.energy !== null) && (
            <CascadeBlock progress={sections.mood}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  marginTop: 20,
                }}
              >
                {extraction!.moodLabel && (
                  <Text
                    style={{
                      fontFamily: tokens.fontSans,
                      fontSize: 15,
                      fontWeight: "600",
                      color: tokens.text,
                    }}
                  >
                    {extraction!.moodLabel}
                  </Text>
                )}
                {extraction!.moodLabel && extraction!.energy !== null && (
                  <Text style={{ color: tokens.textTer, fontSize: 15 }}>·</Text>
                )}
                {extraction!.energy !== null && (
                  <Text
                    style={{
                      fontFamily: tokens.fontSans,
                      fontSize: 15,
                      color: tokens.textSec,
                    }}
                  >
                    Energy {extraction!.energy}/10
                  </Text>
                )}
              </View>
            </CascadeBlock>
          )}

          {/* Themes */}
          {extraction!.themes.length > 0 && (
            <CascadeBlock progress={sections.themes}>
              <View style={{ marginTop: 20 }}>
                <SectionLabel tokens={tokens}>Themes</SectionLabel>
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 8,
                    marginTop: 10,
                  }}
                >
                  {extraction!.themes
                    .map((t) => ({ label: t, key: themeKeyForOrNull(t) }))
                    .filter(
                      (x): x is { label: string; key: ThemeKey } =>
                        x.key !== null
                    )
                    .map(({ label, key }) => (
                      <ThemePill
                        key={label}
                        theme={key}
                        label={label}
                        size="m"
                      />
                    ))}
                </View>
              </View>
            </CascadeBlock>
          )}

          {/* Tasks */}
          {extraction!.tasks.length > 0 && (
            <CascadeBlock progress={sections.tasks}>
              <View style={{ marginTop: 24 }}>
                <SectionLabel tokens={tokens}>Tasks</SectionLabel>
                <View style={{ marginTop: 10, gap: 8 }}>
                  {extraction!.tasks.map((task, i) => (
                    <TaskRow
                      key={i}
                      title={task.title}
                      description={task.description ?? null}
                      tokens={tokens}
                    />
                  ))}
                </View>
              </View>
            </CascadeBlock>
          )}

          {/* Goals */}
          {extraction!.goals.length > 0 && (
            <CascadeBlock progress={sections.goals}>
              <View style={{ marginTop: 24 }}>
                <SectionLabel tokens={tokens}>Goals</SectionLabel>
                <View style={{ marginTop: 10, gap: 8 }}>
                  {extraction!.goals.map((goal, i) => (
                    <View
                      key={i}
                      style={{
                        borderRadius: tokens.radius.lg,
                        backgroundColor: tokens.cardBgTint,
                        borderWidth: 0.5,
                        borderColor: tokens.cardBorder,
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: tokens.fontDisplay,
                          fontSize: 14,
                          fontWeight: "600",
                          color: tokens.text,
                        }}
                      >
                        {goal.title}
                      </Text>
                      {goal.description && (
                        <Text
                          style={{
                            fontFamily: tokens.fontSans,
                            fontSize: 12,
                            lineHeight: 17,
                            color: tokens.textSec,
                            marginTop: 4,
                          }}
                        >
                          {goal.description}
                        </Text>
                      )}
                    </View>
                  ))}
                </View>
              </View>
            </CascadeBlock>
          )}

          {/* Sub line */}
          <CascadeBlock progress={sections.sub}>
            <Text
              style={{
                fontFamily: tokens.fontSans,
                fontSize: 15,
                lineHeight: 22,
                color: tokens.textSec,
                marginTop: 32,
              }}
            >
              Imagine what a week looks like.
            </Text>
          </CascadeBlock>

          {/* CTA */}
          <CascadeBlock progress={sections.cta}>
            <View style={{ marginTop: 20 }}>
              <Pressable
                onPress={() =>
                  router.push("/onboarding-new/account" as never)
                }
                accessibilityRole="button"
                accessibilityLabel="Continue"
                style={({ pressed }) => ({
                  backgroundColor: PURPLE,
                  borderRadius: tokens.radius.pill,
                  paddingVertical: 14,
                  alignItems: "center",
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Text
                  style={{
                    fontFamily: tokens.fontSans,
                    fontSize: 16,
                    fontWeight: "600",
                    color: "#ffffff",
                  }}
                >
                  Continue
                </Text>
              </Pressable>
            </View>
          </CascadeBlock>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function CascadeBlock({
  progress,
  children,
}: {
  progress: ReturnType<typeof useSharedValue<number>>;
  children: React.ReactNode;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 14 }],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

function SectionLabel({
  tokens,
  children,
}: {
  tokens: ReturnType<typeof makeAcuityTokens>;
  children: React.ReactNode;
}) {
  return (
    <Text
      style={{
        fontFamily: tokens.fontMono,
        fontSize: 10,
        fontWeight: "700",
        letterSpacing: 1.4,
        color: tokens.textTer,
        textTransform: "uppercase",
      }}
    >
      {children}
    </Text>
  );
}

function TaskRow({
  title,
  description,
  tokens,
}: {
  title: string;
  description: string | null;
  tokens: ReturnType<typeof makeAcuityTokens>;
}) {
  // Local checkbox state — not persisted. Default UNCHECKED to
  // match the extraction-review fix. The real commit surface is
  // the post-signup extraction-review banner on /entries/[id],
  // after the slice 11 claim runs.
  const [checked, setChecked] = useState(false);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 12,
        borderRadius: tokens.radius.lg,
        backgroundColor: tokens.cardBgTint,
        borderWidth: 0.5,
        borderColor: tokens.cardBorder,
        paddingHorizontal: 14,
        paddingVertical: 12,
      }}
    >
      <View style={{ marginTop: 2 }}>
        <GradientCheckbox
          checked={checked}
          onPress={() => setChecked((v) => !v)}
          accessibilityLabel={`Keep ${title}`}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontFamily: tokens.fontSans,
            fontSize: 14,
            fontWeight: "500",
            color: tokens.text,
            lineHeight: 19,
          }}
        >
          {title}
        </Text>
        {description && (
          <Text
            style={{
              fontFamily: tokens.fontSans,
              fontSize: 12,
              lineHeight: 17,
              color: tokens.textSec,
              marginTop: 4,
            }}
          >
            {description}
          </Text>
        )}
      </View>
    </View>
  );
}

function MissingExtractionView({
  tokens,
  onRetry,
}: {
  tokens: ReturnType<typeof makeAcuityTokens>;
  onRetry: () => void;
}) {
  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <StatusBar style="dark" />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 28,
          }}
        >
          <Text
            style={{
              fontFamily: tokens.fontDisplay,
              fontSize: 22,
              lineHeight: 30,
              fontWeight: "700",
              color: tokens.text,
              textAlign: "center",
              marginBottom: 16,
            }}
          >
            Something went wrong
          </Text>
          <Text
            style={{
              fontFamily: tokens.fontSans,
              fontSize: 15,
              lineHeight: 22,
              color: tokens.textSec,
              textAlign: "center",
              marginBottom: 32,
            }}
          >
            We couldn&apos;t find your recording. Let&apos;s try again.
          </Text>
          <Pressable
            onPress={onRetry}
            style={({ pressed }) => ({
              backgroundColor: PURPLE,
              borderRadius: tokens.radius.pill,
              paddingHorizontal: 24,
              paddingVertical: 14,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text
              style={{
                fontFamily: tokens.fontSans,
                fontSize: 15,
                fontWeight: "600",
                color: "#ffffff",
              }}
            >
              Record again
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}
