import { Platform } from "react-native";
import { registerWidgetTaskHandler } from "react-native-android-widget";

import { rippleWidgetTaskHandler } from "./lib/android-widget/task-handler";

// Android home-screen widget: the launcher wakes a headless JS task to draw
// it (added / periodic update / resized), so the handler has to be
// registered at the entry point, before the app itself loads.
if (Platform.OS === "android") {
  registerWidgetTaskHandler(rippleWidgetTaskHandler);
}

import "expo-router/entry";
