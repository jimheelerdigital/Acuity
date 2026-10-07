/**
 * UGC outreach pipeline: run state + the work each stage does. The Inngest
 * functions in inngest/functions/ugc-pipeline.ts call these one step at a
 * time (discover → enrich → rough score → deep enrich → final score →
 * queue + draft), each stage its own function, chained by events carrying
 * the runId.
 *
 * The working set lives on UgcRun.candidates (not in step outputs), so a
 * dry run never writes a creator or a draft: only its run report, viewable
 * at /admin/ugc/runs/<id> and emailed to Keenan.
 *
 * No silent drops: every stage failure is appended to UgcRun.errors and the
 * weekly digest leads with failed runs.
 */
import type { Prisma } from "@prisma/client";

import {
  APIFY_SPEND_CAP_PER_RUN,
  DISCOVERY_PLATFORMS,
  DRY_RUN_PROFILES,
  MAX_PROFILES_PER_RUN,
  MIN_SCORE,
  WEEKLY_CREATOR_CAP,
  type Persona,
  type Platform,
} from "@/lib/ugc/config";
import { applyTextSignals, cheapDropReason } from "@/lib/ugc/enrich";
import { pickQueue } from "@/lib/ugc/score";
import { hashtagJobs } from "@/lib/ugc/sources/apify-hashtags";
import { candidateKey, dedupeCandidates, profileUrlFor, type Candidate } from "@/lib/ugc/sources/types";
import { newTrackingCode } from "@/lib/ugc/status";

export type RunKind = "weekly" | "manual" | "dry-run";

export interface RunEventData {
  runId: string;
}

export interface RunError {
  stage: string;
  message: string;
  at: string;
}

async function db() {
  return (await import("@/lib/prisma")).prisma;
}

export async function startRun(kind: RunKind): Promise<string> {
  const prisma = await db();
  const run = await prisma.ugcRun.create({
    data: { kind, dryRun: kind === "dry-run", stage: "discover", candidates: [] },
  });
  return run.id;
}

/**
 * Make scraped text safe for a Postgres JSON column (2026-10-06): a caption
 * sliced through the middle of an emoji leaves half a surrogate pair, and
 * Prisma rejects the whole write ("unexpected end of hex escape"), which
 * dropped a discovery batch. Also strips NULs, which jsonb refuses.
 */
function cleanJson<T>(value: T): Prisma.InputJsonValue {
  const fix = (v: unknown): unknown => {
    if (typeof v === "string")
      return v.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]|\u0000/g, "");
    if (Array.isArray(v)) return v.map(fix);
    if (v && typeof v === "object" && !(v instanceof Date))
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fix(x)]));
    return v;
  };
  return fix(value) as Prisma.InputJsonValue;
}

export async function loadRun(runId: string) {
  const prisma = await db();
  const run = await prisma.ugcRun.findUniqueOrThrow({ where: { id: runId } });
  return { ...run, list: ((run.candidates ?? []) as unknown as Candidate[]) };
}

export async function saveCandidates(runId: string, list: Candidate[], stage?: string): Promise<void> {
  const prisma = await db();
  await prisma.ugcRun.update({
    where: { id: runId },
    data: {
      candidates: cleanJson(list),
      profilesFound: list.length,
      ...(stage ? { stage } : {}),
    },
  });
}

export async function addCost(runId: string, cost: { apifyUsd?: number; modelUsd?: number }): Promise<void> {
  const prisma = await db();
  await prisma.ugcRun.update({
    where: { id: runId },
    data: {
      apifyCostUsd: { increment: cost.apifyUsd ?? 0 },
      modelCostUsd: { increment: cost.modelUsd ?? 0 },
    },
  });
}

export async function recordError(runId: string, stage: string, err: unknown, fatal = false): Promise<void> {
  const prisma = await db();
  const run = await prisma.ugcRun.findUnique({ where: { id: runId } });
  if (!run) return;
  const errors = ((run.errors ?? []) as unknown as RunError[]).concat({
    stage,
    message: (err instanceof Error ? err.message : String(err)).slice(0, 500),
    at: new Date().toISOString(),
  });
  await prisma.ugcRun.update({
    where: { id: runId },
    data: {
      errors: cleanJson(errors),
      ...(fatal ? { status: "failed", finishedAt: new Date() } : {}),
    },
  });
}

