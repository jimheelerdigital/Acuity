import { inngest } from "@/inngest/client";

/**
 * UGC creator outreach pipeline (2026-10-06, per Keenan). Each stage is its
 * own Inngest function, chained by events carrying { runId }:
 *
 *   ugc/discover.requested  → ugc-discover      (weekly cron, Sundays 5:00 UTC)
 *   ugc/enrich.requested    → ugc-enrich         cheap stage, every profile
 *   ugc/rough.requested     → ugc-score-rough    Haiku, keeps top FINAL_SCORE_LIMIT
 *   ugc/deep.requested      → ugc-enrich-deep    views, captions, transcripts
 *   ugc/final.requested     → ugc-score-final    Opus 5.5 rubric
 *   ugc/draft.requested     → ugc-draft          queue (60/40, cap 10) + drafts + claims check
 *
 * Same structure as competitor-scrape-daily.ts: one step per unit of work,
 * lib modules loaded with await import() inside each step. Every failure is
 * written to UgcRun.errors (onFailure marks the run failed) so the weekly
 * digest shows it — nothing drops silently.
 *
 * Manual triggers:
 *   ugc/discover.requested { kind: "weekly" | "manual" | "dry-run" }
 *   ("dry-run" = 25 profiles, nothing saved but the run report).
 */

type Kind = "weekly" | "manual" | "dry-run";

async function failRun(stage: string, event: { data?: unknown }, error: unknown) {
  const runId = ((event.data as { event?: { data?: { runId?: string } } })?.event?.data?.runId) as string | undefined;
  if (!runId) return;
  const { recordError } = await import("@/lib/ugc/pipeline");
  await recordError(runId, stage, error, true);
}

const ENRICH_IG_BATCH = 50;
const LINK_SCAN_BATCH = 25;
const ROUGH_BATCH = 20;
const DEEP_BATCH = 10;
const FINAL_BATCH = 5;

// ─── 1. Discover ───────────────────────────────────────────────────────────

export const ugcDiscoverFn = inngest.createFunction(
  {
    id: "ugc-discover",
    name: "UGC — 1. Discover creators (weekly, Sundays)",
    retries: 1,
    concurrency: { limit: 1 },
    // A failure before the run row exists is caught by the digest's
    // "stuck run" check (running > 6h).
    onFailure: async ({ event, error }) => failRun("discover", event, error),
    triggers: [
      // Sundays 5:00 UTC, after the 3:30 competitor scrape (same Apify plan).
      { cron: "0 5 * * 0" },
      { event: "ugc/discover.requested" },
    ],
  },
  async ({ event, step }) => {
    const kind: Kind = ((event?.data as { kind?: Kind } | undefined)?.kind) ?? "weekly";
    const runId = await step.run("start-run", async () => {
      const { startRun } = await import("@/lib/ugc/pipeline");
      return startRun(kind);
    });
    const dryRun = kind === "dry-run";

    // Manual adds waiting for their first run (never on a dry run).
    if (!dryRun) {
      await step.run("manual-adds", async () => {
        const { loadRun, saveCandidates } = await import("@/lib/ugc/pipeline");
        const { manualSource } = await import("@/lib/ugc/sources/manual");
        const { metaMarketplaceSource } = await import("@/lib/ugc/sources/meta-marketplace");
        const budget = { remainingUsd: () => 0, add: () => {}, spentUsd: () => 0 };
        const manual = await manualSource.discover({ max: 100, budget, skip: new Set() });
        const meta = await metaMarketplaceSource.discover({ max: 0, budget, skip: new Set() });
        const run = await loadRun(runId);
        await saveCandidates(runId, [...run.list, ...manual, ...meta]);
      });
    }

    // Manual-only runs skip the hashtag scrape.
    if (kind !== "manual") {
      const jobs = await step.run("plan-jobs", async () => {
        const { discoveryJobs } = await import("@/lib/ugc/pipeline");
        return process.env.APIFY_TOKEN ? discoveryJobs() : [];
      });
      if (jobs.length === 0) {
        await step.run("no-apify", async () => {
          const { recordError } = await import("@/lib/ugc/pipeline");
          await recordError(runId, "discover", "APIFY_TOKEN not set — no hashtag discovery this run");
        });
      }
      for (const [i, job] of jobs.entries()) {
        const status = await step.run(`hashtag-${i}-${job.platform}-${job.tag}`, async () => {
          const p = await import("@/lib/ugc/pipeline");
          const { scrapeHashtag } = await import("@/lib/ugc/sources/apify-hashtags");
          const run = await p.loadRun(runId);
          const max = p.maxProfiles(dryRun);
          const fresh = run.list.filter((c) => c.source === "apify-hashtag").length;
          const remaining = await p.apifyRemaining(runId);
          if (fresh >= max) return "full";
          if (remaining <= 0.05) return "budget";
          try {
            const r = await scrapeHashtag(job.platform, job.tag, remaining);
            await p.addCost(runId, { apifyUsd: r.costUsd });
            const skip = new Set(await p.skipKeys());
            const manual = run.list.filter((c) => c.source !== "apify-hashtag");
            const found = p.mergeFound(run.list.filter((c) => c.source === "apify-hashtag"), r.candidates, skip, max);
            await p.saveCandidates(runId, [...manual, ...found]);
          } catch (err) {
            await p.recordError(runId, `discover #${job.tag} (${job.platform})`, err);
          }
          return "ok";
        });
        if (status === "full" || status === "budget") break;
      }
    }

    await step.run("stage-done", async () => {
      const { saveCandidates, loadRun } = await import("@/lib/ugc/pipeline");
      const run = await loadRun(runId);
      await saveCandidates(runId, run.list, "enrich");
    });
    await step.sendEvent("next", { name: "ugc/enrich.requested", data: { runId } });
    return { runId };
  }
);

