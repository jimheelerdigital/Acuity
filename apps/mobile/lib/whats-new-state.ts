import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { useEffect, useState } from "react";
import { Platform } from "react-native";

import { releaseFor, type WhatsNewRelease } from "@/lib/whats-new-content";

/**
 * What's New progress for the running version (1.9.1).
 *
 *   explored  — item ids the person has seen in the tour (or opened).
 *               Drives the check marks and "2 of 5 explored".
 *   eligibleAt — when this version's update sheet first appeared. Only
 *               people who actually UPDATED get the Home pill; fresh
 *               installs never see it (onboarding covers them).
 *   pillDismissed — they closed the Home pill.
 *
 * Home pill rule: eligible, within 7 days of eligibleAt, not dismissed,
 * and not everything explored. Profile → What's New is always there; its
 * dot shows while eligible and not everything is explored.
 *
 * Module store + subscribers so the sheet, page, pill and Profile row stay
 * in step without a context provider. Per device (AsyncStorage).
 */

const PILL_DAYS = 7;

export type WhatsNewState = {
  loaded: boolean;
  version: string | null;
  release: WhatsNewRelease | null;
  explored: string[];
  eligibleAt: number | null;
  pillDismissed: boolean;
};

const version = Constants.expoConfig?.version ?? null;
const platform: "ios" | "android" = Platform.OS === "ios" ? "ios" : "android";

const keys = (v: string) => ({
  explored: `whatsNew.explored.${v}`,
  eligibleAt: `whatsNew.eligibleAt.${v}`,
  pillDismissed: `whatsNew.pillDismissed.${v}`,
});

let state: WhatsNewState = {
  loaded: false,
  version,
  release: version ? releaseFor(version, platform) : null,
  explored: [],
  eligibleAt: null,
  pillDismissed: false,
};
const listeners = new Set<(s: WhatsNewState) => void>();
let loading: Promise<void> | null = null;

function set(patch: Partial<WhatsNewState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l(state);
}

export function loadWhatsNewState(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    if (!version) {
      set({ loaded: true });
      return;
    }
    const k = keys(version);
    try {
      const [explored, eligibleAt, dismissed] = await Promise.all([
        AsyncStorage.getItem(k.explored),
        AsyncStorage.getItem(k.eligibleAt),
        AsyncStorage.getItem(k.pillDismissed),
      ]);
      let ids: string[] = [];
      try {
        const parsed = explored ? JSON.parse(explored) : [];
        if (Array.isArray(parsed)) ids = parsed.filter((x) => typeof x === "string");
      } catch {
        ids = [];
      }
      const at = eligibleAt ? Number(eligibleAt) : NaN;
      set({
        loaded: true,
        explored: ids,
        eligibleAt: Number.isFinite(at) ? at : null,
        pillDismissed: dismissed === "1",
      });
    } catch {
      set({ loaded: true });
    }
  })();
  return loading;
}

export function getWhatsNewState(): WhatsNewState {
  return state;
}

// Writes wait for the first load so they never overwrite stored progress.
export function markExplored(itemId: string): void {
  void loadWhatsNewState().then(() => markExploredNow(itemId));
}

function markExploredNow(itemId: string): void {
  if (!version || state.explored.includes(itemId)) return;
  const explored = [...state.explored, itemId];
  set({ explored });
  AsyncStorage.setItem(keys(version).explored, JSON.stringify(explored)).catch(() => {});
}

/** Called when this version's update sheet is shown (an actual update). */
export function markEligible(): void {
  void loadWhatsNewState().then(markEligibleNow);
}

function markEligibleNow(): void {
  if (!version || state.eligibleAt) return;
  const now = Date.now();
  set({ eligibleAt: now });
  AsyncStorage.setItem(keys(version).eligibleAt, String(now)).catch(() => {});
}

export function dismissPill(): void {
  if (!version) return;
  set({ pillDismissed: true });
  AsyncStorage.setItem(keys(version).pillDismissed, "1").catch(() => {});
}

/** Items in this release that have a tour stop. */
export function tourItemIds(s: WhatsNewState): string[] {
  return (s.release?.items ?? []).filter((i) => i.tour).map((i) => i.id);
}

export function exploredCount(s: WhatsNewState): { done: number; total: number } {
  const ids = tourItemIds(s);
  return { done: ids.filter((id) => s.explored.includes(id)).length, total: ids.length };
}

export function showHomePill(s: WhatsNewState, now = Date.now()): boolean {
  if (!s.loaded || !s.release || !s.eligibleAt || s.pillDismissed) return false;
  if (now - s.eligibleAt > PILL_DAYS * 24 * 60 * 60 * 1000) return false;
  const { done, total } = exploredCount(s);
  return total > 0 && done < total;
}

export function showProfileDot(s: WhatsNewState): boolean {
  if (!s.loaded || !s.release || !s.eligibleAt) return false;
  const { done, total } = exploredCount(s);
  return total > 0 && done < total;
}

export function useWhatsNewState(): WhatsNewState {
  const [s, setS] = useState(state);
  useEffect(() => {
    listeners.add(setS);
    setS(state);
    void loadWhatsNewState();
    return () => {
      listeners.delete(setS);
    };
  }, []);
  return s;
}
