/**
 * Fire-and-forget client-side instrumentation sink (2026-05-07).
 *
 * Why this exists: builds 27-30 each shipped a hypothesis-driven
 * SecureStore-race fix and none worked. We need to stop guessing
 * and actually see the timeline of events on the device. Every
 * interesting auth call site calls `debugLog(event, payload)`, which
 * POSTs to `/api/_debug/client-log` with no await. Server logs the
 * event as `client.<event>` with the session id, and we filter
 * Vercel logs by session id to reconstruct exactly what the client
 * did before/after the 401.
 *
 * Design constraints:
 *   - NEVER block the calling code. No await on the fetch. Failures
 *     are caught and silently dropped — instrumentation must not
 *     surface errors in user flows.
 *   - NEVER log token contents. Only lengths, presence flags, and
 *     non-sensitive identifiers (user id is fine; the token itself
 *     is not). Server-side safeLog redacts a denylist of fields as
 *     defense-in-depth, but the client shouldn't rely on that.
 *   - Session id is generated once per app launch and attached to
 *     every event so we can group Jim's events vs background noise.
 *     NOT cryptographically unique — Math.random + timestamp is
 *     enough for diagnostic filtering.
 *
 * Usage:
 *   import { debugLog } from "@/lib/debug-log";
 *   debugLog("tokenBridge.set", { prevLen: 0, nextLen: 412 });
 */

import Constants from "expo-constants";

let cachedSessionId: string | null = null;

function getSessionId(): string {
  if (cachedSessionId) return cachedSessionId;
  cachedSessionId = `s-${Date.now().toString(36)}-${Math.floor(
    Math.random() * 1e12
  ).toString(36)}`;
  return cachedSessionId;
}

function apiBaseUrl(): string {
  const extra = Constants.expoConfig?.extra as
    | { apiUrl?: string }
    | undefined;
  return (
    process.env.EXPO_PUBLIC_API_URL ??
    extra?.apiUrl ??
    "https://getacuity.io"
  );
}

/**
 * Capture a short, non-sensitive snapshot of the call stack. Used
 * for setUser(null), clearToken, clearSession, tokenBridge.set —
 * any place where "who triggered this" is the diagnostic question.
 * The first frame (Error constructor) is dropped; we keep up to 6
 * frames after that. Each frame is trimmed to the function name
 * and short location, which is enough to disambiguate callers
 * without leaking source paths.
 */
function captureStack(): string {
  const raw = new Error().stack ?? "";
  return raw
    .split("\n")
    .slice(2, 8)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" | ");
}

/**
 * Fire-and-forget POST to the diagnostic sink. Returns immediately;
 * the underlying fetch resolves on its own schedule and any error
 * is swallowed.
 *
 * The optional `withStack` flag attaches a captured-at-call stack
 * trace excerpt — only set this on call sites where the caller's
 * identity matters (e.g. setUser(null), clearToken, clearSession).
 * Stack capture is cheap but not free; default to off.
 */
export function debugLog(
  event: string,
  payload: Record<string, unknown> = {},
  options: { withStack?: boolean } = {}
): void {
  const ts = new Date().toISOString();
  const sid = getSessionId();
  const enrichedPayload: Record<string, unknown> = {
    sessionId: sid,
    ...payload,
  };
  if (options.withStack) {
    enrichedPayload.stack = captureStack();
  }

  const body = JSON.stringify({
    event,
    timestamp: ts,
    payload: enrichedPayload,
  });

  // Local dev visibility — Metro logs in the terminal. In production
  // builds (__DEV__ === false) this branch is dead-code-eliminated by
  // the bundler, so no console noise on TestFlight.
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log(`[CLIENT-DBG ${event}]`, enrichedPayload);
  }

  // Fire and forget. NEVER await. NEVER throw.
  fetch(`${apiBaseUrl()}/api/_debug/client-log`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  }).catch(() => {
    // Silent. Instrumentation must not surface failures.
  });
}

/** Read the current session id (for cross-referencing in logs). */
export function getDebugSessionId(): string {
  return getSessionId();
}
