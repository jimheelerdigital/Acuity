import { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { NOT_LAZY, REVIEWS } from "@/lib/onboarding-v11/copy";
import { goBack, goNext, trackV11 } from "@/lib/onboarding-v11/flow";

import { Body, Card, FunnelHeader, Heading, LightScreen, PROGRESS, PrimaryButton, ReviewCard, RippleAppIcon, V11, textBody } from "./_v11/ui";

const STAGE_H = 236;
const CYCLE_MS = 3400;

/**
 * Miro #6 — "You're not lazy. You're running without a system." with
 * everything funneling into Ripple to track (animated): loose ends drift
 * down and disappear into the "Ripple keeps track of it" card, on a loop.
 * Same motion as the web funnel's ReassureScreen (v9-float).
 */
export default function V11NotLazy() {
  useEffect(() => {
    trackV11("notlazy", "viewed");
  }, []);

  return (
    <LightScreen>
      <FunnelHeader progress={PROGRESS.notlazy} onBack={goBack} />
      <Body
        footer={
          <PrimaryButton
            label={NOT_LAZY.cta}
            onPress={() => {
              trackV11("notlazy", "answered", "continue");
              goNext("notlazy");
            }}
          />
        }
      >
        <Heading title={NOT_LAZY.title} />
        <View style={{ height: STAGE_H, overflow: "hidden", marginBottom: 18 }}>
          {NOT_LAZY.things.map((t, i) => (
            <FloatingChip key={t} label={t} index={i} />
          ))}
          <View style={{ position: "absolute", bottom: 6, left: 0, right: 0, alignItems: "center" }}>
            <Card style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingLeft: 12, paddingRight: 26, borderRadius: 26 }}>
              <RippleAppIcon size={46} />
              <View>
                <Text style={{ fontFamily: V11.display, fontSize: 17, color: V11.ink }}>Ripple</Text>
                <Text style={{ fontSize: 14, color: V11.ter }}>keeps track of it</Text>
              </View>
            </Card>
          </View>
        </View>
        <Animated.Text entering={FadeInDown.delay(200).duration(400)} style={{ ...textBody, fontSize: 17, lineHeight: 26, textAlign: "center" }}>
          {NOT_LAZY.body}
        </Animated.Text>
        <Animated.View entering={FadeInDown.delay(320).duration(400)} style={{ marginTop: 22 }}>
          <ReviewCard quote={REVIEWS[0].quote} name={REVIEWS[0].name} />
        </Animated.View>
      </Body>
    </LightScreen>
  );
}

function FloatingChip({ label, index }: { label: string; index: number }) {
  const t = useSharedValue(0);
  const side = index % 2 ? 1 : -1;
  const x0 = side * (40 + (index % 3) * 30);
  const r0 = side * 8;

  useEffect(() => {
    t.value = withDelay(
      index * 420,
      withRepeat(withTiming(1, { duration: CYCLE_MS, easing: Easing.in(Easing.quad) }), -1, false)
    );
  }, [index, t]);

  const style = useAnimatedStyle(() => {
    const p = t.value;
    const opacity = p < 0.15 ? p / 0.15 : p > 0.7 ? Math.max(0, 1 - (p - 0.7) / 0.3) : 1;
    return {
      opacity,
      transform: [
        { translateX: x0 * (1 - p) },
        { translateY: -30 + p * (STAGE_H - 96) },
        { rotate: `${r0 * (1 - p)}deg` },
        { scale: 1 - 0.4 * p },
      ],
    };
  });

  return (
    <Animated.View style={[{ position: "absolute", top: 0, left: 0, right: 0, alignItems: "center" }, style]}>
      <View
        style={{
          backgroundColor: "#ffffff",
          borderRadius: 999,
          borderWidth: 1,
          borderColor: V11.lineStrong,
          paddingHorizontal: 16,
          paddingVertical: 8,
          shadowColor: "#141028",
          shadowOffset: { width: 0, height: 4 },
          shadowRadius: 10,
          shadowOpacity: 0.06,
        }}
      >
        <Text style={{ fontSize: 14, fontWeight: "600", color: V11.sec }}>{label}</Text>
      </View>
    </Animated.View>
  );
}
