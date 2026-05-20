import { useEffect } from "react";
import {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

/**
 * useCountUp — Motion #3 (Stat count-up) from the design's motion
 * gallery. Tweens a numeric value from 0 to target in 850ms with
 * easeOutCubic. Returns reanimated animatedProps you spread onto the
 * Animated.Text rendering the digit.
 *
 * Pair with `fontVariant: ['tabular-nums']` to prevent digit jitter.
 *
 * Re-fires when `target` changes — pass a stable target during the
 * window you want stable. Pass `animated: false` to skip the tween
 * (render the static target immediately).
 */

const EASE_OUT_CUBIC = Easing.bezier(0.16, 0.9, 0.3, 1);
const DURATION_MS = 850;

export function useCountUp(target: number, animated = true) {
  const value = useSharedValue(animated ? 0 : target);

  useEffect(() => {
    if (!animated) {
      value.value = target;
      return;
    }
    value.value = withTiming(target, {
      duration: DURATION_MS,
      easing: EASE_OUT_CUBIC,
    });
  }, [target, animated, value]);

  // Animated.Text reads `text` from animatedProps to render the
  // current frame's value. Round to integer per design — fractional
  // intermediates during the tween read as noise on whole-number
  // stats (streak count, entries count).
  const animatedProps = useAnimatedProps(() => ({
    text: String(Math.round(value.value)),
    // Required by RN for Text — even though we override text via
    // animatedProps, the prop typing still expects defaultValue.
    defaultValue: String(Math.round(value.value)),
  }));

  return animatedProps;
}
