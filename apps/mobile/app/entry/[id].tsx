import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { MOOD_LABELS, type EntryDTO, type TaskDTO } from "@acuity/shared";

import {
  GlassPill,
  GradientText,
  HeroCard,
  ThemePill,
  type ThemeKey,
} from "@/components/acuity";
import { CalendarEventsSection } from "@/components/entry/calendar-events-section";
import { ExtractionReview } from "@/components/extraction-review";
import { MoodIcon } from "@/components/mood-icon";
import { ProLockedFooter } from "@/components/pro-locked-card";
import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";
import { getCached, invalidate, isStale, setCached } from "@/lib/cache";

type EntryDetail = EntryDTO & { tasks: TaskDTO[] };
type EntryDetailResponse = { entry: EntryDetail };

const CANONICAL_THEMES = new Set<string>([
  "career",
  "family",
  "health",
  "avoidance",
  "money",
  "relationships",
  "sleep",
  "growth",
  "solitude",
]);

function entryDetailKey(id: string): string {
  return `/api/entries/${id}`;
}

/**
 * Best-effort pull-quote derivation. EntryDTO has no dedicated
 * "headline" field, so we fall through a hierarchy of existing
 * AI-extracted candidates, ending at the first 1-2 transcript
 * sentences. Re-evaluate when/if the extraction pipeline starts
 * persisting an explicit pullQuote field.
 */
function selectPullQuote(entry: EntryDetail): string {
  if (entry.insights && entry.insights.length > 0) return entry.insights[0];
  if (entry.wins && entry.wins.length > 0) return entry.wins[0];
  if (entry.summary) {
    const firstSentence = entry.summary.match(/[^.!?]+[.!?]+/);
    if (firstSentence) return firstSentence[0].trim();
    return entry.summary;
  }
  if (entry.transcript) {
    const sentences = entry.transcript.match(/[^.!?]+[.!?]+/g);
    if (sentences && sentences.length > 0) {
      return sentences.slice(0, 2).join(" ").trim();
    }
    return entry.transcript.slice(0, 200);
  }
  return "";
}

function formatDuration(seconds: number | null): string | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

