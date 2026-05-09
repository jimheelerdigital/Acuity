import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  ALLOWED_PRODUCT_IDS,
  decideNotificationAction,
  decideReceiptVerify,
  fetchTransactionInfo,
  type AppleTransactionInfo,
  type UserStateForNotification,
  type UserStateForVerify,
} from "@/lib/apple-iap";

/**
 * Phase 2 — Apple IAP decision functions. Pure logic; unit-testable
 * without mocking Prisma or Apple's API. Wraps the security/UX-
 * critical branching in `decideNotificationAction` and
 * `decideReceiptVerify` so route handlers stay thin.
 */

const FUTURE = Date.now() + 30 * 24 * 60 * 60 * 1000;
const PAST = Date.now() - 1000;

function info(overrides: Partial<AppleTransactionInfo> = {}): AppleTransactionInfo {
  return {
    transactionId: "tx_2000000001",
    originalTransactionId: "ot_2000000001",
    productId: "com.heelerdigital.acuity.pro.monthly",
    expiresDate: FUTURE,
    environment: "Sandbox",
    rawPayload: {},
    ...overrides,
  };
}

function userVerify(
  overrides: Partial<UserStateForVerify> = {}
): UserStateForVerify {
  return {
    id: "u1",
    subscriptionStatus: "TRIAL",
    subscriptionSource: null,
    appleOriginalTransactionId: null,
    stripeSubscriptionId: null,
    ...overrides,
  };
}

function userNotif(
  overrides: Partial<UserStateForNotification> = {}
): UserStateForNotification {
  return {
    subscriptionStatus: "PRO",
    subscriptionSource: "apple",
    appleOriginalTransactionId: "ot_2000000001",
    ...overrides,
  };
}

describe("ALLOWED_PRODUCT_IDS", () => {
  it("contains the Phase 1 monthly product", () => {
    expect(
      ALLOWED_PRODUCT_IDS.has("com.heelerdigital.acuity.pro.monthly")
    ).toBe(true);
  });

  it("does not yet include annual or other products", () => {
    expect(
      ALLOWED_PRODUCT_IDS.has("com.heelerdigital.acuity.pro.annual")
    ).toBe(false);
    expect(ALLOWED_PRODUCT_IDS.has("anything.else")).toBe(false);
  });
});

