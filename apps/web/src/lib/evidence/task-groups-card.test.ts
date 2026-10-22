/**
 * Task groups from Siri / the Action Button + Manage groups (Jimmy,
 * 2026-10-22): "Can the 'Which group' be asked with the due date question?
 * The less screens popping up consecutively the better" and "preconfigured
 * tags set in the app ... personal, work, health, etc".
 *
 *   - iOS 26+: one card after the task name with due-date AND group buttons.
 *   - Older iOS / no group picked: the server files the task with AI.
 *   - Manage groups screen: add, rename, change icon, reorder, delete.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  GROUP_COLORS,
  GROUP_ICONS,
  GROUP_NAME_MAX,
  moveGroup,
  nextGroupColor,
} from "../../../../mobile/lib/task-groups";

const mobile = (p: string) => readFileSync(resolve(__dirname, "../../../../mobile", p), "utf8");
const web = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8");

describe("Manage groups helpers", () => {
  it("moves a group and renumbers every order 0..n-1", () => {
    const groups = [
      { id: "a", order: 0 },
      { id: "b", order: 0 },
      { id: "c", order: 5 },
    ];
    expect(moveGroup(groups, 2, -1)).toEqual([
      { id: "a", order: 0 },
      { id: "c", order: 1 },
      { id: "b", order: 2 },
    ]);
    expect(moveGroup(groups, 0, -1)).toBeNull();
    expect(moveGroup(groups, 2, 1)).toBeNull();
  });

  it("gives a new group an unused palette color", () => {
    expect(nextGroupColor([{ color: "#3b82f6" }])).toBe(GROUP_COLORS[1]);
    const all = GROUP_COLORS.map((color) => ({ color }));
    expect(GROUP_COLORS).toContain(nextGroupColor(all));
  });

  it("matches the server's name cap and offers the seeded icons first", () => {
    expect(GROUP_NAME_MAX).toBe(40);
    expect(GROUP_ICONS.slice(0, 5)).toEqual(["briefcase", "person", "heart", "cart", "ellipsis-horizontal"]);
  });
});

describe("Manage groups screen", () => {
  const screen = mobile("app/task-groups.tsx");

  it("uses the existing task-groups API for every change", () => {
    expect(screen).toMatch(/api\.post<[^>]*>\("\/api\/task-groups"/);
    expect(screen).toMatch(/api\.patch<[^>]*>\(`\/api\/task-groups\/\$\{draft\.id\}`/);
    expect(screen).toMatch(/api\.del\(`\/api\/task-groups\/\$\{g\.id\}`/);
    expect(screen).toMatch(/moveTasksTo: other\.id/);
  });

  it("is reachable from the Tasks tab and registered as a modal", () => {
    expect(mobile("app/(tabs)/tasks.tsx")).toMatch(/router\.push\("\/task-groups"\)/);
    expect(mobile("app/_layout.tsx")).toMatch(/name="task-groups"[\s\S]{0,80}presentation: "modal"/);
  });

  it("publishes groups to the App Group for the Siri card, and clears them on sign-out", () => {
    const siri = mobile("lib/siri-shortcuts-data.ts");
    expect(siri).toMatch(/storage\.set\("taskGroupsForSiri"/);
    expect(siri).toMatch(/subscribeCached\(TASK_GROUPS_CACHE_KEY/);
    expect(mobile("app/_layout.tsx")).toMatch(/startSiriTaskGroupsPublisher\(\)/);
    expect(mobile("lib/widget-data.ts")).toMatch(/clearSiriUserData\(\)/);
  });
});

describe("Add a Task: due date and group on one card", () => {
  const swift = mobile("plugins/RippleShortcuts.swift");

  it("shows the card on iOS 26+ and keeps the due-date question below that", () => {
    expect(swift).toMatch(/if #available\(iOS 26\.0, \*\) \{[\s\S]*?requestConfirmation\([\s\S]*?snippetIntent: AddTaskCardSnippet\(taskTitle: trimmed\)/);
    expect(swift).toMatch(/\} else \{\s*choice = try await \$due\.requestValue\("Add a due date\?"\)/);
  });

  it("puts due-date and group buttons on the card", () => {
    expect(swift).toMatch(/Button\(intent: ChooseTaskDueIntent\(item\.0\)\)/);
    expect(swift).toMatch(/Button\(intent: ChooseTaskGroupIntent\(g\.id\)\)/);
    expect(swift).toMatch(/forKey: "taskGroupsForSiri"/);
  });

  it("sends the group, or asks the server to file it with AI", () => {
    expect(swift).toMatch(/body\["groupId"\] = g/);
    expect(swift).toMatch(/body\["autoGroup"\] = true/);
  });
});

describe("AI files Siri tasks that have no group", () => {
  it("only when the request asks and no group was chosen", () => {
    const route = web("app/api/tasks/route.ts");
    expect(route).toMatch(/if \(body\.autoGroup === true && !groupId\) \{\s*await dispatchTaskAutoGroup\(task\.id, userId\);/);
  });

  it("never overwrites a group set in the meantime, and is registered", () => {
    const fn = web("inngest/functions/task-auto-group.ts");
    expect(fn).toMatch(/updateMany\(\{\s*where: \{ id: taskId, userId, groupId: null \}/);
    expect(web("app/api/inngest/route.ts")).toMatch(/taskAutoGroupFn,/);
  });

  it("dispatch is bounded, deduped per task and never throws", () => {
    const lib = web("lib/task-auto-group.ts");
    expect(lib).toMatch(/id: taskAutoGroupEventId\(taskId\)/);
    expect(lib).toMatch(/SEND_TIMEOUT_MS = 4_000/);
    expect(lib).toMatch(/catch \(err\) \{[\s\S]*?return false;/);
  });

  it("recategorize and the new function share one classifier", () => {
    expect(web("app/api/task-groups/recategorize/route.ts")).toMatch(/from "@\/lib\/task-group-classify"/);
    expect(web("lib/task-group-classify.ts")).toMatch(/export async function classifyTasks\(/);
  });
});