// ─── 2. Cheap enrich ───────────────────────────────────────────────────────

export const ugcEnrichFn = inngest.createFunction(
  {
    id: "ugc-enrich",
    name: "UGC — 2. Cheap enrich + filters",
    retries: 1,
    triggers: [{ event: "ugc/enrich.requested" }],
    onFailure: async ({ event, error }) => failRun("enrich", event, error),
  },
  async ({ event, step }) => {
    const { runId } = event.data as { runId: string };
    const igHandles = await step.run("plan", async () => {
      const { loadRun } = await import("@/lib/ugc/pipeline");
      const run = await loadRun(runId);
      return run.list.filter((c) => c.platform === "instagram").map((c) => c.handle);
    });
    for (let i = 0; i < igHandles.length; i += ENRICH_IG_BATCH) {
      await step.run(`instagram-profiles-${i}`, async () => {
        const p = await import("@/lib/ugc/pipeline");
        const { cheapEnrichInstagram } = await import("@/lib/ugc/enrich");
        const run = await p.loadRun(runId);
        const want = new Set(igHandles.slice(i, i + ENRICH_IG_BATCH));
        const batch = run.list.filter((c) => c.platform === "instagram" && want.has(c.handle));
        try {
          const r = await cheapEnrichInstagram(batch, await p.apifyRemaining(runId));
          await p.addCost(runId, { apifyUsd: r.costUsd });
          await p.saveCandidates(runId, run.list);
        } catch (err) {
          await p.recordError(runId, "enrich instagram profiles", err);
        }
      });
    }
    await step.run("tiktok-bare-profiles", async () => {
      const p = await import("@/lib/ugc/pipeline");
      const { cheapEnrichTikTok } = await import("@/lib/ugc/enrich");
      const run = await p.loadRun(runId);
      try {
        const r = await cheapEnrichTikTok(run.list.filter((c) => c.platform === "tiktok"), await p.apifyRemaining(runId));
        await p.addCost(runId, { apifyUsd: r.costUsd });
        await p.saveCandidates(runId, run.list);
      } catch (err) {
        await p.recordError(runId, "enrich tiktok profiles", err);
      }
    });

    // Link-in-bio pages (free): emails + portfolio links.
    const total = await step.run("count", async () => {
      const { loadRun } = await import("@/lib/ugc/pipeline");
      return (await loadRun(runId)).list.length;
    });
    for (let i = 0; i < total; i += LINK_SCAN_BATCH) {
      await step.run(`link-in-bio-${i}`, async () => {
        const { loadRun, saveCandidates } = await import("@/lib/ugc/pipeline");
        const { applyTextSignals, scanLinkInBio } = await import("@/lib/ugc/enrich");
        const run = await loadRun(runId);
        await Promise.all(
          run.list.slice(i, i + LINK_SCAN_BATCH).map(async (c) => {
            applyTextSignals(c, await scanLinkInBio(c.linkInBio));
          })
        );
        await saveCandidates(runId, run.list);
      });
    }

    await step.run("filters", async () => {
      const p = await import("@/lib/ugc/pipeline");
      const run = await p.loadRun(runId);
      const list = p.applyCheapFilters(run.list, {});
      // Dry runs keep the cheap drops (labeled) so all 25 can be seen scored.
      const kept = run.dryRun ? list : list.filter((c) => !c.dropped);
      await p.saveCandidates(runId, kept, "rough");
      const prisma = (await import("@/lib/prisma")).prisma;
      await prisma.ugcRun.update({
        where: { id: runId },
        data: { report: { cheapDrops: list.filter((c) => c.dropped).length, afterCheap: kept.length } },
      });
    });
    await step.sendEvent("next", { name: "ugc/rough.requested", data: { runId } });
  }
);

