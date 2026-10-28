import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  Switch,
  type View as RNView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  parseWrappedPeriod,
  wrappedPeriodKey,
  wrappedShareText,
  type WrappedSummary,
} from "@acuity/shared";

import { StickyBackButton } from "@/components/back-button";
import {
  WRAPPED_SHARE_CARD_HEIGHT,
  WRAPPED_SHARE_CARD_WIDTH,
  WrappedShareCard,
} from "@/components/insights/wrapped-share-card";
import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";
import { shareWrapped } from "@/lib/wrapped-share";

/** The share preview is the real card at half size. */
const PREVIEW_SCALE = 0.5;

/**
 * Ripple Wrapped (2026-10-27): a card-by-card recap of a month
 * (?period=YYYY-MM) or a year (?period=YYYY). Data comes from
 * GET /api/insights/wrapped. Every section hides itself when the user
 * doesn't have enough data for it.
 *
 * Sharing (image, 2026-10-28): a story-sized WrappedShareCard is rendered
 * off-screen, captured with react-native-view-shot and shared as a PNG via
 * expo-sharing. A half-size copy of the same card is shown as the preview, so
 * the user sees exactly what's shared. If capture fails (including a binary
 * older than 1.9.7, which lacks the native module) it falls back to the text
 * share (wrappedShareText), which carries the same facts. "Share as text"
 * stays available. Privacy rule: see wrappedShareText / WrappedShareCard. A
 * person's first name is only added when the user turns it on here.
 */
