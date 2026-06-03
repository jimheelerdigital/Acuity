import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useColorScheme as useNativewindColorScheme } from "nativewind";

import { api } from "@/lib/api";
import { getStoredUser, getToken } from "@/lib/auth";
import {
  ACUITY_ACCENT_PRESETS,
  makeAcuityTokens,
  type AcuityAccent,
  type AcuityTokens,
} from "@/lib/theme/tokens";

/**
 * Theme system — extended for visual refresh v2 (Slice Q1, 2026-05-19).
 *
 * The user has three choices for mode: "light", "dark", or "system"
 * (follow OS). They also have four palette choices: coral (default),
 * sunset, citrus, cobalt. Persistence:
 *
 *   - AsyncStorage on device:
 *       - "acuity.mode" — new key (Q1). Stores light|dark|system.
 *       - "acuity_theme_preference" — legacy key (pre-Q1). Same values.
 *       - "acuity.palette" — new key (Q1). Stores coral|sunset|citrus|cobalt.
 *   - User.theme on server — syncs mode across devices (web parity).
 *     Palette cross-device sync ships in Q2 alongside a new
 *     User.themePalette column. For Q1 the palette is device-local.
 *
 * Migration strategy (dual-read + dual-write):
 *   - On boot: prefer "acuity.mode". Fall back to legacy
 *     "acuity_theme_preference" if new is missing; on first such read
 *     we copy old→new so subsequent boots are clean.
 *   - On change: write to BOTH keys for builds 45, 46, 47.
 *     Build 48 stops writing legacy; build 49+ removes the read fallback.
 *
 * Tokens: `makeAcuityTokens({ dark, accent })` returns the full
 * v2 token set. The hook memoizes by (resolvedMode, palette) so a
 * single render only does the ~30 culori conversions once.
 *
 * Backwards-compat: the original useTheme() shape ({ preference,
 * resolved, setPreference }) is preserved. New consumers can read
 * tokens + palette via the same hook.
 */

export type ThemeChoice = "light" | "dark" | "system";

interface ThemeContextValue {
  /** The user's stored mode preference (what they explicitly picked). */
  preference: ThemeChoice;
  /**
   * The actual scheme currently in effect. If preference is "system",
   * this reflects what the OS is reporting right now.
   */
  resolved: "light" | "dark";
  setPreference: (p: ThemeChoice) => void;
  /** Active palette accent. */
  palette: AcuityAccent;
  setPalette: (p: AcuityAccent) => void;
  /** Resolved v2 design tokens. Re-derived when mode or palette changes. */
  tokens: AcuityTokens;
}

const MODE_KEY = "acuity.mode";
const PALETTE_KEY = "acuity.palette";
// Legacy key from pre-Q1. Read-only fallback during dual-read window
// (builds 45-48); fully removed in build 49+.
const LEGACY_MODE_KEY = "acuity_theme_preference";

function isThemeChoice(v: unknown): v is ThemeChoice {
  return v === "light" || v === "dark" || v === "system";
}

function isAccent(v: unknown): v is AcuityAccent {
  return (
    typeof v === "string" &&
    Object.prototype.hasOwnProperty.call(ACUITY_ACCENT_PRESETS, v)
  );
}

const DEFAULT_PALETTE: AcuityAccent = "coral";
const DEFAULT_TOKENS = makeAcuityTokens({
  dark: true,
  accent: DEFAULT_PALETTE,
});