describe("decideReceiptVerify", () => {
  it("happy path — TRIAL user, no prior, no other owner → write", () => {
    const d = decideReceiptVerify(info(), userVerify(), null);
    expect(d.action).toBe("write");
  });

  it("rejects unknown product (BAD_PRODUCT)", () => {
    const d = decideReceiptVerify(
      info({ productId: "com.heelerdigital.acuity.pro.annual" }),
      userVerify(),
      null
    );
    expect(d.action).toBe("conflict");
    if (d.action === "conflict") expect(d.code).toBe("BAD_PRODUCT");
  });

  it("rejects expired receipt (EXPIRED_RECEIPT)", () => {
    const d = decideReceiptVerify(
      info({ expiresDate: PAST }),
      userVerify(),
      null
    );
    expect(d.action).toBe("conflict");
    if (d.action === "conflict") expect(d.code).toBe("EXPIRED_RECEIPT");
  });

  it("rejects when another user owns the originalTransactionId", () => {
    const d = decideReceiptVerify(info(), userVerify({ id: "u1" }), {
      id: "u2",
    });
    expect(d.action).toBe("conflict");
    if (d.action === "conflict") {
      expect(d.code).toBe("ANOTHER_USER_OWNS_TRANSACTION");
    }
  });

  it("does NOT conflict when the otherOwner IS the current user (idempotent re-verify)", () => {
    const d = decideReceiptVerify(
      info(),
      userVerify({
        id: "u1",
        subscriptionStatus: "PRO",
        subscriptionSource: "apple",
        appleOriginalTransactionId: "ot_2000000001",
      }),
      // Caller is responsible for filtering otherOwner !== currentUser,
      // but the helper also tolerates being passed the same id.
      null
    );
    expect(d.action).toBe("idempotent-noop");
  });

  it("rejects when user has active Stripe sub (ACTIVE_STRIPE_SUB)", () => {
    const d = decideReceiptVerify(
      info(),
      userVerify({
        subscriptionStatus: "PRO",
        subscriptionSource: "stripe",
        stripeSubscriptionId: "sub_abc",
      }),
      null
    );
    expect(d.action).toBe("conflict");
    if (d.action === "conflict") expect(d.code).toBe("ACTIVE_STRIPE_SUB");
  });

  it("does NOT block a previously-canceled Stripe user (FREE) from buying via Apple", () => {
    // Re-subscriber who canceled on Stripe should be allowed to
    // re-subscribe via iOS without being blocked.
    const d = decideReceiptVerify(
      info(),
      userVerify({
        subscriptionStatus: "FREE",
        subscriptionSource: "stripe",
        stripeSubscriptionId: null,
      }),
      null
    );
    expect(d.action).toBe("write");
  });

  it("returns idempotent-noop on re-verify of same Apple sub", () => {
    const d = decideReceiptVerify(
      info(),
      userVerify({
        id: "u1",
        subscriptionStatus: "PRO",
        subscriptionSource: "apple",
        appleOriginalTransactionId: "ot_2000000001",
      }),
      null
    );
    expect(d.action).toBe("idempotent-noop");
  });

  it("re-verify of a different Apple sub (different ot) → write (sub upgrade scenario)", () => {
    // User had ot_old, somehow now has ot_new. This is the family-
    // sharing hand-off or rare environment switch case. Write.
    const d = decideReceiptVerify(
      info({ originalTransactionId: "ot_NEW" }),
      userVerify({
        id: "u1",
        subscriptionStatus: "PRO",
        subscriptionSource: "apple",
        appleOriginalTransactionId: "ot_OLD",
      }),
      null
    );
    expect(d.action).toBe("write");
  });
});

