/**
 * POST /api/feedback/submit
 *
 * Slice O (2026-05-18, pivoted). User-facing feedback intake proxy.
 * The mobile app posts here; we enrich with server-known context
 * (user metadata, server timestamp) and forward as a Block-Kit-
 * formatted message to a Slack incoming webhook (#acuity-feedback).
 *
 * Architecture: Slack is the single funnel for ALL feedback sources
 * (in-app, Jim/Keenan pasting from email/text, future Sentry alerts,
 * future App Store reviews). One Make.com scenario watches the
 * channel and routes to Monday.com — keeps us inside Make's free-tier
 * 2-scenario limit (intake-from-Slack + commit-tag-sync are the only
 * two scenarios needed).
 *
 * Previous design (commit 9c2a391) posted JSON to a Make webhook
 * directly. Pivoted to Slack-direct so Make doesn't need a dedicated
 * trigger scenario for in-app feedback.
 *
 * Why we still proxy through this endpoint instead of letting the
 * mobile binary POST Slack directly:
 *   1. The Slack webhook URL stays out of the mobile JS bundle.
 *      Future webhook rotation doesn't require an app update.
 *   2. Server appends authoritative context (verified userId,
 *      subscription state, server timestamp).
 *   3. Server-side rate-limit prevents a client-side bug from
 *      flooding the channel.
 *
 * Auth: signed-in users only.
 * Rate limit: 10 submissions/hour per user (limiters.feedbackSubmit).
 *
 * Request body (from mobile):
 *   {
 *     content: string         // required, 1-4000 chars after trim
 *     type: "bug" | "feature" | "ux" | "other"  // required
 *     appVersion?: string     // mobile app version
 *     buildNumber?: string    // iOS build number
 *     osName?: string         // "iOS" | "Android"
 *     osVersion?: string      // e.g., "17.5"
 *   }
 *
 * Slack message shape (Block Kit):
 *   - Header block: "New feedback — <Type>"
 *   - Section block: quoted user content (each line prefixed `> `)
 *   - Context block: one-line "From email (uidShort) • vN (B) OS X • <plan> • N entries • <ts> UTC"
 *   - Code-fence section: JSON metadata bag (Make's Slack module
 *     reads the full message text; we embed structured fields here
 *     so Make can regex/Claude-parse reliably without depending on
 *     Slack's metadata feature which incoming webhooks don't expose).
 *
 * Response:
 *   200 { ok: true }              — Slack accepted the post
 *   400 { error: ... }            — invalid request body
 *   401 { error: "Unauthorized" } — no session
 *   429                            — rate limited
 *   502 { error: "WebhookError" } — Slack returned non-2xx
 *   503 { error: "Disabled" }    — SLACK_FEEDBACK_WEBHOOK_URL not set
 *
 * Failure mode (Slack unreachable / 5xx): return 502 + safeLog. Mobile
 * shows "couldn't send" alert; user can retry. No queue on our side.
 * Acceptable for v1 — Slack's webhook uptime is very high.
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

  const webhookUrl = process.env.SLACK_FEEDBACK_WEBHOOK_URL;
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

  const submittedAt = new Date().toISOString();
  const slackMessage = buildSlackMessage({
    content,
    type,
    submittedAt,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      subscriptionStatus: user.subscriptionStatus,
      trialEndsAt: user.trialEndsAt
        ? user.trialEndsAt.toISOString()
        : null,
      totalRecordings: user.totalRecordings,
      accountCreatedAt: user.createdAt.toISOString(),
    },
    mobile: {
      appVersion: stringOrNull(body.appVersion, 32),
      buildNumber: stringOrNull(body.buildNumber, 16),
      osName: stringOrNull(body.osName, 16),
      osVersion: stringOrNull(body.osVersion, 32),
    },
    network: { ip: ipFromRequest(req) },
  });

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(slackMessage),
    });
    if (!res.ok) {
      // Slack returns text bodies on error like "invalid_payload" —
      // surface a short prefix in the log so we can diagnose if a
      // payload-shape bug ever ships.
      const errText = await res.text().catch(() => "");
      safeLog.warn("feedback.submit.webhook-error", {
        userId,
        status: res.status,
        body: errText.slice(0, 120),
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

// ─── Slack Block Kit message construction ─────────────────────

const TYPE_LABELS: Record<string, string> = {
  bug: "Bug",
  feature: "Feature idea",
  ux: "UX / design",
  other: "Other",
};

interface SlackMessagePayload {
  content: string;
  type: string;
  submittedAt: string;
  user: {
    id: string;
    email: string | null;
    name: string | null;
    subscriptionStatus: string | null;
    trialEndsAt: string | null;
    totalRecordings: number;
    accountCreatedAt: string;
  };
  mobile: {
    appVersion: string | null;
    buildNumber: string | null;
    osName: string | null;
    osVersion: string | null;
  };
  network: { ip: string };
}

function buildSlackMessage(payload: SlackMessagePayload): object {
  const typeLabel = TYPE_LABELS[payload.type] ?? payload.type;
  const userTagShort = payload.user.id.slice(0, 8);
  const submittedAtDisplay =
    payload.submittedAt.slice(0, 16).replace("T", " ") + " UTC";

  // Each line of the user's content gets a `> ` prefix so Slack
  // renders it as a quote block. Two-line breaks collapse to a single
  // newline in mrkdwn — preserve user's paragraph breaks by joining
  // with explicit `>\n>` between paragraphs.
  const quotedContent = payload.content
    .split("\n")
    .map((line) => (line.trim() === "" ? ">" : `> ${line}`))
    .join("\n");

  // Human-readable context line. Compact, scannable.
  const mobile = payload.mobile;
  const versionStr = mobile.appVersion
    ? `v${mobile.appVersion}${mobile.buildNumber ? ` (${mobile.buildNumber})` : ""}`
    : "version unknown";
  const osStr =
    mobile.osName && mobile.osVersion
      ? `${mobile.osName} ${mobile.osVersion}`
      : mobile.osName ?? "OS unknown";
  const planStr = payload.user.subscriptionStatus ?? "FREE";
  const ctx = `From ${payload.user.email ?? "no-email"} (${userTagShort}) • ${versionStr} ${osStr} • ${planStr} • ${payload.user.totalRecordings} entries • ${submittedAtDisplay}`;

  // Structured metadata for Make.com to extract. JSON in a code fence
  // so Slack renders it readable + Make's Slack module can grab the
  // full message text and regex/Claude-parse the JSON block.
  const metadata = {
    userId: payload.user.id,
    email: payload.user.email,
    name: payload.user.name,
    type: payload.type,
    subscriptionStatus: payload.user.subscriptionStatus,
    totalRecordings: payload.user.totalRecordings,
    accountCreatedAt: payload.user.accountCreatedAt,
    appVersion: mobile.appVersion,
    buildNumber: mobile.buildNumber,
    osName: mobile.osName,
    osVersion: mobile.osVersion,
    submittedAt: payload.submittedAt,
    networkIp: payload.network.ip,
  };

  return {
    // Notification-fallback text (shown in push notifications + screen
    // reader fallback when blocks fail to render).
    text: `New feedback (${typeLabel}) from ${payload.user.email ?? "user"}`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `New feedback — ${typeLabel}` },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: quotedContent },
      },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: ctx }],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "```\n" + JSON.stringify(metadata, null, 2) + "\n```",
        },
      },
    ],
  };
}
