import { useRouter } from "expo-router";
import { X } from "lucide-react-native";
import { useEffect, useMemo } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { CATEGORY, MOOD, TEXT } from "./theme-tokens";
import type { WaveTheme } from "./ThemeMoodWaveRow";

/**
 * Mobile counterpart to ThemeDetailModal — renders as a bottom sheet
 * via React Native Modal + Reanimated translateY animation. Snaps to
 * 90% height; backdrop tap closes. No bottom-sheet library dep.
 */

export type DetailEntry = {
  id: string;
  createdAt: string;
  excerpt: string;
  sentiment: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
};

export function ThemeDetailSheet({
  theme,
  entries,
  windowStart,
  windowEnd,
  onClose,
}: {
  theme: WaveTheme;
  entries: DetailEntry[];
  windowStart: string | null;
  windowEnd: string;
  onClose: () => void;
}) {
  const { height: screenH } = useWindowDimensions();
  const SHEET_H = Math.round(screenH * 0.9);
  const c = CATEGORY[theme.category];
  const router = useRouter();

  const translateY = useSharedValue(SHEET_H);
  useEffect(() => {
    translateY.value = withTiming(0, {
      duration: 280,
      easing: Easing.out(Easing.cubic),
    });
  }, [translateY]);
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const handleClose = () => {
    translateY.value = withTiming(SHEET_H, {
      duration: 220,
      easing: Easing.in(Easing.cubic),
    });
    setTimeout(onClose, 220);
  };

  const dateRange = useMemo(() => {
    const fmt = (iso: string) =>
      new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return windowStart ? `${fmt(windowStart)} – ${fmt(windowEnd)}` : `through ${fmt(windowEnd)}`;
  }, [windowStart, windowEnd]);

  const positives = theme.entries.filter((e) => e.mood >= 7).length;
  const neutrals = theme.entries.filter((e) => e.mood >= 5 && e.mood < 7).length;
  const negatives = theme.entries.filter((e) => e.mood < 5).length;

  return (
    <Modal transparent animationType="fade" onRequestClose={handleClose} visible>
      <Pressable
        onPress={handleClose}
        style={{
          flex: 1,
          backgroundColor: "rgba(8,8,16,0.7)",
          justifyContent: "flex-end",
        }}
      >
        <Animated.View
          onStartShouldSetResponder={() => true}
          style={[
            {
              height: SHEET_H,
              backgroundColor: "#0E0E1C",
              borderTopWidth: 0.5,
              borderColor: `${c.solid}55`,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              shadowColor: c.solid,
              shadowOpacity: 0.3,
              shadowRadius: 30,
              shadowOffset: { width: 0, height: -10 },
            },
            sheetStyle,
          ]}
        >
          {/* drag handle */}
          <View style={{ alignItems: "center", paddingTop: 10 }}>
            <View
              style={{
                width: 36,
                height: 4,
                borderRadius: 999,
                backgroundColor: "rgba(255,255,255,0.18)",
              }}
            />
          </View>

          {/* header */}
          <View
            style={{
              paddingHorizontal: 20,
              paddingTop: 16,
              paddingBottom: 14,
              borderBottomWidth: 0.5,
              borderBottomColor: "rgba(255,255,255,0.06)",
              flexDirection: "row",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 22,
                  fontWeight: "500",
                  color: TEXT.primary,
                  letterSpacing: -0.4,
                }}
              >
                {capitalize(theme.name)}
              </Text>
              <View
                style={{
                  marginTop: 6,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <Text style={{ fontSize: 12, color: TEXT.secondary }}>
                  {theme.count} mention{theme.count === 1 ? "" : "s"} · {dateRange}
                </Text>
                <View
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 999,
                    backgroundColor: `${colorForMean(theme.meanMood)}20`,
                    borderWidth: 0.5,
                    borderColor: `${colorForMean(theme.meanMood)}55`,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "600",
                      color: colorForMean(theme.meanMood),
                    }}
                  >
                    mood {theme.meanMood.toFixed(1)}
                  </Text>
                </View>
              </View>
            </View>
            <Pressable
              onPress={handleClose}
              hitSlop={8}
              style={{ padding: 4 }}
            >
              <X size={20} color="rgba(168,168,180,0.7)" />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 22 }}>
            <Section label="MOOD BREAKDOWN">
              <View style={{ flexDirection: "row", gap: 10 }}>
                <MoodCount label="positive" count={positives} color={MOOD.positive} />
                <MoodCount label="neutral" count={neutrals} color="rgba(168,168,180,0.7)" />
                <MoodCount label="tense" count={negatives} color={MOOD.negative} />
              </View>
            </Section>

            {theme.coOccurrences.length > 0 && (
              <Section label="PAIRS WITH">
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {theme.coOccurrences.map((co) => (
                    <View
                      key={co.themeName}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 999,
                        backgroundColor: "rgba(255,255,255,0.04)",
                        borderWidth: 0.5,
                        borderColor: "rgba(255,255,255,0.08)",
                      }}
                    >
                      <Text style={{ fontSize: 12, color: TEXT.primary }}>
                        {capitalize(co.themeName)}{" "}
                        <Text style={{ color: TEXT.tertiary }}>{co.count}</Text>
                      </Text>
                    </View>
                  ))}
                </View>
              </Section>
            )}

            <Section label="ENTRIES">
              {entries.length === 0 ? (
                <Text style={{ fontSize: 12, color: TEXT.tertiary }}>
                  No entry excerpts available for this period.
                </Text>
              ) : (
                <View style={{ gap: 8 }}>
                  {entries.map((e) => (
                    <Pressable
                      key={e.id}
                      onPress={() => {
                        handleClose();
                        setTimeout(() => router.push(`/entry/${e.id}` as never), 240);
                      }}
                      style={{
                        flexDirection: "row",
                        alignItems: "flex-start",
                        gap: 10,
                        padding: 10,
                        borderRadius: 10,
                        backgroundColor: "rgba(255,255,255,0.02)",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          color: TEXT.tertiary,
                          marginTop: 2,
                          minWidth: 44,
                        }}
                      >
                        {new Date(e.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </Text>
                      <Text
                        style={{ flex: 1, fontSize: 13, color: TEXT.primary, lineHeight: 18 }}
                      >
                        {e.excerpt || "—"}
                      </Text>
                      <View
                        style={{
                          paddingHorizontal: 5,
                          paddingVertical: 1,
                          borderRadius: 999,
                          backgroundColor:
                            e.sentiment === "POSITIVE"
                              ? `${MOOD.positive}1f`
                              : e.sentiment === "NEGATIVE"
                                ? `${MOOD.negative}1f`
                                : "rgba(168,168,180,0.1)",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 9,
                            fontWeight: "700",
                            letterSpacing: 0.5,
                            color:
                              e.sentiment === "POSITIVE"
                                ? MOOD.positive
                                : e.sentiment === "NEGATIVE"
                                  ? MOOD.negative
                                  : TEXT.secondary,
                          }}
                        >
                          {e.sentiment.slice(0, 3)}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              )}
            </Section>
          </ScrollView>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View>
      <Text
        style={{
          fontSize: 9.5,
          letterSpacing: 1.8,
          fontWeight: "700",
          color: TEXT.tertiary,
          textTransform: "uppercase",
          marginBottom: 10,
        }}
      >
        {label}
      </Text>
      {children}
    </View>
  );
}

function MoodCount({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 10,
        backgroundColor: `${color}10`,
        borderWidth: 0.5,
        borderColor: `${color}40`,
      }}
    >
      <Text
        style={{
          fontSize: 22,
          fontWeight: "500",
          color: TEXT.primary,
          letterSpacing: -0.5,
        }}
      >
        {count}
      </Text>
      <Text
        style={{
          fontSize: 10,
          color,
          marginTop: 2,
          fontWeight: "600",
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function colorForMean(mean: number): string {
  if (mean < 5) return MOOD.negative;
  if (mean > 7.5) return MOOD.positive;
  return "rgba(168,168,180,0.7)";
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
