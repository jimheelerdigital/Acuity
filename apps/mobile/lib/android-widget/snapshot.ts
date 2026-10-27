import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * The data the Android home-screen widget draws from.
 *
 * Android widgets are drawn by the launcher, often while the app is closed,
 * so the widget can't call the API or read React state. The app writes this
 * snapshot whenever habits load or change (see lib/widget-data.ts), and the
 * widget task handler reads it back to redraw. Same fields the iOS widget
 * reads from its App Group: a streak and today's habits.
 */
export const ANDROID_WIDGET_NAME = "RippleToday";

const KEY = "ripple.androidWidget.v1";

export interface WidgetHabit {
  name: string;
  done: boolean;
  /** This habit's current streak in days (absent in older snapshots). */
  streak?: number;
}

export interface WidgetSnapshot {
  /** Best current streak among today's habits. */
  streak: number;
  habits: WidgetHabit[];
  /** Local date (YYYY-MM-DD) the habits list was computed for. */
  localDate: string;
}

export async function writeWidgetSnapshot(s: WidgetSnapshot): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(s));
}

export async function readWidgetSnapshot(): Promise<WidgetSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WidgetSnapshot>;
    if (typeof parsed.streak !== "number" || !Array.isArray(parsed.habits)) {
      return null;
    }
    return {
      streak: parsed.streak,
      habits: parsed.habits
        .filter((h): h is WidgetHabit => !!h && typeof h.name === "string")
        .map((h) => ({
          name: h.name,
          done: !!h.done,
          ...(typeof h.streak === "number" ? { streak: h.streak } : {}),
        })),
      localDate: typeof parsed.localDate === "string" ? parsed.localDate : "",
    };
  } catch {
    return null;
  }
}

/** Clear on sign-out so the next person on the device never sees it. */
export async function clearWidgetSnapshot(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
