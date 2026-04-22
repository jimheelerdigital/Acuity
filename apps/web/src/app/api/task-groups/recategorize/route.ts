/**
 * POST /api/task-groups/recategorize
 *
 * Runs Claude over this user's currently-ungrouped tasks (Task.groupId
 * IS NULL and status != DONE) and assigns each one to the best-match
 * TaskGroup. Returns a count. Used by the "Re-run AI categorization"
 * button on the task-groups settings page.
 *
 * Rate-limited by the `expensiveAi` bucket (10/hour).
 */
import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

import { CLAUDE_MAX_TOKENS, CLAUDE_MODEL } from "@acuity/shared";

import { getAnySessionUserId } from "@/lib/mobile-auth";
import { enforceUserRateLimit } from "@/lib/rate-limit";
import { ensureDefaultTaskGroups, resolveGroupName } from "@/lib/task-groups";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Cap how many tasks we send to Claude per call — each task is small
// but we don't want to spend the whole token budget on a mass re-run.
const MAX_TASKS_PER_CALL = 40;

export async function POST(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await enforceUserRateLimit("expensiveAi", userId);
  if (limited) return limited;

  const { prisma } = await import("@/lib/prisma");
  await ensureDefaultTaskGroups(prisma, userId);

  const groups = await prisma.taskGroup.findMany({
    where: { userId },
    orderBy: { order: "asc" },
    select: { id: true, name: true },
  });
  if (groups.length === 0) {
    return NextResponse.json({ updated: 0 });
  }
  const groupNames = groups.map((g) => g.name);

  const ungrouped = await prisma.task.findMany({
    where: { userId, groupId: null, status: { not: "DONE" } },
    orderBy: { createdAt: "desc" },
    take: MAX_TASKS_PER_CALL,
    select: { id: true, title: true, text: true, description: true },
  });

  if (ungrouped.length === 0) {
    return NextResponse.json({ updated: 0 });
  }

  const classifications = await classifyTasks(ungrouped, groupNames);

  let updated = 0;
  for (const task of ungrouped) {
    const chosen = classifications[task.id];
    const groupId = await resolveGroupName(prisma, userId, chosen);
    if (!groupId) continue;
    await prisma.task.update({
      where: { id: task.id },
      data: { groupId },
    });
    updated += 1;
  }

  return NextResponse.json({ updated });
}

/**
 * Single Claude call that classifies every task in the batch. Returns
 * a {taskId: groupName} map. Falls back to an empty map on parse
 * failure — caller will leave those tasks ungrouped rather than
 * throw.
 */
async function classifyTasks(
  tasks: Array<{
    id: string;
    title: string | null;
    text: string | null;
    description: string | null;
  }>,
  groupNames: string[]
): Promise<Record<string, string>> {
  const taskCorpus = tasks
    .map((t) => {
      const label = t.title ?? t.text ?? "(untitled)";
      const desc = t.description ? ` — ${t.description}` : "";
      return `${t.id}: ${label}${desc}`;
    })
    .join("\n");

  const systemPrompt = `You classify short to-do items into one of the user's existing task groups. Return JSON only — no prose wrapper. For each task, pick the group name that best fits. If nothing clearly fits, use "Other". Never invent a new group name.`;

  const userPrompt = `User's task groups (pick from this exact list, case-sensitive):
${groupNames.join(", ")}

Tasks to classify (one per line, format "<id>: <text>"):
${taskCorpus}

Return JSON with shape: {"classifications": [{"id": "<id>", "group": "<name from the list>"}]}. One entry per task. No markdown fences.`;

  try {
    const res = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: Math.min(CLAUDE_MAX_TOKENS, 1500),
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
    const raw = res.content[0].type === "text" ? res.content[0].text : "";
    const jsonText = raw
      .replace(/^```(?:json)?\n?/m, "")
      .replace(/\n?```$/m, "")
      .trim();
    const parsed = JSON.parse(jsonText) as {
      classifications?: Array<{ id?: string; group?: string }>;
    };
    const out: Record<string, string> = {};
    for (const c of parsed.classifications ?? []) {
      if (typeof c.id === "string" && typeof c.group === "string") {
        out[c.id] = c.group;
      }
    }
    return out;
  } catch {
    return {};
  }
}
