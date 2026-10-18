import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = { id: string; email: string; codeHash: string; expiresAt: Date; attempts: number; consumedAt: Date | null; createdAt: Date };
let rows: Row[] = [];
let n = 0;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
    emailSignInCode: {
      updateMany: async ({ where, data }: any) => {
        const hit = rows.filter(
          (r) =>
            r.email === (where.email ?? r.email) &&
            (where.id ? r.id === where.id : true) &&
            (where.consumedAt === null ? r.consumedAt === null : true) &&
            (where.attempts?.lt !== undefined ? r.attempts < where.attempts.lt : true)
        );
        hit.forEach((r) => {
          const { attempts, ...rest } = data;
          Object.assign(r, rest);
          if (attempts?.increment) r.attempts += attempts.increment;
        });
        return { count: hit.length };
      },
      create: async ({ data }: any) => {
        const r = { id: `c${++n}`, attempts: 0, consumedAt: null, createdAt: new Date(Date.now() + n), ...data };
        rows.push(r);
        return r;
      },
      findFirst: async ({ where }: any) => {
        const r = rows
          .filter((x) => x.email === where.email && x.consumedAt === null)
          .sort((a, b) => +b.createdAt - +a.createdAt)[0];
        return r ? { ...r } : null; // Prisma returns a copy, not a live row
      },
      update: async ({ where, data }: any) => {
        const r = rows.find((x) => x.id === where.id)!;
        if (data.attempts?.increment) r.attempts += data.attempts.increment;
        return r;
      },
    },
  },
}));

import { appReviewCodeFor, checkCode, generateCode, hashCode, issueCode, normalizeEmail } from "./email-code";

beforeEach(() => {
  rows = [];
  process.env.NEXTAUTH_SECRET = "test-secret";
  delete process.env.APP_REVIEW_EMAILS;
  delete process.env.APP_REVIEW_CODE;
});

describe("helpers", () => {
  it("normalizes emails", () => {
    expect(normalizeEmail("  Jim@Example.COM ")).toBe("jim@example.com");
    expect(normalizeEmail("nope")).toBeNull();
    expect(normalizeEmail(5)).toBeNull();
  });
  it("generates 6 digits", () => {
    for (let i = 0; i < 50; i++) expect(generateCode()).toMatch(/^\d{6}$/);
  });
  it("hash binds the email", () => {
    expect(hashCode("a@b.co", "123456", "k")).not.toBe(hashCode("c@d.co", "123456", "k"));
  });
  it("app review code only for listed emails with a 6-digit code", () => {
    const env = { APP_REVIEW_EMAILS: "Review@x.com, other@x.com", APP_REVIEW_CODE: "424242" };
    expect(appReviewCodeFor("review@x.com", env)).toBe("424242");
    expect(appReviewCodeFor("someone@x.com", env)).toBeNull();
    expect(appReviewCodeFor("review@x.com", { ...env, APP_REVIEW_CODE: "abc" })).toBeNull();
    expect(appReviewCodeFor("review@x.com", {})).toBeNull();
  });
});

describe("issue + check", () => {
  it("accepts the right code once", async () => {
    const code = await issueCode("a@b.co");
    expect(await checkCode("a@b.co", code)).toEqual({ ok: true });
    expect((await checkCode("a@b.co", code)).ok).toBe(false);
  });
  it("a new code retires the old one", async () => {
    const first = await issueCode("a@b.co");
    const second = await issueCode("a@b.co");
    if (first !== second) expect((await checkCode("a@b.co", first)).ok).toBe(false);
    expect((await checkCode("a@b.co", second)).ok).toBe(true);
  });
  it("locks after 5 wrong tries", async () => {
    const code = await issueCode("a@b.co");
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 4; i++) expect(await checkCode("a@b.co", wrong)).toEqual({ ok: false, error: "InvalidCode" });
    expect(await checkCode("a@b.co", wrong)).toEqual({ ok: false, error: "TooManyAttempts" });
    expect(await checkCode("a@b.co", code)).toEqual({ ok: false, error: "TooManyAttempts" });
  });
  it("parallel wrong guesses can never exceed the cap (atomic increment)", async () => {
    const code = await issueCode("a@b.co");
    const wrong = code === "000000" ? "111111" : "000000";
    // 8 guesses race on the same (stale) read of attempts=0. The WHERE
    // attempts < MAX clause means only 5 writes land.
    const results = await Promise.all(Array.from({ length: 8 }, () => checkCode("a@b.co", wrong)));
    expect(rows[0].attempts).toBe(5);
    expect(results.every((r) => !r.ok)).toBe(true);
    expect(await checkCode("a@b.co", code)).toEqual({ ok: false, error: "TooManyAttempts" });
  });
  it("rejects expired codes", async () => {
    const code = await issueCode("a@b.co");
    rows[0].expiresAt = new Date(Date.now() - 1);
    expect(await checkCode("a@b.co", code)).toEqual({ ok: false, error: "ExpiredCode" });
  });
  it("code for one email doesn't work for another", async () => {
    const code = await issueCode("a@b.co");
    await issueCode("c@d.co");
    expect((await checkCode("c@d.co", code)).ok).toBe(code === "x");
  });
  it("app review fixed code works without any stored row", async () => {
    process.env.APP_REVIEW_EMAILS = "review@x.com";
    process.env.APP_REVIEW_CODE = "424242";
    expect(await checkCode("review@x.com", "424242")).toEqual({ ok: true });
    expect((await checkCode("review@x.com", "111111")).ok).toBe(false);
  });
});
