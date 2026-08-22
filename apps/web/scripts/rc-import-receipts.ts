/**
 * RevenueCat receipt import — migrate existing subscribers into RC.
 *
 * Posts each existing subscription to RevenueCat's receipt-import endpoints so
 * RC knows about the 17 live subs (12 Stripe, 5 Apple) BEFORE it becomes the
 * source of truth. Without this step, cutover would look to RC like every
 * existing customer has no entitlement.
 *
 * ── Safety posture ───────────────────────────────────────────────────
 *  - DRY RUN IS THE DEFAULT. You must pass --apply to send anything.
 *  - Reads secrets from env only, never argv (a key in argv leaks into shell
 *    history and `ps` output).
 *  - Per-row logging + a summary, so a partial failure is legible.
 *  - Idempotent: RC's import is itself idempotent per (app_user_id, receipt),
 *    and we additionally keep a local ledger file so a re-run skips rows that
 *    already succeeded. A rerun after a network failure resumes rather than
 *    re-posting everything.
 *
 * ── Which API key ────────────────────────────────────────────────────
 * `POST /v1/receipts` requires a **PUBLIC, app-specific** key — NOT the
 * `sk_` secret key. Passing a secret returns HTTP 400 / code 7243
 * ("Secret API keys should not be used in your app"). RC treats
 * /receipts as client-facing; the same is true of GET /subscribers,
 * POST /attributes, POST /attribution and GET /offerings.
 *
 * The key is per-APP, so it depends on which store the row came from:
 *   kind: "stripe" → RC_PUBLIC_KEY_STRIPE  (the Stripe/web app's key)
 *   kind: "apple"  → RC_PUBLIC_KEY_IOS     (appl_…)
 *
 * There is no v2 alternative: API v2 can read customers/subscriptions,
 * transfer them, and grant entitlements, but has NO import-a-purchase
 * endpoint. Granting an entitlement via v2 was considered and rejected —
 * it creates a PROMOTIONAL grant with no real renewal date, which is both
 * the wrong data and, in our mapping, the `comp` source.
 *
 * ── Usage ────────────────────────────────────────────────────────────
 *   # 1. put the mapping file somewhere OUTSIDE the repo (it contains receipts)
 *   # 2. export the PUBLIC key(s) for the platforms you're importing
 *   export RC_PUBLIC_KEY_STRIPE=...          (never pass as an argument)
 *   npx tsx apps/web/scripts/rc-import-receipts.ts --file ~/rc-mapping.json
 *   npx tsx apps/web/scripts/rc-import-receipts.ts --file ~/rc-mapping.json --apply
 *
 * Options:
 *   --file <path>     mapping file (JSON array or JSONL). REQUIRED.
 *   --apply           actually POST to RevenueCat. Omit for a dry run.
 *   --only <kind>     restrict to "apple" or "stripe".
 *   --limit <n>       process at most n rows (useful for a 1-row canary).
 *   --ledger <path>   where to record successes. Default: <file>.ledger.json
 *   --concurrency <n> parallel requests. Default 2 — RC rate-limits, and this
 *                     is a one-time job over ~17 rows, so slow is free.
 *
 * ── Mapping file shape (produced by Cowork) ───────────────────────────
 *   [
 *     { "app_user_id": "<our User.id>", "kind": "apple",  "receipt_or_sub_token": "<base64 receipt>" },
 *     { "app_user_id": "<our User.id>", "kind": "stripe", "receipt_or_sub_token": "sub_1abc..." }
 *   ]
 *
 * `app_user_id` MUST be our `User.id` — that is what the mobile client aliases
 * via Purchases.logIn(), and what the RC webhook looks the user up by. Using an
 * email or a Stripe customer id here would import the subscription against an
 * id nothing will ever query.
 */

import "./load-env";

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// ─── Types ───────────────────────────────────────────────────────────

type ImportKind = "apple" | "stripe";

interface MappingRow {
  app_user_id: string;
  kind: ImportKind;
  receipt_or_sub_token: string;
  /** Optional: helps RC attach the right product. Not required. */
  product_id?: string;
  /** Optional, for logging only. Never sent to RC. */
  email?: string;
}

interface RowOutcome {
  app_user_id: string;
  /** "-" for a row that failed validation — never invent a kind we didn't read. */
  kind: ImportKind | "-";
  status: "would-import" | "imported" | "skipped-ledger" | "invalid" | "failed";
  detail: string;
  httpStatus?: number;
}

