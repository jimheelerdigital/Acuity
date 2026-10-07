import { describe, expect, it, vi } from "vitest";

// Prod runs the 2026-09 prices; config reads them at import time.
vi.hoisted(() => {
  process.env.NEW_PRICING_ENABLED = "1";
});

// claims-check imports Jev; keep it offline (null = Jev didn't answer).
vi.mock("@/lib/content-factory/jev", () => ({ askJev: vi.fn(async () => null), noulOf: () => null }));

import { contentIssues, formatIssues, strayPrices, withoutRuleLines, claimsCheck } from "./claims-check";
import {
  KILL_SPEND,
  MAX_FEE_PER_VIDEO,
  MAILING_ADDRESS,
  OPT_OUT_LINE,
  OUTREACH_SEND_ENABLED,
  SIGNATURE_BLOCK,
  personaSlots,
  allHashtags,
} from "./config";
import { composeEmail, allowedDollars, followUpBody } from "./draft";
import { applyTextSignals, cheapDropReason, findCredentials, findEmail, _test } from "./enrich";
import { costPerTrial, groupStats, isKill, lowDealWarning, rightsEndingSoon } from "./metrics";
import { activePoints, pickQueue, reconcileTypePersona, selectForFinal } from "./score";
import { parseManualHandle, quoteMath } from "./sources/manual";
import { dedupeCandidates, type Candidate } from "./sources/types";
import { composeBrief, CREDENTIALED_LINE, PARTNERSHIP_LINE } from "./brief";
import { buildRawMessage } from "./gmail";
import { reached } from "./status";

const cand = (over: Partial<Candidate>): Candidate => ({
  platform: "instagram",
  handle: "x",
  source: "apify-hashtag",
  profileUrl: "https://www.instagram.com/x/",
  ...over,
});

describe("config", () => {
  it("splits 10 slots 6/4 and keeps sending off", () => {
    expect(personaSlots(10)).toEqual({ midlife: 6, ambitious: 4 });
    expect(OUTREACH_SEND_ENABLED).toBe(false);
    expect(KILL_SPEND).toBe(30);
    expect(allHashtags()).toContain("ugccreator");
    expect(allHashtags()).toContain("therapistsofinstagram");
  });
  it("signature carries the mailing address", () => {
    expect(SIGNATURE_BLOCK).toContain("Keenan, co-founder of Ripple — goripple.io");
    expect(MAILING_ADDRESS).toBe("8733 Southwestern Blvd #1737, Dallas, TX 75206");
  });
});

describe("sources", () => {
  it("dedupes by platform + handle across sources", () => {
    const out = dedupeCandidates([
      cand({ handle: "@Jane", seenIn: ["#a"] }),
      cand({ handle: "jane", seenIn: ["#b"], source: "manual" }),
      cand({ handle: "jane", platform: "tiktok" }),
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].seenIn).toEqual(["#a", "#b"]);
  });
  it("parses manual handles and URLs", () => {
    expect(parseManualHandle({ handle: "@Some.One" })).toEqual({ platform: "instagram", handle: "some.one" });
    expect(parseManualHandle({ handle: "https://www.tiktok.com/@momcreator?lang=en" })).toEqual({ platform: "tiktok", handle: "momcreator" });
    expect(() => parseManualHandle({ handle: "not a handle!" })).toThrow();
  });
  it("quote math: per video and cap", () => {
    expect(quoteMath(240, 3)).toEqual({ quotedRateCents: 24000, costPerVideoCents: 8000, underFeeCap: true });
    expect(quoteMath(150)).toMatchObject({ costPerVideoCents: 15000, underFeeCap: false });
    expect(quoteMath(null).costPerVideoCents).toBeNull();
  });
});

describe("enrich signals", () => {
  it("finds emails, credentials, UGC + rates", () => {
    expect(findEmail("collabs: Jane.Doe@gmail.com 💌")).toBe("jane.doe@gmail.com");
    expect(findEmail("icon@2x.png")).toBeNull();
    expect(findCredentials("LCSW | therapist & mom of 3")).toContain("LCSW");
    const c = applyTextSignals(cand({ bio: "UGC creator · rates in link" }), "https://jane.canva.site/portfolio");
    expect(c.mentionsUgc).toBe(true);
    expect(c.listsRates).toBe(true);
    expect(c.portfolioUrl).toContain("canva.site");
  });
  it("cheap drops: followers cap and no contact (manual exempt)", () => {
    expect(cheapDropReason(cand({ followers: 25_000, email: "a@b.co" }))).toMatch(/over/);
    expect(cheapDropReason(cand({ followers: 900 }))).toMatch(/no email/);
    expect(cheapDropReason(cand({ followers: 900, source: "manual" }))).toBeNull();
    expect(cheapDropReason(cand({ followers: 900, portfolioUrl: "https://x.notion.site" }))).toBeNull();
  });
  it("strips VTT to text", () => {
    expect(_test.vttToText("WEBVTT\n\n00:00.000 --> 00:01.000\nhello there\n\n00:01.000 --> 00:02.000\nfriend")).toBe("hello there friend");
  });
});