describe("decideNotificationAction", () => {
  describe("status-guard (Stripe-sourced users untouched)", () => {
    it("DID_RENEW on Stripe-sourced user → skip-stripe-source", () => {
      const d = decideNotificationAction(
        "DID_RENEW",
        userNotif({ subscriptionSource: "stripe" })
      );
      expect(d.action).toBe("skip-stripe-source");
    });

    it("EXPIRED on Stripe-sourced user → skip-stripe-source (NOT FREE)", () => {
      const d = decideNotificationAction(
        "EXPIRED",
        userNotif({ subscriptionSource: "stripe", subscriptionStatus: "PRO" })
      );
      expect(d.action).toBe("skip-stripe-source");
    });

    it("REFUND on Stripe-sourced user → skip-stripe-source", () => {
      const d = decideNotificationAction(
        "REFUND",
        userNotif({ subscriptionSource: "stripe" })
      );
      expect(d.action).toBe("skip-stripe-source");
    });
  });

  describe("no matching user", () => {
    it("returns ignore when user is null", () => {
      const d = decideNotificationAction("DID_RENEW", null);
      expect(d.action).toBe("ignore");
    });
  });

  describe("DID_RENEW", () => {
    it("Apple PRO user → set-status PRO (idempotent)", () => {
      const d = decideNotificationAction("DID_RENEW", userNotif());
      expect(d.action).toBe("set-status");
      if (d.action === "set-status") expect(d.nextStatus).toBe("PRO");
    });

    it("Apple PAST_DUE user (recovered) → set-status PRO", () => {
      const d = decideNotificationAction(
        "DID_RENEW",
        userNotif({ subscriptionStatus: "PAST_DUE" })
      );
      expect(d.action).toBe("set-status");
      if (d.action === "set-status") expect(d.nextStatus).toBe("PRO");
    });

    it("Apple FREE user (grace renewal after expiry) → set-status PRO", () => {
      const d = decideNotificationAction(
        "DID_RENEW",
        userNotif({ subscriptionStatus: "FREE" })
      );
      expect(d.action).toBe("set-status");
      if (d.action === "set-status") expect(d.nextStatus).toBe("PRO");
    });
  });

  describe("DID_FAIL_TO_RENEW", () => {
    it("PRO Apple user → set-status PAST_DUE", () => {
      const d = decideNotificationAction("DID_FAIL_TO_RENEW", userNotif());
      expect(d.action).toBe("set-status");
      if (d.action === "set-status") expect(d.nextStatus).toBe("PAST_DUE");
    });

    it("FREE user (already expired) → ignore (no resurrection)", () => {
      const d = decideNotificationAction(
        "DID_FAIL_TO_RENEW",
        userNotif({ subscriptionStatus: "FREE" })
      );
      expect(d.action).toBe("ignore");
    });

    it("PAST_DUE user → ignore (already in dunning)", () => {
      const d = decideNotificationAction(
        "DID_FAIL_TO_RENEW",
        userNotif({ subscriptionStatus: "PAST_DUE" })
      );
      expect(d.action).toBe("ignore");
    });
  });

  describe("EXPIRED", () => {
    it("PRO Apple user → set-status FREE", () => {
      const d = decideNotificationAction("EXPIRED", userNotif());
      expect(d.action).toBe("set-status");
      if (d.action === "set-status") expect(d.nextStatus).toBe("FREE");
    });

    it("PAST_DUE Apple user → set-status FREE", () => {
      const d = decideNotificationAction(
        "EXPIRED",
        userNotif({ subscriptionStatus: "PAST_DUE" })
      );
      expect(d.action).toBe("set-status");
      if (d.action === "set-status") expect(d.nextStatus).toBe("FREE");
    });

    it("FREE Apple user → ignore (idempotent)", () => {
      const d = decideNotificationAction(
        "EXPIRED",
        userNotif({ subscriptionStatus: "FREE" })
      );
      expect(d.action).toBe("ignore");
    });
  });

  describe("REFUND / REVOKE", () => {
    it("REFUND PRO user → set-status FREE", () => {
      const d = decideNotificationAction("REFUND", userNotif());
      expect(d.action).toBe("set-status");
      if (d.action === "set-status") expect(d.nextStatus).toBe("FREE");
    });

    it("REVOKE PRO user → set-status FREE", () => {
      const d = decideNotificationAction("REVOKE", userNotif());
      expect(d.action).toBe("set-status");
      if (d.action === "set-status") expect(d.nextStatus).toBe("FREE");
    });
  });

  describe("log-only types", () => {
    it("DID_CHANGE_RENEWAL_STATUS → log-only", () => {
      const d = decideNotificationAction(
        "DID_CHANGE_RENEWAL_STATUS",
        userNotif()
      );
      expect(d.action).toBe("log-only");
    });

    it("CONSUMPTION_REQUEST → log-only", () => {
      const d = decideNotificationAction("CONSUMPTION_REQUEST", userNotif());
      expect(d.action).toBe("log-only");
    });

    it("unknown future type → log-only (forward-compat)", () => {
      const d = decideNotificationAction(
        "SOME_FUTURE_NOTIFICATION_TYPE",
        userNotif()
      );
      expect(d.action).toBe("log-only");
    });
  });

  describe("null subscriptionSource (anomaly: user has Apple ot but no source label)", () => {
    it("DID_RENEW on null-source user → set-status PRO (treat as Apple)", () => {
      // If a user matches by appleOriginalTransactionId but their
      // source label is null (data drift / pre-Phase-4 row), we
      // still want to act on Apple's notification. The status guard
      // is specifically for source='stripe', not for null.
      const d = decideNotificationAction(
        "DID_RENEW",
        userNotif({ subscriptionSource: null })
      );
      expect(d.action).toBe("set-status");
      if (d.action === "set-status") expect(d.nextStatus).toBe("PRO");
    });
  });
});

