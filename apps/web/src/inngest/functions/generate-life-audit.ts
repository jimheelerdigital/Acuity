import Anthropic from "@anthropic-ai/sdk";
import { NonRetriableError } from "inngest";

import { CLAUDE_FLAGSHIP_MAX_TOKENS, CLAUDE_FLAGSHIP_MODEL } from "@acuity/shared";

import { inngest } from "@/inngest/client";
import {
  buildDegradedAudit,
  buildLifeAuditUserMessage,
  LIFE_AUDIT_SYSTEM_PROMPT,
  MIN_ENTRIES_FOR_AUDIT,
  type LifeAuditExtraction,
} from "@/lib/prompts/life-audit";
import { safeLog } from "@/lib/safe-log";

type GenerateLifeAuditEventData = {
  lifeAuditId: string;
  userId: string;
};

function truncateForUi(message: string, max = 200): string {
  return message.length > max ? message.slice(0, max - 1) + "…" : message;
}

export const generateLifeAuditFn = inngest.createFunction(
  {
    id: "generate-life-audit",
    name: "Generate Day 14 Life Audit",
    triggers: [{ event: "life-audit/generation.requested" }],
    // BACKGROUND tier (Decisions 2026-04-19 #3): the user isn't watching.
    // Audit runs the night before trialEndsAt; up to ~14 min of retry
    // backoff is fine. The degraded-fallback path in onFailure fires
    // after retries are exhausted.
    retries: 3,
    concurrency: { key: "event.data.userId", limit: 1 },
    onFailure: async ({ event, error }) => {
      // After all retries exhausted, drop a degraded-template audit
      // so the user still has something to read when they hit the
      // paywall. IMPLEMENTATION_PLAN_PAYWALL.md §7.3 — the invariant
      // is "a user never hits the paywall without having read their
      // Life Audit." No Claude call here — the whole point of the
      // fallback is to survive Claude-down / rate-limit / garbage-
      // output scenarios.
      const originalData = (event.data as { event?: { data?: unknown } })?.event
        ?.data as GenerateLifeAuditEventData | undefined;
      const lifeAuditId = originalData?.lifeAuditId;
      const userId = originalData?.userId;
      if (!lifeAuditId || !userId) return;

      const { prisma } = await import("@/lib/prisma");
      try {
        const audit = await prisma.lifeAudit.findUnique({
          where: { id: lifeAuditId },
          select: { periodStart: true, periodEnd: true },
        });
        if (!audit) return;

        const entries = await prisma.entry.findMany({
          where: {
            userId,
            status: "COMPLETE",
            entryDate: { gte: audit.periodStart, lte: audit.periodEnd },
          },
          orderBy: { entryDate: "asc" },
          select: {
            entryDate: true,
            summary: true,
            mood: true,
            moodScore: true,
            themes: true,
            wins: true,
            blockers: true,
          },
        });

        const fallback = buildDegradedAudit({
          entries,
          periodStart: audit.periodStart,
          periodEnd: audit.periodEnd,
        });

        await prisma.lifeAudit.update({
          where: { id: lifeAuditId },
          data: {
            narrative: fallback.narrative,
            closingLetter: fallback.closingLetter,
            themesArc: fallback.themesArc as object,
            moodArc: fallback.moodArc,
            status: "COMPLETE",
            degraded: true,
            errorMessage: truncateForUi(
              `Generator exhausted retries: ${error?.message ?? "unknown"}`
            ),
          },
        });

        safeLog.warn("life-audit.degraded_fallback_shipped", {
          lifeAuditId,
          userId,
          entryCount: entries.length,
        });
      } catch (err) {
        safeLog.error("life-audit.degraded_fallback_failed", err, {
          lifeAuditId,
          userId,
        });
      }
    },
  },
  async ({ event, step, runId }) => {
    const { lifeAuditId, userId } =
      event.data as GenerateLifeAuditEventData;
    const { prisma } = await import("@/lib/prisma");

    // Step 0: attach runId + flip to GENERATING.
    await step.run("record-run-id", async () => {
      await prisma.lifeAudit.update({
        where: { id: lifeAuditId },
        data: { inngestRunId: runId, status: "GENERATING" },
      });
    });

    // Step 1: load trial-window entries + verify ownership + min count.
    const loaded = await step.run("load-trial-entries", async () => {
      const audit = await prisma.lifeAudit.findUnique({
        where: { id: lifeAuditId },
        select: {
          userId: true,
          periodStart: true,
          periodEnd: true,
          kind: true,
        },
      });
      if (!audit) {
        throw new NonRetriableError(`LifeAudit ${lifeAuditId} not found`);
      }
      if (audit.userId !== userId) {
        throw new NonRetriableError(
          `LifeAudit ${lifeAuditId} does not belong to user ${userId}`
        );
      }

      const entries = await prisma.entry.findMany({
        where: {
          userId,
          status: "COMPLETE",
          entryDate: { gte: audit.periodStart, lte: audit.periodEnd },
        },
        orderBy: { entryDate: "asc" },
        select: {
          entryDate: true,
          summary: true,
          mood: true,
          moodScore: true,
          themes: true,
          wins: true,
          blockers: true,
        },
      });

      if (entries.length < MIN_ENTRIES_FOR_AUDIT) {
        // Not enough data for a meaningful audit — bail non-retriably
        // so retries don't burn Claude tokens on the same thin
        // context. Surface the specific error to the user.
        await prisma.lifeAudit.update({
          where: { id: lifeAuditId },
          data: {
            status: "FAILED",
            errorMessage:
              "Not enough entries for a meaningful audit (need at least 7).",
          },
        });
        throw new NonRetriableError(
          `Only ${entries.length} entries in the trial window; need at least ${MIN_ENTRIES_FOR_AUDIT}.`
        );
      }

      return {
        entries: entries.map((e) => ({
          entryDate: e.entryDate.toISOString(),
          summary: e.summary,
          mood: e.mood,
          moodScore: e.moodScore,
          themes: e.themes,
          wins: e.wins,
          blockers: e.blockers,
        })),
        periodStart: audit.periodStart.toISOString(),
        periodEnd: audit.periodEnd.toISOString(),
      };
    });

    // Step 2: generate via Claude Opus.
    const parsed = await step.run("generate-audit", async () => {
      const anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });

      const userContent = buildLifeAuditUserMessage(
        loaded.entries.map((e) => ({
          entryDate: new Date(e.entryDate),
          summary: e.summary,
          mood: e.mood,
          moodScore: e.moodScore,
          themes: e.themes,
          wins: e.wins,
          blockers: e.blockers,
        })),
        new Date(loaded.periodStart),
        new Date(loaded.periodEnd)
      );

      const message = await anthropic.messages.create({
        model: CLAUDE_FLAGSHIP_MODEL,
        max_tokens: CLAUDE_FLAGSHIP_MAX_TOKENS,
        system: LIFE_AUDIT_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userContent }],
      });

      const rawText =
        message.content[0].type === "text" ? message.content[0].text : "";
      const jsonText = rawText
        .replace(/^```(?:json)?\n?/m, "")
        .replace(/\n?```$/m, "")
        .trim();

      let result: LifeAuditExtraction;
      try {
        result = JSON.parse(jsonText) as LifeAuditExtraction;
      } catch {
        throw new Error(
          `Claude returned non-JSON (${rawText.length} chars): ${rawText.slice(0, 200)}`
        );
      }
      // Minimal structural validation — if the model returned
      // something shaped unlike what we asked for, retry rather than
      // persist garbage.
      if (
        typeof result.narrative !== "string" ||
        typeof result.closingLetter !== "string" ||
        typeof result.moodArc !== "string" ||
        !result.themesArc
      ) {
        throw new Error("Claude output missing required fields");
      }
      return result;
    });

    // Step 3: persist + flip to COMPLETE.
    await step.run("persist", async () => {
      await prisma.lifeAudit.update({
        where: { id: lifeAuditId },
        data: {
          narrative: parsed.narrative,
          closingLetter: parsed.closingLetter,
          themesArc: parsed.themesArc as object,
          moodArc: parsed.moodArc,
          status: "COMPLETE",
        },
      });
    });

    return { lifeAuditId, status: "COMPLETE" };
  }
);
