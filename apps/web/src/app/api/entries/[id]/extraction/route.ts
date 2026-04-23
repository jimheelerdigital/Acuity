/**
 * GET  /api/entries/[id]/extraction   — returns proposed tasks + goals for review
 * POST /api/entries/[id]/extraction   — body: { action: "commit" | "skip", tasks?, goals? }
 *
 * Backs the review banner on the entry detail page. Extraction runs
 * automatically after recording, but the user explicitly commits
 * which tasks + goals to persist — preventing noise pollution when
 * Claude over-extracts.
 *
 * Pre-commit: Task / Goal rows do NOT exist yet; the proposed items
 * live on Entry.rawAnalysis. Post-commit: rows are created in a
 * transaction and Entry.extractionCommittedAt is set so the banner
 * disappears.
 *
 * Auth: getAnySessionUserId so web + mobile share the endpoint.
 */

import { NextRequest, NextResponse } from "next/server";

import type { ExtractionResult } from "@acuity/shared";

import { getAnySessionUserId } from "@/lib/mobile-auth";
import { enforceUserRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ReviewTask = {
  tempId: string;
  title: string;
  description: string | null;
  priority: string;
  dueDate: string | null;
  groupName: string | null;
};
type ReviewGoal = {
  tempId: string;
  title: string;
  description: string | null;
  targetDate: string | null;
  lifeArea: string | null;
  /** true when a Goal row with this title already exists for the user
   *  — the review UI can label it "already tracked" so the user knows
   *  committing this goal is a no-op. */
  alreadyExists: boolean;
};

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");

  const entry = await prisma.entry.findFirst({
    where: { id: params.id, userId },
    select: {
      id: true,
      status: true,
      rawAnalysis: true,
      extractionCommittedAt: true,
    },
  });
  if (!entry) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const extraction = parseExtraction(entry.rawAnalysis);

  // Match any extracted goal titles against existing user goals so the
  // review UI can render "already tracked" state without needing to
  // create duplicates. Case-insensitive exact match for now; the
  // pipeline's upsert uses the same semantics.
  const extractedTitles = extraction?.goals?.map((g) => g.title) ?? [];
  const existingGoals =
    extractedTitles.length > 0
      ? await prisma.goal.findMany({
          where: {
            userId,
            title: {
              in: extractedTitles,
              mode: "insensitive",
            },
          },
          select: { title: true },
        })
      : [];
  const existingTitleSet = new Set(
    existingGoals.map((g) => g.title.toLowerCase())
  );

  const tasks: ReviewTask[] = (extraction?.tasks ?? []).map((t, i) => ({
    tempId: `task-${i}`,
    title: t.title,
    description: t.description ?? null,
    priority: t.priority,
    dueDate: t.dueDate ?? null,
    groupName: t.groupName ?? null,
  }));

  const goals: ReviewGoal[] = (extraction?.goals ?? []).map((g, i) => ({
    tempId: `goal-${i}`,
    title: g.title,
    description: g.description ?? null,
    targetDate: g.targetDate ?? null,
    lifeArea: null,
    alreadyExists: existingTitleSet.has(g.title.toLowerCase()),
  }));

  return NextResponse.json({
    entryId: entry.id,
    status: entry.status,
    committedAt: entry.extractionCommittedAt?.toISOString() ?? null,
    tasks,
    goals,
  });
}

type CommitTaskInput = {
  title: string;
  description?: string | null;
  priority?: string;
  dueDate?: string | null;
  groupName?: string | null;
};
type CommitGoalInput = {
  title: string;
  description?: string | null;
  targetDate?: string | null;
  lifeArea?: string | null;
};

