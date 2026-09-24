/**
 * Ripple MCP server (1.8, "bring your own AI").
 *
 * Exposes a small set of READ-ONLY tools over the user's OWN journal so they
 * can point an external MCP client (Claude Desktop, Cursor, ChatGPT, …) at
 * their Ripple data. Every tool is scoped to the authenticated user's id and
 * reflects only that user's content back to them — this is the user reading
 * their own journal through their own assistant, on their own token.
 *
 * AUTH
 *   - Bearer token = a per-user McpAccessToken (see lib/mcp-token.ts). The
 *     user mints it in Ripple settings and pastes it into their client.
 *   - verifyToken resolves the token → userId, then Pro-gates: the AI
 *     features are Pro-only, so a non-Pro (or lapsed) user's valid token is
 *     authenticated but gets NO `journal:read` scope → 403. Re-checked on
 *     EVERY request, so a lapse stops access without needing revocation.
 *
 * TRANSPORT
 *   - Stateless Streamable HTTP via mcp-handler 1.x (no Redis, no sessions).
 *   - Mounted at /api/mcp. mcp-handler matches the request pathname exactly,
 *     so `basePath: "/api"` derives the streamable endpoint to "/api/mcp".
 *   - Stays on the 1.x line deliberately: mcp-handler 2.x + MCP SDK v2
 *     require zod ^4, and this repo is on zod 3. When the repo migrates to
 *     zod 4, bump to mcp-handler 2.x for the 2026-07-28 protocol. The 1.x
 *     stateless Streamable HTTP transport is supported by all current
 *     clients today.
 *
 * PRIVACY POSTURE
 *   - Read-only. No tool mutates, deletes, or exports.
 *   - Returns the user's own summaries + capped excerpts, not raw full
 *     transcripts by default — enough for an assistant to reason over,
 *     without dumping everything.
 */

import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { z } from "zod";

import {
  currentStreak,
  bestStreak,
  completionRate,
  type HabitLike,
} from "@acuity/shared";

import { resolveEntitlement } from "@/lib/entitlements/resolve";
import { localDateForTimezone } from "@/lib/habits-autocheck";
import { retrieveRelevantEntries, toCitations } from "@/lib/journal-query";
import { verifyMcpToken } from "@/lib/mcp-token";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Embedding + ranking on search_journal can take a few seconds on a cold
// path; give the function headroom.
export const maxDuration = 60;

const SERVER_NAME = "ripple";
const SERVER_VERSION = "1.8.0";
const SCOPE_READ = "journal:read";

/** Wrap any JSON-serializable value as an MCP text tool result. */
function jsonResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

/** Wrap an error message as an MCP error tool result. */
function errorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true as const,
  };
}

/**
 * Pull the authenticated user's id off the auth context. withMcpAuth has
 * already enforced a valid token + the read scope before any tool runs, so
 * this should always be present; throwing on a miss is a defensive guard, not
 * an expected path.
 */
function userIdFrom(extra: { authInfo?: AuthInfo }): string {
  const uid = extra.authInfo?.extra?.userId;
  if (typeof uid !== "string" || uid.length === 0) {
    throw new Error("Missing authenticated user context");
  }
  return uid;
}

/** Clamp a caller-supplied limit into a sane range. */
function clampLimit(n: number | undefined, def: number, max: number): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return def;
  return Math.max(1, Math.min(max, Math.floor(n)));
}

