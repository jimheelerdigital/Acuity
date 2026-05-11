import { describe, expect, it } from "vitest";

import {
  classifyPurchaseError,
  classifyRestoreOutcome,
  classifyVerifyResponse,
  purchaseErrorMessage,
} from "@acuity/shared";

/**
 * Phase 3a — pure decision functions for the iOS IAP flow.
 * These live in @acuity/shared so this apps/web vitest harness
 * can run them (apps/mobile has no test runner today).
 */

describe("classifyVerifyResponse", () => {
  it("200 ok → success", () => {
    const r = classifyVerifyResponse({ status: 200, body: { ok: true } });
    expect(r.kind).toBe("success");
  });

  it("200 with idempotent flag → idempotent-success", () => {
    const r = classifyVerifyResponse({
      status: 200,
      body: { ok: true, idempotent: true },
    });
    expect(r.kind).toBe("idempotent-success");
  });

  it("409 ACTIVE_STRIPE_SUB → manage-on-web", () => {
    const r = classifyVerifyResponse({
      status: 409,
      body: { code: "ACTIVE_STRIPE_SUB", error: "blah" },
    });
    expect(r.kind).toBe("ux-conflict");
    if (r.kind === "ux-conflict") {
      expect(r.route).toBe("manage-on-web");
      expect(r.message).toBe("blah"); // server message preferred
    }
  });

  it("409 ACTIVE_STRIPE_SUB without server message → uses fallback", () => {
    const r = classifyVerifyResponse({
      status: 409,
      body: { code: "ACTIVE_STRIPE_SUB" },
    });
    if (r.kind === "ux-conflict") {
      expect(r.route).toBe("manage-on-web");
      expect(r.message).toMatch(/web/i);
    }
  });

  it("409 ANOTHER_USER_OWNS_TRANSACTION → contact-support", () => {
    const r = classifyVerifyResponse({
      status: 409,
      body: { code: "ANOTHER_USER_OWNS_TRANSACTION" },
    });
    expect(r.kind).toBe("ux-conflict");
    if (r.kind === "ux-conflict") {
      expect(r.route).toBe("contact-support");
    }
  });

  it("409 unknown code → show-error", () => {
    const r = classifyVerifyResponse({
      status: 409,
      body: { code: "UNKNOWN_CONFLICT", error: "x" },
    });
    if (r.kind === "ux-conflict") expect(r.route).toBe("show-error");
  });

  it("400 BAD_PRODUCT → show-error with update-the-app copy", () => {
    const r = classifyVerifyResponse({
      status: 400,
      body: { code: "BAD_PRODUCT" },
    });
    expect(r.kind).toBe("ux-conflict");
    if (r.kind === "ux-conflict") {
      expect(r.message).toMatch(/update Acuity/i);
    }
  });

  it("400 EXPIRED_RECEIPT → show-error with restore copy", () => {
    const r = classifyVerifyResponse({
      status: 400,
      body: { code: "EXPIRED_RECEIPT" },
    });
    expect(r.kind).toBe("ux-conflict");
    if (r.kind === "ux-conflict") expect(r.message).toMatch(/Restore/i);
  });

  it("400 generic → transient-error not-retryable", () => {
    const r = classifyVerifyResponse({
      status: 400,
      body: { error: "Bad body" },
    });
    expect(r.kind).toBe("transient-error");
    if (r.kind === "transient-error") expect(r.retryable).toBe(false);
  });

  it("401 → transient-error sign-out copy", () => {
    const r = classifyVerifyResponse({ status: 401, body: null });
    expect(r.kind).toBe("transient-error");
    if (r.kind === "transient-error") {
      expect(r.message).toMatch(/sign out/i);
      expect(r.retryable).toBe(false);
    }
  });

  it("502 APPLE_AUTH_FAILED → retryable", () => {
    const r = classifyVerifyResponse({
      status: 502,
      body: { code: "APPLE_AUTH_FAILED" },
    });
    expect(r.kind).toBe("transient-error");
    if (r.kind === "transient-error") expect(r.retryable).toBe(true);
  });

  it("503 → retryable", () => {
    const r = classifyVerifyResponse({ status: 503, body: null });
    expect(r.kind).toBe("transient-error");
    if (r.kind === "transient-error") expect(r.retryable).toBe(true);
  });

  it("418 (unexpected) → not retryable", () => {
    const r = classifyVerifyResponse({ status: 418, body: null });
    expect(r.kind).toBe("transient-error");
    if (r.kind === "transient-error") expect(r.retryable).toBe(false);
  });
});

