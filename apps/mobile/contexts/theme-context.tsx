import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useColorScheme as useNativewindColorScheme } from "nativewind";

import { api } from "@/lib/api";
import { getStoredUser, getToken } from "@/lib/auth";

/**
 * Theme system — parity with the web app.
 *
 * The user has three choices: "light", "dark", or "system" (follow OS).
 * Persistence happens in two places:
 *
 *   - AsyncStorage on the device → survives app close, covers the
 *     first launch before we've authenticated.
 *   - User.theme on the server → syncs the choice across devices.
 *     Web already reads/writes this field; mobile mirrors.
 *
 * On mount: hydrate from AsyncStorage first (fastest, avoids a flash).
 * Then if the user is signed in, fetch /api/user/me and reconcile — if
 * the server has a preference we don't, honor the server.
 *
 * The "system" value resolves to the OS scheme at render time via
 * NativeWind's useColorScheme hook. Calling setColorScheme("system")
 * tells NativeWind to follow the OS going forward.
 *
 * Apply via: every React Native component in the app can use
 * `className="bg-white dark:bg-[#0B0B12]"` — NativeWind emits the
 * dark-variant style when setColorScheme lands "dark", whether from
 * explicit pick or system-resolved.
 */

export type ThemeChoice = "light" | "dark" | "system";

interface ThemeContextValue {
  /** The user's stored preference (what they explicitly picked). */
  preference: ThemeChoice;
  /**
   * The actual scheme currently in effect. If preference is "system",
   * this reflects what the OS is reporting right now.
   */
  resolved: "light" | "dark";
  setPreference: (p: ThemeChoice) => void;
}

const THEME_KEY = "acuity_theme_preference";

const ThemeContext = createContext<ThemeContextValue>({
  preference: "system",
  resolved: "dark",
  setPreference: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { colorScheme, setColorScheme } = useNativewindColorScheme();
  const [preference, setPreferenceState] = useState<ThemeChoice>("system");

  // Hydrate from local storage on first mount. Also pull the DB value
  // if the user's auth token is already present (cross-device sync).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(THEME_KEY);
        if (cancelled) return;
        if (stored === "light" || stored === "dark" || stored === "system") {
          setPreferenceState(stored);
          setColorScheme(stored);
        }

        // Cross-device: if signed in, read the DB preference. The
        // cached user in SecureStore was written at last sign-in and
        // may carry a .theme field once the server starts returning it.
        const token = await getToken();
        if (!token) return;
        const cached = await getStoredUser();
        const dbTheme = (cached as { theme?: string | null } | null)?.theme;
        if (
          typeof dbTheme === "string" &&
          (dbTheme === "light" || dbTheme === "dark") &&
          stored == null
        ) {
          // DB has a preference but local doesn't — honor server.
          setPreferenceState(dbTheme);
          setColorScheme(dbTheme);
          await AsyncStorage.setItem(THEME_KEY, dbTheme);
        }
      } catch {
        // AsyncStorage failure is non-fatal — default to "system" and
        // whatever NativeWind resolves from the OS.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setPreference = useCallback(
    (next: ThemeChoice) => {
      setPreferenceState(next);
      setColorScheme(next);
      // Fire-and-forget persistence — failures don't block the UI.
      AsyncStorage.setItem(THEME_KEY, next).catch(() => {});
      (async () => {
        const token = await getToken();
        if (!token) return;
        try {
          await api.post<{ ok: boolean }>("/api/user/theme", {
            theme: next,
          });
        } catch {
          // Non-fatal — local state is still applied.
        }
      })();
    },
    [setColorScheme]
  );

  const resolved: "light" | "dark" = colorScheme === "dark" ? "dark" : "light";

  return (
    <ThemeContext.Provider value={{ preference, resolved, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