// ─── 3. Rough score ────────────────────────────────────────────────────────

export const ugcScoreRoughFn = inngest.createFunction(
  {
    id: "ugc-score-rough",
    name: "UGC — 3. Rough score (Haiku)",
    retries: 1,
    triggers: [{ event: "ugc/rough.requested" }],
    onFailure: async ({ event, error }) => failRun("rough score", event, error),
  },
  async ({ event, step }) => {
    const { runId } = event.data as { runId: string };
    const total = await step.run("count", async () => {
      const { loadRun } = await import("@/lib/ugc/pipeline");
      return (await loadRun(runId)).list.length;
    });
    for (let i = 0; i < total; i += ROUGH_BATCH) {
      await step.run(`rough-${i}`, async () => {
        const p = await import("@/lib/ugc/pipeline");
        const { roughScoreBatch } = await import("@/lib/ugc/score");
        const run = await p.loadRun(runId);
        try {
          const r = await roughScoreBatch(run.list.slice(i, i + ROUGH_BATCH));
          await p.addCost(runId, { modelUsd: r.costUsd });
          await p.saveCandidates(runId, run.list);
        } catch (err) {
          await p.recordError(runId, `rough score batch ${i / ROUGH_BATCH + 1}`, err);
        }
      });
    }
    await step.run("keep-top", async () => {
      const p = await import("@/lib/ugc/pipeline");
      const { selectForFinal } = await import("@/lib/ugc/score");
      const run = await p.loadRun(runId);
      // Dry runs score everyone they found (25), so the labeled drops are in.
      const keep = run.dryRun ? run.list : selectForFinal(run.list);
      await p.saveCandidates(runId, keep, "deep");
    });
    await step.sendEvent("next", { name: "ugc/deep.requested", data: { runId } });
  }
);

// ─── 4. Expensive enrich ───────────────────────────────────────────────────

export const ugcEnrichDeepFn = inngest.createFunction(
  {
    id: "ugc-enrich-deep",
    name: "UGC — 4. Deep enrich (views, captions, transcripts)",
    retries: 1,
    triggers: [{ event: "ugc/deep.requested" }],
    onFailure: async ({ event, error }) => failRun("deep enrich", event, error),
  },
  async ({ event, step }) => {
    const { runId } = event.data as { runId: string };
    const total = await step.run("count", async () => {
      const { loadRun } = await import("@/lib/ugc/pipeline");
      return (await loadRun(runId)).list.length;
    });
    for (let i = 0; i < total; i += DEEP_BATCH) {
      await step.run(`deep-${i}`, async () => {
        const p = await import("@/lib/ugc/pipeline");
        const { deepEnrichBatch } = await import("@/lib/ugc/enrich");
        const run = await p.loadRun(runId);
        try {
          const r = await deepEnrichBatch(run.list.slice(i, i + DEEP_BATCH), await p.apifyRemaining(runId));
          await p.addCost(runId, { apifyUsd: r.apifyUsd, modelUsd: r.modelUsd });
          await p.saveCandidates(runId, run.list);
        } catch (err) {
          await p.recordError(runId, `deep enrich batch ${i / DEEP_BATCH + 1}`, err);
        }
      });
    }
    await step.run("stage-done", async () => {
      const p = await import("@/lib/ugc/pipeline");
      const run = await p.loadRun(runId);
      await p.saveCandidates(runId, run.list, "final");
    });
    await step.sendEvent("next", { name: "ugc/final.requested", data: { runId } });
  }
);

// ─── 5. Final score ────────────────────────────────────────────────────────

export const ugcScoreFinalFn = inngest.createFunction(
  {
    id: "ugc-score-final",
    name: "UGC — 5. Final score (Opus 5.5)",
    retries: 1,
    triggers: [{ event: "ugc/final.requested" }],
    onFailure: async ({ event, error }) => failRun("final score", event, error),
  },
  async ({ event, step }) => {
    const { runId } = event.data as { runId: string };
    const total = await step.run("count", async () => {
      const { loadRun } = await import("@/lib/ugc/pipeline");
      return (await loadRun(runId)).list.length;
    });
    for (let i = 0; i < total; i += FINAL_BATCH) {
      await step.run(`final-${i}`, async () => {
        const p = await import("@/lib/ugc/pipeline");
        const { finalScore } = await import("@/lib/ugc/score");
        const run = await p.loadRun(runId);
        let cost = 0;
        await Promise.all(
          run.list.slice(i, i + FINAL_BATCH).map(async (c) => {
            try {
              cost += (await finalScore(c)).costUsd;
            } catch (err) {
              await p.recordError(runId, `final score @${c.handle}`, err);
            }
          })
        );
        await p.addCost(runId, { modelUsd: cost });
        await p.saveCandidates(runId, run.list);
      });
    }
    await step.run("stage-done", async () => {
      const p = await import("@/lib/ugc/pipeline");
      const run = await p.loadRun(runId);
      await p.saveCandidates(runId, run.list, "draft");
    });
    await step.sendEvent("next", { name: "ugc/draft.requested", data: { runId } });
  }
);

