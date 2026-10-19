import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { Stack, router } from "expo-router";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { Check } from "lucide-react-native";

import { useAuth } from "@/contexts/auth-context";
import { applyPendingSetup } from "@/lib/onboarding-v11/apply";
import { prefetchOffering } from "@/lib/onboarding-v11/offering-cache";
import { trackV11 } from "@/lib/onboarding-v11/flow";

import { LightScreen, RippleAppIcon, V11 } from "./_v11/ui";

/**
 * "Setting up your account" — between sign-up and the paywall (Jimmy,
 * 2026-10-15: entering the code → paywall took ~5s on a blank screen).
 *
 * Does the real work, in parallel, and shows it:
 *   1. "Saving your first debrief"  — claims the anonymous debrief (+ the
 *      consent, name, check-in time and habits she picked; applyPendingSetup)
 *   2. "Getting your plan ready"     — the RevenueCat offering (prefetched
 *      from the results screen, so usually already done)
 * Each row ticks when its work actually finishes — no fake timer — with a
 * short minimum so it doesn't flash, and a ceiling so a slow network never
 * holds her here: whatever isn't done by then is retried later (the claim
 * by finishOnboarding, the offering by the paywall).
 */
const MIN_MS = 1200;
const MAX_MS = 7000;

export default function V11Setup() {
  const { refresh } = useAuth();
  const [saved, setSaved] = useState(false);
  const [planReady, setPlanReady] = useState(false);
  const left = useRef(false);

  useEffect(() => {
    trackV11("setup", "viewed");
    const started = Date.now();
    const go = () => {
      if (left.current) return;
      left.current = true;
      router.replace("/onboarding-new/paywall");
    };
    const work = Promise.all([
      applyPendingSetup()
        .catch(() => null)
        .then(() => refresh().catch(() => {}))
        .finally(() => setSaved(true)),
      prefetchOffering().finally(() => setPlanReady(true)),
    ]);
    void work.then(() => {
      const wait = Math.max(0, MIN_MS - (Date.now() - started));
      setTimeout(go, wait + 250);
    });
    const ceiling = setTimeout(go, MAX_MS);
    return () => clearTimeout(ceiling);
  }, [refresh]);

  return (
    <LightScreen>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
        <Pulse>
          <RippleAppIcon size={72} />
        </Pulse>
        <Animated.Text
          entering={FadeInDown.duration(380)}
          accessibilityRole="header"
          style={{ marginTop: 34, textAlign: "center", fontFamily: V11.heading, fontSize: 26, letterSpacing: -0.6, color: V11.ink }}
        >
          Setting up your account
        </Animated.Text>
        <View style={{ marginTop: 26, gap: 14, alignSelf: "stretch", paddingHorizontal: 12 }}>
          <Step label="Saving your first debrief" done={saved} />
          <Step label="Getting your plan ready" done={planReady} />
        </View>
      </View>
    </LightScreen>
  );
}

function Step({ label, done }: { label: string; done: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: done ? V11.good : "#ffffff",
          borderWidth: done ? 0 : 2,
          borderColor: V11.lineStrong,
        }}
      >
        {done ? (
          <Animated.View entering={FadeIn.duration(200)}>
            <Check size={16} color="#ffffff" strokeWidth={3} />
          </Animated.View>
        ) : null}
      </View>
      <Text style={{ fontSize: 17, fontWeight: done ? "600" : "500", color: done ? V11.ink : V11.sec }}>{label}</Text>
    </View>
  );
}

function Pulse({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ width: 72, height: 72, alignItems: "center", justifyContent: "center" }}>
      <Ring delay={0} />
      <Ring delay={800} />
      {children}
    </View>
  );
}

function Ring({ delay }: { delay: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }), -1, false));
  }, [delay, t]);
  const s = useAnimatedStyle(() => ({ opacity: 0.45 * (1 - t.value), transform: [{ scale: 1 + t.value * 0.8 }] }));
  return <Animated.View style={[{ position: "absolute", width: 72, height: 72, borderRadius: 20, borderWidth: 2, borderColor: V11.coral }, s]} />;
}
