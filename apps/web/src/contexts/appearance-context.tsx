"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

/**
 * AppearanceProvider — web-side theme + palette state.
 *
 * Replaces `next-themes` for Ripple surfaces. next-themes only knows
 * about `theme`; we also need `palette` (coral/sunset/citrus/cobalt)
 * and the `data-theme` / `data-palette` attribute pair on `<html>`.
 * Building our own provider keeps both concerns in a single context.
 *
 * SSR hydration:
 *
 *   1. The server reads `User.theme` + `User.themePalette` in
 *      `apps/web/src/app/layout.tsx` and renders `<html data-theme=
 *      "X" data-palette="Y">` on first paint.
 *   2. This provider mounts on the client with `initialTheme` +
 *      `initialPalette` matching those server values, so the React
 *      tree doesn't fight the server-rendered HTML.
 *   3. On `theme === "system"`, the provider attaches a
 *      `matchMedia('(prefers-color-scheme: dark)')` listener and
 *      flips the resolved `data-theme` attribute on `<html>` when
 *      the OS preference changes.
 *
 * Persistence:
 *
 *   Setters call `POST /api/user/theme` (the existing mobile-shared
 *   endpoint — see route.ts there for the contract). The endpoint
 *   accepts `{ theme?: "light"|"dark"|"system", palette?: "coral"|
 *   "sunset"|"citrus"|"cobalt" }`. `theme: "system"` stores NULL on
 *   the User row.
 *
 *   Optimistic — the data-* attribute flips immediately; the POST
 *   is fire-and-forget. Network failure isn't surfaced as an error;
 *   the user can re-toggle if they notice the swap didn't persist.
 *
 * No localStorage layer — the User row IS the source of truth, and
 * unauthenticated routes (marketing, auth, etc.) bypass this
 * provider entirely.
 */

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";
export type Palette = "coral" | "sunset" | "citrus" | "cobalt";

const VALID_THEMES: ThemePreference[] = ["light", "dark", "system"];
const VALID_PALETTES: Palette[] = ["coral", "sunset", "citrus", "cobalt"];

interface AppearanceContextValue {
  /** What the user picked. `"system"` follows OS. */
  themePreference: ThemePreference;
  /** What's actually rendering right now (system → resolved). */
  theme: ResolvedTheme;
  palette: Palette;
  setThemePreference: (next: ThemePreference) => void;
  setPalette: (next: Palette) => void;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export interface AppearanceProviderProps {
  /** Server-resolved User.theme (null → "system"). */
  initialThemePreference: ThemePreference;
  /** Server-resolved User.themePalette (coral default). */
  initialPalette: Palette;
  /** When SSR already resolved "system" to a concrete light/dark, the
   *  server passes the resolution it picked so first paint matches the
   *  attribute it stamped on <html>. */
  initialResolvedTheme: ResolvedTheme;
  children: ReactNode;
}

function applyDocumentAttributes(
  theme: ResolvedTheme,
  palette: Palette
): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.setAttribute("data-palette", palette);
  // Persist to cookie so the blocking <script> in root layout can
  // apply the correct theme before first paint on next navigation.
  try {
    document.cookie = `acuity_appearance=${theme}:${palette};path=/;max-age=31536000;SameSite=Lax`;
  } catch {}
}

function resolveSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function AppearanceProvider({
  initialThemePreference,
  initialPalette,
  initialResolvedTheme,
  children,
}: AppearanceProviderProps) {
  const [themePreference, setThemePreferenceState] =
    useState<ThemePreference>(initialThemePreference);
  const [palette, setPaletteState] = useState<Palette>(initialPalette);
  const [resolvedTheme, setResolvedTheme] =
    useState<ResolvedTheme>(initialResolvedTheme);

  // Resolve "system" → matchMedia. Subscribed via change listener so
  // OS-level theme toggles propagate while the page is open.
  useEffect(() => {
    if (themePreference !== "system") {
      setResolvedTheme(themePreference);
      applyDocumentAttributes(themePreference, palette);
      return;
    }
    // System mode — bind to matchMedia.
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      const next: ResolvedTheme = mq.matches ? "dark" : "light";
      setResolvedTheme(next);
      applyDocumentAttributes(next, palette);
    };
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [themePreference, palette]);

  const persistTheme = useCallback((next: ThemePreference) => {
    // Fire-and-forget POST. The mobile-shared endpoint accepts the
    // exact same body. "system" stores NULL on the User row.
    void fetch("/api/user/theme", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: next }),
    }).catch(() => {
      // Network failure — non-fatal. Local UI state stands.
    });
  }, []);

  const persistPalette = useCallback((next: Palette) => {
    void fetch("/api/user/theme", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ palette: next }),
    }).catch(() => {});
  }, []);

  const setThemePreference = useCallback(
    (next: ThemePreference) => {
      if (!VALID_THEMES.includes(next)) return;
      setThemePreferenceState(next);
      // Resolved theme + attribute update happens in the effect above.
      persistTheme(next);
    },
    [persistTheme]
  );

  const setPalette = useCallback(
    (next: Palette) => {
      if (!VALID_PALETTES.includes(next)) return;
      setPaletteState(next);
      // Apply the new palette attribute immediately so the UI flips
      // before the persist fetch resolves.
      applyDocumentAttributes(resolvedTheme, next);
      persistPalette(next);
    },
    [persistPalette, resolvedTheme]
  );

  return (
    <AppearanceContext.Provider
      value={{
        themePreference,
        theme: resolvedTheme,
        palette,
        setThemePreference,
        setPalette,
      }}
    >
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance(): AppearanceContextValue {
  const ctx = useContext(AppearanceContext);
  if (!ctx) {
    // Default-safe: return a no-op value so unauthenticated routes
    // (which mount without the provider) don't crash. Setters are
    // no-ops; theme/palette read as the canonical defaults.
    return {
      themePreference: "light",
      theme: "light",
      palette: "coral",
      setThemePreference: () => {},
      setPalette: () => {},
    };
  }
  return ctx;
}

export function parseThemePreference(raw: unknown): ThemePreference {
  if (raw === "light" || raw === "dark") return raw;
  // null, undefined, "system", anything else → "system"
  return "system";
}

export function parsePalette(raw: unknown): Palette {
  if (
    raw === "coral" ||
    raw === "sunset" ||
    raw === "citrus" ||
    raw === "cobalt"
  ) {
    return raw;
  }
  return "coral";
}
