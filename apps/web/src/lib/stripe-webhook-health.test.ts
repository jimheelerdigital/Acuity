import { describe, expect, it } from "vitest";

import {
  assessWebhookHealth,
  DELIVERY_GRACE_MS,
  EXPECTED_WEBHOOK_URL,
  QUIET_THRESHOLD_MS,
  type StripeEventSummary,
  type WebhookHealthInput,
} from "./stripe-webhook-health";

const NOW = Date.UTC(2026, 7, 24, 12, 0, 0); // 2026-08-24T12:00:00Z

const HEALTHY_ENDPOINT = {
  id: "we_1TPqdBD9XJakJqj5dgHvjrbX",
  status: "enabled",
  url: EXPECTED_WEBHOOK_URL,
};

/** Seconds-since-epoch for `hoursAgo` before NOW, as Stripe returns. */
function createdHoursAgo(hoursAgo: number): number {
  return Math.floor((NOW - hoursAgo * 3_600_000) / 1000);
}

function event(id: string, hoursAgo: number, type = "invoice.payment_succeeded"): StripeEventSummary {
  return { id, type, created: createdHoursAgo(hoursAgo) };
}

function input(overrides: Partial<WebhookHealthInput> = {}): WebhookHealthInput {
  return {
    now: NOW,
    endpoint: HEALTHY_ENDPOINT,
    lastProcessedAt: NOW - 2 * 3_600_000,
    stripeEvents: [],
    ingestedIds: new Set<string>(),
    undeliveredIds: new Set<string>(),
    ...overrides,
  };
}

describe("assessWebhookHealth — the false-alarm fix", () => {
  it("is HEALTHY when quiet for 35.8h with nothing for Stripe to deliver (the 2026-08-24 false alarm)", () => {
    // Reproduces the live state that would have emailed under the old 24h
    // rule: last ingest 2026-08-23T01:00Z, endpoint enabled, Stripe idle.
    const verdict = assessWebhookHealth(
      input({ lastProcessedAt: NOW - 35.8 * 3_600_000, stripeEvents: [] })
    );

    expect(verdict.healthy).toBe(true);
    expect(verdict.findings).toEqual([]);
    expect(verdict.quietHours).toBe(35.8);
  });

  it("is HEALTHY at 53.5h quiet — the longest real gap in the 90 days to 2026-08-24", () => {
    const verdict = assessWebhookHealth(
      input({ lastProcessedAt: NOW - 53.5 * 3_600_000 })
    );
    expect(verdict.healthy).toBe(true);
  });

  it("is HEALTHY past the 72h quiet threshold when Stripe also has nothing", () => {
    const verdict = assessWebhookHealth(
      input({ lastProcessedAt: NOW - (QUIET_THRESHOLD_MS + 3_600_000) })
    );
    expect(verdict.healthy).toBe(true);
    expect(verdict.summary).toContain("Stripe has nothing to deliver");
  });

  it("is HEALTHY with an empty ledger when Stripe has no events either (fresh account)", () => {
    const verdict = assessWebhookHealth(
      input({ lastProcessedAt: null, stripeEvents: [] })
    );
    expect(verdict.healthy).toBe(true);
    expect(verdict.quietHours).toBeNull();
  });
});

describe("assessWebhookHealth — endpoint configuration", () => {
  it("flags a disabled endpoint (the exact 2026-06-12 failure)", () => {
    const verdict = assessWebhookHealth(
      input({ endpoint: { ...HEALTHY_ENDPOINT, status: "disabled" } })
    );
    expect(verdict.healthy).toBe(false);
    expect(verdict.findings.map((f) => f.kind)).toEqual(["endpoint_disabled"]);
  });

  it("flags a www URL, which 308-redirects and Stripe will not follow", () => {
    const verdict = assessWebhookHealth(
      input({
        endpoint: {
          ...HEALTHY_ENDPOINT,
          url: "https://www.goripple.io/api/stripe/webhook",
        },
      })
    );
    expect(verdict.findings.map((f) => f.kind)).toEqual(["endpoint_url_mismatch"]);
  });

  it("flags a missing endpoint even while the ledger looks recent", () => {
    const verdict = assessWebhookHealth(
      input({ endpoint: null, lastProcessedAt: NOW - 60_000 })
    );
    expect(verdict.findings.map((f) => f.kind)).toEqual(["endpoint_missing"]);
  });

  it("reports both findings when the endpoint is disabled AND misrouted", () => {
    const verdict = assessWebhookHealth(
      input({
        endpoint: {
          ...HEALTHY_ENDPOINT,
          status: "disabled",
          url: "https://www.goripple.io/api/stripe/webhook",
        },
      })
    );
    expect(verdict.findings.map((f) => f.kind)).toEqual([
      "endpoint_disabled",
      "endpoint_url_mismatch",
    ]);
  });
});

