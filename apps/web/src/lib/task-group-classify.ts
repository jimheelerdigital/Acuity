import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { CLAUDE_MAX_TOKENS, CLAUDE_MODEL } from "@acuity/shared";

/**
 * Shared task-group classifier. Used by:
 *   - POST /api/task-groups/recategorize (batch, user-triggered)
 *   - the task-auto-group Inngest function (one task added from Siri /
 *     the Action Button without a group, 2026-10-22)
 */
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Single Claude call that classifies every task in the batch. Returns
 * a {taskId: groupName} map. Falls back to an empty map on parse
 * failure — caller will leave those tasks ungrouped rather than
 * throw.
 */
export async function classifyTasks(
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