describe("classifyPurchaseError", () => {
  it("null/undefined → store-unknown not-silent", () => {
    expect(classifyPurchaseError(null)).toEqual({
      kind: "store-unknown",
      silent: false,
    });
    expect(classifyPurchaseError(undefined)).toEqual({
      kind: "store-unknown",
      silent: false,
    });
  });

  it("user cancellation (E_USER_CANCELLED) → silent", () => {
    expect(classifyPurchaseError({ code: "E_USER_CANCELLED" })).toEqual({
      kind: "user-cancelled",
      silent: true,
    });
  });

  it("user cancellation alt spelling (E_USER_CANCELED) → silent", () => {
    expect(classifyPurchaseError({ code: "E_USER_CANCELED" })).toEqual({
      kind: "user-cancelled",
      silent: true,
    });
  });

  it("user cancellation via SKError code 2 → silent", () => {
    expect(classifyPurchaseError({ code: 2 })).toEqual({
      kind: "user-cancelled",
      silent: true,
    });
    expect(classifyPurchaseError({ responseCode: 2 })).toEqual({
      kind: "user-cancelled",
      silent: true,
    });
  });

  it("user cancellation via message string fallback → silent", () => {
    expect(
      classifyPurchaseError({ code: "E_UNKNOWN", message: "User canceled the request" })
    ).toEqual({ kind: "user-cancelled", silent: true });
  });

  it("deferred (Ask to Buy / family sharing) → not silent", () => {
    expect(classifyPurchaseError({ code: "E_DEFERRED_PAYMENT" })).toEqual({
      kind: "deferred",
      silent: false,
    });
  });

  it("payment not allowed → not silent", () => {
    expect(classifyPurchaseError({ code: "E_NOT_ALLOWED" })).toEqual({
      kind: "payment-not-allowed",
      silent: false,
    });
  });

  it("network errors via code or message → not silent", () => {
    expect(classifyPurchaseError({ code: "E_NETWORK_ERROR" })).toEqual({
      kind: "network",
      silent: false,
    });
    expect(classifyPurchaseError({ message: "Network unreachable" })).toEqual({
      kind: "network",
      silent: false,
    });
  });

  it("unknown errors → store-unknown not-silent", () => {
    expect(classifyPurchaseError({ code: "E_WEIRD" })).toEqual({
      kind: "store-unknown",
      silent: false,
    });
  });

  it("already-owned via Android-style code → already-owned not-silent", () => {
    expect(classifyPurchaseError({ code: "E_ALREADY_OWNED" })).toEqual({
      kind: "already-owned",
      silent: false,
    });
    expect(classifyPurchaseError({ code: "E_PRODUCT_ALREADY_OWNED" })).toEqual({
      kind: "already-owned",
      silent: false,
    });
    expect(classifyPurchaseError({ code: "E_ITEM_ALREADY_OWNED" })).toEqual({
      kind: "already-owned",
      silent: false,
    });
  });

  it("already-owned via iOS message-string heuristics", () => {
    expect(
      classifyPurchaseError({ code: "E_UNKNOWN", message: "You already own this product" })
    ).toEqual({ kind: "already-owned", silent: false });
    expect(
      classifyPurchaseError({ code: "E_UNKNOWN", message: "Already purchased" })
    ).toEqual({ kind: "already-owned", silent: false });
    expect(
      classifyPurchaseError({ code: "E_UNKNOWN", message: "You're already subscribed to this." })
    ).toEqual({ kind: "already-owned", silent: false });
    expect(
      classifyPurchaseError({ message: "You are currently subscribed to Acuity Pro." })
    ).toEqual({ kind: "already-owned", silent: false });
  });

  it("user-cancelled takes precedence over already-owned (dialog dismiss)", () => {
    // If Apple's "already subscribed" dialog is dismissed, code is
    // cancel — that path stays silent so we don't surface a redundant
    // error banner on top of the user's intentional dismiss.
    expect(
      classifyPurchaseError({ code: "E_USER_CANCELLED", message: "Already subscribed" })
    ).toEqual({ kind: "user-cancelled", silent: true });
  });
});

describe("purchaseErrorMessage", () => {
  it("user-cancelled returns null (silent surface)", () => {
    expect(purchaseErrorMessage("user-cancelled")).toBeNull();
  });

  it("non-silent kinds return user-facing strings", () => {
    expect(purchaseErrorMessage("payment-not-allowed")).toMatch(/Screen Time/);
    expect(purchaseErrorMessage("deferred")).toMatch(/Ask to Buy/);
    expect(purchaseErrorMessage("network")).toMatch(/Network/);
    expect(purchaseErrorMessage("store-unknown")).toMatch(/try again/i);
    expect(purchaseErrorMessage("already-owned")).toMatch(/Restore Purchases/);
  });
});

describe("classifyRestoreOutcome", () => {
  it("totalAvailable=0 → none", () => {
    const r = classifyRestoreOutcome({
      totalAvailable: 0,
      successfulVerifies: 0,
      errors: [],
    });
    expect(r.kind).toBe("none");
  });

  it("totalAvailable>0 + successful verify → restored with count", () => {
    const r = classifyRestoreOutcome({
      totalAvailable: 1,
      successfulVerifies: 1,
      errors: [],
      verifiedTransactionIds: ["tx1"],
    });
    expect(r.kind).toBe("restored");
    if (r.kind === "restored") {
      expect(r.count).toBe(1);
      expect(r.verifiedTransactionIds).toEqual(["tx1"]);
    }
  });

  it("multiple successful → restored with combined count", () => {
    const r = classifyRestoreOutcome({
      totalAvailable: 2,
      successfulVerifies: 2,
      errors: [],
      verifiedTransactionIds: ["tx1", "tx2"],
    });
    if (r.kind === "restored") expect(r.count).toBe(2);
  });

  it("totalAvailable>0 + zero successful + errors → error with first message", () => {
    const r = classifyRestoreOutcome({
      totalAvailable: 1,
      successfulVerifies: 0,
      errors: ["Apple verification failed"],
    });
    expect(r.kind).toBe("error");
    if (r.kind === "error") expect(r.message).toBe("Apple verification failed");
  });

  it("totalAvailable>0 + zero successful + empty errors → fallback message", () => {
    const r = classifyRestoreOutcome({
      totalAvailable: 1,
      successfulVerifies: 0,
      errors: [],
    });
    expect(r.kind).toBe("error");
    if (r.kind === "error") expect(r.message).toMatch(/couldn't verify/i);
  });
});
