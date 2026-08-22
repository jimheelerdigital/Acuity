import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards the identifiers that must survive the Acuity → Ripple rename.
 *
 * ── Why this test exists ─────────────────────────────────────────────
 * The rename is a find-and-replace over user-facing copy, and the strings
 * below look exactly like copy. They are not. Each one is a key into
 * something that already exists in the world — a keychain entry, an Apple
 * product, a storage bucket, a live deep link — and renaming it does not
 * produce an error. It produces silent, usually unrecoverable, data loss:
 *
 *   - AsyncStorage keys: every user loses their theme, re-sees the product
 *     tour, and gets re-prompted for notification permission (a ONE-SHOT
 *     OS resource — a re-prompt after a prior denial simply never appears,
 *     so their reminders stop working permanently).
 *   - acuity_session_token: everyone is signed out.
 *   - Apple product IDs are IMMUTABLE. Renaming one does not rename the
 *     product; it points the app at a product that does not exist, and
 *     existing subscribers stop resolving as subscribed.
 *   - Bundle id: a different bundle id is a DIFFERENT APP. New listing,
 *     zero users, zero reviews, no IAP continuity.
 *   - acuity:// scheme: breaks live Meta ad deep links and the magic-link
 *     auth callback.
 *   - Storage buckets: every existing Entry.audioPath points into them.
 *
 * None of that fails a typecheck or a build. So it fails here instead.
 *
 * This is deliberately a CONTENT test over real files rather than a lint
 * rule: it asserts the literals are still present where they are supposed
 * to be, which catches a rename no matter how it was performed.
 */

const REPO = join(__dirname, "..", "..", "..", "..", "..");

function read(rel: string): string {
  return readFileSync(join(REPO, rel), "utf8");
}

/** Every .ts/.tsx under a directory, skipping build output. */
function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    if (["node_modules", ".next", ".expo", "ios", "android", ".git"].includes(e)) {
      continue;
    }
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
}

describe("rename denylist — identifiers that must NOT become 'ripple'", () => {
  it("keeps the iOS bundle id and Android package", () => {
    // A different bundle id is a different app: new listing, no users, no
    // reviews, no IAP continuity.
    const appJson = read("apps/mobile/app.json");
    expect(appJson).toContain('"bundleIdentifier": "com.heelerdigital.acuity"');
    expect(appJson).toContain('"package": "com.heelerdigital.acuity"');
  });

  it("keeps the acuity:// deep-link scheme", () => {
    // Live Meta ad links and the magic-link auth callback both use it.
    expect(read("apps/mobile/app.json")).toContain('"scheme": "acuity"');
  });

  it("keeps the EAS slug", () => {
    expect(read("apps/mobile/app.json")).toContain('"slug": "acuity"');
  });

  it("keeps the SecureStore session-token key", () => {
    // Renaming signs every user out.
    expect(read("apps/mobile/lib/auth.ts")).toContain('"acuity_session_token"');
  });

  it("keeps every acuity.* / acuity_* local-storage key", () => {
    // The sharpest trap in the whole rename: these look like copy, and
    // renaming them silently wipes local state for every existing install.
    const REQUIRED = [
      '"acuity.tour.completed"',
      '"acuity.palette"',
      '"acuity.mode"',
      '"acuity.haptics"',
      '"acuity.anon_session_id"',
      '"acuity.push.prompted_at"',
      '"acuity.push.denied_at"',
      '"acuity.push.registered_at"',
      '"acuity.try_session_token"',
      '"acuity_has_launched"',
      '"acuity_last_active_ms"',
    ];
    const corpus = walk(join(REPO, "apps/mobile"))
      .map((f) => readFileSync(f, "utf8"))
      .join("\n");
    for (const key of REQUIRED) {
      expect(corpus, `storage key ${key} was renamed or removed`).toContain(key);
    }
  });

  it("keeps the store product identifiers", () => {
    // Apple product IDs are immutable. Renaming points the app at a
    // product that does not exist; existing subscribers stop resolving.
    const corpus = [
      ...walk(join(REPO, "apps/web/src")),
      ...walk(join(REPO, "apps/mobile")),
      ...walk(join(REPO, "packages/shared/src")),
    ]
      .map((f) => readFileSync(f, "utf8"))
      .join("\n");
    for (const id of [
      "com.heelerdigital.acuity.pro.monthly",
      "com.heelerdigital.acuity.pro.annual",
      "acuity_pro_monthly",
      "acuity_pro_annual",
    ]) {
      expect(corpus, `product id ${id} was renamed`).toContain(id);
    }
  });

  it("keeps the storage bucket names", () => {
    // Every existing Entry.audioPath points into these.
    const corpus = walk(join(REPO, "apps/web/src"))
      .map((f) => readFileSync(f, "utf8"))
      .join("\n");
    expect(corpus).toContain('"voice-entries"');
    expect(corpus).toContain('"voice-entries-try"');
  });

  it("keeps the @acuity/shared package scope", () => {
    expect(read("packages/shared/package.json")).toContain('"@acuity/shared"');
  });

  it("has NOT introduced a ripple-namespaced storage key for existing state", () => {
    // A rename could also appear as a NEW key alongside the old one, which
    // reads as "the setting reset itself". ripple.v10.* is the one
    // legitimate namespace (new state, introduced with v10 — nothing to
    // migrate), so anything else under ripple.* is suspicious.
    const corpus = walk(join(REPO, "apps/mobile"))
      .map((f) => readFileSync(f, "utf8"))
      .join("\n");
    const suspicious = [...corpus.matchAll(/"ripple[._][a-z0-9_.]+"/g)]
      .map((m) => m[0])
      .filter((k) => !k.startsWith('"ripple.v10.'));
    expect(suspicious, `unexpected ripple-namespaced keys: ${suspicious}`).toEqual(
      []
    );
  });
});
