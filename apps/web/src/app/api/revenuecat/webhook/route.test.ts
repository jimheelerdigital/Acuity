/**
 * RevenueCat webhook — Web Billing purchases made OFF goripple.io's own
 * checkout (RevenueCat Purchase Links / Funnels on signup.cat), 2026-10-16.
 *
 * Those purchases can arrive with an `$RCAnonymousID:` app_user_id, or an id
 * that is not one of our User ids, and get linked to the app later through a
 * redemption link (PURCHASE_REDEEMED, plus TRANSFER for outcome "transfer").
 * The webhook must never crash or mis-assign on them, and once linked the
 * redeemer's row must match RC. In-memory Prisma; we assert the writes.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = {
  id: string;
  subscriptionStatus: string;
  subscriptionSource: string | null;
  stripeSubscriptionId: string | null;
};
type RcState = {
  subscriptionStatus: string;
  trialEndsAt: Date | null;
  stripeFirstFailureAt: Date | null;
  subscriptionSource: string | null;
};

const h = vi.hoisted(() => {
  const db = {
    users: [] as Row[],
    writes: [] as Array<{ id: string; data: Record<string, unknown> }>,
    dedup: new Set<string>(),
    findManyCalls: 0,
  };
  const rc = new Map<string, unknown>();
  const stripeSubs = new Map<string, string>();
  const effects: Array<{ event: Record<string, unknown>; userId: string }> = [];
  const failRc = { on: false };

  const prismaMock = {
    user: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) => {
        db.findManyCalls++;
        return db.users.filter((u) => where.id.in.includes(u.id)).map((u) => ({ ...u }));
      },
      updateMany: async ({ where, data }: { where: { id: string; subscriptionSource?: { not: string } }; data: Record<string, unknown> }) => {
        const u = db.users.find((x) => x.id === where.id);
        if (!u) return { count: 0 };
        if (where.subscriptionSource && u.subscriptionSource === where.subscriptionSource.not) return { count: 0 };
        Object.assign(u, data);
        db.writes.push({ id: u.id, data });
        return { count: 1 };
      },
    },
    revenueCatEvent: {
      create: async ({ data }: { data: { id: string } }) => {
        if (db.dedup.has(data.id)) throw Object.assign(new Error("dup"), { code: "P2002" });
        db.dedup.add(data.id);
        return data;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        db.dedup.delete(where.id);
        return {};
      },
    },
  };
  (globalThis as unknown as { prisma: unknown }).prisma = prismaMock;
  return { db, rc, stripeSubs, effects, failRc, prismaMock };
});

vi.mock("@/lib/prisma", () => ({ prisma: h.prismaMock }));
vi.mock("@/lib/safe-log", () => ({
  safeLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/revenuecat/client", () => ({
  fetchRcEntitlementState: async (id: string) => {
    if (h.failRc.on) throw new Error("rc down");
    return (h.rc.get(id) as RcState | undefined) ?? null;
  },
}));
vi.mock("@/lib/stripe", () => ({
  stripe: {
    subscriptions: {
      retrieve: async (id: string) => {
        const status = h.stripeSubs.get(id);
        if (!status) throw new Error("no such subscription");
        return { id, status };
      },
    },
  },
}));
vi.mock("@/lib/revenuecat/web-billing-effects", async (orig) => {
  const real = await orig<typeof import("@/lib/revenuecat/web-billing-effects")>();
  return {
    ...real,
    runRcWebBillingEffects: async (event: Record<string, unknown>, userId: string) => {
      h.effects.push({ event, userId });
    },
  };
});

import { POST } from "./route";

const ANON = "$RCAnonymousID:9f1c2b";
const TRIAL_END = new Date("2026-10-23T12:00:00Z");

function call(event: Record<string, unknown>) {
  const req = new Request("https://goripple.io/api/revenuecat/webhook", {
    method: "POST",
    headers: { authorization: "test-webhook-auth", "content-type": "application/json" },
    body: JSON.stringify({ api_version: "1.0", event }),
  });
  return POST(req as never);
}

const pro = (source = "stripe"): RcState => ({
  subscriptionStatus: "PRO",
  trialEndsAt: null,
  stripeFirstFailureAt: null,
  subscriptionSource: source,
});
const free = (): RcState => ({
  subscriptionStatus: "FREE",
  trialEndsAt: null,
  stripeFirstFailureAt: null,
  subscriptionSource: null,
});
const row = (over: Partial<Row> & { id: string }): Row => ({
  subscriptionStatus: "TRIAL",
  subscriptionSource: null,
  stripeSubscriptionId: null,
  ...over,
});

let n = 0;
const eid = () => `evt_${++n}`;

beforeEach(() => {
  process.env.RC_WEBHOOK_AUTH = "test-webhook-auth";
  process.env.RC_SOURCE_OF_TRUTH = "1";
  h.db.users = [];
  h.db.writes = [];
  h.db.dedup.clear();
  h.db.findManyCalls = 0;
  h.rc.clear();
  h.stripeSubs.clear();
  h.effects.length = 0;
  h.failRc.on = false;
});

describe("RC_BILLING purchase from a Purchase Link / Funnel", () => {
  it("anonymous purchaser: 200, no lookup, no write, no side effects", async () => {
    h.db.users = [row({ id: "u1" })];
    const res = await call({
      id: eid(), type: "INITIAL_PURCHASE", store: "RC_BILLING", app_user_id: ANON,
      original_app_user_id: ANON, aliases: [ANON], entitlement_ids: ["pro"],
      period_type: "TRIAL", expiration_at_ms: TRIAL_END.getTime(), product_id: "ripple_pro_monthly_web",
    });
    expect(res.status).toBe(200);
    expect((await res.json()).action).toBe("ignore");
    expect(h.db.findManyCalls).toBe(0);
    expect(h.db.writes).toEqual([]);
    expect(h.effects).toEqual([]);
  });

  it("an app_user_id that is not one of our users: ignored, nobody else is touched", async () => {
    h.db.users = [row({ id: "u1" })];
    const res = await call({
      id: eid(), type: "INITIAL_PURCHASE", store: "RC_BILLING", app_user_id: "funnel-buyer@example.com",
      original_app_user_id: "funnel-buyer@example.com", entitlement_ids: ["pro"], period_type: "NORMAL",
    });
    expect(res.status).toBe(200);
    expect((await res.json()).action).toBe("ignore");
    expect(h.db.writes).toEqual([]);
    expect(h.effects).toEqual([]);
  });

  it("anonymous primary id with our user in aliases (after Purchases.logIn): grants that user", async () => {
    h.db.users = [row({ id: "u1" })];
    const res = await call({
      id: eid(), type: "INITIAL_PURCHASE", store: "RC_BILLING", app_user_id: ANON,
      original_app_user_id: ANON, aliases: [ANON, "u1"], entitlement_ids: ["pro"], period_type: "NORMAL",
    });
    expect(res.status).toBe(200);
    expect(h.db.writes).toEqual([
      { id: "u1", data: expect.objectContaining({ subscriptionStatus: "PRO", subscriptionSource: "stripe" }) },
    ]);
    expect(h.effects.map((e) => e.userId)).toEqual(["u1"]);
  });
});

describe("PURCHASE_REDEEMED (redemption link)", () => {
  it("alias outcome from an anonymous Funnel purchase: syncs the redeemer from RC and attributes once", async () => {
    h.db.users = [row({ id: "u1", subscriptionStatus: "TRIAL", subscriptionSource: null })];
    h.rc.set("u1", { ...pro(), subscriptionStatus: "TRIAL", trialEndsAt: TRIAL_END });
    const id = eid();
    const res = await call({
      id, type: "PURCHASE_REDEEMED", store: "RC_BILLING", environment: "PRODUCTION",
      redeemed_from: [ANON], redeemed_by: ["u1"], redemption_outcome: "alias",
      product_id: "ripple_pro_monthly_web", entitlement_ids: ["pro"], workflow_id: "wf_123",
    });
    expect(res.status).toBe(200);
    expect(h.db.writes).toEqual([
      { id: "u1", data: expect.objectContaining({ subscriptionStatus: "TRIAL", trialEndsAt: TRIAL_END, subscriptionSource: "stripe" }) },
    ]);
    expect(h.effects).toHaveLength(1);
    expect(h.effects[0].userId).toBe("u1");
    expect(h.effects[0].event).toMatchObject({
      id, type: "INITIAL_PURCHASE", store: "RC_BILLING", period_type: "TRIAL",
      expiration_at_ms: TRIAL_END.getTime(), product_id: "ripple_pro_monthly_web",
      metadata: { surface: "rc_funnel" },
    });

    // RC redelivers the same event → deduped, nothing runs twice.
    const again = await call({
      id, type: "PURCHASE_REDEEMED", store: "RC_BILLING", redeemed_from: [ANON],
      redeemed_by: ["u1"], redemption_outcome: "alias",
    });
    expect((await again.json()).duplicate).toBe(true);
    expect(h.effects).toHaveLength(1);
  });

  it("purchaser was already one of our users: syncs, but no second set of side effects", async () => {
    h.db.users = [
      row({ id: "u0", subscriptionStatus: "PRO", subscriptionSource: "stripe" }),
      row({ id: "u1", subscriptionStatus: "FREE" }),
    ];
    h.rc.set("u0", pro());
    h.rc.set("u1", pro());
    const res = await call({
      id: eid(), type: "PURCHASE_REDEEMED", store: "RC_BILLING", redeemed_from: ["u0"],
      redeemed_by: ["u1"], redemption_outcome: "alias", entitlement_ids: ["pro"],
    });
    expect(res.status).toBe(200);
    expect(h.db.writes.map((w) => w.id)).toEqual(["u1"]);
    expect(h.effects).toEqual([]);
  });

  it("anonymous redeemer (app not signed in yet): nothing to write, no crash", async () => {
    h.db.users = [row({ id: "u1" })];
    const res = await call({
      id: eid(), type: "PURCHASE_REDEEMED", store: "RC_BILLING", redeemed_from: [ANON],
      redeemed_by: ["$RCAnonymousID:app"], redemption_outcome: "alias",
    });
    expect(res.status).toBe(200);
    expect(h.db.writes).toEqual([]);
    expect(h.effects).toEqual([]);
  });

  it("no side effects when RC does not (yet) entitle the redeemer", async () => {
    h.db.users = [row({ id: "u1", subscriptionStatus: "FREE" })];
    h.rc.set("u1", free());
    await call({
      id: eid(), type: "PURCHASE_REDEEMED", store: "RC_BILLING", redeemed_from: [ANON],
      redeemed_by: ["u1"], redemption_outcome: "alias",
    });
    expect(h.effects).toEqual([]);
  });

  it("redeemer_owns: re-sync only, no attribution", async () => {
    h.db.users = [row({ id: "u1", subscriptionStatus: "PRO", subscriptionSource: "stripe" })];
    h.rc.set("u1", pro());
    await call({
      id: eid(), type: "PURCHASE_REDEEMED", store: "RC_BILLING", redeemed_from: [ANON],
      redeemed_by: ["u1"], redemption_outcome: "redeemer_owns",
    });
    expect(h.effects).toEqual([]);
  });

  it("other stores keep the previous handling (ignored, no writes)", async () => {
    h.db.users = [row({ id: "u1" })];
    h.rc.set("u1", pro());
    const res = await call({
      id: eid(), type: "PURCHASE_REDEEMED", store: "STRIPE", redeemed_from: [ANON],
      redeemed_by: ["u1"], redemption_outcome: "alias",
    });
    expect(res.status).toBe(200);
    expect((await res.json()).action).toBe("ignore");
    expect(h.db.writes).toEqual([]);
  });

  it("RC failure → 500 and the dedup row is released so RC's retry runs", async () => {
    h.db.users = [row({ id: "u1" })];
    h.failRc.on = true;
    const id = eid();
    const res = await call({
      id, type: "PURCHASE_REDEEMED", store: "RC_BILLING", redeemed_from: [ANON],
      redeemed_by: ["u1"], redemption_outcome: "alias",
    });
    expect(res.status).toBe(500);
    expect(h.db.dedup.has(id)).toBe(false);
    expect(h.effects).toEqual([]);
  });
});

describe("TRANSFER of a RevenueCat Web Billing purchase", () => {
  it("demotes the old account (stripe-sourced, no live Stripe sub) so one purchase can't unlock two", async () => {
    h.db.users = [
      row({ id: "old", subscriptionStatus: "PRO", subscriptionSource: "stripe" }),
      row({ id: "new", subscriptionStatus: "FREE" }),
    ];
    h.rc.set("old", free());
    h.rc.set("new", pro());
    const res = await call({
      id: eid(), type: "TRANSFER", store: "RC_BILLING", transferred_from: ["old"], transferred_to: ["new"],
    });
    expect(res.status).toBe(200);
    expect(h.db.users.find((u) => u.id === "old")?.subscriptionStatus).toBe("FREE");
    expect(h.db.users.find((u) => u.id === "new")).toMatchObject({ subscriptionStatus: "PRO", subscriptionSource: "stripe" });
  });

  it("stale Stripe subscription id (Stripe says canceled) still demotes", async () => {
    h.db.users = [row({ id: "old", subscriptionStatus: "PRO", subscriptionSource: "stripe", stripeSubscriptionId: "sub_old" })];
    h.stripeSubs.set("sub_old", "canceled");
    h.rc.set("old", free());
    await call({ id: eid(), type: "TRANSFER", store: "RC_BILLING", transferred_from: ["old"], transferred_to: [ANON] });
    expect(h.db.users[0].subscriptionStatus).toBe("FREE");
  });

  it("never demotes a row with a live Stripe-direct subscription", async () => {
    h.db.users = [row({ id: "old", subscriptionStatus: "PRO", subscriptionSource: "stripe", stripeSubscriptionId: "sub_live" })];
    h.stripeSubs.set("sub_live", "active");
    h.rc.set("old", free());
    await call({ id: eid(), type: "TRANSFER", store: "RC_BILLING", transferred_from: ["old"], transferred_to: ["x"] });
    expect(h.db.users[0].subscriptionStatus).toBe("PRO");
  });

  it("never demotes when Stripe can't be reached (unknown = live)", async () => {
    h.db.users = [row({ id: "old", subscriptionStatus: "PRO", subscriptionSource: "stripe", stripeSubscriptionId: "sub_unknown" })];
    h.rc.set("old", free());
    await call({ id: eid(), type: "TRANSFER", store: "RC_BILLING", transferred_from: ["old"], transferred_to: ["x"] });
    expect(h.db.users[0].subscriptionStatus).toBe("PRO");
  });

  it("store transfers keep the old rule: a stripe row is never demoted", async () => {
    h.db.users = [row({ id: "old", subscriptionStatus: "PRO", subscriptionSource: "stripe" })];
    h.rc.set("old", free());
    await call({ id: eid(), type: "TRANSFER", store: "APP_STORE", transferred_from: ["old"], transferred_to: ["x"] });
    expect(h.db.users[0].subscriptionStatus).toBe("PRO");
    expect(h.db.writes).toEqual([]);
  });
});
