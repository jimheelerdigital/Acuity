import "server-only";

import { safeLog } from "@/lib/safe-log";

/**
 * First-debrief result recovery + "Your list is ready" push (2026-10-20,
 * Keenan: 29% of people who finish their first recording never see the
 * results). Shared by /api/mobile/try-recording/result and /notify.
 *
 * A "job" is one anonymous upload: the storage object name the app
 * uploaded to (`voice-entries-try/<storagePath>`) and the install's
 * anonDeviceId. /api/mobile/try-recording saves the TrySession with
 * audioPath = storagePath on success and deletes the object on every
 * analysis failure, so the pair (TrySession?, object?) tells us:
 *   session            → ready
 *   no session, object → still running (or never started) → pending
 *   neither            → failed, nothing is coming
 * No schema change: TrySession.audioPath and anonDeviceId already exist.
 */

const TRY_STORAGE_BUCKET = "voice-entries-try";
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export interface TryJob {
  storagePath: string;
  anonDeviceId: string;
}

export type TryResult =
  | { status: "ready"; sessionToken: string; extraction: unknown; expiresAt: string }
  | { status: "pending" }
  | { status: "failed" };

/** Same validation the analysis route applies to these two fields. */
export function parseTryJob(body: unknown): TryJob | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const storagePath = typeof b.storagePath === "string" ? b.storagePath.trim() : "";
  const anonDeviceId = typeof b.anonDeviceId === "string" ? b.anonDeviceId.trim() : "";
  if (!storagePath || storagePath.length > 200 || storagePath.includes("/") || storagePath.includes("..")) return null;
  if (!anonDeviceId || anonDeviceId.length > 128) return null;
  return { storagePath, anonDeviceId };
}

export async function readTryJobBody(req: Request): Promise<(TryJob & { raw: Record<string, unknown> }) | null> {
  try {
    const raw = (await req.json()) as Record<string, unknown>;
    const job = parseTryJob(raw);
    return job ? { ...job, raw } : null;
  } catch {
    return null;
  }
}

type FindDb = {
  trySession: {
    findFirst(args: {
      where: { audioPath: string; anonDeviceId: string; expiresAt: { gt: Date } };
      select: { sessionToken: true; extractionData: true; expiresAt: true };
    }): Promise<{ sessionToken: string; extractionData: unknown; expiresAt: Date } | null>;
  };
};

export async function findTryResult(
  job: TryJob,
  deps?: { db?: FindDb; audioExists?: (path: string) => Promise<boolean> }
): Promise<TryResult> {
  const db = deps?.db ?? ((await import("@/lib/prisma")).prisma as unknown as FindDb);
  const row = await db.trySession.findFirst({
    where: { audioPath: job.storagePath, anonDeviceId: job.anonDeviceId, expiresAt: { gt: new Date() } },
    select: { sessionToken: true, extractionData: true, expiresAt: true },
  });
  if (row) {
    return {
      status: "ready",
      sessionToken: row.sessionToken,
      extraction: row.extractionData,
      expiresAt: row.expiresAt.toISOString(),
    };
  }
  const exists = deps?.audioExists ?? defaultAudioExists;
  return (await exists(job.storagePath)) ? { status: "pending" } : { status: "failed" };
}

async function defaultAudioExists(path: string): Promise<boolean> {
  const { verifyStoredAudio } = await import("@/lib/audio");
  const check = await verifyStoredAudio(TRY_STORAGE_BUCKET, path);
  // "too_large" still exists; only a missing/empty object means gone.
  return check.ok || check.reason === "too_large";
}

/** Expo push tokens look like ExponentPushToken[xxxx] (or ExpoPushToken[...]). */
export function isExpoPushToken(v: unknown): v is string {
  return typeof v === "string" && v.length <= 200 && /^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/.test(v);
}

export const TRY_READY_PUSH = {
  title: "Your list is ready",
  body: "Ripple pulled the to-dos out of your debrief. Tap to see them.",
} as const;

export async function sendTryReadyPush(pushToken: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetchImpl(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        to: pushToken,
        title: TRY_READY_PUSH.title,
        body: TRY_READY_PUSH.body,
        sound: "default",
        data: { type: "try_ready", src: "try_ready" },
      }),
    });
    if (!res.ok) {
      safeLog.error("try-ready-push.http_error", `HTTP ${res.status}`, { status: res.status });
      return false;
    }
    return true;
  } catch (err) {
    safeLog.error("try-ready-push.fetch_throw", err);
    return false;
  }
}

/**
 * Wait for a job to finish, then push. Polls every `intervalMs` until the
 * result is ready (→ push, "sent"), the analysis failed ("failed"), or
 * `budgetMs` runs out ("timeout"). The analysis route's maxDuration is
 * 120s, so a budget just under this route's own maxDuration covers it.
 */
export async function waitThenPush(
  job: TryJob,
  pushToken: string,
  opts: {
    budgetMs: number;
    intervalMs?: number;
    find?: (job: TryJob) => Promise<TryResult>;
    push?: (token: string) => Promise<boolean>;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
  }
): Promise<"sent" | "failed" | "timeout" | "push_failed"> {
  const find = opts.find ?? ((j: TryJob) => findTryResult(j));
  const push = opts.push ?? ((t: string) => sendTryReadyPush(t));
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;
  const interval = opts.intervalMs ?? 2000;
  const deadline = now() + opts.budgetMs;
  for (;;) {
    const r = await find(job).catch(() => ({ status: "pending" }) as TryResult);
    if (r.status === "ready") return (await push(pushToken)) ? "sent" : "push_failed";
    if (r.status === "failed") return "failed";
    if (now() + interval > deadline) return "timeout";
    await sleep(interval);
  }
}
