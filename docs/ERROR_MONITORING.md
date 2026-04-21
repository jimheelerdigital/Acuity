# Error Monitoring — Sentry setup

Added 2026-04-21 (W9). Before public beta this is how we get visibility
on runtime errors across web + mobile.

## Env vars Jim needs to set

### Web (Vercel project → Settings → Environment Variables)

| Key                        | Scope         | Value                                              | Purpose |
| -------------------------- | ------------- | -------------------------------------------------- | --- |
| `NEXT_PUBLIC_SENTRY_DSN`   | Production + Preview + Dev (public) | `https://...@oNNN.ingest.sentry.io/NNN` | Client + edge init reads this. Public by design — DSNs aren't secrets. |
| `SENTRY_DSN`               | Production + Preview + Dev (server-only) | Same value as above, optional — server falls back to the NEXT_PUBLIC one. | Server runtime init. Separating lets you rotate server-only if you ever split ingest endpoints. |
| `SENTRY_ORG`               | Production + Preview (build-time) | `acuity` (or whatever slug you chose)               | `withSentryConfig` needs this to upload source maps during `next build`. |
| `SENTRY_PROJECT`           | Production + Preview (build-time) | `acuity-web`                                       | Same. |
| `SENTRY_AUTH_TOKEN`        | Production + Preview (build-time, SECRET) | Sentry internal integration token with `project:releases` + `org:read` scope | Source-map upload auth. **Keep secret** — leaks let an attacker push fake release info. |

Without `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN`, `next.config.js`
falls through to the bare config (no Sentry wrapper) — local dev stays
fast and builds don't fail on missing Sentry. The runtime SDK still
captures errors using `NEXT_PUBLIC_SENTRY_DSN` if it's set; without
source maps the stack traces will be minified in prod.

Grab values from the Sentry dashboard after creating a project:

1. Sign up at sentry.io → create an organization (suggest slug `acuity`).
2. Create a **Next.js** project — copy the DSN shown. That's `NEXT_PUBLIC_SENTRY_DSN`.
3. Project settings → **Client Keys (DSN)** — copy the DSN (same as step 2).
4. Organization settings → **Developer Settings → Internal Integrations** → create one with `project:releases` + `org:read` scopes. Copy the token → `SENTRY_AUTH_TOKEN`.
5. `SENTRY_ORG` = the org slug (e.g. `acuity`). `SENTRY_PROJECT` = project slug (e.g. `acuity-web`).

### Mobile (Expo / EAS)

| Key                      | Scope               | Purpose |
| ------------------------ | ------------------- | --- |
| `EXPO_PUBLIC_SENTRY_DSN` | All build profiles  | Mobile JS bundle reads this at init time. |

Add to `apps/mobile/.env` or through EAS secret (`eas secret:create --name EXPO_PUBLIC_SENTRY_DSN --value '...'`). Rebuild the app with `eas build` — `@sentry/react-native` is a native module, JS-only OTA updates won't ship it.

## What we capture

- **Web:** client renders + server-side route errors + middleware errors. Source maps uploaded at build time when the 3 build-time vars are set.
- **Mobile:** JS errors + native crashes (once the EAS build lands). User gets tagged with a truncated 12-char id prefix + subscription segment — no raw userId or email.

## What we explicitly DON'T capture

All of these patterns get redacted in `beforeSend` / `beforeBreadcrumb`:

- `email`, `transcript`, `summary`, `content`, `entry`, `rawAnalysis`
- `passwordHash`, `password`, `token`, `sessionToken`
- `authorization` (request headers), `cookie`

See the scrub fn in `apps/web/sentry.server.config.ts` / `apps/mobile/lib/sentry.ts` for the pattern list. Keep it in sync when new PII fields land.

Session Replay is **disabled**. Record-screen DOM contains entry content at speak time; replay without a masking allowlist would be an immediate leak. Follow-up: ship replay with explicit `sensitive` class guards.

## Sample rates

| Signal  | Dev      | Prod   |
| ------- | -------- | ------ |
| Errors  | 100%     | 100%   |
| Traces  | 10%      | 1%     |
| Replay  | off      | off    |

## Error boundary

Web: `apps/web/src/app/global-error.tsx` — Next.js's top-level boundary. Renders a branded fallback with the Sentry `eventId` so Jim can correlate user reports to specific events.

Mobile: automatic via `@sentry/react-native` — React Native's default red-box is replaced by the Sentry error handler which logs + re-throws. If you want a custom fallback UI, add an `ErrorBoundary` component around the root Stack in `apps/mobile/app/_layout.tsx`.

## Tunnel route

Web config uses `tunnelRoute: "/monitoring"` — browser ad-blockers that block `*.ingest.sentry.io` won't swallow errors. Requests are proxied through `/monitoring` on your own domain.

## Verifying the setup

1. Set the env vars, deploy (or `npm run dev`).
2. Hit any page → open DevTools → Network → confirm a request to `/monitoring` (or `*.ingest.sentry.io` if tunnel disabled).
3. Throw a test error from a button click in dev:

   ```tsx
   <button onClick={() => { throw new Error("Sentry test"); }}>crash</button>
   ```

   Should appear in Sentry within ~30s.
4. Mobile: after EAS rebuild, install the dev build and force-crash from an action. Check Sentry → project → Issues.
