import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

import { api } from "@/lib/api";
import {
  buildSnapshots,
  byLocalDay,
  lastLocalDays,
  sleepHoursByDay,
} from "@/lib/health-aggregate";

/**
 * Apple Health, read only (1.9.6). Jimmy: "health is a nice touch."
 *
 * Reads four daily numbers from HealthKit — steps, exercise minutes, sleep,
 * heart-rate variability — and uploads one row per day for the last week to
 * POST /api/health/snapshots. That feeds the Insights "Health & mood" card
 * and habits that complete themselves from Health ("10,000 steps").
 *
 * iOS only. The HealthKit library is imported on first use, so Android and
 * any build without it never load it. HealthKit never says whether read
 * access was granted; a denied type simply returns no data (sent as null).
 *
 * "Connected" is a per-device switch (they can't be connected on a phone
 * that never asked HealthKit). Sync runs on app foreground, at most every
 * 30 minutes.
 */

const ENABLED_KEY = "ripple.health.enabled";
const SYNCED_AT_KEY = "ripple.health.syncedAt";
const SYNC_EVERY_MS = 30 * 60 * 1000;
const DAYS = 7;

const READ_TYPES = [
  "HKQuantityTypeIdentifierStepCount",
  "HKQuantityTypeIdentifierAppleExerciseTime",
  "HKCategoryTypeIdentifierSleepAnalysis",
  "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
] as const;

async function hk() {
  return import("@kingstinct/react-native-healthkit");
}

export function healthSupported(): boolean {
  return Platform.OS === "ios";
}

/** HealthKit exists on this device (not on iPad without Health, etc.). */
export async function healthAvailable(): Promise<boolean> {
  if (!healthSupported()) return false;
  try {
    const H = await hk();
    return await H.isHealthDataAvailableAsync();
  } catch {
    return false;
  }
}

export async function isHealthEnabled(): Promise<boolean> {
  if (!healthSupported()) return false;
  return (await AsyncStorage.getItem(ENABLED_KEY).catch(() => null)) === "1";
}

/**
 * Shows Apple's Health permission sheet (read only) and turns sync on.
 * Returns false when HealthKit isn't available or the sheet failed.
 */
export async function connectHealth(): Promise<boolean> {
  if (!(await healthAvailable())) return false;
  try {
    const H = await hk();
    await H.requestAuthorization({ toRead: READ_TYPES });
    await AsyncStorage.setItem(ENABLED_KEY, "1");
    await syncHealth({ force: true });
    return true;
  } catch {
    return false;
  }
}

/** Stops uploading. Access itself is revoked in the Health app. */
export async function disconnectHealth(): Promise<void> {
  await AsyncStorage.multiRemove([ENABLED_KEY, SYNCED_AT_KEY]).catch(() => {});
}

export type HealthSyncResult = { uploaded: number } | null;

let running = false;

/** Never throws: Health trouble must not break app start. */
export async function syncHealth(opts: { force?: boolean } = {}): Promise<HealthSyncResult> {
  if (running || !(await isHealthEnabled())) return null;
  running = true;
  try {
    if (!opts.force) {
      const last = Number((await AsyncStorage.getItem(SYNCED_AT_KEY)) ?? 0);
      if (Date.now() - last < SYNC_EVERY_MS) return null;
    }
    const H = await hk();
    const now = new Date();
    const days = lastLocalDays(now, DAYS);
    const anchor = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (DAYS - 1));
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const filter = { date: { startDate: anchor, endDate: end } };
    const interval = { day: 1 };

    const sum = async (
      id: "HKQuantityTypeIdentifierStepCount" | "HKQuantityTypeIdentifierAppleExerciseTime",
      unit: string
    ) => {
      try {
        const res = await H.queryStatisticsCollectionForQuantity(id, ["cumulativeSum"], anchor, interval, {
          filter,
          unit: unit as never,
        });
        return byLocalDay(res.map((r) => ({ startDate: r.startDate ?? anchor, value: r.sumQuantity?.quantity })));
      } catch {
        return new Map<string, number>();
      }
    };

    const [steps, activeMinutes, hrv, sleepHours] = await Promise.all([
      sum("HKQuantityTypeIdentifierStepCount", "count"),
      sum("HKQuantityTypeIdentifierAppleExerciseTime", "min"),
      (async () => {
        try {
          const res = await H.queryStatisticsCollectionForQuantity(
            "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
            ["discreteAverage"],
            anchor,
            interval,
            { filter, unit: "ms" }
          );
          return byLocalDay(
            res.map((r) => ({ startDate: r.startDate ?? anchor, value: r.averageQuantity?.quantity }))
          );
        } catch {
          return new Map<string, number>();
        }
      })(),
      (async () => {
        try {
          // From the evening before the first day, so that night counts.
          const sleepFrom = new Date(anchor.getTime() - 12 * 3_600_000);
          const samples = await H.queryCategorySamples("HKCategoryTypeIdentifierSleepAnalysis", {
            limit: 0,
            filter: { date: { startDate: sleepFrom, endDate: end } },
          });
          return sleepHoursByDay(
            samples.map((s) => ({ startDate: s.startDate, endDate: s.endDate, value: Number(s.value) }))
          );
        } catch {
          return new Map<string, number>();
        }
      })(),
    ]);

    const snapshots = buildSnapshots(days, { steps, activeMinutes, sleepHours, hrv });
    if (snapshots.length > 0) {
      await api.post("/api/health/snapshots", { snapshots });
    }
    await AsyncStorage.setItem(SYNCED_AT_KEY, String(Date.now()));
    return { uploaded: snapshots.length };
  } catch {
    return null;
  } finally {
    running = false;
  }
}

/** Sign-out: the next person on this device starts disconnected. */
export async function clearHealthState(): Promise<void> {
  await disconnectHealth();
}