export default function WrappedScreen() {
  const { tokens } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ period?: string }>();
  const period = parseWrappedPeriod(typeof params.period === "string" ? params.period : null);
  const key = period ? wrappedPeriodKey(period) : null;

  const [data, setData] = useState<WrappedSummary | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [includePerson, setIncludePerson] = useState(false);
  const [sharing, setSharing] = useState(false);
  const cardRef = useRef<RNView>(null);

  useEffect(() => {
    if (!key) {
      setState("error");
      return;
    }
    let alive = true;
    setState("loading");
    api
      .get<WrappedSummary>(`/api/insights/wrapped?period=${key}`)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setState("ready");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, [key]);

  const shareText = data ? wrappedShareText(data, { includePerson }) : "";

  const onShareImage = async () => {
    if (!data || sharing) return;
    setSharing(true);
    try {
      await shareWrapped({
        cardRef,
        text: shareText,
        dialogTitle: "Share your Ripple Wrapped",
        periodKey: data.period.key,
      });
    } finally {
      setSharing(false);
    }
  };

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: tokens.bg }}>
      <StickyBackButton onPress={() => router.back()} />
      {state === "ready" && data?.eligible ? (
        // Capture target for the share image: full size, off-screen, never
        // seen or read by VoiceOver. See lib/wrapped-share.ts.
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ position: "absolute", top: 0, left: -10000 }}
        >
          <WrappedShareCard ref={cardRef} data={data} includePerson={includePerson} tokens={tokens} />
        </View>
      ) : null}
      {state === "loading" ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={tokens.primary} />
        </View>
      ) : state === "error" || !data ? (
        <Centered>
          <Text style={{ fontFamily: tokens.fontSans, fontSize: 16, color: tokens.textSec, textAlign: "center" }}>
            Couldn't load this recap. Check your connection and try again.
          </Text>
        </Centered>
      ) : !data.eligible ? (
        <Centered>
          <Text style={{ fontFamily: tokens.fontDisplay, fontSize: 22, color: tokens.text, textAlign: "center" }}>
            Not enough for a recap yet
          </Text>
          <Text
            style={{ fontFamily: tokens.fontSans, fontSize: 15, lineHeight: 22, color: tokens.textSec, textAlign: "center", marginTop: 8 }}
          >
            Wrapped needs {data.minEntries} debriefs in {data.period.label.replace(/^Your /, "")}. You have {data.entries}.
          </Text>
        </Centered>
      ) : (
        <ScrollView contentContainerStyle={{ paddingTop: 64, paddingHorizontal: 20, paddingBottom: 48, gap: 14 }}>
          {/* Hero */}
          <View style={{ borderRadius: tokens.radius.xl, overflow: "hidden" }}>
            <LinearGradient
              colors={tokens.gradMix.colors as unknown as readonly [string, string, ...string[]]}
              locations={tokens.gradMix.locations as unknown as readonly [number, number, ...number[]]}
              start={tokens.gradMix.start}
              end={tokens.gradMix.end}
              style={{ padding: 24 }}
            >
              <Text style={eyebrowOnColor(tokens.fontSans)}>Ripple Wrapped</Text>
              <Text style={{ fontFamily: tokens.fontDisplay, fontSize: 30, color: "#fff", marginTop: 6 }}>
                {data.period.label}
              </Text>
              <Text style={{ fontFamily: tokens.fontDisplay, fontSize: 64, color: "#fff", marginTop: 18, lineHeight: 70 }}>
                {data.entries}
              </Text>
              <Text style={{ fontFamily: tokens.fontSans, fontSize: 16, color: "rgba(255,255,255,0.92)" }}>
                debriefs over {data.daysJournaled} {data.daysJournaled === 1 ? "day" : "days"}
                {data.minutesTalked ? ` · ${data.minutesTalked} min of talking` : ""}
              </Text>
            </LinearGradient>
          </View>

          {data.topThemes.length > 0 ? (
            <Section eyebrow="On your mind">
              {data.topThemes.map((t, i) => (
                <View key={t.theme} style={{ flexDirection: "row", alignItems: "baseline", marginTop: i ? 10 : 2 }}>
                  <Text style={{ fontFamily: tokens.fontDisplay, fontSize: 22, color: tokens.primary, width: 28 }}>
                    {i + 1}
                  </Text>
                  <Text style={{ fontFamily: tokens.fontDisplay, fontSize: 22, color: tokens.text, flex: 1 }}>{t.theme}</Text>
                  <Text style={{ fontFamily: tokens.fontSans, fontSize: 13, color: tokens.textTer }}>
                    in {t.entries} debriefs
                  </Text>
                </View>
              ))}
            </Section>
          ) : null}

          {data.habitStreak ? (
            <Section eyebrow="Longest streak">
              <Big>{data.habitStreak.days} days</Big>
              <Sub>of {data.habitStreak.habit}, in a row</Sub>
            </Section>
          ) : null}

          {data.tasks ? (
            <Section eyebrow="Just by talking">
              <Big>{data.tasks.captured} to-dos</Big>
              <Sub>
                captured from your debriefs · {data.tasks.completed} done
              </Sub>
            </Section>
          ) : null}

          {data.biggestWin ? (
            <Section eyebrow="A win worth remembering">
              <Text style={{ fontFamily: tokens.fontDisplay, fontSize: 20, lineHeight: 28, color: tokens.text }}>
                “{data.biggestWin}”
              </Text>
            </Section>
          ) : null}

          {data.person ? (
            <Section eyebrow="Came up most">
              <Big>{data.person.firstName}</Big>
              <Sub>mentioned {data.person.mentions} times</Sub>
            </Section>
          ) : null}

          {data.moodArc ? (
            <Section eyebrow="Your mood">
              <MoodBars arc={data.moodArc} />
            </Section>
          ) : null}

          {/* Share */}
          <Section eyebrow="Share it">
            <View style={{ alignItems: "center", marginTop: 4 }}>
              <View
                accessible
                accessibilityRole="image"
                accessibilityLabel={`Preview of your share image. ${shareText.replace(/\n/g, ". ")}`}
                style={{
                  width: WRAPPED_SHARE_CARD_WIDTH * PREVIEW_SCALE,
                  height: WRAPPED_SHARE_CARD_HEIGHT * PREVIEW_SCALE,
                  borderRadius: tokens.radius.md,
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    width: WRAPPED_SHARE_CARD_WIDTH,
                    height: WRAPPED_SHARE_CARD_HEIGHT,
                    transform: [{ scale: PREVIEW_SCALE }],
                    transformOrigin: "top left",
                  }}
                >
                  <WrappedShareCard data={data} includePerson={includePerson} tokens={tokens} />
                </View>
              </View>
            </View>
            {data.person ? (
              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 14 }}>
                <Text style={{ fontFamily: tokens.fontSans, fontSize: 14, color: tokens.text, flex: 1 }}>
                  Include {data.person.firstName}
                </Text>
                <Switch
                  value={includePerson}
                  onValueChange={setIncludePerson}
                  trackColor={{ true: tokens.primary }}
                  accessibilityLabel={`Include ${data.person.firstName} in what you share`}
                />
              </View>
            ) : null}
            <Text style={{ fontFamily: tokens.fontSans, fontSize: 12, color: tokens.textTer, marginTop: 8 }}>
              Only what's on this card is shared. Nothing you said in your debriefs.
            </Text>
            <Pressable
              onPress={() => {
                void onShareImage();
              }}
              disabled={sharing}
              accessibilityRole="button"
              accessibilityState={{ busy: sharing, disabled: sharing }}
              style={{
                marginTop: 14,
                alignItems: "center",
                paddingVertical: 13,
                borderRadius: tokens.radius.pill,
                backgroundColor: tokens.primary,
                opacity: sharing ? 0.7 : 1,
              }}
            >
              {sharing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ fontFamily: tokens.fontSans, fontSize: 15, fontWeight: "600", color: "#fff" }}>
                  Share my recap
                </Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => {
                void Share.share({ message: shareText }).catch(() => {});
              }}
              accessibilityRole="button"
              hitSlop={8}
              style={{ alignItems: "center", paddingVertical: 10, marginTop: 4 }}
            >
              <Text style={{ fontFamily: tokens.fontSans, fontSize: 14, fontWeight: "600", color: tokens.primary }}>
                Share as text instead
              </Text>
            </Pressable>
          </Section>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function eyebrowOnColor(font: string) {
  return {
    fontFamily: font,
    fontSize: 11,
    fontWeight: "700" as const,
    letterSpacing: 2,
    textTransform: "uppercase" as const,
    color: "rgba(255,255,255,0.85)",
  };
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
      {children}
    </View>
  );
}

