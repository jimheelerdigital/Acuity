import Constants from "expo-constants";

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
    "https://getacuity.io"
  );
}

async function buildHeaders(
  extra?: HeadersInit,
  hasBody = true
): Promise<Headers> {
  const headers = new Headers(extra);
  if (hasBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const token = tokenBridge.get() ?? (await getToken());
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
}

async function request<T>(
  path: string,
  opts: RequestInit = {},
  { hasBody = true }: { hasBody?: boolean } = {}
): Promise<T> {
  const headers = await buildHeaders(opts.headers, hasBody);
  const res = await fetch(`${apiBaseUrl()}${path}`, {
    ...opts,
    headers,
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
   */
  upload: async <T>(path: string, formData: FormData): Promise<T> => {
    const token = tokenBridge.get() ?? (await getToken());
    const headers: HeadersInit = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${apiBaseUrl()}${path}`, {
      method: "POST",
      headers,
      body: formData,
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
  },

  /** Resolved base URL. Useful when a call site needs to construct a
   *  non-JSON URL (e.g. audio src attribute). */
  baseUrl: apiBaseUrl,
};
