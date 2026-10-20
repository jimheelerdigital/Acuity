import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

import { uploadAudioDirect } from "@/lib/direct-upload";
import { getInstallId } from "@/lib/install-id";

/**
 * Mobile anonymous Try Session — onboarding-v2 slice 1 (2026-05-25).
 *
 * Two distinct identifiers, both AsyncStorage-backed:
 *
 *   - acuity.anon_session_id : a stable device UUID generated once on
 *     first launch. Survives sign-out / sign-in cycles. Sent to
 *     /api/mobile/try-recording in the request body as anonDeviceId,
 *     persisted on the TrySession row for funnel analytics + any
 *     future per-device rate limiting.
 *
 *   - acuity.try_session_token : the sessionToken handed back by the
 *     try-recording endpoint for the user's most recent attempt.
 *     Persists until claim-on-signup completes (slice 8) and then
 *     gets cleared so a returning unauthenticated user doesn't try
 *     to re-claim a consumed token.
 *
 * Lives in lib/ (not contexts/) because both signup endpoint helpers
 * and the slice-2-through-9 onboarding screens need read access
 * without bringing a React context into scope.
 *
 * AsyncStorage on iOS is plaintext + sandboxed to the app — fine for
 * an anonymous device id + a single-use opaque token. We don't put
 * either into expo-secure-store because we want the keys to survive
 * Keychain-clear scenarios (sign-out flows wipe the session token
 * keychain entry today; the try-session token must outlive that).
 */

const TRY_SESSION_TOKEN_KEY = "acuity.try_session_token";
const TRY_SESSION_EXPIRES_KEY = "acuity.try_session_expires_at";
// Slice 9 (2026-05-26) — extraction body persisted alongside the
// token so the slice 10 reveal screen can render the user's real
// extraction without re-fetching. Cleared on claim alongside the
// token. AsyncStorage JSON-serialized.
const TRY_SESSION_EXTRACTION_KEY = "acuity.try_session_extraction";

/**
 * Returns the device's stable anonymous id, generating + persisting
 * one on first call. Idempotent — every subsequent call returns the
 * same id from AsyncStorage. We do NOT regenerate after sign-out:
 * the same device should have a stable funnel identifier across the
 * entire account-creation arc, even if the user signs out + restarts.
 *
 * The UUID format is OS-agnostic. expo-crypto's randomUUID is more
 * convenient but pulls in another dep — RFC 4122 v4 from
 * Math.random + Date.now is fine here since the value is just a
 * stable analytics key, never a security boundary.
 */
export async function getOrCreateAnonDeviceId(): Promise<string> {
  // 2026-10-20: the device id IS the install id now (lib/install-id.ts),
  // which adopts any value already stored under acuity.anon_session_id and keeps that
  // key in step. One id means TrySession.anonDeviceId joins straight onto
  // the onboarding events' sessionToken.
  return getInstallId();
}

export async function getStoredTrySessionToken(): Promise<string | null> {
  try {
    const token = await AsyncStorage.getItem(TRY_SESSION_TOKEN_KEY);
    if (!token) return null;
    const expiresAtRaw = await AsyncStorage.getItem(TRY_SESSION_EXPIRES_KEY);
    if (expiresAtRaw) {
      const expiresAt = Number(expiresAtRaw);
      if (Number.isFinite(expiresAt) && expiresAt < Date.now()) {
        // Stored token is past its server-side TTL — clear locally
        // so we never POST a guaranteed-410 claim.
        await clearStoredTrySession();
        return null;
      }
    }
    return token;
  } catch {
    return null;
  }
}

export async function setStoredTrySession(
  sessionToken: string,
  expiresAtIso: string
): Promise<void> {
  try {
    const expires = new Date(expiresAtIso).getTime();
    await AsyncStorage.setItem(TRY_SESSION_TOKEN_KEY, sessionToken);
    if (Number.isFinite(expires)) {
      await AsyncStorage.setItem(TRY_SESSION_EXPIRES_KEY, String(expires));
    }
  } catch {
    // Same fail-soft pattern — the in-memory user flow still works,
    // the user just loses claim continuity on app restart.
  }
}

/**
 * Forget the anonymous session token only (after a successful claim), but
 * KEEP the stored extraction: in the 1.9.1 account-first flow the claim
 * runs right after processing, while the reveal and paywall screens still
 * read the extraction. The funnel clears it at the end (reminders).
 */