function Section({ eyebrow, children }: { eyebrow: string; children: ReactNode }) {
  const { tokens } = useTheme();
  return (
    <View
      style={{
        borderRadius: tokens.radius.lg,
        borderWidth: 1,
        borderColor: tokens.line,
        backgroundColor: tokens.cardBg,
        padding: 18,
      }}
    >
      <Text
        style={{
          fontFamily: tokens.fontSans,
          fontSize: 11,
          fontWeight: "700",
          letterSpacing: 2,
          textTransform: "uppercase",
          color: tokens.textTer,
          marginBottom: 8,
        }}
      >
        {eyebrow}
      </Text>
      {children}
    </View>
  );
}

function Big({ children }: { children: ReactNode }) {
  const { tokens } = useTheme();
  return <Text style={{ fontFamily: tokens.fontDisplay, fontSize: 34, color: tokens.text }}>{children}</Text>;
}

function Sub({ children }: { children: ReactNode }) {
  const { tokens } = useTheme();
  return (
    <Text style={{ fontFamily: tokens.fontSans, fontSize: 15, color: tokens.textSec, marginTop: 2 }}>{children}</Text>
  );
}

/** Average moodScore (1–10) per bucket, as simple bars. */
function MoodBars({ arc }: { arc: { label: string; avg: number }[] }) {
  const { tokens } = useTheme();
  const MAX_H = 96;
  return (
    <View
      style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, marginTop: 6 }}
      accessible
      accessibilityLabel={`Average mood: ${arc.map((b) => `${b.label} ${b.avg} out of 10`).join(", ")}`}
    >
      {arc.map((b) => (
        <View key={b.label} style={{ flex: 1, alignItems: "center" }}>
          <Text style={{ fontFamily: tokens.fontSans, fontSize: 11, color: tokens.textTer, marginBottom: 4 }}>
            {b.avg.toFixed(1)}
          </Text>
          <View
            style={{
              width: "100%",
              maxWidth: 34,
              height: Math.max(6, (b.avg / 10) * MAX_H),
              borderRadius: 8,
              backgroundColor: tokens.primary,
              opacity: 0.35 + (b.avg / 10) * 0.65,
            }}
          />
          <Text style={{ fontFamily: tokens.fontSans, fontSize: 11, color: tokens.textSec, marginTop: 6 }}>
            {b.label}
          </Text>
        </View>
      ))}
    </View>
  );
}
