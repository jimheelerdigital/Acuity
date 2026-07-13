import { useEffect, useRef } from "react";
import { Animated, Easing, Image, View } from "react-native";

import { useTheme } from "@/contexts/theme-context";

/**
 * RippleRingBurst — Ripple brand motif for the processing/uploading
 * state of the recording screen (STAGE 6 rebrand, branding/visual).
 *
 * A small raindrop mark centered inside a stack of concentric rings
 * that scale outward (≈0.12 → 1.0) and fade (opacity 0 → ~0.55 → 0),
 * evoking a drop landing in water. Purely decorative — carries no
 * recording/processing logic; it's rendered alongside the existing
 * ProcessingProgressBar, which still owns all phase/state signals.
 *
 * Everything is token-driven so both light and dark resolve correctly:
 *   - Rings tint with `tokens.primary` (the active accent).
 *   - The raindrop uses `ripple-mark-white.png` in dark mode (reads on
 *     the lifted-charcoal surface) and `ripple-mark-coral.png` in
 *     light mode (accent on the near-white surface). No hardcoded hex.
 *
 * Animation: three ring layers, each an Animated.loop of a single
 * driver value (0 → 1) staggered by a third of the cycle so a new
 * ring is always emerging as the previous ones fade. Uses the RN
 * Animated API (native driver) — matching the surrounding recording
 * screen / ProcessingProgressBar conventions.
 */

// require() (not import) — this repo has no ambient `*.png` module
// declaration, so the import form fails typecheck while require()
// resolves to `any`. Metro bundles the asset either way.
const MARK_WHITE = require("@/assets/brand/ripple-mark-white.png");
const MARK_CORAL = require("@/assets/brand/ripple-mark-coral.png");

const RING_COUNT = 3;
const CYCLE_MS = 2600;
const RING_MAX = 148; // outer diameter at full expansion
const START_SCALE = 0.12;

export interface RippleRingBurstProps {
  /** Overall footprint (square). Rings expand up to RING_MAX within it. */
  size?: number;
  /** Raindrop mark size. */
  markSize?: number;
}

export function RippleRingBurst({
  size = 160,
  markSize = 40,
}: RippleRingBurstProps) {
  const { tokens } = useTheme();
  // One driver per ring, staggered so the burst reads as continuous.
  const drivers = useRef(
    Array.from({ length: RING_COUNT }, () => new Animated.Value(0))
  ).current;

  useEffect(() => {
    const loops = drivers.map((driver, i) => {
      const loop = Animated.loop(
        Animated.timing(driver, {
          toValue: 1,
          duration: CYCLE_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        })
      );
      // Stagger the start of each ring by an even fraction of the cycle.
      const delay = (CYCLE_MS / RING_COUNT) * i;
      const timeout = setTimeout(() => loop.start(), delay);
      return { loop, timeout };
    });
    return () => {
      loops.forEach(({ loop, timeout }) => {
        clearTimeout(timeout);
        loop.stop();
      });
    };
  }, [drivers]);

  const markSource = tokens.mode === "dark" ? MARK_WHITE : MARK_CORAL;

  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {drivers.map((driver, i) => {
        const scale = driver.interpolate({
          inputRange: [0, 1],
          outputRange: [START_SCALE, 1],
        });
        // Fade 0 → ~0.55 → 0 across the expansion.
        const opacity = driver.interpolate({
          inputRange: [0, 0.5, 1],
          outputRange: [0, 0.55, 0],
        });
        return (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={{
              position: "absolute",
              width: RING_MAX,
              height: RING_MAX,
              borderRadius: RING_MAX / 2,
              borderWidth: 2,
              borderColor: tokens.primary,
              opacity,
              transform: [{ scale }],
            }}
          />
        );
      })}

      {/* Centered raindrop mark — sits above the rings. */}
      <Image
        source={markSource}
        style={{ width: markSize, height: markSize }}
        resizeMode="contain"
      />
    </View>
  );
}
