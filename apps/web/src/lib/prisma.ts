import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Force-set Prisma connection-pool params on the runtime DATABASE_URL.
 *
 * Why this lives in code instead of trusting the Vercel env var:
 *
 * Production was hitting `PrismaClientKnownRequestError P2024` —
 * "Timed out fetching a new connection from the connection pool" —
 * across /api/lifemap, /api/user/me, /api/lifemap/trend, /api/home,
 * /api/entries during normal page loads. Root cause: the Vercel env
 * had `DATABASE_URL=...?pgbouncer=true&connection_limit=1`, the
 * standard Supabase + serverless recipe from when each Vercel
 * function processed exactly one request per instance. With Fluid
 * Compute now reusing warm Lambdas across concurrent requests, the
 * single client-side connection becomes a hard bottleneck — every
 * second concurrent query waits behind the first and trips the
 * default 10s `pool_timeout`.
 *
 * Forcing connection_limit=10 + pool_timeout=30 here means the next
 * deploy can't accidentally regress the fix by forgetting to update
 * the env var. Why those numbers: PgBouncer (transaction pooler,
 * port 6543) multiplexes server-side, so 10 client-side handles do
 * NOT translate into 10 Postgres backends — Supabase free-tier's
 * 60-connection cap is unaffected. pool_timeout=30 absorbs occasional
 * burst contention without surfacing 500s.
 *
 * DIRECT_URL is intentionally left alone — it's the unpooled URL
 * used by `prisma migrate` and any code path that must run outside
 * a transaction pooler (rare). It doesn't go through this rewrite.
 *
 * Idempotent: existing `connection_limit` / `pool_timeout` query
 * params get overwritten; nothing else about the URL is touched.
 */
function withPoolParams(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    u.searchParams.set("connection_limit", "10");
    u.searchParams.set("pool_timeout", "30");
    return u.toString();
  } catch {
    // Malformed URL — let Prisma raise its own clearer error rather
    // than silently swallowing here.
    return rawUrl;
  }
}

function createPrismaClient() {
  // Guard: don't throw at module load if DATABASE_URL is absent (e.g. build time)
  if (!process.env.DATABASE_URL) {
    return null as unknown as PrismaClient;
  }
  return new PrismaClient({
    datasources: {
      db: { url: withPoolParams(process.env.DATABASE_URL) },
    },
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
