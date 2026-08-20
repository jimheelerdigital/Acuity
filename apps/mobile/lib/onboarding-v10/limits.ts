/**
 * v10 hard limits. DEPENDENCY-FREE ON PURPOSE — no imports, so this stays
 * loadable from a test runner that doesn't resolve the mobile `@/` alias.
 * The cap lived in upload.ts first and could not be asserted for exactly
 * that reason; an unenforceable guard is just a comment.
 */

/**
 * 🔒 HARD CAP — DO NOT RAISE UNTIL THE SIGNED-URL PATH COVERS
 *    /api/mobile/try-recording.
 *
 * 120s of HIGH_QUALITY AAC is ~1.9MB, comfortably under Vercel's 4.5MB
 * serverless body cap.
 *
 * The app's own MAX_AUDIO_BYTES guard (25MB) CANNOT protect this path: it is
 * 5.5× the platform limit, so Vercel rejects the request before the handler
 * ever runs. The failure therefore surfaces as an opaque 413 rather than the
 * tidy one at try-recording/route.ts:94 — which is precisely why the
 * production bug was hard to place.
 *
 * Raising this while v10 still posts multipart silently reintroduces that
 * bug on the north-star path (first debrief per fresh install). The 413 fix
 * converts BOTH /api/record and /api/mobile/try-recording to one shared
 * signed-URL direct-to-storage flow; once `uploadDebrief` is swapped to it,
 * this cap can be raised freely and the guarding test deleted.
 *
 * Enforced by apps/web/src/lib/evidence/v10-recording-cap.test.ts.
 */
export const V10_MAX_RECORDING_MS = 120_000;
