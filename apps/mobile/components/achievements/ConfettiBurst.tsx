/**
 * 120-particle confetti burst — RN port of the canvas confetti in
 * apps/web/src/components/achievements/CelebrationModal.tsx. Skia
 * Canvas renders the particles; Reanimated drives a per-frame
 * shared value that the Skia layer reads on each redraw.
 *
 * Parameters mirror the web reference exactly:
 *   - 120 particles
 *   - Spawn at screen center horizontally, ~42% down vertically
 *   - Each particle: angle = random 0..2π, speed = 4..13
 *   - Initial vy = sin(angle) * speed - 4 (upward boost)
 *   - Per-frame: vy += 0.16 (gravity), vx *= 0.99 (friction)
 *   - ~150-frame life with linear opacity fade
 *   - ~40% circles (radius = size/2) + ~60% rects (size × size*0.6)
 *   - Same 6-color palette: amber / coral / red / violet / orange / cream
 *
 * Lifecycle: spawns a fresh burst whenever the `key` changes (the
 * parent uses the modal's open state + slug as the key so opening a
 * new badge replays from frame 0). After ~150 frames every particle's
 * opacity hits zero — the Skia canvas still renders nothing visible
 * but the effect is gone. Sits behind the badge with
 * `pointerEvents: "none"` so it doesn't block the Continue tap.
 *
 * No iOS pod work required at install time on Expo SDK 54 — Skia's
 * podspec autolinks via expo-modules-autolinking; EAS Build picks it
 * up on the next image bake.
 */

import { useEffect, useMemo } from "react";
import { Dimensions, StyleSheet, View } from "react-native";
import { Canvas, Circle, Group, Rect } from "@shopify/react-native-skia";
import {
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
} from "react-native-reanimated";

const COLORS = [
  "#F7D595",
  "#E89653",
  "#E0533A",
  "#7C5AE0",
  "#F4A14E",
  "#FBE6C8",
];

const PARTICLE_COUNT = 120;
const LIFE_FRAMES = 150;
const GRAVITY = 0.16;
const FRICTION = 0.99;
// 16ms ≈ 60fps; multiplied into the spawn loop to convert
// reanimated's frame.timeSincePreviousFrame (ms) into "frame units"
// matching the web reference's per-rAF integer step.
const TARGET_FRAME_MS = 16;

type Particle = {
  x0: number;
  y0: number;
  vx0: number;
  vy0: number;
  rot0: number;
  vr: number;
  size: number;
  color: string;
  shape: "circle" | "rect";
};

function spawnParticles(cx: number, cy: number): Particle[] {
  const parts: Particle[] = [];
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 9;
    parts.push({
      x0: cx,
      y0: cy,
      vx0: Math.cos(angle) * speed,
      vy0: Math.sin(angle) * speed - 4,
      rot0: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      size: 5 + Math.random() * 7,
      color: COLORS[Math.floor(Math.random() * COLORS.length)] as string,
      shape: Math.random() < 0.4 ? "circle" : "rect",
    });
  }
  return parts;
}

/**
 * Closed-form per-particle position at frame `t`:
 *   x(t) = x0 + vx0 * (1 - friction^t) / (1 - friction)
 *   y(t) = y0 + vy0*t + 0.5*g*t^2 — but vx friction makes a clean
 *   integration impractical for vy as well; we sidestep that by
 *   stepping forward symbolically frame-by-frame inside the shared
 *   useDerivedValue, which is what the web canvas does too.
 *
 * Implementation: useFrameCallback advances a single sharedValue
 * `frame` counter. Each particle's derived position is computed from
 * that counter via an iterative integration on the Reanimated worklet
 * thread. 120 × 150 frames ≈ 18,000 worklet ops total — well within
 * Reanimated's per-frame budget at 60fps.
 */
export function ConfettiBurst({ visible }: { visible: boolean }) {
  const { width, height } = useMemo(() => Dimensions.get("window"), []);
  const particles = useMemo(
    () => (visible ? spawnParticles(width / 2, height * 0.42) : []),
    [visible, width, height]
  );

  const frame = useSharedValue(0);

  useEffect(() => {
    frame.value = 0;
  }, [visible, frame]);

  useFrameCallback((frameInfo) => {
    if (!visible) return;
    if (frame.value > LIFE_FRAMES) return;
    const ms = frameInfo.timeSincePreviousFrame ?? TARGET_FRAME_MS;
    frame.value = frame.value + ms / TARGET_FRAME_MS;
  }, visible);

  if (!visible) return null;

  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { width, height }]}
    >
      <Canvas style={{ flex: 1 }}>
        {particles.map((p, i) => (
          <ConfettiParticle key={i} particle={p} frame={frame} />
        ))}
      </Canvas>
    </View>
  );
}

/**
 * One particle's animated transform + opacity. Lives inside a Group
 * so a single rotate+translate stack applies to whichever primitive
 * (circle vs. rect) the particle is drawn as. The position math is
 * the iterative gravity/friction integration described above —
 * cached per-frame via useDerivedValue so the worklet only re-runs
 * when `frame` ticks.
 */
function ConfettiParticle({
  particle,
  frame,
}: {
  particle: Particle;
  frame: { value: number };
}) {
  const transform = useDerivedValue(() => {
    const t = frame.value;
    // Iterative integration on the worklet thread. Re-running this
    // loop per particle per frame is the cost we pay for parity with
    // the canvas reference; with 120 particles × ~150 frames it
    // stays comfortably under the 16ms worklet budget at 60fps.
    let x = particle.x0;
    let y = particle.y0;
    let vx = particle.vx0;
    let vy = particle.vy0;
    for (let i = 0; i < t; i++) {
      vy += GRAVITY;
      vx *= FRICTION;
      x += vx;
      y += vy;
    }
    const rot = particle.rot0 + particle.vr * t;
    return [{ translateX: x }, { translateY: y }, { rotate: rot }];
  });

  const opacity = useDerivedValue(() =>
    Math.max(0, 1 - frame.value / LIFE_FRAMES)
  );

  return (
    <Group transform={transform} opacity={opacity}>
      {particle.shape === "circle" ? (
        <Circle
          cx={0}
          cy={0}
          r={particle.size / 2}
          color={particle.color}
        />
      ) : (
        <Rect
          x={-particle.size / 2}
          y={-particle.size / 2}
          width={particle.size}
          height={particle.size * 0.6}
          color={particle.color}
        />
      )}
    </Group>
  );
}
