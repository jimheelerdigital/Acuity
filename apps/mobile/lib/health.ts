import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

import { api } from "@/lib/api";
import {
  BACKGROUND_SYNC_DAYS,
  backgroundSyncDecision,
  buildSnapshots,
  byLocalDay,
  lastLocalDays,
  sleepHoursByDay,
  type HealthSnapshotRow,
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
 *
 * Background (2026-10-28): HealthKit background delivery wakes the app — even
 * when it was closed — when new steps or exercise minutes are saved, at most
 * hourly. The wake re-sends today and yesterday (startHealthBackgroundSync),
 * so a "5,000 steps" habit checks itself off without the app being opened.
 * The observer queries are registered natively at launch by
 * @react-native-healthkit/core (BackgroundDeliveryManager); events that
 * arrive before JS boots are queued and flushed when we subscribe. Needs the
 * com.apple.developer.healthkit.background-delivery entitlement (app.json,
 * healthkit plugin `background: true`). Apple includes it in any profile
 * with the HealthKit capability; EAS capability sync ignores the key.
 */

const ENABLED_KEY = "healthSync.enabled";
const SYNCED_AT_KEY = "healthSync.syncedAt";
const BG_SYNCED_AT_KEY = "healthSync.backgroundSyncedAt";
/** Set once background delivery is configured on this install. */
const BG_CONFIGURED_KEY = "healthSync.background.v1";
const SYNC_EVERY_MS = 30 * 60 * 1000;
const DAYS = 7;

/** What habit rules can check (steps, exercise minutes). Sleep and HRV only
 * feed Insights, which can wait for the next app open. */
const BACKGROUND_TYPES = [
  "HKQuantityTypeIdentifierStepCount",
  "HKQuantityTypeIdentifierAppleExerciseTime",
] as const;

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
    void startHealthBackgroundSync();
    return true;
  } catch {
    return false;
  }
}

/** Stops uploading. Access itself is revoked in the Health app. */
export async function disconnectHealth(): Promise<void> {
  await stopHealthBackgroundSync();
  await AsyncStorage.multiRemove([
    ENABLED_KEY,
    SYNCED_AT_KEY,
    BG_SYNCED_AT_KEY,
    BG_CONFIGURED_KEY,
  ]).catch(() => {});
}

type HealthKit = Awaited<ReturnType<typeof hk>>;

/**
 * Reads the last `dayCount` local days from HealthKit. `failed` is true when
 * any read threw (as opposed to returning no data, which is how a denied
 * permission looks) — a background upload then skips rather than overwrite
 * a stored day with blanks.
 */
async function collectSnapshots(
  H: HealthKit,
  dayCount: number
): Promise<{ snapshots: HealthSnapshotRow[]; failed: boolean }> {
  let failed = false;
  const now = new Date();
  const days = lastLocalDays(now, dayCount);
  const anchor = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (dayCount - 1));
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
      failed = true;
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
        failed = true;
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
        failed = true;
        return new Map<string, number>();
      }
    })(),
  ]);

  return { snapshots: buildSnapshots(days, { steps, activeMinutes, sleepHours, hrv }), failed };
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
    const { snapshots } = await collectSnapshots(H, DAYS);
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

/**
 * A background wake: re-send today and yesterday so the server's habit
 * auto-check runs. Light by design — two days, at most every 15 minutes,
 * nothing while the phone is locked (Health is unreadable then), and no
 * upload if any read failed. Idempotent server-side (per-day upsert; habit
 * checks are additive). Never throws.
 */
export async function syncHealthInBackground(): Promise<HealthSyncResult> {
  if (!healthSupported()) return null;
  try {
    const H = await hk();
    const [enabled, protectedDataAvailable, fgAt, bgAt] = await Promise.all([
      isHealthEnabled(),
      H.isProtectedDataAvailableAsync().catch(() => false),
      AsyncStorage.getItem(SYNCED_AT_KEY).catch(() => null),
      AsyncStorage.getItem(BG_SYNCED_AT_KEY).catch(() => null),
    ]);
    // `running` is read synchronously right before it is set, so two wakes
    // that resolve together still upload once.
    const decision = backgroundSyncDecision({
      enabled,
      running,
      protectedDataAvailable,
      lastSyncedAt: Math.max(Number(fgAt ?? 0) || 0, Number(bgAt ?? 0) || 0),
      now: Date.now(),
    });
    if (decision !== "sync") return null;
    running = true;
    try {
      const { snapshots, failed } = await collectSnapshots(H, BACKGROUND_SYNC_DAYS);
      if (failed) return null;
      if (snapshots.length > 0) {
        await api.post("/api/health/snapshots", { snapshots });
      }
      await AsyncStorage.setItem(BG_SYNCED_AT_KEY, String(Date.now()));
      return { uploaded: snapshots.length };
    } finally {
      running = false;
    }
  } catch {
    return null;
  }
}

let subscriptions: { remove: () => unknown }[] = [];

/**
 * Call at JS startup (module scope of the root layout), so it also runs when
 * iOS launches the app in the background for a Health update. No-op unless
 * Health is connected on this phone. Configures background delivery once per
 * install (persisted natively, so the observers come back on every launch),
 * then subscribes — which also flushes any wake that arrived before JS was
 * up. Idempotent. Never throws.
 */
export async function startHealthBackgroundSync(): Promise<void> {
  if (!healthSupported() || subscriptions.length > 0) return;
  try {
    if (!(await isHealthEnabled())) return;
    const H = await hk();
    if ((await AsyncStorage.getItem(BG_CONFIGURED_KEY)) !== "1") {
      // Fails quietly (native log only) on a build without the
      // background-delivery entitlement; foreground sync still works.
      await H.configureBackgroundTypes([...BACKGROUND_TYPES], H.UpdateFrequency.hourly);
      await AsyncStorage.setItem(BG_CONFIGURED_KEY, "1");
    }
    if (subscriptions.length > 0) return;
    subscriptions = BACKGROUND_TYPES.map((id) =>
      H.subscribeToChanges(id, () => {
        void syncHealthInBackground();
      })
    );
  } catch {
    // Health trouble must not break app start.
  }
}

async function stopHealthBackgroundSync(): Promise<void> {
  const subs = subscriptions;
  subscriptions = [];
  for (const s of subs) {
    try {
      s.remove();
    } catch {
      // already gone
    }
  }
  if (!healthSupported()) return;
  try {
    const H = await hk();
    await H.clearBackgroundTypes();
    await H.disableAllBackgroundDelivery();
  } catch {
    // nothing registered
  }
}

/** Sign-out: the next person on this device starts disconnected. */
export async function clearHealthState(): Promise<void> {
  await disconnectHealth();
}