describe("scoring", () => {
  it("active points only inside 30 days", () => {
    const now = Date.parse("2026-10-06T00:00:00Z");
    expect(activePoints("2026-09-20T00:00:00Z", now)).toBe(15);
    expect(activePoints("2026-08-01T00:00:00Z", now)).toBe(0);
    expect(activePoints(null, now)).toBe(0);
  });
  it("productivity creators are ambitious only", () => {
    expect(reconcileTypePersona("midlife", "productivity")).toEqual({ persona: "ambitious", creatorType: "productivity" });
    expect(reconcileTypePersona("midlife", "credentialed").persona).toBe("midlife");
  });
  it("keeps manual adds plus the top rough scores", () => {
    const list = [cand({ handle: "m", source: "manual", roughScore: 1 }), ...Array.from({ length: 5 }, (_, i) => cand({ handle: `h${i}`, roughScore: i * 10 }))];
    const kept = selectForFinal(list, 3);
    expect(kept.map((c) => c.handle)).toEqual(["m", "h4", "h3"]);
  });
  it("queue follows the 60/40 split, never backfills, skips under 70", () => {
    const pool = [
      ...Array.from({ length: 9 }, (_, i) => cand({ handle: `mid${i}`, persona: "midlife", score: 90 - i })),
      cand({ handle: "amb0", persona: "ambitious", score: 88 }),
      cand({ handle: "amb1", persona: "ambitious", score: 60 }),
    ];
    const picked = pickQueue(pool, { midlife: 0, ambitious: 0 }, 10);
    expect(picked.filter((c) => c.persona === "midlife")).toHaveLength(6);
    expect(picked.filter((c) => c.persona === "ambitious").map((c) => c.handle)).toEqual(["amb0"]);
    expect(pickQueue(pool, { midlife: 6, ambitious: 4 }, 10)).toHaveLength(0);
  });
});

describe("claims check", () => {
  const dollars = allowedDollars();
  it("flags therapy claims, mirror line, time of day, stray prices", () => {
    expect(contentIssues("Ripple replaces therapy for busy moms.", dollars)).toContain("treats / diagnoses / cures / replaces-therapy claim");
    expect(contentIssues("Ripple treats anxiety.", dollars).length).toBeGreaterThan(0);
    expect(contentIssues("It's a mirror, not a coach.", dollars)).toContain('says "mirror, not a coach"');
    expect(contentIssues("Use Ripple every night before bed.", dollars)).toContain("pins Ripple to a time of day");
    expect(strayPrices("now $4.99 or $9.99 or $100", dollars)).toEqual(["$4.99"]);
  });
  it("allows credentials and brain dump", () => {
    expect(contentIssues("I'm a therapist and Ripple is my brain dump voice journal.", dollars)).toEqual([]);
  });
  it("rule lines don't flag themselves", () => {
    const t = "You may not say Ripple treats, diagnoses, cures, or replaces therapy.\nTalk naturally.";
    expect(contentIssues(withoutRuleLines(t), dollars)).toEqual([]);
  });
  it("format: words, links, required lines", () => {
    const issues = formatIssues("see https://a.com and https://b.com", { allowedDollars: [], maxLinks: 1, mustInclude: [OPT_OUT_LINE] });
    expect(issues.join(" ")).toMatch(/2 links/);
    expect(issues.join(" ")).toMatch(/missing/);
  });
  it("fails closed when Jev doesn't answer", async () => {
    const r = await claimsCheck("email", "Hi! Ripple here.", { allowedDollars: dollars });
    expect(r.status).toBe("unchecked");
  });
});