export async function apifyRemaining(runId: string): Promise<number> {
  const prisma = await db();
  const run = await prisma.ugcRun.findUniqueOrThrow({ where: { id: runId }, select: { apifyCostUsd: true } });
  return Math.max(0, APIFY_SPEND_CAP_PER_RUN - run.apifyCostUsd);
}

export function maxProfiles(dryRun: boolean): number {
  return dryRun ? DRY_RUN_PROFILES : MAX_PROFILES_PER_RUN;
}

// ─── Stage 1: discover ─────────────────────────────────────────────────────

/** Everyone we must not rediscover: existing creators + the do-not-contact list. */
export async function skipKeys(): Promise<string[]> {
  const prisma = await db();
  const [creators, dnc] = await Promise.all([
    prisma.ugcCreator.findMany({ select: { platform: true, handle: true } }),
    prisma.ugcDoNotContact.findMany({ select: { key: true } }),
  ]);
  return [...creators.map((c) => candidateKey(c)), ...dnc.map((d) => d.key).filter((k) => !k.startsWith("email:"))];
}

export function discoveryJobs(): { platform: Platform; tag: string }[] {
  return hashtagJobs(DISCOVERY_PLATFORMS);
}

/** Merge newly found candidates into the run's list, honoring skip + max. */
export function mergeFound(list: Candidate[], found: Candidate[], skip: Set<string>, max: number): Candidate[] {
  const merged = dedupeCandidates([...list, ...found.filter((c) => !skip.has(candidateKey(c)))]);
  return merged.slice(0, max);
}

// ─── Stage 2: cheap enrich filters ─────────────────────────────────────────

/** Apply text signals + the cheap drops. Dry runs label drops but keep them. */
export function applyCheapFilters(list: Candidate[], linkText: Record<string, string>): Candidate[] {
  for (const c of list) {
    applyTextSignals(c, linkText[candidateKey(c)] ?? "");
    const reason = cheapDropReason(c);
    if (reason) c.dropped = reason;
  }
  return list;
}

// ─── Stage 6: queue + commit ───────────────────────────────────────────────

/** Creators queued in the last 7 days, per persona (the weekly cap's "already used"). */
export async function queuedThisWeek(): Promise<Record<Persona, number>> {
  const prisma = await db();
  const since = new Date(Date.now() - 7 * 86_400_000);
  const rows = await prisma.ugcCreator.groupBy({
    by: ["persona"],
    where: { queuedAt: { gte: since }, source: { not: "manual" } },
    _count: { _all: true },
  });
  const out: Record<Persona, number> = { midlife: 0, ambitious: 0 };
  for (const r of rows) if (r.persona === "midlife" || r.persona === "ambitious") out[r.persona] = r._count._all;
  return out;
}

/** Turn a scored-but-not-queued creator row back into a candidate (for the queue). */
export function rowToCandidate(r: {
  id: string;
  platform: string;
  handle: string;
  source: string;
  displayName: string | null;
  profileUrl: string | null;
  bio: string | null;
  followers: number | null;
  lastPostAt: Date | null;
  email: string | null;
  portfolioUrl: string | null;
  credentials: string | null;
  persona: string | null;
  creatorType: string | null;
  score: number | null;
  scoreReason: string | null;
  scoreDetail: unknown;
  recentVideos: unknown;
  notes: string | null;
  quotedRateCents: number | null;
  costPerVideoCents: number | null;
  avgViews: number | null;
}): Candidate {
  return {
    platform: r.platform as Platform,
    handle: r.handle,
    source: r.source as Candidate["source"],
    creatorId: r.id,
    displayName: r.displayName,
    profileUrl: r.profileUrl ?? profileUrlFor(r.platform as Platform, r.handle),
    bio: r.bio,
    followers: r.followers,
    lastPostAt: r.lastPostAt?.toISOString() ?? null,
    email: r.email,
    portfolioUrl: r.portfolioUrl,
    credentials: r.credentials,
    persona: (r.persona as Persona) ?? undefined,
    creatorType: (r.creatorType as Candidate["creatorType"]) ?? undefined,
    score: r.score ?? undefined,
    scoreReason: r.scoreReason ?? undefined,
    scoreDetail: (r.scoreDetail as Record<string, unknown>) ?? undefined,
    recentVideos: (r.recentVideos as Candidate["recentVideos"]) ?? undefined,
    notes: r.notes,
    quotedRateCents: r.quotedRateCents,
    costPerVideoCents: r.costPerVideoCents,
    avgViews: r.avgViews,
  };
}

