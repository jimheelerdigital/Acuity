/**
 * Asserts that the Supabase Storage bucket holding voice recordings is
 * private. Re-runnable in CI / locally as a guardrail against an accidental
 * `public: true` flip on the bucket via the Supabase dashboard or admin API.
 *
 * Usage:
 *   set -a && source apps/web/.env.local && set +a && \
 *     npx tsx scripts/assert-bucket-private.ts
 *
 * Exits 0 if the bucket exists and is private.
 * Exits 1 if the bucket is missing, public, or any error occurs.
 */

import { createClient } from "@supabase/supabase-js";

const BUCKET = "voice-entries";

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    console.error(
      "[assert-bucket-private] FAIL: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is unset."
    );
    process.exit(1);
  }

  const sb = createClient(url, serviceRole);
  const { data, error } = await sb.storage.getBucket(BUCKET);

  if (error) {
    console.error(`[assert-bucket-private] FAIL: cannot fetch bucket "${BUCKET}":`, error);
    process.exit(1);
  }
  if (!data) {
    console.error(`[assert-bucket-private] FAIL: bucket "${BUCKET}" not found.`);
    process.exit(1);
  }
  if (data.public !== false) {
    console.error(
      `[assert-bucket-private] FAIL: bucket "${BUCKET}" is PUBLIC. Audio recordings would be retrievable by anyone who can guess the path. Flip it to private immediately.`
    );
    process.exit(1);
  }

  console.log(
    `[assert-bucket-private] OK: bucket "${BUCKET}" is private. file_size_limit=${data.file_size_limit ?? "(none)"}, allowed_mime_types=${JSON.stringify(data.allowed_mime_types ?? null)}.`
  );
}

main().catch((err) => {
  console.error("[assert-bucket-private] threw:", err);
  process.exit(1);
});