describe("drafts + brief", () => {
  it("email always ends with opt-out + signature + address, one link", () => {
    const e = composeEmail("Hi Jane,\n\nI'm Keenan, co-founder of Ripple.");
    expect(e).toContain(OPT_OUT_LINE);
    expect(e.endsWith(SIGNATURE_BLOCK)).toBe(true);
    expect(formatIssues(e, { allowedDollars: [], maxLinks: 1 })).toEqual([]);
    expect(followUpBody("Jane")).toContain("Ripple");
  });
  it("allowed dollars include the offer and pricing", () => {
    expect(allowedDollars()).toEqual(expect.arrayContaining([MAX_FEE_PER_VIDEO, 50, 25, 9.99, 89.99]));
  });
  it("brief has branches, two hooks, rules, money; credentialed line only for credentialed", () => {
    const videos = [1, 2, 3].map((n) => ({ n, painBranch: "load", hooks: ["a", "b"], talkingPoints: ["t"] }));
    const base = { handle: "x", displayName: "Jane Doe", persona: "midlife" as const, feePerVideoCents: 8000, credentials: null };
    const b = composeBrief({ ...base, creatorType: "lookalike" }, videos);
    expect(b).toContain("[branch: load]");
    expect(b).toContain("Hook B: b");
    expect(b).toContain(PARTNERSHIP_LINE);
    expect(b).toContain("$80 per video");
    expect(b).not.toContain(CREDENTIALED_LINE);
    expect(composeBrief({ ...base, creatorType: "credentialed" }, videos)).toContain(CREDENTIALED_LINE);
  });
});

describe("gmail message", () => {
  it("plain text, no HTML, threads replies", () => {
    const raw = buildRawMessage({ from: "keenan@heelerdigital.com", to: "a@b.co", subject: "Ripple: videos", body: "Hi\nthere", inReplyTo: "<m1@x>" });
    const text = Buffer.from(raw, "base64url").toString("utf8");
    expect(text).toContain("Content-Type: text/plain");
    expect(text).toContain("In-Reply-To: <m1@x>");
    expect(text).not.toMatch(/<img|<html/i);
  });
});

describe("metrics", () => {
  it("cost per trial, kill, rights window", () => {
    expect(costPerTrial({ adSpendCents: 4500, trials: 3 })).toBe(15);
    expect(costPerTrial({ adSpendCents: 4500, trials: 0 })).toBeNull();
    expect(isKill({ adSpendCents: 3000, trials: 0 })).toBe(true);
    expect(isKill({ adSpendCents: 2999, trials: 0 })).toBe(false);
    const now = Date.parse("2026-10-06T00:00:00Z");
    expect(rightsEndingSoon({ rightsEndAt: new Date("2026-10-15T00:00:00Z") }, now)).toBe(true);
    expect(rightsEndingSoon({ rightsEndAt: new Date("2026-11-15T00:00:00Z") }, now)).toBe(false);
  });
  it("low-deal warning at 40 offers and under 2 deals", () => {
    const s = { offersSent: 40, replied: 5, replyRate: 0.125, deals: 1, paidCents: 0, avgCostPerTrial: null };
    expect(lowDealWarning(s)).toBe("Consider raising MAX_FEE_PER_VIDEO to 150.");
    expect(lowDealWarning({ ...s, deals: 2 })).toBeNull();
  });
  it("group stats count status milestones", () => {
    expect(reached("deal", "contacted")).toBe(true);
    expect(reached("skipped", "contacted")).toBe(false);
    const mk = (status: string, videos: object[] = []) =>
      ({ status, contactedAt: null, repliedAt: null, feePaidCents: 0, videos }) as never;
    const s = groupStats([mk("contacted"), mk("replied"), mk("paid", [{ adSpendCents: 3000, trials: 2, bonusPaidCents: 5000, extensionPaidCents: 0 }]), mk("queued")]);
    expect(s.offersSent).toBe(3);
    expect(s.deals).toBe(1);
    expect(s.avgCostPerTrial).toBe(15);
    expect(s.paidCents).toBe(5000);
  });
});

describe("draft greeting name (10-06 dry run)", () => {
  it("skips non-name words and handle-only display names", async () => {
    const { firstName } = await import("./draft");
    const c = (displayName: string | null, handle: string) => ({ displayName, handle }) as never;
    expect(firstName(c("UGC Mairim", "ugc.mairim"))).toBe("Mairim");
    expect(firstName(c("liindsxo", "liindsxo"))).toBeNull();
    expect(firstName(c("Judy Kim", "itsjudykim"))).toBe("Judy");
    expect(firstName(c(null, "x"))).toBeNull();
  });
});