/**
 * Write every final-scored candidate as a creator row ("scored"), keeping
 * manual rows' ids. Returns key → creatorId. Cheap-stage drops aren't
 * stored (they may add an email later and get found again).
 */
export async function commitScored(runId: string, list: Candidate[]): Promise<Record<string, string>> {
  const prisma = await db();
  const ids: Record<string, string> = {};
  for (const raw of list) {
    if (raw.score == null) continue;
    const c = cleanJson(raw) as unknown as Candidate & { score: number }; // bio/name text too, not just the JSON columns
    const data = {
      persona: c.persona ?? null,
      creatorType: c.creatorType ?? null,
      score: c.score,
      scoreReason: c.scoreReason ?? null,
      scoreDetail: cleanJson(c.scoreDetail ?? {}),
      displayName: c.displayName ?? null,
      profileUrl: c.profileUrl,
      bio: c.bio ?? null,
      followers: c.followers ?? null,
      lastPostAt: c.lastPostAt ? new Date(c.lastPostAt) : null,
      email: c.email ?? null,
      portfolioUrl: c.portfolioUrl ?? null,
      linkInBio: c.linkInBio ?? null,
      mentionsUgc: !!c.mentionsUgc,
      listsRates: !!c.listsRates,
      credentials: c.credentials ?? null,
      avgViews: c.avgViews ?? null,
      recentVideos: cleanJson(c.recentVideos ?? []),
      runId,
    };
    const row = await prisma.ugcCreator.upsert({
      where: { platform_handle: { platform: c.platform, handle: c.handle } },
      create: {
        platform: c.platform,
        handle: c.handle,
        source: c.source,
        trackingCode: newTrackingCode(),
        status: "scored",
        ...data,
      },
      update: { ...data, status: "scored" },
    });
    await prisma.ugcStatusEvent.create({
      data: {
        creatorId: row.id,
        from: c.creatorId ? "found" : null,
        to: "scored",
        by: "ugc-pipeline",
        note: `score ${c.score}${c.score < MIN_SCORE ? " (below bar)" : ""}`,
      },
    });
    ids[candidateKey(c)] = row.id;
  }
  return ids;
}

/** Candidates to draft this run: this week's picks across fresh + earlier scored creators. */
export async function queuePicks(fresh: Candidate[]): Promise<Candidate[]> {
  const prisma = await db();
  const earlier = await prisma.ugcCreator.findMany({
    where: { status: "scored", score: { gte: MIN_SCORE }, updatedAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
  });
  const freshKeys = new Set(fresh.map(candidateKey));
  const pool = [...fresh, ...earlier.filter((r) => !freshKeys.has(candidateKey(r))).map(rowToCandidate)];
  return pickQueue(pool, await queuedThisWeek(), WEEKLY_CREATOR_CAP);
}

export async function finishRun(runId: string, report: Record<string, unknown>, queued: number): Promise<void> {
  const prisma = await db();
  await prisma.ugcRun.update({
    where: { id: runId },
    data: {
      status: "done",
      stage: "done",
      queued,
      report: cleanJson(report),
      finishedAt: new Date(),
      // Dry runs keep their working set for the report page; real runs drop it.
      ...(report.dryRun ? {} : { candidates: [] }),
    },
  });
}
