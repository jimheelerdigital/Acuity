import "server-only";

import { safeLog } from "@/lib/safe-log";

/**
 * File a task into one of the user's groups with AI, after the fact
 * (2026-10-22). Used when a task is added from Siri / the Action Button
 * without a group (older iOS has no group card; on iOS 26 the person can
 * skip it). The create route answers right away; the
 * `task-auto-group` Inngest function classifies and sets groupId only if
 * the task is still ungrouped by then.
 *
 * Never throws: on a send failure the task simply stays ungrouped (it
 * still shows in the list; "Re-run AI categorization" can file it later).
 */
export const TASK_AUTO_GROUP_EVENT = "task/auto-group";

export function taskAutoGroupEventId(taskId: string): string {
  return `task-auto-group:${taskId}`;
}

const SEND_TIMEOUT_MS = 4_000;

export async function dispatchTaskAutoGroup(taskId: string, userId: string): Promise<boolean> {
  try {
    const { inngest } = await import("@/inngest/client");
    await Promise.race([
      inngest.send({
        id: taskAutoGroupEventId(taskId),
        name: TASK_AUTO_GROUP_EVENT,
        data: { taskId, userId },
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("send timeout")), SEND_TIMEOUT_MS)),
    ]);
    return true;
  } catch (err) {
    safeLog.warn("task.auto_group.dispatch_failed", {
      taskId,
      message: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
