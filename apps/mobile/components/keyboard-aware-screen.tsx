import {
  Platform,
  ScrollView,
  type StyleProp,
  type ViewStyle,
} from "react-native";

/**
 * Standard text-input screen wrapper. Solves the "keyboard covers the
 * input" launch-quality bug by TRULY scrolling the focused input above the
 * keyboard (not just padding):
 *
 *   - automaticallyAdjustKeyboardInsets (iOS): insets the scroll content by
 *     the keyboard height AND scrolls the focused input into view. This
 *     replaced the old KeyboardAvoidingView `behavior="padding"` (2026-07-02)
 *     — padding lifted the container but didn't scroll a lower field into
 *     view on a long form. No-op on Android (native adjustResize handles it),
 *     so behaviour there is unchanged.
 *   - ScrollView with `flexGrow: 1` on the contentContainer so a short form
 *     still vertically centers.
 *   - keyboardShouldPersistTaps="handled" so a button tap with the keyboard
 *     up isn't eaten by the keyboard-dismiss gesture.
 *   - keyboardDismissMode="interactive" (iOS) — drag the keyboard down to
 *     dismiss.
 *
 * Apply this to any NON-OAUTH screen that contains a TextInput. Do NOT use it
 * on a screen that mounts a Google/Apple SFAuthenticationSession — a
 * ScrollView ancestor of the OAuth button re-layouts during promptAsync() and
 * tears down the auth sheet (f4297d1). Those screens use a form-scoped,
 * padding-only KeyboardAvoidingView with the OAuth buttons left outside it.
 * Don't wrap the ScrollView in TouchableWithoutFeedback — it breaks scroll.
 */
export function KeyboardAwareScreen({
  children,
  contentContainerStyle,
  style,
}: {
  children: React.ReactNode;
  /** Forwarded to ScrollView.contentContainerStyle. flexGrow: 1 is
   *  always merged in so empty content still fills the viewport. */
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Forwarded to the ScrollView `style`. Pass `flex: 1` + theme bg
   *  classes via `className` when the parent SafeAreaView isn't doing
   *  it for you. */
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <ScrollView
      style={[{ flex: 1 }, style]}
      contentContainerStyle={[{ flexGrow: 1 }, contentContainerStyle]}
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}