export async function clearStoredTryToken(): Promise<void> {
  try {
    await AsyncStorage.removeItem(TRY_SESSION_TOKEN_KEY);
    await AsyncStorage.removeItem(TRY_SESSION_EXPIRES_KEY);
  } catch {
    // ignore
  }
}

export async function clearStoredTrySession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(TRY_SESSION_TOKEN_KEY);
    await AsyncStorage.removeItem(TRY_SESSION_EXPIRES_KEY);
    await AsyncStorage.removeItem(TRY_SESSION_EXTRACTION_KEY);
  } catch {
    // ignore
  }
}

/**
 * Persist the extraction body returned by /api/mobile/try-recording
 * so the slice 10 reveal screen can render the user's real
 * extraction without re-fetching. JSON-serialized; replaced on every
 * new submitTryRecording success; cleared on claim or sign-out.
 */
export async function setStoredTryExtraction(
  extraction: Record<string, unknown>
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      TRY_SESSION_EXTRACTION_KEY,
      JSON.stringify(extraction)
    );
  } catch {
    // Fail-soft — the reveal screen handles a missing extraction by
    // rendering a fallback message; we'd rather lose continuity than
    // crash the funnel here.
  }
}

export async function getStoredTryExtraction(): Promise<
  Record<string, unknown> | null
> {
  try {
    const raw = await AsyncStorage.getItem(TRY_SESSION_EXTRACTION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function apiBaseUrl(): string {
  const extra = Constants.expoConfig?.extra as
    | { apiUrl?: string }
    | undefined;
  return (
    process.env.EXPO_PUBLIC_API_URL ??
    extra?.apiUrl ??
    "https://goripple.io"
  );
}

export interface TryRecordingResponse {
  sessionToken: string;
  extraction: Record<string, unknown>;
  expiresAt: string;
}

/**
 * Upload an audio blob to /api/mobile/try-recording and persist the
 * returned sessionToken locally for the slice 8 claim step. Throws
 * on HTTP failure so the calling screen can surface a retry.
 */
export type TryUploadStage = "uploading" | "analyzing";

/**
 * A debrief that reached the server but whose answer this device may not
 * have received (2026-10-20, Keenan's processing drop-off). Persisted the
 * moment the audio is in storage, cleared once the result is stored here.
 *
 * Why: analysis runs inside the POST (~15-50s). If she leaves the app, iOS
 * suspends it and the request dies on the phone ("Network request failed")
 * while the server finishes and saves the result anyway. Prod 2026-10-20:
 * three TrySessions were created with no result ever shown. The pending
 * record lets the app fetch that saved result instead of starting over.
 */
export interface PendingTryJob {
  storagePath: string;
  anonDeviceId: string;
  /** Local audio file, so a real failure can still retry without re-recording. */
  uri: string;
  mimeType: string;
  /** When the analysis request was sent (ms epoch). */
  postedAt: number;
}

// ripple.v10.* = state of the CURRENT funnel attempt, which entry-routing
// deliberately does not count as app history.
const PENDING_KEY = "ripple.v10.try_pending_job";
/** The server route's maxDuration is 120s; past this nothing more is coming. */
export const TRY_RESULT_WINDOW_MS = 130_000;

export async function getPendingTryJob(): Promise<PendingTryJob | null> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const job = JSON.parse(raw) as PendingTryJob;
    if (!job?.storagePath || !job.anonDeviceId) return null;
    // A day later the TrySession itself has expired.
    if (Date.now() - job.postedAt > 24 * 60 * 60 * 1000) {
      await clearPendingTryJob();
      return null;
    }
    return job;
  } catch {
    return null;
  }
}

export async function clearPendingTryJob(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PENDING_KEY);
  } catch {
    // non-fatal
  }
}

async function storeResult(body: TryRecordingResponse): Promise<void> {
  await setStoredTrySession(body.sessionToken, body.expiresAt);
  await setStoredTryExtraction(body.extraction);
  await clearPendingTryJob();
}

/**
 * Upload an audio blob to /api/mobile/try-recording and persist the
 * returned sessionToken locally for the slice 8 claim step. Throws
 * on HTTP failure so the calling screen can surface a retry.
 */
