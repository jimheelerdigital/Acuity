import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The flag is the only thing standing between "merged" and "mailing new
 * users", so pin it: anything but exactly "1" must do no work at all —
 * not even load the cohort.
 */

type Handler = (ctx: { step: { run: ReturnType<typeof vi.fn> }; logger: { info: ReturnType<typeof vi.fn> } }) => Promise<unknown>;
let handler: Handler | null = null;

vi.mock("@/inngest/client", () => ({
  inngest: {
    createFunction: (_opts: unknown, fn: Handler) => {
      handler = fn;
      return { __fn: fn };
    },
  },
}));
vi.mock("@/lib/safe-log", () => ({ safeLog: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/v10-day2-push", () => ({ sendDay2Push: vi.fn() }));
vi.mock("@/lib/day2-nudge", () => ({
  DAY2_NUDGE_EMAIL_KEY: "day2_nudge",
  DAY2_NUDGE_EVENT: "day2_nudge_sent",
  runDay2Nudge: vi.fn(),
}));

const ORIGINAL = process.env.ENABLE_V10_DAY2_PUSH;

beforeEach(async () => {
  vi.resetModules();
  handler = null;
  await import("./v10-day2-push-cron");
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.ENABLE_V10_DAY2_PUSH;
  else process.env.ENABLE_V10_DAY2_PUSH = ORIGINAL;
});

async function run() {
  const step = { run: vi.fn(async (_name: string, f: () => Promise<unknown>) => f()) };
  const logger = { info: vi.fn() };
  const result = await handler!({ step, logger });
  return { step, result };
}

describe("day-2 nudge cron flag gate", () => {
  it("unset → noop, cohort never loaded", async () => {
    delete process.env.ENABLE_V10_DAY2_PUSH;
    const { step, result } = await run();
    expect(result).toEqual({ skipped: true, push: 0, email: 0 });
    expect(step.run).not.toHaveBeenCalled();
  });

  it.each(["true", "yes", "0", "ON", " 1"])("%j → noop (exact \"1\" only)", async (v) => {
    process.env.ENABLE_V10_DAY2_PUSH = v;
    const { step } = await run();
    expect(step.run).not.toHaveBeenCalled();
  });

  it("\"1\" → runs the nudge step", async () => {
    process.env.ENABLE_V10_DAY2_PUSH = "1";
    const { runDay2Nudge } = await import("@/lib/day2-nudge");
    vi.mocked(runDay2Nudge).mockResolvedValueOnce({ candidates: 0, push: 0, email: 0 } as never);
    // prisma / trial-emails / internal-traffic are imported inside the
    // step; stub them so the step body resolves without a database.
    vi.doMock("@/lib/prisma", () => ({ prisma: {} }));
    vi.doMock("@/lib/trial-emails", () => ({ sendTrialEmail: vi.fn() }));
    vi.doMock("@/lib/internal-traffic", () => ({ isInternalEmail: vi.fn() }));
    const { step, result } = await run();
    expect(step.run).toHaveBeenCalledTimes(1);
    expect(runDay2Nudge).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ candidates: 0, push: 0, email: 0 });
  });
});