// ─── CLI parsing ─────────────────────────────────────────────────────

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  const get = (flag: string): string | null => {
    const i = args.indexOf(flag);
    return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
  };
  const has = (flag: string) => args.includes(flag);

  const file = get("--file");
  const only = get("--only");
  const limitRaw = get("--limit");
  const concurrencyRaw = get("--concurrency");

  if (only !== null && only !== "apple" && only !== "stripe") {
    fail(`--only must be "apple" or "stripe", got ${JSON.stringify(only)}`);
  }

  return {
    file,
    apply: has("--apply"),
    only: (only as ImportKind | null) ?? null,
    limit: limitRaw ? Number.parseInt(limitRaw, 10) : null,
    ledger: get("--ledger"),
    concurrency: concurrencyRaw ? Math.max(1, Number.parseInt(concurrencyRaw, 10)) : 2,
    help: has("--help") || has("-h"),
  };
}

function fail(message: string): never {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

// ─── Mapping file loading ────────────────────────────────────────────

/**
 * Accepts either a JSON array or JSONL (one object per line) — Cowork may
 * produce either, and guessing wrong shouldn't cost a round trip.
 */
function loadMapping(path: string): MappingRow[] {
  const abs = resolve(path);
  if (!existsSync(abs)) fail(`mapping file not found: ${abs}`);
  const raw = readFileSync(abs, "utf8").trim();
  if (raw.length === 0) fail(`mapping file is empty: ${abs}`);

  let parsed: unknown;
  if (raw.startsWith("[")) {
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      fail(`mapping file is not valid JSON: ${(err as Error).message}`);
    }
  } else {
    // JSONL
    const rows: unknown[] = [];
    for (const [i, line] of raw.split("\n").entries()) {
      const t = line.trim();
      if (t.length === 0) continue;
      try {
        rows.push(JSON.parse(t));
      } catch {
        fail(`mapping file line ${i + 1} is not valid JSON`);
      }
    }
    parsed = rows;
  }

  if (!Array.isArray(parsed)) fail("mapping file must contain an array of rows");
  return parsed as MappingRow[];
}

/** Validate one row without throwing, so one bad row doesn't kill the run. */
function validateRow(row: unknown, index: number): { ok: true; row: MappingRow } | { ok: false; detail: string } {
  if (typeof row !== "object" || row === null) {
    return { ok: false, detail: `row ${index} is not an object` };
  }
  const r = row as Partial<MappingRow>;
  if (typeof r.app_user_id !== "string" || r.app_user_id.trim().length === 0) {
    return { ok: false, detail: `row ${index} missing app_user_id` };
  }
  if (r.kind !== "apple" && r.kind !== "stripe") {
    return { ok: false, detail: `row ${index} (${r.app_user_id}) has invalid kind: ${String(r.kind)}` };
  }
  if (
    typeof r.receipt_or_sub_token !== "string" ||
    r.receipt_or_sub_token.trim().length === 0
  ) {
    return { ok: false, detail: `row ${index} (${r.app_user_id}) missing receipt_or_sub_token` };
  }
  return { ok: true, row: r as MappingRow };
}

// ─── Ledger (local idempotency) ──────────────────────────────────────

interface Ledger {
  imported: Record<string, string>; // key → ISO timestamp
}

function ledgerKey(row: MappingRow): string {
  // Keyed on user + kind + a short token fingerprint. The fingerprint keeps
  // the ledger from being a second copy of the receipts while still detecting
  // a changed token for the same user.
  const fp = row.receipt_or_sub_token.slice(-12);
  return `${row.app_user_id}:${row.kind}:${fp}`;
}

function loadLedger(path: string): Ledger {
  if (!existsSync(path)) return { imported: {} };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Ledger;
    return { imported: parsed.imported ?? {} };
  } catch {
    console.warn(`⚠ ledger at ${path} is unreadable — treating as empty`);
    return { imported: {} };
  }
}

function saveLedger(path: string, ledger: Ledger): void {
  writeFileSync(path, JSON.stringify(ledger, null, 2) + "\n", "utf8");
}

// ─── RevenueCat API ──────────────────────────────────────────────────

const RC_API_BASE = "https://api.revenuecat.com/v1";

/**
 * POST a receipt to RevenueCat.
 *
 * Apple: /receipts with `fetch_token` = the base64 App Store receipt (or an
 * StoreKit2 JWS transaction), plus `app_user_id` and the platform header.
 * Stripe: same endpoint, `fetch_token` = the Stripe subscription id, with
 * X-Platform: stripe. RC resolves it against the Stripe account connected in
 * the dashboard — which is why the Stripe integration must be configured in RC
 * BEFORE running this for Stripe rows.
 */
/** X-Platform value RC expects, per mapping row kind. */
function platformFor(kind: ImportKind): string {
  return kind === "apple" ? "ios" : "stripe";
}