const baseHandler = createMcpHandler(
  (server) => {
    // ── search_journal ──────────────────────────────────────────────────
    server.registerTool(
      "search_journal",
      {
        title: "Search journal",
        description:
          "Semantic search over the user's own journal entries. Returns the " +
          "most relevant entries as dated excerpts with a relevance score. " +
          "Use this to answer questions about what the user has written, " +
          "felt, or done over time.",
        inputSchema: {
          query: z
            .string()
            .min(2)
            .max(500)
            .describe("What to look for, in natural language."),
          limit: z
            .number()
            .int()
            .optional()
            .describe("Max entries to return (1-25, default 10)."),
        },
      },
      async ({ query, limit }, extra) => {
        try {
          const userId = userIdFrom(extra);
          const topK = clampLimit(limit, 10, 25);
          const { ranked, totalEmbedded } = await retrieveRelevantEntries(
            userId,
            query,
            { topK }
          );
          if (totalEmbedded === 0) {
            return jsonResult({
              results: [],
              note: "No indexed entries yet — nothing to search.",
            });
          }
          return jsonResult({
            query,
            totalEmbeddedEntries: totalEmbedded,
            results: toCitations(ranked, { maxChars: 500 }),
          });
        } catch (err) {
          return errorResult(
            err instanceof Error ? err.message : "search_journal failed"
          );
        }
      }
    );

    // ── list_recent_entries ─────────────────────────────────────────────
    server.registerTool(
      "list_recent_entries",
      {
        title: "List recent entries",
        description:
          "The user's most recent completed journal entries in reverse " +
          "chronological order (date, one-line summary, mood). Use for " +
          "'what have I been up to lately' without a specific query.",
        inputSchema: {
          limit: z
            .number()
            .int()
            .optional()
            .describe("How many entries (1-50, default 10)."),
        },
      },
      async ({ limit }, extra) => {
        try {
          const userId = userIdFrom(extra);
          const take = clampLimit(limit, 10, 50);
          const entries = await prisma.entry.findMany({
            where: { userId, status: "COMPLETE" },
            orderBy: { createdAt: "desc" },
            take,
            select: {
              id: true,
              createdAt: true,
              summary: true,
              mood: true,
              moodScore: true,
            },
          });
          return jsonResult({
            entries: entries.map((e) => ({
              id: e.id,
              date: e.createdAt.toISOString().slice(0, 10),
              summary: e.summary ?? null,
              mood: e.mood ?? null,
              moodScore: e.moodScore ?? null,
            })),
          });
        } catch (err) {
          return errorResult(
            err instanceof Error ? err.message : "list_recent_entries failed"
          );
        }
      }
    );

    // ── list_themes ─────────────────────────────────────────────────────
    server.registerTool(
      "list_themes",
      {
        title: "List themes",
        description:
          "The recurring themes extracted from the user's journal, with how " +
          "many entries mention each. Use to surface patterns ('what keeps " +
          "coming up for me').",
        inputSchema: {
          limit: z
            .number()
            .int()
            .optional()
            .describe("How many themes (1-50, default 20)."),
        },
      },
      async ({ limit }, extra) => {
        try {
          const userId = userIdFrom(extra);
          const take = clampLimit(limit, 20, 50);
          const themes = await prisma.theme.findMany({
            where: { userId },
            orderBy: { mentions: { _count: "desc" } },
            take,
            select: {
              name: true,
              createdAt: true,
              _count: { select: { mentions: true } },
            },
          });
          return jsonResult({
            themes: themes.map((t) => ({
              name: t.name,
              mentionCount: t._count.mentions,
              firstSeen: t.createdAt.toISOString().slice(0, 10),
            })),
          });
        } catch (err) {
          return errorResult(
            err instanceof Error ? err.message : "list_themes failed"
          );
        }
      }
    );

    // ── list_tasks ──────────────────────────────────────────────────────
    server.registerTool(
      "list_tasks",
      {
        title: "List tasks",
        description:
          "The user's tasks (extracted from entries or added manually). " +
          "Filter by open/done/all. Returns title, status, priority, due date.",
        inputSchema: {
          status: z
            .enum(["open", "done", "all"])
            .optional()
            .describe("Which tasks (default 'open')."),
          limit: z
            .number()
            .int()
            .optional()
            .describe("How many (1-100, default 50)."),
        },
      },
      async ({ status, limit }, extra) => {
        try {
          const userId = userIdFrom(extra);
          const take = clampLimit(limit, 50, 100);
          const filter = status ?? "open";
          const where =
            filter === "all"
              ? { userId }
              : filter === "done"
                ? { userId, status: "DONE" }
                : { userId, status: { not: "DONE" } };
          const tasks = await prisma.task.findMany({
            where,
            orderBy: { createdAt: "desc" },
            take,
            select: {
              id: true,
              title: true,
              text: true,
              status: true,
              priority: true,
              dueDate: true,
              completedAt: true,
              createdAt: true,
            },
          });
          return jsonResult({
            filter,
            tasks: tasks.map((t) => ({
              id: t.id,
              title: t.title ?? t.text ?? null,
              status: t.status,
              priority: t.priority,
              dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
              completedAt: t.completedAt
                ? t.completedAt.toISOString().slice(0, 10)
                : null,
              createdAt: t.createdAt.toISOString().slice(0, 10),
            })),
          });
        } catch (err) {
          return errorResult(
            err instanceof Error ? err.message : "list_tasks failed"
          );
        }
      }
    );

    // ── list_goals ──────────────────────────────────────────────────────
    server.registerTool(
      "list_goals",
      {
        title: "List goals",
        description:
          "The user's goals with status, progress, life area, and target " +
          "date. Archived goals are excluded unless a status is given.",
        inputSchema: {
          status: z
            .enum([
              "NOT_STARTED",
              "IN_PROGRESS",
              "ON_HOLD",
              "COMPLETE",
              "ARCHIVED",
            ])
            .optional()
            .describe("Filter to one status (default: all except ARCHIVED)."),
          limit: z
            .number()
            .int()
            .optional()
            .describe("How many (1-100, default 50)."),
        },
      },
      async ({ status, limit }, extra) => {
        try {
          const userId = userIdFrom(extra);
          const take = clampLimit(limit, 50, 100);
          const where = status
            ? { userId, status }
            : { userId, status: { not: "ARCHIVED" } };
          const goals = await prisma.goal.findMany({
            where,
            orderBy: { createdAt: "desc" },
            take,
            select: {
              id: true,
              title: true,
              status: true,
              progress: true,
              lifeArea: true,
              targetDate: true,
              createdAt: true,
            },
          });
          return jsonResult({
            goals: goals.map((g) => ({
              id: g.id,
              title: g.title,
              status: g.status,
              progress: g.progress,
              lifeArea: g.lifeArea,
              targetDate: g.targetDate
                ? g.targetDate.toISOString().slice(0, 10)
                : null,
              createdAt: g.createdAt.toISOString().slice(0, 10),
            })),
          });
        } catch (err) {
          return errorResult(
            err instanceof Error ? err.message : "list_goals failed"
          );
        }
      }
    );

    // ── list_habits ─────────────────────────────────────────────────────
    server.registerTool(
      "list_habits",
      {
        title: "List habits",
        description:
          "The user's active habits with current streak, best streak, " +
          "whether it's checked today, and 30-day completion rate. Streaks " +
          "respect each habit's schedule and the user's timezone.",
      },
      async (extra) => {
        try {
          const userId = userIdFrom(extra);
          const [user, habits] = await Promise.all([
            prisma.user.findUnique({
              where: { id: userId },
              select: { timezone: true },
            }),
            prisma.habit.findMany({
              where: { userId, archivedAt: null },
              orderBy: { sortOrder: "asc" },
              select: {
                id: true,
                name: true,
                description: true,
                daysActive: true,
                type: true,
              },
            }),
          ]);

          const today = localDateForTimezone(user?.timezone);

          if (habits.length === 0) {
            return jsonResult({ today, habits: [] });
          }

          const checks = await prisma.habitCheck.findMany({
            where: { userId, habitId: { in: habits.map((h) => h.id) } },
            select: { habitId: true, localDate: true },
          });
          const byHabit = new Map<string, Set<string>>();
          for (const c of checks) {
            let set = byHabit.get(c.habitId);
            if (!set) {
              set = new Set<string>();
              byHabit.set(c.habitId, set);
            }
            set.add(c.localDate);
          }

          return jsonResult({
            today,
            habits: habits.map((h) => {
              const dates = byHabit.get(h.id) ?? new Set<string>();
              const habitLike: HabitLike = {
                id: h.id,
                name: h.name,
                daysActive: h.daysActive,
                archivedAt: null,
              };
              return {
                id: h.id,
                name: h.name,
                description: h.description ?? null,
                type: h.type,
                checkedToday: dates.has(today),
                currentStreak: currentStreak(habitLike, dates, today),
                bestStreak: bestStreak(habitLike, dates, today),
                completionRate30: completionRate(habitLike, dates, today, 30).pct,
                totalChecks: dates.size,
              };
            }),
          });
        } catch (err) {
          return errorResult(
            err instanceof Error ? err.message : "list_habits failed"
          );
        }
      }
    );

    // ── get_weekly_summary ──────────────────────────────────────────────
    server.registerTool(
      "get_weekly_summary",
      {
        title: "Get weekly summary",
        description:
          "The user's generated weekly report (narrative, insight bullets, " +
          "mood arc, top themes, task/goal counts). Defaults to the latest; " +
          "pass weeksAgo to step back. Does not generate a new one.",
        inputSchema: {
          weeksAgo: z
            .number()
            .int()
            .min(0)
            .max(104)
            .optional()
            .describe("0 = most recent (default), 1 = the week before, etc."),
        },
      },
      async ({ weeksAgo }, extra) => {
        try {
          const userId = userIdFrom(extra);
          const skip = clampLimit(
            weeksAgo === undefined ? 0 : weeksAgo + 1,
            1,
            105
          ) - 1;
          const report = await prisma.weeklyReport.findFirst({
            where: { userId, status: "COMPLETE" },
            orderBy: { weekStart: "desc" },
            skip,
            select: {
              weekStart: true,
              weekEnd: true,
              narrative: true,
              insightBullets: true,
              moodArc: true,
              topThemes: true,
              tasksOpened: true,
              tasksClosed: true,
              goalsProgressed: true,
              entryCount: true,
            },
          });
          if (!report) {
            return jsonResult({
              note: "No weekly report available for that period.",
            });
          }
          return jsonResult({
            weekStart: report.weekStart.toISOString().slice(0, 10),
            weekEnd: report.weekEnd.toISOString().slice(0, 10),
            narrative: report.narrative,
            insightBullets: report.insightBullets,
            moodArc: report.moodArc,
            topThemes: report.topThemes,
            tasksOpened: report.tasksOpened,
            tasksClosed: report.tasksClosed,
            goalsProgressed: report.goalsProgressed,
            entryCount: report.entryCount,
          });
        } catch (err) {
          return errorResult(
            err instanceof Error ? err.message : "get_weekly_summary failed"
          );
        }
      }
    );
  },
  { serverInfo: { name: SERVER_NAME, version: SERVER_VERSION } },
  {
    // Mounted at /api/mcp → basePath "/api" makes the streamable endpoint
    // resolve to "/api/mcp" (mcp-handler matches the pathname exactly).
    basePath: "/api",
    // SSE is removed from the spec and needs Redis; we only serve stateless
    // Streamable HTTP.
    disableSse: true,
    maxDuration: 60,
    verboseLogs: false,
  }
);

