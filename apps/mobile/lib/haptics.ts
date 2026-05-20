import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useState } from "react";

/**
 * Haptic feedback preference (Slice Q2, 2026-05-19).
 *
 * Single global toggle. Default ON. Persisted to AsyncStorage at
 * `acuity.haptics`. Device-local — does NOT sync across devices.
 *
 * Why local-only: haptics is contextual. Some users want it on iPhone
 * but off on iPad. Some want it off in quiet environments. The cross-
 * device behavior most users want is "this is a per-device choice",
 * matching how iOS itself treats haptics in Settings.
 *
 * Read pattern: `const { enabled, light, medium } = useHaptics();`
 * Components call `light()` / `medium()` directly — the hook gates
 * by `enabled` so callers don't have to wrap every fire site.
 *
 * If we ever want server sync, add a User.hapticsEnabled column and
 * extend the same dual-read pattern theme-context.tsx uses.
 */

const HAPTICS_KEY = "acuity.haptics";

interface UseHapticsValue {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  /** Light impact (task check, swatch select, segmented tap). No-op when disabled. */
  light: () => void;
  /** Medium impact (achievement unlock, finish-day celebration). No-op when disabled. */
  medium: () => void;
}

export function useHaptics(): UseHapticsValue {
  const [enabled, setEnabledState] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(HAPTICS_KEY);
        if (cancelled) return;
        // Default ON when no preference is stored (first run). Only
        // explicit "false" disables — anything else falls through to
        // the enabled default.
        if (stored === "false") {
          setEnabledState(false);
        }
      } catch {
        // Non-fatal — default ON stands.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setEnabled = useCallback((v: boolean) => {
    setEnabledState(v);
    AsyncStorage.setItem(HAPTICS_KEY, v ? "true" : "false").catch(() => {});
    if (v) {
      // Confirm the toggle ON with a small tap so the user feels what
      // they enabled. Confirming OFF with a tap would be jarring (you
      // just told us not to vibrate).
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  }, []);

  const light = useCallback(() => {
    if (!enabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, [enabled]);

  const medium = useCallback(() => {
    if (!enabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }, [enabled]);

  return { enabled, setEnabled, light, medium };
}
