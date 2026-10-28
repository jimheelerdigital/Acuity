import { LinearGradient } from "expo-linear-gradient";
import { forwardRef } from "react";
import { Image, Text, View } from "react-native";

import { wrappedMoodTrend, type WrappedSummary } from "@acuity/shared";

import type { AcuityTokens as Tokens } from "@/lib/theme/tokens";

/** Logical size of the share image: 9:16, so 1080×1920 at 3x. */
export const WRAPPED_SHARE_CARD_WIDTH = 360;
export const WRAPPED_SHARE_CARD_HEIGHT = 640;

/** Real brand lockup aspect ratio (assets/brand/ripple-lockup-white.png, 312×73). */
const LOCKUP_RATIO = 312 / 73;

const WHITE = "#ffffff";
const WHITE_SOFT = "rgba(255,255,255,0.88)";
const WHITE_DIM = "rgba(255,255,255,0.72)";
const GLASS = "rgba(255,255,255,0.16)";

/**
 * Ripple Wrapped share image (2026-10-28): a portrait, story-sized card that
 * react-native-view-shot turns into a PNG (see lib/wrapped-share.ts).
 *
 * Privacy: exactly the same facts as wrappedShareText, nothing more. Counts,
 * top themes, the longest streak's LENGTH (never the habit's name), to-dos,
 * the mood direction (never the scores), and a first name only when the user
 * turned "Include <name>" on. Never the biggest win, never transcript text.
 *
 * Pure presentation: fixed size, no hooks besides what the caller passes, so
 * the visible preview and the off-screen capture render identically. Takes
 * `tokens` as a prop (rather than useTheme) for the same reason.
 */
export const WrappedShareCard = forwardRef<
  View,
  { data: WrappedSummary; includePerson: boolean; tokens: Tokens }
>(function WrappedShareCard({ data, includePerson, tokens }, ref) {
  const themes = data.topThemes.slice(0, 3);
  const trend = wrappedMoodTrend(data);
  const person = includePerson && data.person ? data.person.firstName : null;
  const periodLabel =
    data.period.kind === "year" ? data.period.label.replace(/^Your /, "") : data.period.label;

  const chips: { label: string; value: string }[] = [];
  if (trend) chips.push({ label: "Mood", value: trend });
  if (person) chips.push({ label: "Came up most", value: person });

  return (
    <View
      ref={ref}
      collapsable={false}
      style={{
        width: WRAPPED_SHARE_CARD_WIDTH,
        height: WRAPPED_SHARE_CARD_HEIGHT,
        overflow: "hidden",
        backgroundColor: tokens.primary,
      }}
    >
      <LinearGradient
        colors={tokens.gradMix.colors as unknown as readonly [string, string, ...string[]]}
        locations={tokens.gradMix.locations as unknown as readonly [number, number, ...number[]]}
        start={tokens.gradMix.start}
        end={tokens.gradMix.end}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />

      {/* Ripple rings, top right. Decorative only. */}
      {[120, 200, 280, 360].map((d, i) => (
        <View
          key={d}
          style={{
            position: "absolute",
            width: d,
            height: d,
            borderRadius: d / 2,
            borderWidth: 1.5,
            borderColor: `rgba(255,255,255,${0.22 - i * 0.045})`,
            top: -d / 2 + 40,
            right: -d / 2 + 40,
          }}
        />
      ))}

      <View style={{ flex: 1, paddingHorizontal: 30, paddingTop: 34, paddingBottom: 28 }}>
        <Image
          source={require("../../assets/brand/ripple-lockup-white.png")}
          style={{ width: 22 * LOCKUP_RATIO, height: 22 }}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />

        <Text
          style={{
            fontFamily: tokens.fontSans,
            fontSize: 11,
            fontWeight: "700",
            letterSpacing: 2.4,
            textTransform: "uppercase",
            color: WHITE_DIM,
            marginTop: 30,
          }}
        >
          Ripple Wrapped
        </Text>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          style={{ fontFamily: tokens.fontDisplay, fontSize: 30, color: WHITE, marginTop: 4 }}
        >
          {periodLabel}
        </Text>

        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          style={{
            fontFamily: tokens.fontDisplay,
            fontSize: 96,
            lineHeight: 104,
            color: WHITE,
            marginTop: 14,
            letterSpacing: -2,
          }}
        >
          {data.entries}
        </Text>
        <Text style={{ fontFamily: tokens.fontSans, fontSize: 17, lineHeight: 23, color: WHITE_SOFT }}>
          debriefs over {data.daysJournaled} {data.daysJournaled === 1 ? "day" : "days"}
          {data.minutesTalked ? `\n${data.minutesTalked} min of talking it through` : ""}
        </Text>

        {themes.length > 0 ? (
          <View style={{ marginTop: 22 }}>
            <Text
              style={{
                fontFamily: tokens.fontSans,
                fontSize: 11,
                fontWeight: "700",
                letterSpacing: 2.4,
                textTransform: "uppercase",
                color: WHITE_DIM,
                marginBottom: 4,
              }}
            >
              On my mind
            </Text>
            {themes.map((t, i) => (
              <View key={t.theme} style={{ flexDirection: "row", alignItems: "baseline", marginTop: 4 }}>
                <Text style={{ fontFamily: tokens.fontDisplay, fontSize: 20, color: WHITE_DIM, width: 24 }}>
                  {i + 1}
                </Text>
                <Text
                  numberOfLines={1}
                  style={{ fontFamily: tokens.fontDisplay, fontSize: 22, color: WHITE, flex: 1 }}
                >
                  {t.theme}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {data.habitStreak || data.tasks ? (
          <View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
            {data.habitStreak ? (
              <Tile
                tokens={tokens}
                value={`${data.habitStreak.days}`}
                label="day habit streak"
              />
            ) : null}
            {data.tasks ? (
              <Tile
                tokens={tokens}
                value={`${data.tasks.captured}`}
                label={`to-dos from talking · ${data.tasks.completed} done`}
              />
            ) : null}
          </View>
        ) : null}

        {chips.length > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
            {chips.map((c) => (
              <View
                key={c.label}
                style={{
                  backgroundColor: GLASS,
                  borderRadius: tokens.radius.pill,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                }}
              >
                <Text style={{ fontFamily: tokens.fontSans, fontSize: 13, color: WHITE }}>
                  <Text style={{ color: WHITE_DIM }}>{c.label} · </Text>
                  {c.value}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={{ flex: 1 }} />

        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            justifyContent: "space-between",
            borderTopWidth: 1,
            borderTopColor: "rgba(255,255,255,0.24)",
            paddingTop: 14,
          }}
        >
          <Text style={{ fontFamily: tokens.fontSans, fontSize: 13, lineHeight: 18, color: WHITE_SOFT, flex: 1 }}>
            Voice journaling,{"\n"}a few minutes a night
          </Text>
          <Text style={{ fontFamily: tokens.fontSans, fontSize: 15, fontWeight: "700", color: WHITE }}>
            goripple.io
          </Text>
        </View>
      </View>
    </View>
  );
});

function Tile({ tokens, value, label }: { tokens: Tokens; value: string; label: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: GLASS, borderRadius: tokens.radius.md, padding: 12 }}>
      <Text style={{ fontFamily: tokens.fontDisplay, fontSize: 28, lineHeight: 32, color: WHITE }}>{value}</Text>
      <Text numberOfLines={2} style={{ fontFamily: tokens.fontSans, fontSize: 12, lineHeight: 16, color: WHITE_SOFT, marginTop: 2 }}>
        {label}
      </Text>
    </View>
  );
}
