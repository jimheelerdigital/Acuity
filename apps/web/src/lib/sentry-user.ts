/**
 * Sentry user-tagging helper. The raw User.id is a cuid — not PII by
 * itself, but we'd rather send a HMAC over it so a Sentry incident
 * doesn't give casual viewers a mapping back to real account ids
 * (especially for internal debugging UIs that inherit Sentry's data).
 *
 * Hash uses NEXTAUTH_SECRET so only servers with the secret can
 * reverse-lookup. Client code imports setHashedUser which does a
 * short fetch-less PRF — we can't read the secret client-side, so
 * the client calls /api/sentry/tag to get the server-computed hash
 * once per session. Implementation of that endpoint left for a
 * follow-up; for this first pass we tag with the raw id on the
 * server and skip user tagging on the client.
 */

import { createHmac } from "crypto";

export function hashUserIdForSentry(userId: string): string {
  const secret = process.env.NEXTAUTH_SECRET ?? "dev-unsigned";
  return createHmac("sha256", secret)
    .update(userId)
    .digest("hex")
    .slice(0, 16); // 16 hex chars is enough for dedup + correlation
}
