import type { WidgetTaskHandlerProps } from "react-native-android-widget";

import { renderRippleWidget } from "./ripple-widget";
import { ANDROID_WIDGET_NAME, readWidgetSnapshot } from "./snapshot";

/**
 * Runs in a headless JS task when the launcher asks for the widget —
 * added, periodic update, resized. Reads the last snapshot the app wrote
 * and redraws. Taps don't come through here: the root uses OPEN_URI, which
 * the library opens natively (straight into the recorder).
 */
export async function rippleWidgetTaskHandler(
  props: WidgetTaskHandlerProps
): Promise<void> {
  const { widgetInfo, widgetAction, renderWidget } = props;
  if (widgetInfo.widgetName !== ANDROID_WIDGET_NAME) return;

  switch (widgetAction) {
    case "WIDGET_ADDED":
    case "WIDGET_UPDATE":
    case "WIDGET_RESIZED": {
      const snapshot = await readWidgetSnapshot();
      renderWidget(
        renderRippleWidget(snapshot, widgetInfo.width, widgetInfo.height)
      );
      break;
    }
    default:
      break;
  }
}
