import { beforeEach, describe, expect, it, vi } from "vitest";

const DAY = 24 * 3600_000;
const now = Date.now();
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const metaGraph = vi.fn();
vi.mock("./meta", () => ({ metaGraph: (...a: unknown[]) => metaGraph(...a), adAccountPath: () => "act_1" }));

const db = {
  signups: [] as { signupUtmTerm: string }[],
  pays: [] as { userId: string; createdAt: Date }[],
  payUsers: [] as { id: string; signupUtmTerm: string | null; subscriptionStatus: string; stripeFirstFailureAt: Date | null }[],
  appUsers: [] as { trialEndsAt: Date; subscriptionStatus: string }[],
};
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findMany: vi.fn(async (args: { where: Record<string, unknown> }) =>
        "signupUtmTerm" in args.where ? db.signups : "id" in args.where ? db.payUsers : db.appUsers
      ),
    },
    onboardingEvent: { findMany: vi.fn(async () => db.pays) },
  },
}));

import { accountSpend } from "./account-spend";

describe("accountSpend", () => {
  beforeEach(() => {
    metaGraph.mockReset();
    db.signups = [{ signupUtmTerm: "as_web" }, { signupUtmTerm: "as_web" }, { signupUtmTerm: "as_other" }];
    db.pays = [
      { userId: "u1", createdAt: new Date(now - 10 * DAY) },
      { userId: "u2", createdAt: new Date(now - 9 * DAY) },
      { userId: "u3", createdAt: new Date(now - 1 * DAY) },
      { userId: "u4", createdAt: new Date(now - 9 * DAY) },
    ];
    db.payUsers = [
      { id: "u1", signupUtmTerm: "as_web", subscriptionStatus: "PRO", stripeFirstFailureAt: null },
      { id: "u2", signupUtmTerm: "as_web", subscriptionStatus: "FREE", stripeFirstFailureAt: null },
      { id: "u3", signupUtmTerm: "as_web", subscriptionStatus: "PRO", stripeFirstFailureAt: null },
      { id: "u4", signupUtmTerm: null, subscriptionStatus: "PRO", stripeFirstFailureAt: null },
    ];
    db.appUsers = [
      { trialEndsAt: new Date(now - DAY), subscriptionStatus: "PRO" },
      { trialEndsAt: new Date(now + 3 * DAY), subscriptionStatus: "TRIAL" },
    ];
  });

  it("joins web outcomes by ad set and blends app trials by spend", async () => {
    metaGraph.mockResolvedValueOnce({
      data: [
        { campaign_id: "c_web", campaign_name: "Web", adset_id: "as_web", objective: "OUTCOME_SALES", spend: "100.00" },
        { campaign_id: "c_app1", campaign_name: "App W", adset_id: "as_a1", objective: "OUTCOME_APP_PROMOTION", spend: "75.00" },
        { campaign_id: "c_app2", campaign_name: "App M", adset_id: "as_a2", objective: "OUTCOME_APP_PROMOTION", spend: "25.00" },
      ],
      paging: { cursors: { after: "x" }, next: "https://next" },
    });
    metaGraph.mockResolvedValueOnce({ data: [{ campaign_id: "c_web", campaign_name: "Web", adset_id: "as_web2", objective: "OUTCOME_SALES", spend: "20.50" }] });

    const a = await accountSpend(iso(now - 14 * DAY), iso(now));
    expect(metaGraph).toHaveBeenCalledTimes(2);
    expect(a.totalSpendCents).toBe(22050);

    const web = a.campaigns.find((c) => c.campaignId === "c_web")!;
    expect(web).toMatchObject({ kind: "web", spendCents: 12050, signups: 2, paidTrials: 3, ended: 2, payers: 1, costPerPayerCents: 12050, verdict: "too early" });

    const app = a.campaigns.find((c) => c.campaignId === "c_app1")!;
    expect(app).toMatchObject({ kind: "app", paidTrials: 1.5, payers: 0.8 });
    expect(a.appStore).toEqual({ trials: 2, ended: 1, payers: 1 });
    expect(a.webNotFromMeta).toEqual({ paidTrials: 1, payers: 1 });
  });
});