/**
 * Resolve a bearer token to an AuthInfo, or undefined to reject (→ 401).
 *
 * Two-stage: (1) the token must be a valid, active McpAccessToken; (2) the
 * owning user must currently be Pro-entitled. A valid token for a non-Pro
 * user authenticates but receives no `journal:read` scope, which withMcpAuth
 * turns into a 403 — deliberately distinct from 401 so the user can tell
 * "bad token" apart from "need Pro". Entitlement is read fresh on every
 * request, so a lapse revokes access without touching the token.
 */
async function verifyToken(
  _req: Request,
  bearerToken?: string
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;

  const verified = await verifyMcpToken(bearerToken);
  if (!verified) return undefined;

  // Resolve entitlement through the single resolver (RevenueCat-cutover-
  // ready) rather than reading Prisma directly. null = stale/deleted user.
  const resolved = await resolveEntitlement(verified.userId);
  if (!resolved) return undefined;

  // MCP/AI is a Pro feature, gated on the same flag as the extraction/AI
  // pipeline (true for PRO and active TRIAL; false for FREE/post-trial/
  // past-due). Grant the read scope only when entitled.
  const scopes = resolved.entitlement.canExtractEntries ? [SCOPE_READ] : [];

  return {
    token: bearerToken,
    clientId: verified.userId,
    scopes,
    extra: { userId: verified.userId, tokenId: verified.tokenId },
  };
}

const handler = withMcpAuth(baseHandler, verifyToken, {
  required: true,
  requiredScopes: [SCOPE_READ],
});

export { handler as GET, handler as POST };
