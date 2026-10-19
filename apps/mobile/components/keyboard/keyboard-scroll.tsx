import { forwardRef } from "react";
import { Platform, type ScrollView, type ScrollViewProps } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

/**
 * The app's ScrollView for any screen with a text field. Drop-in for
 * <ScrollView>: same props, plus it keeps the FOCUSED field (and
 * `bottomOffset` points below it) above the keyboard, and adds the
 * keyboard's height as scrollable space so the last field and the buttons
 * under it can always be scrolled into view.
 *
 * Replaces `automaticallyAdjustKeyboardInsets`, which is iOS-only and does
 * nothing on Android once the app is edge-to-edge (SDK 54 +
 * keyboard-controller), and the per-screen KeyboardAvoidingView guesses.
 * Requires <KeyboardProvider> at the app root (app/_layout.tsx).
 */
export const KeyboardScroll = forwardRef<ScrollView, ScrollViewProps & { bottomOffset?: number }>(
  function KeyboardScroll({ bottomOffset = 32, children, ...props }, ref) {
    return (
      <KeyboardAwareScrollView
        // keyboard-controller types its ref as its own ScrollView handle.
        ref={ref as never}
        bottomOffset={bottomOffset}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        {...props}
      >
        {children}
      </KeyboardAwareScrollView>
    );
  },
);
