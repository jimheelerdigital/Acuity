/**
 * v10 hard limits. DEPENDENCY-FREE ON PURPOSE — no imports, so this stays
 * loadable from a test runner that doesn't resolve the mobile `@/` alias.
 */

/**
 * Recording cap for the v10 onboarding debrief.
 *
 * This was 120_000 while v10 posted multipart audio, because Vercel's 4.5MB
 * serverless body cap rejected anything longer BEFORE the handler ran. That
 * constraint is gone: uploadDebrief now writes straight to Supabase Storage
 * via a signed URL, so the only ceiling left is Whisper's 25MB — which at
 * 64 kbps mono is over 50 minutes of audio.
 *
 * Matches the main recorder's 300s so the first debrief and every later one
 * behave the same way.
 */
export const V10_MAX_RECORDING_MS = 300_000;