function wordCount(text: string | null | undefined): number {
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

function asCanonicalTheme(label: string): ThemeKey | null {
  const lower = label.toLowerCase();
  return CANONICAL_THEMES.has(lower) ? (lower as ThemeKey) : null;
}

export default function EntryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { tokens } = useTheme();
  const cacheKey = id ? entryDetailKey(id) : null;
  const initialCached = cacheKey
    ? getCached<EntryDetailResponse>(cacheKey)
    : undefined;

  const [entry, setEntry] = useState<EntryDetail | null>(
    () => initialCached?.entry ?? null
  );
  const [loading, setLoading] = useState(() => !initialCached);

  const requestDelete = useCallback(() => {
    if (!id) return;
    Alert.alert(
      "Delete this entry?",
      "This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await api.del(`/api/entries/${id}`);
              invalidate(entryDetailKey(id));
              invalidate("/api/entries");
              router.back();
            } catch (err) {
              const message =
                err instanceof Error ? err.message : "Delete failed.";
              Alert.alert("Couldn't delete entry", message);
            }
          },
        },
      ],
      { cancelable: true }
    );
  }, [id, router]);

  const openMenu = useCallback(() => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Cancel", "Delete entry"],
          destructiveButtonIndex: 1,
          cancelButtonIndex: 0,
        },
        (idx) => {
          if (idx === 1) requestDelete();
        }
      );
    } else {
      Alert.alert(
        "Entry options",
        undefined,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete entry",
            style: "destructive",
            onPress: requestDelete,
          },
        ],
        { cancelable: true }
      );
    }
  }, [requestDelete]);

  const reload = useCallback(() => {
    if (!cacheKey) return;
    api
      .get<EntryDetailResponse>(cacheKey)
      .then((d) => {
        setCached(cacheKey, d);
        setEntry(d.entry ?? null);
      })
      .catch(() => {
        setEntry((prev) => prev ?? null);
      })
      .finally(() => setLoading(false));
  }, [cacheKey]);

  useEffect(() => {
    if (!cacheKey) return;
    if (!initialCached || isStale(cacheKey)) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  // Hooks above the early returns so order stays stable.
  const date = useMemo(
    () =>
      entry?.createdAt
        ? new Date(entry.createdAt).toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })
        : "",
    [entry?.createdAt]
  );

  const pullQuote = useMemo(
    () => (entry ? selectPullQuote(entry) : ""),
    [entry]
  );

  const stats = useMemo(() => {
    if (!entry) return { words: 0, duration: null as string | null };
    return {
      words: wordCount(entry.transcript),
      duration: formatDuration(entry.audioDuration),
    };
  }, [entry]);

  const headerRight = useCallback(
    () => (
      <Pressable
        onPress={openMenu}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Entry options"
      >
        <Ionicons
          name="ellipsis-horizontal"
          size={22}
          color={tokens.primary}
        />
      </Pressable>
    ),
    [openMenu, tokens.primary]
  );

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ headerRight }} />
        <View
          style={{
            flex: 1,
            backgroundColor: tokens.bg,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ActivityIndicator color={tokens.primary} />
        </View>
      </>
    );
  }

  if (!entry) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: tokens.bg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: tokens.textTer, fontFamily: tokens.fontSans }}>
          Entry not found.
        </Text>
      </View>
    );
  }

  const primaryTheme = entry.themes[0];
  const primaryThemeKey = primaryTheme
    ? asCanonicalTheme(primaryTheme)
    : null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: tokens.bg }}
      contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 20 }}
    >
      <Stack.Screen options={{ headerRight }} />

      {/* Pull-quote hero — display font with a vertical gradient
          accent bar on the left, mono eyebrow row below with date,
          mood, energy. */}
      {pullQuote && (
        <View style={{ flexDirection: "row", gap: 14 }}>
          <View
            style={{
              width: 4,
              borderRadius: 2,
              overflow: "hidden",
              alignSelf: "stretch",
            }}
          >
            <LinearGradient
              colors={tokens.gradMix.colors}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={{ flex: 1 }}
            />
          </View>
          <View style={{ flex: 1, gap: 12 }}>
            <Text
              style={{
                fontFamily: tokens.fontDisplay,
                fontSize: 24,
                fontWeight: "500",
                letterSpacing: -0.5,
                lineHeight: 31,
                color: tokens.text,
              }}
            >
              {`“${pullQuote}”`}
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 10,
              }}
            >
              <Text
                style={{
                  fontFamily: tokens.fontMono,
                  fontSize: 11,
                  fontWeight: "600",
                  letterSpacing: 0.4,
                  color: tokens.textTer,
                  textTransform: "uppercase",
                }}
              >
                {date}
              </Text>
              {entry.mood && (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <MoodIcon mood={entry.mood} size={13} color={tokens.textSec} />
                  <Text
                    style={{
                      fontFamily: tokens.fontSans,
                      fontSize: 12,
                      color: tokens.textSec,
                    }}
                  >
                    {MOOD_LABELS[entry.mood]}
                  </Text>
                </View>
              )}
              {entry.energy !== null && (
                <Text
                  style={{
                    fontFamily: tokens.fontMono,
                    fontSize: 11,
                    fontWeight: "600",
                    letterSpacing: 0.4,
                    color: tokens.textTer,
                  }}
                >
                  ENERGY {entry.energy}/10
                </Text>
              )}
            </View>
          </View>
        </View>
      )}

      <ExtractionReview entryId={entry.id} onCommitted={reload} />

      {/* Gradient quick-stats row — small pills with word count,
          duration, and primary theme (ThemePill if canonical). */}
      {(stats.words > 0 || stats.duration || primaryTheme) && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {stats.words > 0 && (
            <GlassPill padding={[6, 12]} radius={tokens.radius.pill}>
              <Text
                style={{
                  fontFamily: tokens.fontMono,
                  fontSize: 11,
                  fontWeight: "700",
                  letterSpacing: 0.4,
                  color: tokens.textSec,
                  textTransform: "uppercase",
                }}
              >
                {stats.words} {stats.words === 1 ? "WORD" : "WORDS"}
              </Text>
            </GlassPill>
          )}
          {stats.duration && (
            <GlassPill padding={[6, 12]} radius={tokens.radius.pill}>
              <Text
                style={{
                  fontFamily: tokens.fontMono,
                  fontSize: 11,
                  fontWeight: "700",
                  letterSpacing: 0.4,
                  color: tokens.textSec,
                  textTransform: "uppercase",
                }}
              >
                {stats.duration}
              </Text>
            </GlassPill>
          )}
          {primaryThemeKey ? (
            <ThemePill theme={primaryThemeKey} label={primaryTheme} size="s" />
          ) : primaryTheme ? (
            <GlassPill padding={[6, 12]} radius={tokens.radius.pill}>
              <Text
                style={{
                  fontFamily: tokens.fontSans,
                  fontSize: 12,
                  fontWeight: "600",
                  color: tokens.text,
                }}
              >
                {primaryTheme}
              </Text>
            </GlassPill>
          ) : null}
        </View>
      )}

      {/* AI summary in HeroCard with GradientText title */}
      {entry.summary && (
        <HeroCard variant="primary" padding={18}>
          <View style={{ gap: 10 }}>
            <GradientText
              colors={[tokens.primary, tokens.secondary]}
              style={{
                fontFamily: tokens.fontMono,
                fontSize: 10,
                fontWeight: "700",
                letterSpacing: 1.4,
              }}
            >
              AI SUMMARY
            </GradientText>
            <Text
              style={{
                fontFamily: tokens.fontSans,
                fontSize: 15,
                lineHeight: 22,
                color: tokens.text,
              }}
            >
              {entry.summary}
            </Text>
          </View>
        </HeroCard>
      )}

      {/* §B.2.6 Free-tier locked footer. Heuristic unchanged from
          pre-Q6: entry has a summary but no extraction artifacts. */}
      {entry.summary &&
        entry.themes.length === 0 &&
        entry.wins.length === 0 &&
        entry.blockers.length === 0 &&
        entry.tasks.length === 0 && (
          <View style={{ marginTop: -4 }}>
            <ProLockedFooter />
          </View>
        )}

      {/* Themes — ThemePill for canonical names, GlassPill chip
          for the long tail. Both render at "s" size for density. */}
      {entry.themes.length > 0 && (
        <Section title="Themes" tokens={tokens}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {entry.themes.map((t) => {
              const key = asCanonicalTheme(t);
              if (key) return <ThemePill key={t} theme={key} label={t} size="s" />;
              return (
                <View
                  key={t}
                  style={{
                    paddingVertical: 5,
                    paddingHorizontal: 10,
                    borderRadius: tokens.radius.pill,
                    backgroundColor: tokens.bgSub,
                    borderWidth: 0.5,
                    borderColor: tokens.line,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: tokens.fontSans,
                      fontSize: 12,
                      fontWeight: "600",
                      color: tokens.text,
                    }}
                  >
                    {t}
                  </Text>
                </View>
              );
            })}
          </View>
        </Section>
      )}

      {/* Wins — preserved structure, restyled with tokens. */}
      {entry.wins.length > 0 && (
        <Section title="Wins" tokens={tokens}>
          {entry.wins.map((w, i) => (
            <View
              key={i}
              style={{ flexDirection: "row", gap: 8, marginBottom: 6 }}
            >
              <Text style={{ color: tokens.good }}>✓</Text>
              <Text
                style={{
                  flex: 1,
                  fontFamily: tokens.fontSans,
                  fontSize: 14,
                  lineHeight: 20,
                  color: tokens.text,
                }}
              >
                {w}
              </Text>
            </View>
          ))}
        </Section>
      )}

      {/* Blockers — preserved structure, restyled with tokens. */}
      {entry.blockers.length > 0 && (
        <Section title="Blockers" tokens={tokens}>
          {entry.blockers.map((b, i) => (
            <View
              key={i}
              style={{ flexDirection: "row", gap: 8, marginBottom: 6 }}
            >
              <Text style={{ color: tokens.bad }}>↳</Text>
              <Text
                style={{
                  flex: 1,
                  fontFamily: tokens.fontSans,
                  fontSize: 14,
                  lineHeight: 20,
                  color: tokens.text,
                }}
              >
                {b}
              </Text>
            </View>
          ))}
        </Section>
      )}

      {/* Tasks — list preserved per Q6 scope; the row cards get
          their full refresh in Q8 (Tasks tab + checkbox slice). */}
      {entry.tasks.length > 0 && (
        <Section title={`Tasks (${entry.tasks.length})`} tokens={tokens}>
          {entry.tasks.map((t) => {
            const label =
              t.title ??
              (t as { text?: string | null }).text ??
              "Untitled task";
            return (
              <View
                key={t.id}
                style={{
                  borderRadius: tokens.radius.md,
                  borderWidth: 0.5,
                  borderColor: tokens.line,
                  backgroundColor: tokens.cardBg,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  marginBottom: 8,
                }}
              >
                <Text
                  style={{
                    fontFamily: tokens.fontSans,
                    fontSize: 14,
                    fontWeight: "500",
                    color: tokens.text,
                  }}
                >
                  {label}
                </Text>
                {t.description && (
                  <Text
                    style={{
                      fontFamily: tokens.fontSans,
                      fontSize: 12,
                      lineHeight: 17,
                      color: tokens.textTer,
                      marginTop: 4,
                    }}
                  >
                    {t.description}
                  </Text>
                )}
                <Text
                  style={{
                    fontFamily: tokens.fontMono,
                    fontSize: 10,
                    fontWeight: "700",
                    letterSpacing: 0.4,
                    color: tokens.textQuiet,
                    marginTop: 6,
                    textTransform: "uppercase",
                  }}
                >
                  {t.priority} · {t.status.replace("_", " ")}
                </Text>
              </View>
            );
          })}
        </Section>
      )}

      {/* Transcript — full text plain. EntryDTO has no "highlights"
          field today, so we render uniform weight and leave a
          backlog note for when the extraction pipeline starts
          persisting per-sentence highlight flags. */}
      <Section title="Transcript" tokens={tokens}>
        {/* TODO(post-Q6): when EntryDTO gains a `highlights` field
            (array of {start, end} indices or sentence IDs), branch
            here to render flagged sentences with a soft palette-
            tinted background. */}
        <Text
          style={{
            fontFamily: tokens.fontSans,
            fontSize: 14,
            lineHeight: 22,
            color: tokens.textSec,
          }}
        >
          {entry.transcript || "Transcript still processing…"}
        </Text>
      </Section>

      {/* Slice 7 v1.2 Calendar Integration — events that day with
          link/unlink controls. Component fetches its own data and
          renders nothing when the user isn't connected or has no
          events in the window, so disconnected users see no extra
          chrome on this screen. */}
      <CalendarEventsSection entryId={entry.id} />
    </ScrollView>
  );
}

function Section({
  title,
  children,
  tokens,
}: {
  title: string;
  children: React.ReactNode;
  tokens: ReturnType<typeof useTheme>["tokens"];
}) {
  return (
    <View>
      <Text
        style={{
          fontFamily: tokens.fontMono,
          fontSize: 10,
          fontWeight: "700",
          letterSpacing: 1.4,
          color: tokens.textTer,
          textTransform: "uppercase",
          marginBottom: 10,
        }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}