/** Env var holding the PUBLIC app key for this kind. */
export function publicKeyEnvVar(kind: ImportKind): string {
  return kind === "apple" ? "RC_PUBLIC_KEY_IOS" : "RC_PUBLIC_KEY_STRIPE";
}

/**
 * Resolve the public key for a row's platform.
 *
 * Deliberately refuses to fall back to RC_SECRET_KEY: doing so would
 * reproduce the 7243 failure with a confusing message, and quietly sending
 * a secret to a client-facing endpoint is exactly what RC's error is
 * warning about.
 */
function publicKeyFor(kind: ImportKind): string | null {
  const raw = process.env[publicKeyEnvVar(kind)];
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
}

async function postReceipt(
  row: MappingRow,
  apiKey: string
): Promise<{ ok: true; httpStatus: number } | { ok: false; httpStatus: number; detail: string }> {
  const platform = platformFor(row.kind);

  const body: Record<string, unknown> = {
    app_user_id: row.app_user_id,
    fetch_token: row.receipt_or_sub_token,
  };
  if (row.product_id) body.product_id = row.product_id;

  let res: Response;
  try {
    res = await fetch(`${RC_API_BASE}/receipts`, {
      method: "POST",
      headers: {
        // PUBLIC app-specific key. A secret key here returns 7243.
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Platform": platform,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return {
      ok: false,
      httpStatus: 0,
      detail: `network error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (res.ok) return { ok: true, httpStatus: res.status };

  // Surface RC's error message — this runs against our own account, so there
  // is no attacker to leak information to, and the message is the whole
  // diagnostic value ("receipt already imported", "invalid product", …).
  let detail = `HTTP ${res.status}`;
  try {
    const text = await res.text();
    if (text) detail += `: ${text.slice(0, 400)}`;
  } catch {
    /* keep the status-only detail */
  }
  return { ok: false, httpStatus: res.status, detail };
}

// ─── Concurrency helper ──────────────────────────────────────────────

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

// ─── Main ────────────────────────────────────────────────────────────

function usage(): void {
  console.log(`
RevenueCat receipt import

  npx tsx apps/web/scripts/rc-import-receipts.ts --file <path> [--apply]

  --file <path>      mapping file (JSON array or JSONL). Required.
  --apply            actually POST to RevenueCat (default is a dry run)
  --only <kind>      "apple" | "stripe"
  --limit <n>        process at most n rows
  --ledger <path>    success ledger (default <file>.ledger.json)
  --concurrency <n>  parallel requests (default 2)

  PUBLIC app-specific keys must be in the environment (never as arguments):
    RC_PUBLIC_KEY_STRIPE   for kind: "stripe"
    RC_PUBLIC_KEY_IOS      for kind: "apple"
  NOT the sk_ secret key — POST /v1/receipts rejects it with code 7243.
`);
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    usage();
    return;
  }
  if (!opts.file) {
    usage();
    fail("--file is required");
  }

  // Keys from env ONLY, and PUBLIC app-specific keys — not the sk_ secret.
  // See the header: POST /v1/receipts rejects secret keys with code 7243.
  if (process.env.RC_SECRET_KEY && !process.env.RC_PUBLIC_KEY_STRIPE && !process.env.RC_PUBLIC_KEY_IOS) {
    console.warn(
      "\n⚠ RC_SECRET_KEY is set but no RC_PUBLIC_KEY_* is. /v1/receipts needs a\n" +
        "  PUBLIC app-specific key; a secret key returns 400 code 7243.\n"
    );
  }

  const ledgerPath = resolve(opts.ledger ?? `${opts.file}.ledger.json`);
  const ledger = loadLedger(ledgerPath);

  const rawRows = loadMapping(opts.file);
  console.log(`\nRevenueCat receipt import`);
  console.log(`  mode        : ${opts.apply ? "APPLY (will POST)" : "DRY RUN (no requests)"}`);
  console.log(`  mapping     : ${resolve(opts.file)} (${rawRows.length} rows)`);
  console.log(`  ledger      : ${ledgerPath} (${Object.keys(ledger.imported).length} already imported)`);
  console.log(
    `  keys        : stripe=${publicKeyFor("stripe") ? "present" : "absent"} apple=${publicKeyFor("apple") ? "present" : "absent"} (PUBLIC app keys)`
  );
  if (opts.only) console.log(`  only        : ${opts.only}`);
  if (opts.limit) console.log(`  limit       : ${opts.limit}`);
  console.log("");

  // Validate + filter first so the summary counts are honest.
  const outcomes: RowOutcome[] = [];
  const queue: MappingRow[] = [];

  for (const [i, raw] of rawRows.entries()) {
    const v = validateRow(raw, i);
    if (!v.ok) {
      outcomes.push({
        app_user_id: "(unparsed)",
        kind: "-",
        status: "invalid",
        detail: v.detail,
      });
      continue;
    }
    const row = v.row;
    if (opts.only && row.kind !== opts.only) continue;
    if (ledger.imported[ledgerKey(row)]) {
      outcomes.push({
        app_user_id: row.app_user_id,
        kind: row.kind,
        status: "skipped-ledger",
        detail: `already imported ${ledger.imported[ledgerKey(row)]}`,
      });
      continue;
    }
    queue.push(row);
    if (opts.limit && queue.length >= opts.limit) break;
  }

  if (queue.length === 0) {
    console.log("Nothing to do.\n");
    printSummary(outcomes, opts.apply);
    return;
  }

  // Fail BEFORE any request if a platform in the queue has no public key —
  // better one clear error than N identical 7243s.
  if (opts.apply) {
    const kinds = [...new Set(queue.map((r) => r.kind))];
    const missing = kinds.filter((k) => publicKeyFor(k) === null);
    if (missing.length > 0) {
      fail(
        `Missing PUBLIC API key(s) for: ${missing.join(", ")}\n` +
          missing.map((k) => `  export ${publicKeyEnvVar(k)}=...`).join("\n") +
          `\n\nThese are the per-app PUBLIC keys from RevenueCat → Project settings →\n` +
          `API keys → App-specific keys (Stripe/web app for stripe rows, iOS app for\n` +
          `apple rows). NOT the sk_ secret key — /v1/receipts rejects secrets with\n` +
          `code 7243. Dry runs need no key at all.`
      );
    }
  }

  const processed = await mapWithConcurrency(queue, opts.concurrency, async (row) => {
    const label = `${row.kind.padEnd(6)} ${row.app_user_id}${row.email ? ` <${row.email}>` : ""}`;

    if (!opts.apply) {
      console.log(`  · [dry-run] would import ${label}`);
      return {
        app_user_id: row.app_user_id,
        kind: row.kind,
        status: "would-import" as const,
        detail: "dry run",
      };
    }

    const res = await postReceipt(row, publicKeyFor(row.kind)!);
    if (res.ok) {
      console.log(`  ✓ imported ${label} (HTTP ${res.httpStatus})`);
      ledger.imported[ledgerKey(row)] = new Date().toISOString();
      // Persist after EVERY success so an interrupted run doesn't lose
      // progress and a rerun resumes instead of re-posting.
      saveLedger(ledgerPath, ledger);
      return {
        app_user_id: row.app_user_id,
        kind: row.kind,
        status: "imported" as const,
        detail: "ok",
        httpStatus: res.httpStatus,
      };
    }

    console.error(`  ✗ FAILED   ${label} — ${res.detail}`);
    return {
      app_user_id: row.app_user_id,
      kind: row.kind,
      status: "failed" as const,
      detail: res.detail,
      httpStatus: res.httpStatus,
    };
  });

  outcomes.push(...processed);
  console.log("");
  printSummary(outcomes, opts.apply);

  // Non-zero exit on any hard failure so CI / a wrapper notices.
  const failed = outcomes.filter((o) => o.status === "failed" || o.status === "invalid");
  if (failed.length > 0) process.exitCode = 1;
}

function printSummary(outcomes: RowOutcome[], applied: boolean): void {
  const count = (s: RowOutcome["status"]) => outcomes.filter((o) => o.status === s).length;

  console.log("─── Summary ───────────────────────────────");
  console.log(`  mode            : ${applied ? "APPLY" : "DRY RUN"}`);
  console.log(`  total rows seen : ${outcomes.length}`);
  if (!applied) console.log(`  would import    : ${count("would-import")}`);
  else console.log(`  imported        : ${count("imported")}`);
  console.log(`  skipped (ledger): ${count("skipped-ledger")}`);
  console.log(`  invalid rows    : ${count("invalid")}`);
  console.log(`  failed          : ${count("failed")}`);

  const problems = outcomes.filter((o) => o.status === "failed" || o.status === "invalid");
  if (problems.length > 0) {
    console.log("\n  Problems:");
    for (const p of problems) {
      console.log(`   - ${p.kind} ${p.app_user_id}: ${p.detail}`);
    }
  }

  console.log("");
  if (!applied) {
    console.log("  Dry run only — no requests were sent. Re-run with --apply to import.");
    console.log("  Tip: start with `--limit 1` as a canary before the full set.\n");
  }
}

main().catch((err) => {
  console.error("\n✗ unexpected error:", err);
  process.exit(1);
});