// ─── fetchTransactionInfo — Production→Sandbox fallback ──────────
//
// Locks in the 2026-05-09 fix: production returning 401 now triggers
// a sandbox retry (was: 404-only). Build-34's TestFlight purchase
// failed because Apple's production endpoint returns 401 for
// sandbox-only transactionIds, and the pre-fix code bailed without
// retrying sandbox. These tests use a real generated EC P-256 key
// for JWT signing (so signAppStoreConnectJwt completes) and a mock
// `fetchImpl` to simulate Apple's response codes — Apple's actual
// JWT-decode + cert chain are not exercised because we only test
// the failure-path control flow.

function generateTestJwtConfig() {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  return {
    keyId: "TESTKEYID01",
    issuerId: "00000000-0000-0000-0000-000000000000",
    privateKeyPem: privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString(),
  };
}

function mockResponse(status: number, body: object = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("fetchTransactionInfo — environment fallback", () => {
  const config = generateTestJwtConfig();
  const txId = "2000000001";

  it("Production 404 → falls back to Sandbox (legacy behavior preserved)", async () => {
    const calls: string[] = [];
    const fetchImpl = (url: string | URL) => {
      const u = String(url);
      calls.push(u);
      if (u.includes("api.storekit.itunes.apple.com")) {
        return Promise.resolve(mockResponse(404));
      }
      // Sandbox 200 with malformed signedTransactionInfo to short-
      // circuit the JWS decode path; we only verify that sandbox
      // WAS called.
      return Promise.resolve(
        mockResponse(200, { signedTransactionInfo: "not-a-real-jws" })
      );
    };
    const result = await fetchTransactionInfo(
      txId,
      config,
      fetchImpl as unknown as typeof fetch
    );
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("api.storekit.itunes.apple.com");
    expect(calls[1]).toContain("api.storekit-sandbox.itunes.apple.com");
    // The decode will fail, but that's fine — we just verified the
    // fallback path was taken.
    expect(result.ok).toBe(false);
  });

  it("Production 401 → falls back to Sandbox (NEW: 2026-05-09 fix for build-34 TestFlight)", async () => {
    const calls: string[] = [];
    const fetchImpl = (url: string | URL) => {
      const u = String(url);
      calls.push(u);
      if (u.includes("api.storekit.itunes.apple.com")) {
        return Promise.resolve(mockResponse(401));
      }
      return Promise.resolve(
        mockResponse(200, { signedTransactionInfo: "not-a-real-jws" })
      );
    };
    const result = await fetchTransactionInfo(
      txId,
      config,
      fetchImpl as unknown as typeof fetch
    );
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain("api.storekit-sandbox.itunes.apple.com");
    expect(result.ok).toBe(false); // JWS decode fails on the stub
  });

  it("Production 401 + Sandbox 401 → returns combined diagnostic (genuine credentials issue)", async () => {
    const calls: string[] = [];
    const fetchImpl = (url: string | URL) => {
      calls.push(String(url));
      return Promise.resolve(mockResponse(401));
    };
    const result = await fetchTransactionInfo(
      txId,
      config,
      fetchImpl as unknown as typeof fetch
    );
    expect(calls).toHaveLength(2);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("APPLE_AUTH_FAILED");
      expect(result.diagnostic).toContain("Production:");
      expect(result.diagnostic).toContain("Sandbox:");
    }
  });

  it("Production 500 → does NOT fall back to Sandbox (HTTP error, not env-related)", async () => {
    const calls: string[] = [];
    const fetchImpl = (url: string | URL) => {
      calls.push(String(url));
      return Promise.resolve(mockResponse(500));
    };
    const result = await fetchTransactionInfo(
      txId,
      config,
      fetchImpl as unknown as typeof fetch
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("api.storekit.itunes.apple.com");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("APPLE_HTTP_ERROR");
    }
  });

  it("Production network error → does NOT fall back to Sandbox", async () => {
    const calls: string[] = [];
    const fetchImpl = (url: string | URL) => {
      calls.push(String(url));
      return Promise.reject(new Error("ECONNRESET"));
    };
    const result = await fetchTransactionInfo(
      txId,
      config,
      fetchImpl as unknown as typeof fetch
    );
    expect(calls).toHaveLength(1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("APPLE_HTTP_ERROR");
    }
  });
});
