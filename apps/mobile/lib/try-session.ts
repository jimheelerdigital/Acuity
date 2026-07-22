import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

/**
 * Mobile anonymous Try Session — onboarding-v2 slice 1 (2026-05-25).
 *
 * Two distinct identifiers, both AsyncStorage-backed:
 *
 *   - acuity.anon_session_id : a stable device UUID generated once on
 *     first launch. Survives sign-out / sign-in cycles. Sent to
 *     /api/mobile/try-recording in the multipart body as anonDeviceId,
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

const DEVICE_ID_KEY = "acuity.anon_session_id";
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
  try {
    const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (existing && existing.length > 0) return existing;
  } catch {
    // AsyncStorage failure — fall through to generate, retry persist.
  }
  const id = uuidV4();
  try {
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  } catch {
    // Non-fatal — next call generates a new one. Funnel analytics
    // accept some duplication.
  }
  return id;
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
export async function submitTryRecording(
  audioUri: string,
  mimeType: string
): Promise<TryRecordingResponse> {
  const anonDeviceId = await getOrCreateAnonDeviceId();

  const form = new FormData();
  // React Native fetch's FormData accepts the { uri, name, type } shape
  // for file uploads. Casting to never bypasses the DOM FormData type
  // mismatch; this is the standard RN idiom.
  form.append(
    "audio",
    {
      uri: audioUri,
      name: `try.${extensionForMime(mimeType)}`,
      type: mimeType,
    } as never
  );
  form.append("anonDeviceId", anonDeviceId);

  const res = await fetch(`${apiBaseUrl()}/api/mobile/try-recording`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `try-recording failed (${res.status}): ${text.slice(0, 200)}`
    );
  }
  const body = (await res.json()) as TryRecordingResponse;
  await setStoredTrySession(body.sessionToken, body.expiresAt);
  await setStoredTryExtraction(body.extraction);
  return body;
}

function extensionForMime(mime: string): string {
  if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  return "m4a";
}

// ─── RFC 4122 v4 UUID (Math.random-backed) ─────────────────────────
// Cryptographic randomness isn't required here — the value is a
// stable analytics key, not a security boundary. Inline implementation
// avoids pulling in expo-crypto just for this single helper.
function uuidV4(): string {
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
  const hex: string[] = [];
  for (const b of bytes) hex.push(b.toString(16).padStart(2, "0"));
  return (
    hex.slice(0, 4).join("") +
    "-" +
    hex.slice(4, 6).join("") +
    "-" +
    hex.slice(6, 8).join("") +
    "-" +
    hex.slice(8, 10).join("") +
    "-" +
    hex.slice(10, 16).join("")
  );
}
