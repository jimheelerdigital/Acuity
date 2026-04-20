import Constants from "expo-constants";

import { getToken } from "@/lib/auth";

/**
 * API client for the Next.js backend. Pulls the base URL from
 * app.json's `extra.apiUrl` (populated by the Expo config for
 * TestFlight/App Store builds) with an env-var override so local
 * dev can point at localhost. Every request auto-attaches the
 * Bearer token from SecureStore when present — the web backend's
 * `getAnySessionUserId` helper reads it and authorizes the request.
 */

function apiBaseUrl(): string {
  const extra = Constants.expoConfig?.extra as
    | { apiUrl?: string }
    | undefined;
  return (
    process.env.EXPO_PUBLIC_API_URL ??
    extra?.apiUrl ??
    "https://www.getacuity.io"
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
  const token = await getToken();
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

  del: <T>(path: string, opts?: RequestInit) =>
    request<T>(path, { method: "DELETE", ...opts }, { hasBody: false }),

  /**
   * Upload multipart/form-data (audio files). Manually attaches the
   * Bearer token since we skip the JSON Content-Type header — fetch
   * auto-sets multipart boundary when it sees a FormData body.
   */
  upload: async <T>(path: string, formData: FormData): Promise<T> => {
    const token = await getToken();
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
