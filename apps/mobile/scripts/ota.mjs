#!/usr/bin/env node
/**
 * Publish an OTA update with exactly the env a store build gets.
 *
 * Why (2026-10-27): `eas update` does NOT apply eas.json build-profile
 * `env`, and on SDK 54 it doesn't load the EAS environment unless asked.
 * Update b00c20d6 shipped without EXPO_PUBLIC_HABITS etc. and switched
 * Habits/Growth off for everyone on 1.9.6.
 *
 * A build sees: EAS environment vars + the profile's eas.json `env`
 * (incl. `extends`). This script reproduces that (EAS env via
 * `eas env:exec`, profile env set on top), exports with a clean Metro
 * cache, refuses to publish unless the bundle provably carries that env
 * (see requiredMarkers), then publishes that exact bundle.
 *
 *   node scripts/ota.mjs --message "Fix X" [--profile production]
 *        [--platform ios|android|all] [--dry-run]
 *
 * --dry-run exports + verifies and stops before publishing.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MOBILE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

export function parseArgs(argv) {
  const out = { profile: "production", platform: "all", dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--message" || a === "-m") out.message = argv[++i];
    else if (a === "--profile") out.profile = argv[++i];
    else if (a === "--platform") out.platform = argv[++i];
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!["ios", "android", "all"].includes(out.platform)) {
    throw new Error(`--platform must be ios, android or all`);
  }
  if (!out.dryRun && !out.message) throw new Error("--message is required");
  return out;
}

/** Resolve a build profile the way EAS does for `extends` (env merges). */
export function resolveProfile(easJson, name, seen = new Set()) {
  const p = easJson.build?.[name];
  if (!p) throw new Error(`No build profile "${name}" in eas.json`);
  if (seen.has(name)) throw new Error(`extends cycle at "${name}"`);
  seen.add(name);
  const parent = p.extends ? resolveProfile(easJson, p.extends, seen) : {};
  return {
    ...parent,
    ...p,
    env: { ...(parent.env ?? {}), ...(p.env ?? {}) },
  };
}

/**
 * What must appear in the bundle for the export to count as built with
 * the right env. Checked by value, not by name: Expo inlines a missing
 * EXPO_PUBLIC_* as `undefined`, so a missing var leaves no trace of its
 * name (verified 2026-10-27).
 *  - the per-run export id (lib/sentry.ts reads it): proves the profile
 *    env reached the bundler and the Metro cache didn't serve a stale
 *    transform;
 *  - every long EXPO_PUBLIC_* value (DSN, RevenueCat keys). None is
 *    hard-coded in the app, so they only appear when inlined.
 * EXPO_PUBLIC_API_URL is skipped: the app hard-codes the same URL as a
 * fallback, so it would pass even when missing.
 */
export const VALUE_CHECK_MIN_LENGTH = 20;
export function requiredMarkers(profileEnv, exportId) {
  const markers = [["EXPO_PUBLIC_OTA_EXPORT_ID", exportId]];
  for (const [k, v] of Object.entries(profileEnv)) {
    if (
      k.startsWith("EXPO_PUBLIC_") &&
      k !== "EXPO_PUBLIC_API_URL" &&
      String(v).length >= VALUE_CHECK_MIN_LENGTH
    ) {
      markers.push([k, String(v)]);
    }
  }
  return markers;
}

/** Names of markers whose value is missing from the bundle. */
export function findMissing(bundleText, markers) {
  return markers.filter(([, v]) => !bundleText.includes(v)).map(([k]) => k);
}

export function newExportId(now = new Date()) {
  const stamp = now.toISOString().replace(/[-:T]/g, "").slice(0, 12);
  return `ota-${stamp}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * `expo export --platform all` includes web (no web support here), while
 * `eas update --platform all` means iOS + Android. Name both explicitly.
 */
export function exportPlatformFlags(platform) {
  return platform === "all"
    ? "--platform ios --platform android"
    : `--platform ${platform}`;
}

export function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

function listFiles(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? listFiles(p) : [p];
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const easJson = JSON.parse(readFileSync(join(MOBILE_DIR, "eas.json"), "utf8"));
  const profile = resolveProfile(easJson, args.profile);
  const channel = profile.channel;
  const environment = profile.environment ?? "production";
  if (!channel) throw new Error(`Profile "${args.profile}" has no channel`);
  const exportId = newExportId();
  const profileEnv = { ...(profile.env ?? {}), EXPO_PUBLIC_OTA_EXPORT_ID: exportId };
  const markers = requiredMarkers(profile.env ?? {}, exportId);

  // Profile env is set inside the command so it wins over the EAS
  // environment, matching builds (eas.json env takes precedence).
  const assigns = Object.entries(profileEnv)
    .map(([k, v]) => `${k}=${shellQuote(v)}`)
    .join(" ");
  const outDir = mkdtempSync(join(tmpdir(), "ripple-ota-"));
  const childEnv = { ...process.env };
  delete childEnv.NODE_ENV;

  console.log(`[ota] profile=${args.profile} channel=${channel} environment=${environment}`);
  console.log(`[ota] exporting (${args.platform}) to ${outDir}`);
  execFileSync(
    "eas",
    [
      "env:exec",
      environment,
      "--non-interactive",
      // --clear: Metro caches transforms with env values inlined; a warm
      // cache can ship a previous run's env (seen 2026-10-27).
      `env ${assigns} npx expo export --clear ${exportPlatformFlags(args.platform)} --output-dir ${shellQuote(outDir)}`,
    ],
    { cwd: MOBILE_DIR, stdio: "inherit", env: childEnv }
  );

  const bundles = listFiles(outDir).filter(
    (f) => /\.(hbc|js)$/.test(f) && /_expo[\\/]static[\\/]js/.test(f)
  );
  if (bundles.length === 0) throw new Error("[ota] no bundles found in export");
  for (const b of bundles) {
    const missing = findMissing(readFileSync(b).toString("latin1"), markers);
    if (missing.length) {
      throw new Error(
        `[ota] REFUSING to publish: ${b} is missing ${missing.join(", ")}`
      );
    }
  }
  console.log(
    `[ota] verified ${bundles.length} bundle(s): export id ${exportId} + ${markers.length - 1} env value(s) inlined`
  );

  if (args.dryRun) {
    console.log("[ota] --dry-run: not publishing");
    return;
  }
  execFileSync(
    "eas",
    [
      "env:exec",
      environment,
      "--non-interactive",
      `env ${assigns} eas update --skip-bundler --input-dir ${shellQuote(outDir)}` +
        ` --channel ${shellQuote(channel)} --environment ${shellQuote(environment)}` +
        ` --platform ${args.platform} --message ${shellQuote(args.message)} --non-interactive`,
    ],
    { cwd: MOBILE_DIR, stdio: "inherit", env: childEnv }
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
