import { useEffect, useMemo } from "react";
import { useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { useTheme } from "@/contexts/theme-context";

/**
 * Confetti — one-shot finish-day celebration burst (motion gallery #5).
 *
 * Hand-rolled with Reanimated — no external lib per Slice Q8 directive.
 * 18 particles fan upward from `origin`, follow a ballistic trajectory
 * (gravity pulls them back down), rotate continuously, and fade out
 * over the last 40% of the 1400ms duration.
 *
 * Architecture: one shared value `progress` drives the whole burst
 * 0 → 1 over 1400ms. Each particle has its own random launch params
 * (captured at mount via useMemo). Per-particle useAnimatedStyle
 * reads `progress` + the captured params to compute position +
 * rotation + opacity. 18 worklets per frame; trivial cost.
 *
 * `visible` is the trigger latch. Setting it true starts the
 * animation; `onComplete` fires when the 1400ms timing completes
 * and is responsible for setting `visible` back to false so the
 * component fully unmounts (or the captured params can be re-rolled
 * on the next show).
 *
 * Particles render via an absolute-position View at the burst
 * origin; each particle's transform translates from origin to its
 * current ballistic position. The container has pointerEvents="none"
 * so taps pass through to anything underneath.
 */

const PARTICLE_COUNT = 18;
const DURATION_MS = 1400;
const DURATION_S = DURATION_MS / 1000;
const GRAVITY = 360; // px/s², tuned so peak excursion ≈ 220px before falling

// Per spec: half rounded / half square; sizes 5-9px; angles fan
// upward in [-153°, -27°] (atan2 convention, screen-coords y-down),
// velocity 90-170 px/s, rotation ±360° initial offset + continuous spin.

interface Particle {
  id: number;
  vx: number;
  vy: number;
  size: number;
  rounded: boolean;
  color: string;
  initialRotation: number;
  spin: number; // degrees per second
}

function generateParticles(
  primary: string,
  secondary: string,
  good: string
): Particle[] {
  // Confetti palette per the design's brief: primary/secondary/good +
  // a warm amber + a warm red. Pulled mostly from tokens; the two
  // warm constants are intentional fixed accents that pop against
  // any palette without needing extra token math.
  const palette = [primary, secondary, good, "#f59e0b", "#ef4444"];
  const out: Particle[] = [];
  for (let i = 0; i < PARTICLE_COUNT; i += 1) {
    // Angle in [-153°, -27°] → upward fan (left of straight up to
    // right of straight up). atan2 convention: 0 = right, negative
    // angles rotate counterclockwise (upward in screen coords).
    const angleDeg = -27 - Math.random() * (153 - 27);
    const angleRad = (angleDeg * Math.PI) / 180;
    const velocity = 90 + Math.random() * 80;
    out.push({
      id: i,
      vx: Math.cos(angleRad) * velocity,
      vy: Math.sin(angleRad) * velocity, // negative initially (upward)
      size: 5 + Math.random() * 4,
      rounded: Math.random() < 0.5,
      color: palette[Math.floor(Math.random() * palette.length)],
      initialRotation: Math.random() * 360 - 180,
      spin: (Math.random() - 0.5) * 720, // ±360°/s
    });
  }
  return out;
}

export interface ConfettiProps {
  visible: boolean;
  /** Screen-coord origin of the burst. Defaults to ~30% from top, centered. */
  origin?: { x: number; y: number };
  /** Fires when the 1400ms animation completes. Caller should set visible=false here. */
  onComplete?: () => void;
}

export function Confetti({ visible, origin, onComplete }: ConfettiProps) {
  const { tokens } = useTheme();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const burstX = origin?.x ?? screenWidth / 2;
  const burstY = origin?.y ?? screenHeight * 0.35;

  const progress = useSharedValue(0);

  // Particles are stable across rerenders while visible — re-rolled
  // each time the burst restarts (key off `visible` toggle).
  const particles = useMemo(
    () => generateParticles(tokens.primary, tokens.secondary, tokens.good),
    // Re-roll when visible flips from false→true so each burst is
    // visually distinct. Token deps are included so a palette swap
    // mid-burst doesn't desync colors.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, tokens.primary, tokens.secondary, tokens.good]
  );

  useEffect(() => {
    if (!visible) return;
    progress.value = 0;
    progress.value = withTiming(
      1,
      {
        duration: DURATION_MS,
        // cubic-bezier(.2, .6, .4, 1) per spec — slow start, fast
        // arc, soft trail.
        easing: Easing.bezier(0.2, 0.6, 0.4, 1),
      },
      (finished) => {
        if (finished && onComplete) {
          runOnJS(onComplete)();
        }
      }
    );
  }, [visible, progress, onComplete]);

  if (!visible) return null;

  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 100,
      }}
    >
      {particles.map((p) => (
        <Particle
          key={`${visible}-${p.id}`}
          particle={p}
          progress={progress}
          burstX={burstX}
          burstY={burstY}
        />
      ))}
    </View>
  );
}

function Particle({
  particle,
  progress,
  burstX,
  burstY,
}: {
  particle: Particle;
  progress: SharedValue<number>;
  burstX: number;
  burstY: number;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const t = progress.value * DURATION_S; // seconds
    const dx = particle.vx * t;
    const dy = particle.vy * t + 0.5 * GRAVITY * t * t;
    const rotation = particle.initialRotation + particle.spin * t;
    // Opacity: full until 60% of duration, then linear to 0.
    const fadeStart = 0.6;
    const opacity =
      progress.value < fadeStart
        ? 1
        : Math.max(0, 1 - (progress.value - fadeStart) / (1 - fadeStart));
    return {
      transform: [
        { translateX: dx },
        { translateY: dy },
        { rotate: `${rotation}deg` },
      ],
      opacity,
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: burstX - particle.size / 2,
          top: burstY - particle.size / 2,
          width: particle.size,
          height: particle.size,
          borderRadius: particle.rounded ? particle.size / 2 : 1,
          backgroundColor: particle.color,
        },
        animatedStyle,
      ]}
    />
  );
}