const ThemeContext = createContext<ThemeContextValue>({
  preference: "light",
  resolved: "light",
  setPreference: () => {},
  palette: DEFAULT_PALETTE,
  setPalette: () => {},
  tokens: DEFAULT_TOKENS,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { colorScheme, setColorScheme } = useNativewindColorScheme();
  // v1.3 (2026-06-03): default to "light" for net-new users with no
  // stored preference. Existing users (any AsyncStorage value, or a
  // server-side User.theme) keep what they had — see hydrate effect
  // below for the precedence order.
  const [preference, setPreferenceState] = useState<ThemeChoice>("light");
  const [palette, setPaletteState] =
    useState<AcuityAccent>(DEFAULT_PALETTE);

  // Hydrate from local storage on first mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // ─── Mode: dual-read with legacy fallback ────────────────
        const newMode = await AsyncStorage.getItem(MODE_KEY);
        if (cancelled) return;

        let resolvedPref: ThemeChoice | null = null;
        if (isThemeChoice(newMode)) {
          resolvedPref = newMode;
        } else {
          // No new key — try legacy.
          const legacy = await AsyncStorage.getItem(LEGACY_MODE_KEY);
          if (cancelled) return;
          if (isThemeChoice(legacy)) {
            resolvedPref = legacy;
            // One-shot migration: copy legacy → new so future boots
            // are clean and dual-write keeps both in sync.
            AsyncStorage.setItem(MODE_KEY, legacy).catch(() => {});
          }
        }
        if (resolvedPref) {
          setPreferenceState(resolvedPref);
          setColorScheme(resolvedPref);
        } else {
          // No stored preference anywhere — net-new install. v1.3
          // defaults to light. Apply but do NOT persist, so a user
          // who later picks "system" from settings still has system
          // win over the default.
          setColorScheme("light");
        }

        // ─── Palette: new key only (no legacy to migrate from) ──
        const storedPalette = await AsyncStorage.getItem(PALETTE_KEY);
        if (cancelled) return;
        let resolvedPalette: AcuityAccent | null = null;
        if (isAccent(storedPalette)) {
          resolvedPalette = storedPalette;
          setPaletteState(storedPalette);
        }

        // ─── Cross-device sync from server ───────────────────────
        // Mode + palette both sync; haptics stays device-local per
        // Slice Q2 directive (contextual preference, makes sense to
        // differ per device).
        const token = await getToken();
        if (!token) return;
        const cached = await getStoredUser();
        const cachedAsTheme = cached as
          | { theme?: string | null; themePalette?: string | null }
          | null;
        const dbTheme = cachedAsTheme?.theme;
        const dbPalette = cachedAsTheme?.themePalette;
        if (
          typeof dbTheme === "string" &&
          (dbTheme === "light" || dbTheme === "dark") &&
          resolvedPref == null
        ) {
          setPreferenceState(dbTheme);
          setColorScheme(dbTheme);
          AsyncStorage.setItem(MODE_KEY, dbTheme).catch(() => {});
          AsyncStorage.setItem(LEGACY_MODE_KEY, dbTheme).catch(() => {});
        }
        if (isAccent(dbPalette) && resolvedPalette == null) {
          setPaletteState(dbPalette);
          AsyncStorage.setItem(PALETTE_KEY, dbPalette).catch(() => {});
        }
      } catch {
        // AsyncStorage failure is non-fatal — defaults already applied.
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
      // Dual-write during the migration window (builds 45-47). Both
      // writes are fire-and-forget; failures don't block the UI.
      AsyncStorage.setItem(MODE_KEY, next).catch(() => {});
      AsyncStorage.setItem(LEGACY_MODE_KEY, next).catch(() => {});
      (async () => {
        const token = await getToken();
        if (!token) return;
        try {
          await api.post<{ ok: boolean }>("/api/user/theme", { theme: next });
        } catch {
          // Non-fatal — local state is still applied.
        }
      })();
    },
    [setColorScheme]
  );

  const setPalette = useCallback((next: AcuityAccent) => {
    setPaletteState(next);
    AsyncStorage.setItem(PALETTE_KEY, next).catch(() => {});
    // Cross-device sync via the extended /api/user/theme endpoint
    // (Slice Q2). Fire-and-forget — failures don't block the UI;
    // local state is already applied so the user sees the change.
    (async () => {
      const token = await getToken();
      if (!token) return;
      try {
        await api.post<{ ok: boolean }>("/api/user/theme", { palette: next });
      } catch {
        // Non-fatal — local state stands.
      }
    })();
  }, []);

  const resolved: "light" | "dark" =
    colorScheme === "dark" ? "dark" : "light";

  // Memoize tokens by (resolved, palette). Re-derive only when one
  // changes. Each derivation is ~30 culori conversions — fast, but
  // not free, so we don't redo it every render.
  const tokens = useMemo(
    () => makeAcuityTokens({ dark: resolved === "dark", accent: palette }),
    [resolved, palette]
  );

  return (
    <ThemeContext.Provider
      value={{
        preference,
        resolved,
        setPreference,
        palette,
        setPalette,
        tokens,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