const VALID_PRIORITIES = new Set(["LOW", "MEDIUM", "HIGH", "URGENT"]);

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await enforceUserRateLimit("userWrite", userId);
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as {
    action?: unknown;
    tasks?: unknown;
    goals?: unknown;
  } | null;

  if (!body || typeof body.action !== "string") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (body.action !== "commit" && body.action !== "skip") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const { prisma } = await import("@/lib/prisma");

  const entry = await prisma.entry.findFirst({
    where: { id: params.id, userId },
    select: { id: true, extractionCommittedAt: true },
  });
  if (!entry) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (entry.extractionCommittedAt) {
    return NextResponse.json(
      { error: "Already reviewed" },
      { status: 409 }
    );
  }

  const requestedTasks: CommitTaskInput[] =
    body.action === "commit" && Array.isArray(body.tasks)
      ? (body.tasks as CommitTaskInput[]).filter(
          (t): t is CommitTaskInput =>
            !!t && typeof t === "object" && typeof t.title === "string" && t.title.trim().length > 0
        )
      : [];
  const requestedGoals: CommitGoalInput[] =
    body.action === "commit" && Array.isArray(body.goals)
      ? (body.goals as CommitGoalInput[]).filter(
          (g): g is CommitGoalInput =>
            !!g && typeof g === "object" && typeof g.title === "string" && g.title.trim().length > 0
        )
      : [];

  // Pre-fetch this user's TaskGroups so we can resolve Claude-assigned
  // groupName → TaskGroup.id without per-task DB hops inside the tx.
  const userGroups = requestedTasks.length > 0
    ? await prisma.taskGroup.findMany({
        where: { userId },
        select: { id: true, name: true },
      })
    : [];
  const groupIdByName = new Map<string, string>();
  for (const g of userGroups) groupIdByName.set(g.name.toLowerCase(), g.id);
  const otherGroupId = groupIdByName.get("other") ?? null;

  const [tasksCreated, goalsCreated] = await prisma.$transaction(async (tx) => {
    let tasksCount = 0;
    let goalsCount = 0;

    if (requestedTasks.length > 0) {
      const { count } = await tx.task.createMany({
        data: requestedTasks.map((t) => {
          const priority = typeof t.priority === "string" && VALID_PRIORITIES.has(t.priority)
            ? t.priority
            : "MEDIUM";
          const resolved = t.groupName
            ? groupIdByName.get(t.groupName.trim().toLowerCase())
            : undefined;
          return {
            userId,
            entryId: entry.id,
            text: t.title,
            title: t.title.trim().slice(0, 300),
            description: t.description?.toString().slice(0, 2000) ?? null,
            priority,
            dueDate: t.dueDate ? new Date(t.dueDate) : null,
            groupId: resolved ?? otherGroupId,
          };
        }),
      });
      tasksCount = count;
    }

    for (const g of requestedGoals) {
      // Skip goals that already exist (case-insensitive) — the review
      // UI marks these alreadyExists=true and sends them only if the
      // user explicitly re-checked. Dedupe at write time anyway.
      const existing = await tx.goal.findFirst({
        where: {
          userId,
          title: { equals: g.title, mode: "insensitive" },
        },
        select: { id: true, entryRefs: true },
      });
      if (existing) {
        const refs = Array.from(new Set([...(existing.entryRefs ?? []), entry.id]));
        await tx.goal.update({
          where: { id: existing.id },
          data: { lastMentionedAt: new Date(), entryRefs: refs },
        });
        continue;
      }
      await tx.goal.create({
        data: {
          userId,
          title: g.title.trim().slice(0, 200),
          description: g.description?.toString().slice(0, 2000) ?? null,
          targetDate: g.targetDate ? new Date(g.targetDate) : null,
          lifeArea:
            typeof g.lifeArea === "string" && g.lifeArea.length > 0
              ? g.lifeArea
              : "PERSONAL",
          lastMentionedAt: new Date(),
          entryRefs: [entry.id],
        },
      });
      goalsCount += 1;
    }

    await tx.entry.update({
      where: { id: entry.id },
      data: { extractionCommittedAt: new Date() },
    });

    return [tasksCount, goalsCount] as const;
  });

  // Analytics — extraction signal-to-noise over time.
  try {
    const { track } = await import("@/lib/posthog");
    await track(userId, "entry_extraction_reviewed", {
      entryId: entry.id,
      action: body.action,
      tasksCommitted: tasksCreated,
      goalsCommitted: goalsCreated,
      tasksProposed:
        Array.isArray(body.tasks) ? (body.tasks as unknown[]).length : 0,
      goalsProposed:
        Array.isArray(body.goals) ? (body.goals as unknown[]).length : 0,
    });
  } catch (err) {
    console.warn("[extraction-commit] posthog track failed:", err);
  }

  return NextResponse.json({
    ok: true,
    tasksCreated,
    goalsCreated,
  });
}

function parseExtraction(raw: unknown): ExtractionResult | null {
  if (!raw || typeof raw !== "object") return null;
  // rawAnalysis is stored as Prisma Json; at runtime it's already a
  // plain object — no parse required. Trust Claude's shape since the
  // pipeline's extractor already validated it.
  return raw as ExtractionResult;
}