// ─── 6. Queue + draft ──────────────────────────────────────────────────────

export const ugcDraftFn = inngest.createFunction(
  {
    id: "ugc-draft",
    name: "UGC — 6. Queue + draft offers (claims-checked)",
    retries: 1,
    triggers: [{ event: "ugc/draft.requested" }],
    onFailure: async ({ event, error }) => failRun("draft", event, error),
  },
  async ({ event, step }) => {
    const { runId } = event.data as { runId: string };
    const dryRun = await step.run("load", async () => {
      const { loadRun } = await import("@/lib/ugc/pipeline");
      return (await loadRun(runId)).dryRun;
    });

    if (dryRun) {
      // Draft everyone scored, nothing saved but the run's own report.
      const total = await step.run("count", async () => {
        const { loadRun } = await import("@/lib/ugc/pipeline");
        return (await loadRun(runId)).list.length;
      });
      for (let i = 0; i < total; i += FINAL_BATCH) {
        await step.run(`dry-draft-${i}`, async () => {
          const p = await import("@/lib/ugc/pipeline");
          const { draftForCandidate } = await import("@/lib/ugc/draft");
          const run = await p.loadRun(runId);
          let cost = 0;
          await Promise.all(
            run.list.slice(i, i + FINAL_BATCH).map(async (c) => {
              if (c.score == null) return;
              try {
                cost += (await draftForCandidate(c)).costUsd;
              } catch (err) {
                await p.recordError(runId, `draft @${c.handle}`, err);
              }
            })
          );
          await p.addCost(runId, { modelUsd: cost });
          await p.saveCandidates(runId, run.list);
        });
      }
      await step.run("finish-dry", async () => {
        const p = await import("@/lib/ugc/pipeline");
        const { pickQueue } = await import("@/lib/ugc/score");
        const run = await p.loadRun(runId);
        const wouldQueue = pickQueue(run.list, { midlife: 0, ambitious: 0 }).map((c) => `${c.platform}:${c.handle}`);
        await p.finishRun(runId, { dryRun: true, wouldQueue, ...((run.report as object) ?? {}) }, 0);
        const { sendRunReportEmail } = await import("@/lib/ugc/digest");
        await sendRunReportEmail(runId).catch((err) => p.recordError(runId, "dry-run email", err));
      });
      return { runId, dryRun: true };
    }

    await step.run("commit-scored", async () => {
      const p = await import("@/lib/ugc/pipeline");
      const run = await p.loadRun(runId);
      await p.commitScored(runId, run.list);
    });
    const picks = await step.run("pick-queue", async () => {
      const p = await import("@/lib/ugc/pipeline");
      const run = await p.loadRun(runId);
      const fresh = run.list.filter((c) => c.score != null);
      const prisma = (await import("@/lib/prisma")).prisma;
      const picked = await p.queuePicks(fresh);
      // Resolve ids (fresh rows were just written).
      const ids: string[] = [];
      for (const c of picked) {
        const row = await prisma.ugcCreator.findUnique({
          where: { platform_handle: { platform: c.platform, handle: c.handle } },
          select: { id: true },
        });
        if (row) ids.push(row.id);
      }
      return ids;
    });
    for (const creatorId of picks) {
      await step.run(`draft-${creatorId}`, async () => {
        const p = await import("@/lib/ugc/pipeline");
        const { draftCreator } = await import("@/lib/ugc/actions");
        try {
          const cost = await draftCreator(creatorId, "ugc-pipeline");
          await p.addCost(runId, { modelUsd: cost });
        } catch (err) {
          await p.recordError(runId, `draft ${creatorId}`, err);
        }
      });
    }
    await step.run("finish", async () => {
      const p = await import("@/lib/ugc/pipeline");
      const run = await p.loadRun(runId);
      await p.finishRun(
        runId,
        {
          dryRun: false,
          scored: run.list.filter((c) => c.score != null).length,
          aboveBar: run.list.filter((c) => (c.score ?? 0) >= 70).length,
          ...((run.report as object) ?? {}),
        },
        picks.length
      );
    });
    return { runId, queued: picks.length };
  }
);
