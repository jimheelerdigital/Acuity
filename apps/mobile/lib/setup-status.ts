import { Platform } from "react-native";
import { ExtensionStorage } from "@bacons/apple-targets";
import { getWidgetInfo } from "react-native-android-widget";

import { ANDROID_WIDGET_NAME } from "@/lib/android-widget/snapshot";

/**
 * Setup-hub check marks (1.9.1) — "mark on first use" (Jimmy, 2026-10-15).
 *
 * iOS (written natively into the App Group, read here):
 *   - widget:       the widget extension's getTimeline ran, which only
 *                   happens for a widget placed on a Home/Lock Screen
 *                   (targets/widget/index.swift markWidgetPlaced).
 *   - actionButton: the "Start a Check-in" App Intent has run — that's the
 *                   intent the Action Button is assigned to
 *                   (plugins/RippleShortcuts.swift SetupStamp).
 *   - siri:         any other Ripple App Intent has run.
 *   iOS doesn't tell an intent whether Siri, the Action Button, Shortcuts or
 *   Spotlight ran it, so saying "start a check-in" to Siri also marks the
 *   Action Button. Once marked, a check stays.
 *
 * Android: the widget is checked live (is one placed right now). There is
 * no Siri / Action Button on Android.
 */

export type SetupStatus = {
  widget: boolean;
  actionButton: boolean;
  siri: boolean;
};

const APP_GROUP = "group.com.heelerdigital.acuity";
const storage = Platform.OS === "ios" ? new ExtensionStorage(APP_GROUP) : null;

function has(key: string): boolean {
  try {
    return storage?.get(key) != null;
  } catch {
    return false;
  }
}

export async function readSetupStatus(): Promise<SetupStatus> {
  if (Platform.OS === "android") {
    let widget = false;
    try {
      widget = (await getWidgetInfo(ANDROID_WIDGET_NAME)).length > 0;
    } catch {
      widget = false;
    }
    return { widget, actionButton: false, siri: false };
  }
  return {
    widget: has("setup.widgetSeenAt"),
    actionButton: has("setup.startDebriefAt"),
    siri: has("setup.siriAt"),
  };
}
