import { type StyleProp, type ViewStyle } from "react-native";

import { KeyboardScroll } from "@/components/keyboard/keyboard-scroll";

/**
 * Standard text-input screen wrapper. Scrolls the focused input (and a
 * little space below it) above the keyboard.
 *
 *   - Built on KeyboardScroll (react-native-keyboard-controller's
 *     KeyboardAwareScrollView), 2026-10-19. Before that this used
 *     `automaticallyAdjustKeyboardInsets`, which is iOS-only; on Android
 *     edge-to-edge (SDK 54) nothing moved the input at all.
 *   - `flexGrow: 1` on the contentContainer so a short form still
 *     vertically centers.
 *   - keyboardShouldPersistTaps="handled" so a button tap with the keyboard
 *     up isn't eaten by the keyboard-dismiss gesture.
 *   - Drag the keyboard down to dismiss (iOS interactive, Android on-drag).
 *
 * Apply this to any NON-OAUTH screen that contains a TextInput. Do NOT use it
 * on a screen that mounts a Google/Apple SFAuthenticationSession — a
 * ScrollView ancestor of the OAuth button re-layouts during promptAsync() and
 * tears down the auth sheet (f4297d1). Those screens wrap only the form in
 * KeyboardSafeView with the OAuth buttons left outside it.
 * Don't wrap the scroll view in TouchableWithoutFeedback — it breaks scroll.
 */
export function KeyboardAwareScreen({
  children,
  contentContainerStyle,
  style,
}: {
  children: React.ReactNode;
  /** Forwarded to the scroll view's contentContainerStyle. flexGrow: 1 is
   *  always merged in so empty content still fills the viewport. */
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Forwarded to the scroll view `style`. */
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <KeyboardScroll
      style={[{ flex: 1 }, style]}
      contentContainerStyle={[{ flexGrow: 1 }, contentContainerStyle]}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </KeyboardScroll>
  );
}
