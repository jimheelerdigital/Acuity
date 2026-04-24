import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * CSP OAuth invariants — regression guard for the 2026-04-24 Google
 * OAuth outage.
 *
 * Context: Google OAuth sign-in was silently broken on production twice
 * this month. Both outages were CSP regressions. The first (2026-04-23,
 * commit 2b6aace) fixed a missing `worker-src 'self' blob:` for the
 * Supabase auth worker and added `accounts.google.com` to `connect-src`
 * for OIDC discovery — but overlooked that NextAuth v4's signIn()
 * posts a hidden form that 302-redirects to accounts.google.com, and
 * Chrome 105+ enforces `form-action` on redirect targets per CSP Level
 * 3. That gap caused the 2026-04-24 regression.
 *
 * These tests read `apps/web/next.config.js` directly and assert that
 * every CSP directive load-bearing for OAuth sign-in is present. If
 * someone edits the CSP and drops one of these origins from its
 * directive, CI fails at the source change — before the regression
 * ever ships.
 *
 * This is intentionally a lightweight string-grep test. The CSP is a
 * single string literal in the source; parsing it further would be
 * over-engineering. If we ever move to a structured CSP config, port
 * these assertions to the new representation.
 *
 * Related docs:
 *   - docs/SECURITY_AUDIT.md — broader CSP posture
 *   - PROGRESS.md — commits 2b6aace (initial CSP fix) and the 2026-04-24
 *     form-action follow-up commit that this test was added with.
 */

const NEXT_CONFIG_PATH = path.resolve(__dirname, "../../next.config.js");

function readCspString(): string {
  const source = readFileSync(NEXT_CONFIG_PATH, "utf8");
  // Extract the CSP_DIRECTIVES array (a const array of strings joined
  // with "; "). We don't need a parser — a single regex grab over the
  // array-literal body is enough to produce one long string we can
  // grep directive-by-directive.
  const match = source.match(/const CSP_DIRECTIVES = \[([\s\S]*?)\]\.join/);
  if (!match) {
    throw new Error(
      "Could not locate CSP_DIRECTIVES array in next.config.js — " +
        "did the export shape change? Update this test's regex."
    );
  }
  return match[1];
}

function findDirective(csp: string, name: string): string {
  // Match either the bare directive or the directive preceded by a
  // comment. Each entry in CSP_DIRECTIVES is a line of the form
  // `"<name> <values>"`, joined later with "; ". Look for the string
  // literal body.
  const re = new RegExp(`"(${name}\\s[^"]*)"`, "m");
  const match = csp.match(re);
  if (!match) {
    throw new Error(
      `CSP directive "${name}" not found in next.config.js. ` +
        "Either the directive was deleted (a regression), or the " +
        "directive list format changed — if the latter, update this test."
    );
  }
  return match[1];
}

describe("CSP OAuth invariants", () => {
  const csp = readCspString();

  describe("form-action directive", () => {
    const directive = findDirective(csp, "form-action");

    it("includes 'self' for same-origin form submissions", () => {
      expect(directive).toContain("'self'");
    });

    it("includes accounts.google.com for Google OAuth redirect", () => {
      // NextAuth v4 posts a form that 302-redirects to accounts.google.com.
      // Chrome 105+ enforces form-action on redirect targets per CSP3.
      // Removing this value re-breaks "Sign in with Google" silently.
      expect(directive).toContain("https://accounts.google.com");
    });

    it("includes checkout.stripe.com for Stripe Checkout form POST", () => {
      // Independent from OAuth, but load-bearing for the /upgrade
      // checkout flow. Asserting here so any future CSP edit that
      // drops Stripe also fails CI.
      expect(directive).toContain("https://checkout.stripe.com");
    });
  });

  describe("connect-src directive", () => {
    const directive = findDirective(csp, "connect-src");

    it("includes accounts.google.com for OIDC discovery XHR", () => {
      expect(directive).toContain("https://accounts.google.com");
    });

    it("includes oauth2.googleapis.com for token exchange", () => {
      expect(directive).toContain("https://oauth2.googleapis.com");
    });

    it("includes Supabase origins (REST + realtime)", () => {
      // Supabase auth flows depend on both. Flagging here so a future
      // CSP edit that drops them doesn't silently break magic-link +
      // storage-backed flows.
      expect(directive).toContain("https://*.supabase.co");
      expect(directive).toContain("wss://*.supabase.co");
    });
  });

  describe("worker-src directive", () => {
    const directive = findDirective(csp, "worker-src");

    it("allows blob: for Supabase auth SDK's Web Worker", () => {
      // Supabase spawns a Web Worker from a blob: URL. Without this,
      // worker-src falls back to script-src which does not allow blob:
      // and sign-in silently breaks. This was the first half of the
      // 2026-04-23 regression.
      expect(directive).toContain("blob:");
    });
  });
});
