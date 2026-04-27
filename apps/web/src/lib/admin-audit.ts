import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Canonical admin-action slugs. Add new slugs here (not inline at call
 * sites) so the Overview audit panel can surface them with a readable
 * label and we don't drift across spellings.
 */
export const ADMIN_ACTIONS = {
  FEATURE_FLAG_TOGGLE: "feature_flag.toggle",
  FEATURE_FLAG_ROLLOUT: "feature_flag.rollout",
  FEATURE_FLAG_TIER: "feature_flag.tier",
  FEATURE_OVERRIDE_UPSERT: "feature_override.upsert",
  FEATURE_OVERRIDE_DELETE: "feature_override.delete",
  USER_SOFT_DELETE: "user.soft_delete",
  USER_EXTEND_TRIAL: "user.extend_trial",
  USER_SEND_MAGIC_LINK: "user.send_magic_link",
  METRIC_DRILLDOWN: "admin.metric.drilldown",
} as const;

export type AdminAction =
  (typeof ADMIN_ACTIONS)[keyof typeof ADMIN_ACTIONS];

export type LogAdminActionInput = {
  adminUserId: string;
  action: AdminAction | string;
  targetUserId?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Write an immutable audit row. Never throws — audit failure must
 * not block the primary admin action. Use the slugs in ADMIN_ACTIONS
 * where possible.
 */
export async function logAdminAction(input: LogAdminActionInput): Promise<void> {
  try {
    await prisma.adminAuditLog.create({
      data: {
        adminUserId: input.adminUserId,
        action: input.action,
        targetUserId: input.targetUserId ?? null,
        metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (err) {
    console.warn("[admin-audit] log write failed (non-fatal):", err);
  }
}

export async function listRecentAdminActions(limit = 20) {
  return prisma.adminAuditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 100),
  });
}
