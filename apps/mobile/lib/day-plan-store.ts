import AsyncStorage from "@react-native-async-storage/async-storage";

import type { StoredBlock } from "@/lib/calendar-op";
import { DEFAULT_PLAN_SETTINGS, clampSettings, type PlanSettings } from "@/lib/plan-day";
import { localYmd } from "@/lib/today-tasks";

/**
 * Plan my day, on-device memory (1.9.6):
 *   - blocks:   taskId → the time block written to the calendar, so calendar
 *               sync keeps the block when the task changes (calendar-op
 *               eventForOp). Only today's and later days are kept.
 *   - settings: the workday hours the planner fills.
 * Per device. Nothing here is needed for correctness elsewhere — losing it
 * just means a later edit puts the event back on its due date.
 */

const BLOCKS_KEY = "ripple.planDay.blocks";
const SETTINGS_KEY = "ripple.planDay.settings";

type BlockMap = Record<string, StoredBlock>;

async function readBlocks(): Promise<BlockMap> {
  try {
    const raw = await AsyncStorage.getItem(BLOCKS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as BlockMap) : {};
  } catch {
    return {};
  }
}

/** Blocks still relevant (today or later), pruning the rest. */
export async function loadPlannedBlocks(now: Date = new Date()): Promise<BlockMap> {
  const all = await readBlocks();
  const today = localYmd(now);
  const kept: BlockMap = {};
  let pruned = false;
  for (const [id, b] of Object.entries(all)) {
    if (b && typeof b.day === "string" && b.day >= today) kept[id] = b;
    else pruned = true;
  }
  if (pruned) await AsyncStorage.setItem(BLOCKS_KEY, JSON.stringify(kept)).catch(() => {});
  return kept;
}

export async function savePlannedBlocks(blocks: BlockMap): Promise<void> {
  const current = await loadPlannedBlocks();
  await AsyncStorage.setItem(BLOCKS_KEY, JSON.stringify({ ...current, ...blocks })).catch(() => {});
}

export async function loadPlanSettings(): Promise<PlanSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_PLAN_SETTINGS;
    const p = JSON.parse(raw) as Partial<PlanSettings>;
    if (typeof p.startHour !== "number" || typeof p.endHour !== "number") return DEFAULT_PLAN_SETTINGS;
    return clampSettings({ startHour: p.startHour, endHour: p.endHour });
  } catch {
    return DEFAULT_PLAN_SETTINGS;
  }
}

export async function savePlanSettings(s: PlanSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(clampSettings(s))).catch(() => {});
}

export async function clearPlanDayState(): Promise<void> {
  await AsyncStorage.multiRemove([BLOCKS_KEY, SETTINGS_KEY]).catch(() => {});
}
