import { createContext, useCallback, useContext, useMemo, useRef } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

/**
 * The frame of the screen a view lives in, in the SAME coordinates that
 * `measureInWindow` returns for views inside it (2026-10-22).
 *
 * Why: on iOS, a screen presented as a sheet (expo-router
 * `presentation: "modal"`, RN <Modal presentationStyle="pageSheet">) reports
 * measureInWindow coordinates relative to the SHEET, not the phone screen.
 * KeyboardSafeView compared those against the full window height, so in a
 * sheet it thought it sat ~one sheet-inset higher than it did and padded too
 * little. Real numbers from Jimmy's phone (typed composer, build 187):
 * y=74, h=806, window 956, keyboard 347 → computed gap 76 → Save left under
 * the keyboard.
 *
 * Every presentation's bottom edge is the phone's bottom edge (full screens
 * and iOS sheets alike), so the distance from a view's bottom to its
 * screen frame's bottom, measured in one coordinate space, is exactly the
 * distance the keyboard has to travel before it reaches the view.
 *
 * Mounted for every stack screen via the root Stack's `screenLayout`, and
 * inside RN <Modal>s that host a KeyboardSafeView (a Modal is its own
 * presentation, so it needs its own frame).
 */
type FrameApi = { measureBottom: (cb: (bottom: number) => void) => void };

const ScreenFrameContext = createContext<FrameApi | null>(null);

export function ScreenFrame({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const ref = useRef<View>(null);
  const measureBottom = useCallback((cb: (bottom: number) => void) => {
    ref.current?.measureInWindow((_x, y, _w, h) => {
      if (Number.isFinite(y) && Number.isFinite(h)) cb(y + h);
    });
  }, []);
  const api = useMemo(() => ({ measureBottom }), [measureBottom]);
  return (
    <ScreenFrameContext.Provider value={api}>
      <View ref={ref} collapsable={false} style={[{ flex: 1 }, style]}>
        {children}
      </View>
    </ScreenFrameContext.Provider>
  );
}

export function useScreenFrame(): FrameApi | null {
  return useContext(ScreenFrameContext);
}
