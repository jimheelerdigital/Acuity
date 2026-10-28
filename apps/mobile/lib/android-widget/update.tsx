import { Platform } from "react-native";
import { requestWidgetUpdate } from "react-native-android-widget";

import { renderRippleWidget } from "./ripple-widget";
import {
  ANDROID_WIDGET_NAME,
  clearWidgetSnapshot,
  readWidgetAccent,
  readWidgetSnapshot,
  writeWidgetAccent,
  writeWidgetSnapshot,
  type WidgetSnapshot,
} from "./snapshot";

/** Redraw every placed Ripple widget from this snapshot. No-op off Android. */
async function redraw(snapshot: WidgetSnapshot | null): Promise<void> {
  const accent = await readWidgetAccent();
  await requestWidgetUpdate({
    widgetName: ANDROID_WIDGET_NAME,
    renderWidget: (info) =>
      renderRippleWidget(snapshot, info.width, info.height, accent),
  });
}

/** Palette changed (2026-10-28): store the accent and redraw. No-op off Android. */
export async function publishAndroidWidgetAccent(hex: string): Promise<void> {
  if (Platform.OS !== "android") return;
  if ((await readWidgetAccent()) === hex) return;
  await writeWidgetAccent(hex);
  await redraw(await readWidgetSnapshot());
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
