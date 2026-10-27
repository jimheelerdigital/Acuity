import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  Switch,
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
import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";

/**
 * Ripple Wrapped (2026-10-27): a card-by-card recap of a month
 * (?period=YYYY-MM) or a year (?period=YYYY). Data comes from
 * GET /api/insights/wrapped. Every section hides itself when the user
 * doesn't have enough data for it.
 *
 * Sharing: text via React Native's built-in Share sheet (no image capture;
 * react-native-view-shot isn't installed). The exact text is shown before
 * sharing; see wrappedShareText for the privacy rule. A person's first name
 * is only added when the user turns it on here.
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

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: tokens.bg }}>
      <StickyBackButton onPress={() => router.back()} />
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
            <View
              style={{
                backgroundColor: tokens.bgInset,
                borderRadius: tokens.radius.sm,
                padding: 12,
                marginTop: 4,
              }}
            >
              <Text style={{ fontFamily: tokens.fontSans, fontSize: 13, lineHeight: 19, color: tokens.textSec }}>
                {shareText}
              </Text>
            </View>
            {data.person ? (
              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 12 }}>
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
              Only what's shown above is shared. Nothing you said in your debriefs.
            </Text>
            <Pressable
              onPress={() => {
                void Share.share({ message: shareText }).catch(() => {});
              }}
              accessibilityRole="button"
              style={{
                marginTop: 14,
                alignItems: "center",
                paddingVertical: 13,
                borderRadius: tokens.radius.pill,
                backgroundColor: tokens.primary,
              }}
            >
              <Text style={{ fontFamily: tokens.fontSans, fontSize: 15, fontWeight: "600", color: "#fff" }}>
                Share my recap
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
