import Constants from "expo-constants";
import { Platform } from "react-native";

import { getToken } from "@/lib/auth";
import { tokenBridge } from "@/lib/token-bridge";

/**
 * API client for the Next.js backend. Pulls the base URL from
 * app.json's `extra.apiUrl` (populated by the Expo config for
 * TestFlight/App Store builds) with an env-var override so local
 * dev can point at localhost. Every request auto-attaches the
 * Bearer token from SecureStore when present — the web backend's
 * `getAnySessionUserId` helper reads it and authorizes the request.
 *
 * Bearer attach order (Layer 4 fix, build 29 — see
 * lib/token-bridge.ts for the full saga):
 *   1. tokenBridge.get() — synchronous, populated by sign-in handlers
 *      and refresh(). If present we use it without an await tick;
 *      this is the only path that survived in production after the
 *      previous three layers of SecureStore-race fixes proved
 *      insufficient.
 *   2. await getToken() — fallback for cold-launch reads before any
 *      sign-in event, hits lib/auth's in-memory cache then SecureStore.
 *      The refresh() useEffect typically populates the bridge during
 *      AuthProvider mount, so this path mostly serves the very first
 *      render between the provider mount and refresh resolution.
 */

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

/** Device telemetry headers attached to every request. */
export const devicePlatform = Platform.OS === "ios" ? "ios" : "android";
export const appVersion = Constants.expoConfig?.version ?? "unknown";

async function buildHeaders(
  extra?: HeadersInit,
  hasBody = true
): Promise<Headers> {
  const headers = new Headers(extra);
  if (hasBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  headers.set("X-Platform", devicePlatform);
  headers.set("X-App-Version", appVersion);
  const token = tokenBridge.get() ?? (await getToken());
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
}

/**
 * Default per-request timeout. RN's `fetch` has no built-in timeout —
 * if the server hangs (or the function exceeds Vercel's 300s limit
 * without sending an early response) the await waits forever. Without
 * this, an awaited api.* call in any UI flow (notably onboarding
 * step 9 — 2026-05-29 P0) traps the user with a spinner.
 *
 * 10s covers the slow-but-legitimate cases (cold Lambda, region
 * failover) while still being short enough that the user gets an
 * error path instead of an indefinite wait. Callers that need a
 * different value can pass `timeoutMs` via the options object.
 */
const DEFAULT_TIMEOUT_MS = 10_000;

async function request<T>(
  path: string,
  opts: RequestInit = {},
  {
    hasBody = true,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  }: { hasBody?: boolean; timeoutMs?: number } = {}
): Promise<T> {
  const headers = await buildHeaders(opts.headers, hasBody);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${apiBaseUrl()}${path}`, {
      ...opts,
      headers,
      signal: opts.signal ?? ctrl.signal,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const err = new Error(
        (body as { error?: string }).error ?? `HTTP ${res.status}`
      ) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }

    return res.json() as Promise<T>;
  } catch (err) {
    if (
      err instanceof Error &&
      (err.name === "AbortError" ||
        (err as { code?: string }).code === "ABORT_ERR")
    ) {
      const e = new Error(
        `Request to ${path} timed out after ${timeoutMs}ms`
      ) as Error & { timeout?: boolean };
      e.timeout = true;
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  get: <T>(path: string, opts?: RequestInit) =>
    request<T>(path, { method: "GET", ...opts }, { hasBody: false }),

  post: <T>(path: string, body: unknown, opts?: RequestInit) =>
    request<T>(path, {
      method: "POST",
      body: JSON.stringify(body),
      ...opts,
    }),

  patch: <T>(path: string, body: unknown, opts?: RequestInit) =>
    request<T>(path, {
      method: "PATCH",
      body: JSON.stringify(body),
      ...opts,
    }),

  put: <T>(path: string, body: unknown, opts?: RequestInit) =>
    request<T>(path, {
      method: "PUT",
      body: JSON.stringify(body),
      ...opts,
    }),

  del: <T>(path: string, opts?: RequestInit) =>
    request<T>(path, { method: "DELETE", ...opts }, { hasBody: false }),

  /**
   * Upload multipart/form-data (audio files). Manually attaches the
   * Bearer token since we skip the JSON Content-Type header — fetch
   * auto-sets multipart boundary when it sees a FormData body.
   *
   * Uses a longer 60s timeout because audio uploads are payload-bound
   * (typically 200KB-2MB over cellular) — the 10s JSON default would
   * abort mid-upload on a flaky connection.
   */
  upload: async <T>(
    path: string,
    formData: FormData,
    { timeoutMs = 60_000 }: { timeoutMs?: number } = {}
  ): Promise<T> => {
    const token = tokenBridge.get() ?? (await getToken());
    const headers: HeadersInit = {
      "X-Platform": devicePlatform,
      "X-App-Version": appVersion,
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${apiBaseUrl()}${path}`, {
        method: "POST",
        headers,
        body: formData,
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const err = new Error(
          (body as { error?: string }).error ?? `HTTP ${res.status}`
        ) as Error & { status?: number };
        err.status = res.status;
        throw err;
      }
      return res.json() as Promise<T>;
    } catch (err) {
      if (
        err instanceof Error &&
        (err.name === "AbortError" ||
          (err as { code?: string }).code === "ABORT_ERR")
      ) {
        const e = new Error(
          `Upload to ${path} timed out after ${timeoutMs}ms`
        ) as Error & { timeout?: boolean };
        e.timeout = true;
        throw e;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  },

  /** Resolved base URL. Useful when a call site needs to construct a
   *  non-JSON URL (e.g. audio src attribute). */
  baseUrl: apiBaseUrl,
};