describe("assessWebhookHealth — delivery + ingestion gaps", () => {
  it("flags events Stripe reports as undelivered and we never ingested", () => {
    const verdict = assessWebhookHealth(
      input({
        stripeEvents: [event("evt_a", 5), event("evt_b", 6)],
        undeliveredIds: new Set(["evt_a", "evt_b"]),
      })
    );
    expect(verdict.healthy).toBe(false);
    const finding = verdict.findings.find((f) => f.kind === "delivery_failure");
    expect(finding?.eventIds).toEqual(["evt_a", "evt_b"]);
  });

  it("does NOT flag an undelivered event we already ingested (another endpoint's failure)", () => {
    // `delivery_success:false` is account-wide. If it reached OUR ledger, our
    // pipe worked — the failure belongs to some other destination.
    const verdict = assessWebhookHealth(
      input({
        stripeEvents: [event("evt_a", 5)],
        ingestedIds: new Set(["evt_a"]),
        undeliveredIds: new Set(["evt_a"]),
      })
    );
    expect(verdict.healthy).toBe(true);
  });

  it("flags an ingestion gap: Stripe believes it delivered, our ledger has nothing", () => {
    // Catches what a delivery-side check cannot — signature mismatch, a
    // handler that 200s after crashing, a failed ledger write.
    const verdict = assessWebhookHealth(
      input({ stripeEvents: [event("evt_a", 5), event("evt_b", 4)] })
    );
    const finding = verdict.findings.find((f) => f.kind === "ingestion_gap");
    expect(finding?.eventIds).toEqual(["evt_a", "evt_b"]);
  });

  it("keeps delivery_failure and ingestion_gap disjoint", () => {
    const verdict = assessWebhookHealth(
      input({
        stripeEvents: [event("evt_a", 5), event("evt_b", 4)],
        undeliveredIds: new Set(["evt_a"]),
      })
    );
    expect(
      verdict.findings.find((f) => f.kind === "delivery_failure")?.eventIds
    ).toEqual(["evt_a"]);
    expect(
      verdict.findings.find((f) => f.kind === "ingestion_gap")?.eventIds
    ).toEqual(["evt_b"]);
  });

  it("ignores events inside the grace window — Stripe may still be retrying", () => {
    const insideGrace = DELIVERY_GRACE_MS / 3_600_000 / 2; // half the grace
    const verdict = assessWebhookHealth(
      input({
        stripeEvents: [event("evt_fresh", insideGrace)],
        undeliveredIds: new Set(["evt_fresh"]),
      })
    );
    expect(verdict.healthy).toBe(true);
    expect(verdict.agedEventCount).toBe(0);
    expect(verdict.stripeEventCount).toBe(1);
  });

  it("is HEALTHY when every aged Stripe event is present in our ledger", () => {
    const verdict = assessWebhookHealth(
      input({
        stripeEvents: [event("evt_a", 5), event("evt_b", 10)],
        ingestedIds: new Set(["evt_a", "evt_b"]),
      })
    );
    expect(verdict.healthy).toBe(true);
    expect(verdict.summary).toContain("2/2 aged Stripe event(s) ingested");
  });
});

describe("assessWebhookHealth — the retained time-based fallback", () => {
  it("never fires on quiet alone — Stripe-side activity is required", () => {
    const veryQuiet = assessWebhookHealth(
      input({ lastProcessedAt: NOW - 30 * 24 * 3_600_000, stripeEvents: [] })
    );
    expect(veryQuiet.healthy).toBe(true);
    expect(
      veryQuiet.findings.some((f) => f.kind === "quiet_with_stripe_activity")
    ).toBe(false);
  });

  it("surfaces the contradiction when >72h quiet coexists with ingested Stripe activity", () => {
    // Defence-in-depth: the per-event checks say everything landed, yet the
    // ledger's high-water mark is 72h+ old. Those cannot both be true, so
    // report it rather than assume the per-event pass was exhaustive.
    const verdict = assessWebhookHealth(
      input({
        lastProcessedAt: NOW - (QUIET_THRESHOLD_MS + 3_600_000),
        stripeEvents: [event("evt_a", 5)],
        ingestedIds: new Set(["evt_a"]),
      })
    );
    expect(verdict.healthy).toBe(false);
    expect(verdict.findings.map((f) => f.kind)).toEqual([
      "quiet_with_stripe_activity",
    ]);
  });

  it("does not double-report when a real per-event finding already explains the quiet", () => {
    const verdict = assessWebhookHealth(
      input({
        lastProcessedAt: NOW - (QUIET_THRESHOLD_MS + 3_600_000),
        stripeEvents: [event("evt_a", 5)],
      })
    );
    expect(verdict.findings.map((f) => f.kind)).toEqual(["ingestion_gap"]);
  });
});
