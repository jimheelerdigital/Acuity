import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  type StyleProp,
  type ViewStyle,
} from "react-native";

/**
 * Standard text-input screen wrapper. Solves the "keyboard covers
 * the input" launch-quality bug by combining:
 *
 *   - KeyboardAvoidingView with the iOS-correct "padding" behavior
 *     (Android handles this via window soft-input mode; we leave
 *     `behavior` undefined there)
 *   - ScrollView with `flexGrow: 1` on the contentContainer so a
 *     short form still vertically centers like it did pre-wrap
 *   - keyboardShouldPersistTaps="handled" so a button tap with the
 *     keyboard up doesn't get eaten by the keyboard-dismiss gesture
 *   - keyboardDismissMode="interactive" (iOS) — drag the keyboard
 *     area down to dismiss
 *
 * Apply this to any screen that contains a TextInput. Don't wrap
 * the ScrollView in TouchableWithoutFeedback — it breaks scroll
 * gestures. The interactive dismiss handles "I want the keyboard
 * gone" without sacrificing scrollability.
 *
 * `keyboardVerticalOffset` is exposed because nested screens
 * sometimes need to compensate for a parent navigation header.
 * The auth screens are full-bleed (no header) so the default 0 is
 * correct there. Inside a navigator with a header, pass the header
 * height.
 */
export function KeyboardAwareScreen({
  children,
  contentContainerStyle,
  keyboardVerticalOffset = 0,
  style,
}: {
  children: React.ReactNode;
  /** Forwarded to ScrollView.contentContainerStyle. flexGrow: 1 is
   *  always merged in so empty content still fills the viewport. */
  contentContainerStyle?: StyleProp<ViewStyle>;
  keyboardVerticalOffset?: number;
  /** Forwarded to the outer KeyboardAvoidingView. Pass `flex: 1`
   *  + theme bg classes via `className` when the parent
   *  SafeAreaView isn't doing it for you. */
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <KeyboardAvoidingView
      style={[{ flex: 1 }, style]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      <ScrollView
        contentContainerStyle={[{ flexGrow: 1 }, contentContainerStyle]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={
          Platform.OS === "ios" ? "interactive" : "on-drag"
        }
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
