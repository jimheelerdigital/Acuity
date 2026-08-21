import { Flame } from "lucide-react-native";
import { useEffect, useMemo } from "react";
import { Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { milestoneTier, type MilestoneTier } from "@acuity/shared";

import { useTheme } from "@/contexts/theme-context";

/**
 * Mobile counterpart to apps/web/src/components/milestone-card.tsx.
 * Same tier system + same copy (imported from the shared module so
 * identity stays in sync). Confetti uses Reanimated shared values —
 * 30 (sustained: 45) particles animate top→bottom with rotation.
 *
 * Plays inside a StaticCard wrapper rendered by FocusCardStack, so
 * we don't own the card chrome — just the interior.
 */
export function MilestoneCard({ milestone }: { milestone: number }) {
  const tier = milestoneTier(milestone);
  const copy = MILESTONE_COPY[milestone] ?? MILESTONE_COPY_DEFAULT;

  if (tier === "small" || tier === "medium") {
    return <StandardMilestone milestone={milestone} tier={tier} copy={copy} />;
  }
  return <HeroMilestone milestone={milestone} tier={tier} copy={copy} />;
}

// Q11e-rest: orange/amber values in this file are deliberately
// non-palette semantic streak-celebration accents (the flame color
// gradient: small=orange-light, medium=orange, big=amber, biggest=
// amber-deep). Same exception convention as confetti accents
// (Q8) and theme-map category colors. Zinc grays still convert to
// palette tokens.
function StandardMilestone({
  milestone,
  tier,
  copy,
}: {
  milestone: number;
  tier: MilestoneTier;
  copy: { title: string; body: string };
}) {
  const { tokens } = useTheme();
  return (
    <View className="pr-6">
      <Text className="text-xs font-semibold uppercase tracking-widest text-orange-600 dark:text-orange-400">
        Streak milestone
      </Text>
      <View className="mt-2 flex-row items-center gap-2">
        <Flame
          size={26}
          color={tier === "medium" ? "#F97316" : "#FB923C"}
        />
        <Text
          className="text-3xl font-bold"
          style={{
            color: tier === "medium" ? "#F97316" : tokens.textSec,
          }}
        >
          {milestone}
        </Text>
        <Text
          className="text-sm font-medium self-end mb-1"
          style={{ color: tokens.textSec }}
        >
          {milestone === 1 ? "day" : "days"}
        </Text>
      </View>
      <Text
        className="mt-2 text-base font-semibold"
        style={{ color: tokens.text }}
      >
        {copy.title}
      </Text>
      <Text
        className="mt-1.5 text-sm leading-relaxed"
        style={{ color: tokens.textSec }}
      >
        {copy.body}
      </Text>
    </View>
  );
}

function HeroMilestone({
  milestone,
  tier,
  copy,
}: {
  milestone: number;
  tier: MilestoneTier;
  copy: { title: string; body: string };
}) {
  const { tokens } = useTheme();
  const isBiggest = tier === "biggest";
  return (
    <View
      className={`relative overflow-hidden rounded-xl pr-6 ${
        isBiggest
          ? "bg-amber-50 dark:bg-amber-950/20"
          : "bg-orange-50 dark:bg-orange-950/20"
      }`}
      style={{ marginHorizontal: -8, marginVertical: -8, padding: 16 }}
    >
      <Confetti sustained={isBiggest} />
      <Text
        className={`text-xs font-semibold uppercase tracking-widest ${
          isBiggest
            ? "text-amber-700 dark:text-amber-300"
            : "text-orange-700 dark:text-orange-300"
        }`}
      >
        {isBiggest ? "One full year" : "Milestone"}
      </Text>
      <View className="mt-2 flex-row items-center gap-3">
        <Flame size={36} color={isBiggest ? "#F59E0B" : "#F97316"} />
        <Text
          className={`text-5xl font-black ${
            isBiggest
              ? "text-amber-700 dark:text-amber-300"
              : "text-orange-700 dark:text-orange-300"
          }`}
        >
          {milestone}
        </Text>
        <Text
          className="text-base font-semibold self-end mb-2"
          style={{ color: tokens.textSec }}
        >
          days
        </Text>
      </View>
      <Text
        className="mt-3 text-lg font-semibold"
        style={{ color: tokens.text }}
      >
        {copy.title}
      </Text>
      <Text
        className="mt-2 text-sm leading-relaxed"
        style={{ color: tokens.textSec }}
      >
        {copy.body}
      </Text>
    </View>
  );
}

// ─── Confetti (Reanimated, no new native deps) ─────────────────

function Confetti({ sustained }: { sustained: boolean }) {
  const count = sustained ? 45 : 30;
  const particles = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: Math.random(), // 0..1
        delayMs: Math.floor(Math.random() * (sustained ? 2000 : 800)),
        durMs: Math.floor((sustained ? 3000 : 1800) + Math.random() * 1200),
        hue: Math.floor(Math.random() * 360),
        size: 6 + Math.floor(Math.random() * 5),
        repeat: sustained ? 2 : 1,
      })),
    [count, sustained]
  );

  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: "hidden",
      }}
    >
      {particles.map((p) => (
        <Particle key={p.id} {...p} />
      ))}
    </View>
  );
}

function Particle({
  left,
  delayMs,
  durMs,
  hue,
  size,
  repeat,
}: {
  left: number;
  delayMs: number;
  durMs: number;
  hue: number;
  size: number;
  repeat: number;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delayMs,
      withRepeat(
        withTiming(1, { duration: durMs, easing: Easing.out(Easing.quad) }),
        repeat,
        false
      )
    );
  }, [progress, delayMs, durMs, repeat]);

  const animated = useAnimatedStyle(() => {
    const t = progress.value;
    // 0..0.1 fade-in, 0.1..1 fall.
    const opacity = t < 0.1 ? t * 10 : t < 0.95 ? 1 : (1 - t) * 20;
    return {
      transform: [
        { translateY: -20 + t * 240 },
        { rotate: `${t * 540}deg` },
      ],
      opacity: Math.max(0, Math.min(1, opacity)),
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          top: 0,
          left: `${left * 100}%`,
          width: size,
          height: size,
          backgroundColor: `hsl(${hue}, 85%, 65%)`,
          borderRadius: size > 9 ? 2 : size / 2,
        },
        animated,
      ]}
    />
  );
}

// ─── Copy (same source as web) ──────────────────────────────────

const MILESTONE_COPY: Record<number, { title: string; body: string }> = {
  3: {
    title: "It's starting to stick.",
    body: "Three days in a row. Momentum isn't magic — it's the third day looking like the first.",
  },
  7: {
    title: "A full week.",
    body: "You've shown up seven days. Ripple has enough to start noticing things about you.",
  },
  14: {
    title: "Two weeks of showing up.",
    body: "This is where most people quit. You didn't. Your Day 7 Life Audit is ready whenever you are.",
  },
  30: {
    title: "A month of daily debriefs.",
    body: "Thirty days of data is when patterns stop being noise. Ripple's Life Matrix is actually tracking your life now — not extrapolating.",
  },
  60: {
    title: "Two months in.",
    body: "The habit is yours, not ours. Keep going.",
  },
  100: {
    title: "One hundred days.",
    body: "Most apps never see a number like this from most users. The only person who built it is you.",
  },
  365: {
    title: "A full year of daily reflections.",
    body: "Three hundred and sixty-five days. Nobody can take that back. Your first annual review is already writing itself.",
  },
};

const MILESTONE_COPY_DEFAULT = {
  title: "Streak milestone",
  body: "Another day on the board. Ripple sees you.",
};
