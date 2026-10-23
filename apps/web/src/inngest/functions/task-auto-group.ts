import { inngest } from "@/inngest/client";
import { TASK_AUTO_GROUP_EVENT } from "@/lib/task-auto-group";

/**
 * Files one ungrouped task into the user's best-fit group (2026-10-22).
 * Sent by POST /api/tasks when a Siri / Action Button add asks for it
 * (`autoGroup: true`) and no group was chosen. See lib/task-auto-group.ts.
 *
 * Only writes when the task is STILL ungrouped, so a group the person
 * picks in the app in the meantime always wins.
 */
export const taskAutoGroupFn = inngest.createFunction(
  {
    id: "task-auto-group",
    name: "Tasks — AI group for one new task",
    triggers: [{ event: TASK_AUTO_GROUP_EVENT }],
    retries: 2,
  },
  async ({ event, step }) => {
    const { taskId, userId } = event.data as { taskId: string; userId: string };

    const task = await step.run("load", async () => {
      const { prisma } = await import("@/lib/prisma");
      return prisma.task.findFirst({
        where: { id: taskId, userId, groupId: null },
        select: { id: true, title: true, text: true, description: true },
      });
    });
    if (!task) return { skipped: "grouped-or-gone" };

    const groupName = await step.run("classify", async () => {
      const { prisma } = await import("@/lib/prisma");
      const groups = await prisma.taskGroup.findMany({
        where: { userId },
        orderBy: { order: "asc" },
        select: { name: true },
      });
      if (groups.length === 0) return null;
      const { classifyTasks } = await import("@/lib/task-group-classify");
      const out = await classifyTasks([task], groups.map((g) => g.name));
      return out[task.id] ?? null;
    });
    if (!groupName) return { skipped: "no-classification" };

    return step.run("assign", async () => {
      const { prisma } = await import("@/lib/prisma");
      const { resolveGroupName } = await import("@/lib/task-groups");
      const groupId = await resolveGroupName(prisma, userId, groupName);
      if (!groupId) return { skipped: "no-group" };
      const res = await prisma.task.updateMany({
        where: { id: taskId, userId, groupId: null },
        data: { groupId },
      });
      return { assigned: res.count === 1 ? groupName : null };
    });
  }
);