export async function submitTryRecording(
  audioUri: string,
  mimeType: string,
  onStage?: (stage: TryUploadStage) => void
): Promise<TryRecordingResponse> {
  const anonDeviceId = await getOrCreateAnonDeviceId();
  onStage?.("uploading");

  // Direct-to-storage: the audio goes device → Supabase via a signed URL
  // and this request carries metadata only. Posting the bytes here meant
  // hitting Vercel's non-configurable 4.5MB body cap, which killed
  // full-length recordings at the edge with an opaque 413.
  const { storagePath, mimeType: canonicalMime } = await uploadAudioDirect({
    uri: audioUri,
    mimeType,
    target: "try",
  });

  const job: PendingTryJob = { storagePath, anonDeviceId, uri: audioUri, mimeType, postedAt: Date.now() };
  try {
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(job));
  } catch {
    // Recovery is a bonus; the request itself still goes.
  }
  onStage?.("analyzing");

  const res = await fetch(`${apiBaseUrl()}/api/mobile/try-recording`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      storagePath,
      mimeType: canonicalMime,
      anonDeviceId,
    }),
  });
  if (!res.ok) {
    // 409 = this exact upload was already analysed (an earlier request
    // finished on the server after the phone lost it). Fetch that result.
    if (res.status === 409) {
      const recovered = await fetchTryResult(job).catch(() => null);
      if (recovered && recovered !== "failed") return recovered;
    }
    // Any other 4xx is final for this upload (too short, too long, bad
    // input): nothing will ever be waiting on the server for it.
    if (res.status >= 400 && res.status < 500) await clearPendingTryJob();
    const text = await res.text().catch(() => "");
    const err = new Error(
      `try-recording failed (${res.status}): ${text.slice(0, 200)}`
    ) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  const body = (await res.json()) as TryRecordingResponse;
  await storeResult(body);
  return body;
}

/**
 * Ask the server for the result of a pending job. Returns the result (and
 * stores it exactly as a normal submit would), null while it isn't there
 * yet, or "failed" when the server says it never will be (the analysis
 * failed and the audio was discarded).
 */
export async function fetchTryResult(
  job: PendingTryJob
): Promise<TryRecordingResponse | "failed" | null> {
  const res = await fetch(`${apiBaseUrl()}/api/mobile/try-recording/result`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ storagePath: job.storagePath, anonDeviceId: job.anonDeviceId }),
  });
  if (res.status === 200) {
    const body = (await res.json()) as TryRecordingResponse;
    await storeResult(body);
    return body;
  }
  if (res.status === 410) return "failed";
  return null;
}

/**
 * Poll for a pending job's result until it lands or the server can no
 * longer be working on it. `shouldStop` lets a screen abandon the wait.
 */
export async function waitForTryResult(
  job: PendingTryJob,
  shouldStop: () => boolean = () => false
): Promise<TryRecordingResponse | "failed" | null> {
  const deadline = job.postedAt + TRY_RESULT_WINDOW_MS;
  for (;;) {
    if (shouldStop()) return null;
    const r = await fetchTryResult(job).catch(() => null);
    if (r) return r;
    if (Date.now() > deadline) return null;
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
}

/**
 * "Your list is ready" push for someone who leaves mid-analysis. Called
 * when the app goes to the background with a job in flight and push
 * permission granted. The server waits for the result and sends the push
 * itself, so it arrives even though this app is suspended. Fire-and-forget.
 */
export async function requestTryReadyPush(job: PendingTryJob, pushToken: string): Promise<void> {
  try {
    await fetch(`${apiBaseUrl()}/api/mobile/try-recording/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storagePath: job.storagePath, anonDeviceId: job.anonDeviceId, pushToken }),
    });
  } catch {
    // The request usually outlives the app's suspension only on the server
    // side; a lost response here is expected and harmless.
  }
}

/**
 * Submit a TYPED debrief (mic-denied fallback, spec §4).
 *
 * Mirrors submitTryRecording exactly — same session/extraction persistence,
 * same response shape — but posts JSON to /api/mobile/try-debrief-text,
 * which skips Whisper because the text IS the transcript.
 *
 * Kept alongside its audio sibling so both intake paths store the result
 * identically; Screen 5 then renders either one with no branching.
 */
export async function submitTryDebriefText(
  text: string
): Promise<TryRecordingResponse> {
  const anonDeviceId = await getOrCreateAnonDeviceId();

  const res = await fetch(`${apiBaseUrl()}/api/mobile/try-debrief-text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, anonDeviceId }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `try-debrief-text failed (${res.status}): ${body.slice(0, 200)}`
    );
  }
  const body = (await res.json()) as TryRecordingResponse;
  await setStoredTrySession(body.sessionToken, body.expiresAt);
  await setStoredTryExtraction(body.extraction);
  return body;
}
