/**
 * Side-effect env loader. Import this FIRST — before any "@/..." app module —
 * so DATABASE_URL and secrets are in process.env before "@/lib/prisma" builds
 * its client at import time.
 *
 * Why a separate module: tsx/esbuild hoists all `import` statements to the top
 * of the file, above any inline dotenv `config()` calls. A side-effect import
 * keeps its load order, so putting this first guarantees env is populated
 * before prisma is constructed. .env.local loads first; the repo-root .env
 * overrides it (authoritative secrets).
 */
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(__dirname, "..", ".env.local") });
config({ path: resolve(__dirname, "../../..", ".env"), override: true });
