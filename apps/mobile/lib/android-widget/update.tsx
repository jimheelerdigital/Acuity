import { Platform } from "react-native";
import { requestWidgetUpdate } from "react-native-android-widget";

import { renderRippleWidget } from "./ripple-widget";
import {
  ANDROID_WIDGET_NAME,
  clearWidgetSnapshot,
  writeWidgetSnapshot,
  type WidgetSnapshot,
} from "./snapshot";

/** Redraw every placed Ripple widget from this snapshot. No-op off Android. */
async function redraw(snapshot: WidgetSnapshot | null): Promise<void> {
  await requestWidgetUpdate({
    widgetName: ANDROID_WIDGET_NAME,
    renderWidget: (info) =>
      renderRippleWidget(snapshot, info.width, info.height),
  });
}

export async function publishAndroidWidget(
  snapshot: WidgetSnapshot
): Promise<void> {
  if (Platform.OS !== "android") return;
  await writeWidgetSnapshot(snapshot);
  await redraw(snapshot);
}

/** Sign-out: forget the data and show the empty "Tap to reflect" state. */
export async function clearAndroidWidget(): Promise<void> {
  if (Platform.OS !== "android") return;
  await clearWidgetSnapshot();
  await redraw(null);
}
