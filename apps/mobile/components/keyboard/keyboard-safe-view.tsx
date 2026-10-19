import { useCallback, useRef } from "react";
import {
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";

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
}) {
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();
  const { height: windowHeight } = useWindowDimensions();
  const ref = useRef<View>(null);
  // Distance from this view's bottom edge to the bottom of the window,
  // measured on layout. The padding is applied to an INNER view, so it
  // never changes the outer frame we measure.
  const gapBelow = useSharedValue(0);

  const onLayout = useCallback(() => {
    ref.current?.measureInWindow((_x, y, _w, h) => {
      if (Number.isFinite(y) && Number.isFinite(h)) {
        gapBelow.value = Math.max(0, windowHeight - (y + h));
      }
    });
  }, [gapBelow, windowHeight]);

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
