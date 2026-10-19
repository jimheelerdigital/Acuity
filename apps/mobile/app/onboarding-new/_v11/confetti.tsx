import { useEffect, useMemo } from "react";
import { Dimensions, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

/**
 * Full-screen confetti burst (Miro #8: "yes button they click that confetti
 * explodes the screen"). Pure reanimated — no new native dependency, so it
 * ships over the air. Pieces shoot up from `origin`, then fall past the
 * bottom of the screen with a little drift and spin.
 */
const COLORS = ["#FFAA84", "#F08A64", "#DC7553", "#F5B83D", "#2FB574", "#7C8CF8", "#FF6FA5", "#6CC7F5"];
const COUNT = 90;

export function ConfettiBurst({ origin }: { origin: { x: number; y: number } }) {
  const { width, height } = Dimensions.get("window");
  const pieces = useMemo(
    () =>
      Array.from({ length: COUNT }, (_, i) => {
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
        const power = 0.55 + Math.random() * 0.6;
        return {
          key: i,
          color: COLORS[i % COLORS.length],
          w: 7 + Math.random() * 6,
          h: 10 + Math.random() * 8,
          round: Math.random() < 0.3,
          vx: Math.cos(angle) * width * 0.75 * power,
          peak: Math.sin(angle) * height * 0.55 * power,
          drift: (Math.random() - 0.5) * 120,
          spin: (Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 720),
          delay: Math.random() * 120,
          dur: 1500 + Math.random() * 900,
        };
      }),
    [width, height]
  );
  return (
    <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, width, height }}>
      {pieces.map((p) => (
        <Piece key={p.key} p={p} origin={origin} fall={height - origin.y + 60} />
      ))}
    </View>
  );
}

type P = {
  color: string; w: number; h: number; round: boolean; vx: number; peak: number;
  drift: number; spin: number; delay: number; dur: number;
};

function Piece({ p, origin, fall }: { p: P; origin: { x: number; y: number }; fall: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(p.delay, withTiming(1, { duration: p.dur, easing: Easing.linear }));
  }, [p, t]);
  const style = useAnimatedStyle(() => {
    const k = t.value;
    // Up fast to the peak (first 30%), then fall with gravity.
    const up = Math.min(1, k / 0.3);
    const yUp = p.peak * (1 - (1 - up) * (1 - up));
    const down = Math.max(0, (k - 0.3) / 0.7);
    const y = yUp + (fall - p.peak) * down * down;
    const x = p.vx * Math.min(1, k * 1.4) + p.drift * down;
    return {
      opacity: k > 0.85 ? (1 - k) / 0.15 : 1,
      transform: [{ translateX: x }, { translateY: y }, { rotate: `${p.spin * k}deg` }, { rotateX: `${p.spin * 0.6 * k}deg` }],
    };
  });
  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: origin.x - p.w / 2,
          top: origin.y - p.h / 2,
          width: p.w,
          height: p.round ? p.w : p.h,
          borderRadius: p.round ? p.w / 2 : 2,
          backgroundColor: p.color,
        },
        style,
      ]}
    />
  );
}
