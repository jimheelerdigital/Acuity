import { useCallback, useRef } from "react";
import { trackOnboardingEvent } from "@/lib/onboarding-events";
import {
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useKeyboardHandler, useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from "react-native-reanimated";

/**
 * A container that keeps its bottom edge above the keyboard. Put a screen's
 * input + action buttons inside it and the buttons ride on top of the
 * keyboard instead of disappearing under it.
 *
 * Why not React Native's KeyboardAvoidingView (Jimmy, 10/19 on build 183:
 * the typing screen's Save button sat under the keyboard): RN's version
 * needs a hand-tuned `keyboardVerticalOffset` equal to everything above the
 * view (header, sheet inset, status bar). The typed composer guessed 96;
 * on a real phone that guess was wrong, and every screen guessed
 * differently. This view measures ITSELF in window coordinates and pads by
 * exactly how much the keyboard overlaps it, so there is no offset to tune
 * and it is right in a modal, under a header, above the home indicator, or
 * on Android edge-to-edge.
 *
 * Keyboard height comes from react-native-keyboard-controller, which tracks
 * the keyboard frame-by-frame (including iOS interactive dismiss), so the
 * padding moves with the keyboard rather than jumping. Requires
 * <KeyboardProvider> at the app root (app/_layout.tsx).
 */
export function KeyboardSafeView({
  children,
  style,
  extraSpace = 8,
  fill = true,
  diagnosticsName,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Gap kept between the content's bottom and the keyboard's top. */
  extraSpace?: number;
  /**
   * true (default): fills its parent (flex: 1) — a screen or a full-height
   * sheet. false: sizes to its content — a bottom sheet pinned with
   * justify-end, which then rises by the keyboard overlap.
   */
  fill?: boolean;
  /**
   * When set, reports the measured geometry once per mount while the
   * keyboard is open (event app_keyboard_layout). Used to verify the
   * maths on real phones (2026-10-22: Save still under the keyboard in
   * the typed composer on build 187).
   */
  diagnosticsName?: string;
}) {
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();
  const { height: windowHeight } = useWindowDimensions();
  const ref = useRef<View>(null);
  // Distance from this view's bottom edge to the bottom of the window,
  // measured on layout. The padding is applied to an INNER view, so it
  // never changes the outer frame we measure.
  const gapBelow = useSharedValue(0);

  const reported = useRef(false);

  const measure = useCallback(
    (keyboardOpenHeight?: number) => {
      ref.current?.measureInWindow((_x, y, _w, h) => {
        if (!Number.isFinite(y) || !Number.isFinite(h)) return;
        const gap = Math.max(0, windowHeight - (y + h));
        gapBelow.value = gap;
        if (diagnosticsName && keyboardOpenHeight && !reported.current) {
          reported.current = true;
          void trackOnboardingEvent("app_keyboard_layout", {
            metadata: {
              view: diagnosticsName,
              y: Math.round(y),
              h: Math.round(h),
              window_h: Math.round(windowHeight),
              keyboard_h: Math.round(keyboardOpenHeight),
              gap: Math.round(gap),
            },
          });
        }
      });
    },
    [gapBelow, windowHeight, diagnosticsName]
  );

  const onLayout = useCallback(() => measure(), [measure]);

  // Re-measure every time the keyboard finishes opening. A single onLayout
  // measurement can be stale: it may run while a modal sheet is still
  // animating in, or before a parent settles, and the outer frame doesn't
  // change afterwards so onLayout never fires again (build 187: Save sat
  // under the keyboard in the typed composer).
  useKeyboardHandler(
    {
      onEnd: (e) => {
        "worklet";
        if (e.height > 0) runOnJS(measure)(e.height);
      },
    },
    [measure]
  );

  const padStyle = useAnimatedStyle(() => {
    // keyboard-controller reports height as a negative translate when open.
    const kb = Math.abs(keyboardHeight.value);
    const overlap = kb - gapBelow.value;
    return { paddingBottom: overlap > 0 ? overlap + Math.min(extraSpace, overlap) : 0 };
  });

  return (
    <View ref={ref} onLayout={onLayout} collapsable={false} style={[fill ? { flex: 1 } : null, style]}>
      <Animated.View style={[fill ? { flex: 1 } : null, padStyle]}>{children}</Animated.View>
    </View>
  );
}
