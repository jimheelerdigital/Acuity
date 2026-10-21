import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * Stable per-install id (Keenan, 2026-10-20) — the analytics key that ties
 * a person's pre-sign-in onboarding events to the account they create.
 *
 * Sent as `sessionToken` on every v10_* / app_* onboarding event, signed in
 * or not, and as the `X-Ripple-Install-Id` header on the sign-in calls so
 * the server can stamp `app_signed_in` with it and backfill `userId` onto
 * the earlier anonymous events (lib/mobile-session.ts on the web side).
 *
 * ── Storage ──────────────────────────────────────────────────────────
 * SecureStore (Keychain on iOS) as Keenan asked. Worth knowing: an iOS
 * Keychain item SURVIVES deleting the app, so a reinstall keeps the same
 * id. That is deliberate for the funnel (same phone, same person), and it
 * is why "first open" is tracked separately in AsyncStorage (wiped with the
 * app): app_first_open fires once per install and says `reinstall: true`
 * when the Keychain already had an id. Android clears SecureStore on
 * uninstall, so there every reinstall is a new id.
 *
 * ── One id, not two ─────────────────────────────────────────────────
 * The app already had an AsyncStorage device UUID (`acuity.anon_session_id`)
 * that try-recording stamps on TrySession.anonDeviceId. A first run of this
 * code ADOPTS that value instead of minting a new one, and writes the
 * install id back to that key, so TrySession rows and onboarding events
 * share one id and can be joined.
 */

const SECURE_KEY = "acuity.install_id";
export const LEGACY_ASYNC_KEY = "acuity.anon_session_id";
// Both AsyncStorage keys below are written at BOOT on a brand-new install,
// so they are listed in entry-routing's BOOT_WRITTEN_KEYS: otherwise a
// fresh install would look like "app history" and be sent to sign-in
// instead of the onboarding funnel.
export const FIRST_OPEN_KEY = "acuity.first_open_sent_at";

let cached: string | null = null;
let inflight: Promise<string> | null = null;
/** True when this launch found the id already in the Keychain. */
let foundInKeychain = false;

function uuidV4(): string {
  // Not a security boundary — a stable analytics key. Same generator the
  // try-session device id has always used.
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const VALID = /^[0-9a-f-]{16,64}$/i;

async function resolve(): Promise<string> {
  let fromKeychain: string | null = null;
  try {
    fromKeychain = await SecureStore.getItemAsync(SECURE_KEY);
  } catch {
    fromKeychain = null;
  }
  if (fromKeychain && VALID.test(fromKeychain)) {
    foundInKeychain = true;
    // Keep the legacy key in step (it is wiped on reinstall, the Keychain
    // is not) so TrySession.anonDeviceId keeps matching.
    AsyncStorage.setItem(LEGACY_ASYNC_KEY, fromKeychain).catch(() => {});
    return fromKeychain;
  }

  let legacy: string | null = null;
  try {
    legacy = await AsyncStorage.getItem(LEGACY_ASYNC_KEY);
  } catch {
    legacy = null;
  }
  const id = legacy && VALID.test(legacy) ? legacy : uuidV4();
  try {
    await SecureStore.setItemAsync(SECURE_KEY, id, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    });
  } catch {
    // Non-fatal: the AsyncStorage copy still keeps it stable this install.
  }
  AsyncStorage.setItem(LEGACY_ASYNC_KEY, id).catch(() => {});
  return id;
}

/** The install id. Never throws; resolves once and is cached. */
export async function getInstallId(): Promise<string> {
  if (cached) return cached;
  if (!inflight) {
    inflight = resolve()
      .then((id) => {
        cached = id;
        return id;
      })
      .catch(() => {
        const id = uuidV4();
        cached = id;
        return id;
      });
  }
  return inflight;
}

/** The binary's marketing version, e.g. "1.9.5". */
export function appVersion(): string | null {
  return Constants.expoConfig?.version ?? null;
}

/**
 * Fields stamped on every v10_* / app_* event (Keenan: app_version on
 * every event, so a funnel can be split by build).
 */
export function appContext(): { app_version: string | null; platform: string } {
  return { app_version: appVersion(), platform: Platform.OS };
}

/**
 * Has app_first_open already been sent for this install? Marks it sent.
 * Returns null when it was already sent, otherwise `{ reinstall }`.
 */
export async function claimFirstOpen(): Promise<{ reinstall: boolean } | null> {
  await getInstallId();
  try {
    if (await AsyncStorage.getItem(FIRST_OPEN_KEY)) return null;
    await AsyncStorage.setItem(FIRST_OPEN_KEY, String(Date.now()));
  } catch {
    return null; // can't remember it → don't risk sending it every launch
  }
  return { reinstall: foundInKeychain };
}

/**
 * Header for the sign-in calls (mobile-login, -email-code/verify,
 * -complete, -callback, -callback-apple). The server stamps the
 * app_signed_in event with it and backfills userId onto this install's
 * earlier anonymous events. Never throws, never delays sign-in by more
 * than the (cached after first use) Keychain read.
 */
export async function installIdHeader(): Promise<Record<string, string>> {
  try {
    return { "X-Ripple-Install-Id": await getInstallId() };
  } catch {
    return {};
  }
}
