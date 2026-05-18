/**
 * POST /api/feedback/submit
 *
 * Slice O (2026-05-18). User-facing feedback intake proxy. The mobile
 * app posts here; we enrich with server-known context (user metadata,
 * server timestamp, IP) and forward to a Make.com webhook for the
 * downstream Claude-distillation → Monday.com-board pipeline.
 *
 * Why proxy instead of having the mobile app POST Make directly:
 *   1. The Make webhook URL stays out of the mobile JS bundle. If we
 *      migrate webhook providers (Make → n8n / Zapier / native) later,
 *      no app update needed.
 *   2. Server can append context the client doesn't have authoritatively
 *      (verified userId from the session, server-side timestamp,
 *      request IP).
 *   3. Server-side rate-limit prevents a client-side bug from sending
 *      hundreds of duplicate submissions on rapid retry.
 *
 * Auth: signed-in users only. Unauthenticated submissions would mean
 * anonymous spam at the public surface — and feedback without a user
 * ID is much less useful to Make's deduplication step anyway. If we
 * ever add a non-authenticated feedback path (e.g., from a landing
 * page), it lands at a different route with stricter rate-limiting.
 *
 * Rate limit: 10 submissions/hour per user (see limiters.feedbackSubmit).
 *
 * Request body (from mobile):
 *   {
 *     content: string         // required, 1-4000 chars after trim
 *     type: "bug" | "feature" | "ux" | "other"  // required
 *     appVersion?: string     // mobile app version (Constants.expoConfig.version)
 *     buildNumber?: string    // iOS build number
 *     osName?: string         // "iOS" | "Android"
 *     osVersion?: string      // e.g., "17.5"
 *   }
 *
 * Forward to Make.com (FEEDBACK_WEBHOOK_URL env) shape:
 *   {
 *     source: "in-app-mobile",
 *     content: <client>,
 *     type: <client>,
 *     submittedAt: <server ISO timestamp>,
 *     user: {
 *       id: <session userId>,
 *       email, name, subscriptionStatus, trialEndsAt, totalRecordings,
 *       accountCreatedAt
 *     },
 *     mobile: { appVersion, buildNumber, osName, osVersion },
 *     network: { ip }
 *   }
 *
 * Response:
 *   200 { ok: true }            — forwarded successfully
 *   400 { error: "..." }        — invalid request body
 *   401 { error: "Unauthorized" } — no session
 *   429                          — rate limited
 *   502 { error: "WebhookError" } — Make.com returned non-2xx
 *   503 { error: "Disabled" }    — FEEDBACK_WEBHOOK_URL not set
 *
 * Failure mode (Make.com unreachable / 5xx): we return 502 to the
 * client + safeLog the failure. The mobile app shows a "couldn't
 * send" alert and the user can retry. No queue / retry on our side —
 * if Make is down, feedback is lost. Acceptable for v1 (Make's
 * uptime is fine; bigger surface is the inbox-Slack flow which
 * doesn't go through this endpoint).
 */

import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";
import {
  checkRateLimit,
  limiters,
  rateLimitedResponse,
} from "@/lib/rate-limit";
import { safeLog } from "@/lib/safe-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_TYPES = new Set(["bug", "feature", "ux", "other"]);
const MAX_CONTENT_CHARS = 4000;

interface MobileBody {
  content?: unknown;
  type?: unknown;
  appVersion?: unknown;
  buildNumber?: unknown;
  osName?: unknown;
  osVersion?: unknown;
}

function ipFromRequest(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

function stringOrNull(v: unknown, max = 200): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

export async function POST(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(limiters.feedbackSubmit, `user:${userId}`);
  if (!rl.success) return rateLimitedResponse(rl);

  const body = (await req.json().catch(() => null)) as MobileBody | null;
  if (!body) {
    return NextResponse.json({ error: "InvalidBody" }, { status: 400 });
  }

  // Content validation
  const content =
    typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    return NextResponse.json({ error: "ContentRequired" }, { status: 400 });
  }
  if (content.length > MAX_CONTENT_CHARS) {
    return NextResponse.json(
      { error: "ContentTooLong", limit: MAX_CONTENT_CHARS },
      { status: 400 }
    );
  }

  // Type validation
  const type = typeof body.type === "string" ? body.type : "";
  if (!VALID_TYPES.has(type)) {
    return NextResponse.json(
      { error: "InvalidType", allowed: Array.from(VALID_TYPES) },
      { status: 400 }
    );
  }

  const webhookUrl = process.env.FEEDBACK_WEBHOOK_URL;
  if (!webhookUrl) {
    // Feature not configured. Surface as 503 so the mobile UI can
    // tell the user "feedback is temporarily unavailable" rather
    // than failing silently.
    safeLog.warn("feedback.submit.no-webhook-url", { userId });
    return NextResponse.json({ error: "Disabled" }, { status: 503 });
  }

  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      totalRecordings: true,
      createdAt: true,
    },
  });

  if (!user) {
    // Session was valid but user row was deleted between auth and
    // this lookup. Edge case; treat as 401 so the mobile app routes
    // to sign-in.
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = {
    source: "in-app-mobile",
    content,
    type,
    submittedAt: new Date().toISOString(),
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      subscriptionStatus: user.subscriptionStatus,
      trialEndsAt: user.trialEndsAt,
      totalRecordings: user.totalRecordings,
      accountCreatedAt: user.createdAt,
    },
    mobile: {
      appVersion: stringOrNull(body.appVersion, 32),
      buildNumber: stringOrNull(body.buildNumber, 16),
      osName: stringOrNull(body.osName, 16),
      osVersion: stringOrNull(body.osVersion, 32),
    },
    network: { ip: ipFromRequest(req) },
  };

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      safeLog.warn("feedback.submit.webhook-error", {
        userId,
        status: res.status,
      });
      return NextResponse.json(
        { error: "WebhookError", status: res.status },
        { status: 502 }
      );
    }
  } catch (err) {
    safeLog.error("feedback.submit.webhook-fetch-failed", err, { userId });
    return NextResponse.json(
      { error: "WebhookError" },
      { status: 502 }
    );
  }

  safeLog.info("feedback.submit.ok", { userId, type });
  return NextResponse.json({ ok: true });
}
