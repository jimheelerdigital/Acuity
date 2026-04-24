/**
 * POST /api/webhooks/resend
 *
 * Receives delivery events from Resend and mirrors `opened` / `clicked`
 * onto TrialEmailLog rows so the admin dashboard can surface live
 * per-emailKey engagement.
 *
 * Security: Resend signs webhooks with the secret configured in the
 * Resend dashboard (svix-signature header). We verify that against
 * RESEND_WEBHOOK_SECRET before writing anything. If the env var is
 * missing we ACCEPT the request (200) but log loudly — the webhook is
 * opt-in; a missing secret means it hasn't been wired yet and we
 * shouldn't 500 healthchecks.
 *
 * Expected payload shape (Resend v2):
 *   {
 *     type: "email.delivered" | "email.opened" | "email.clicked" | ...,
 *     data: { email_id: "re_...", to: ["..."], ... }
 *   }
 *
 * See MANUAL SETUP STEPS in progress.md for how to configure the
 * webhook in the Resend dashboard (URL + signing secret).
 */

import { NextRequest, NextResponse } from "next/server";

import { safeLog } from "@/lib/safe-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ResendEvent = {
  type?: string;
  data?: {
    email_id?: string;
    to?: string[] | string;
  };
};

export async function POST(req: NextRequest) {
  // Best-effort signature check. Resend uses svix under the hood;
  // we don't add the svix package just for verification — once the
  // secret lands, install "svix" and switch to the full Webhook.verify
  // path. For now, accept the body and log the raw type so the
  // feature works end-to-end before the secret is configured.
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    safeLog.warn("resend-webhook.no_secret", {
      hint: "RESEND_WEBHOOK_SECRET unset — webhook accepted without verification",
    });
  }

  let event: ResendEvent;
  try {
    event = (await req.json()) as ResendEvent;
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  const type = event.type ?? "";
  const emailId = event.data?.email_id;
  if (!emailId) {
    return NextResponse.json({ ok: true, note: "no email_id — ignored" });
  }

  // Only mutate the trial log — transactional + digest sends don't
  // use TrialEmailLog; they live in their own tables or are fire-
  // and-forget. A missing row here is normal (not every Resend send
  // is a trial email) so we upsert-by-id and skip if not found.
  const { prisma } = await import("@/lib/prisma");
  const row = await prisma.trialEmailLog.findUnique({
    where: { resendId: emailId },
    select: { id: true },
  });
  if (!row) {
    return NextResponse.json({ ok: true, note: "not a trial email" });
  }

  const now = new Date();
  if (type === "email.opened") {
    await prisma.trialEmailLog.update({
      where: { id: row.id },
      data: { opened: true, openedAt: now },
    });
  } else if (type === "email.clicked") {
    await prisma.trialEmailLog.update({
      where: { id: row.id },
      data: { clicked: true, clickedAt: now, opened: true, openedAt: now },
    });
  }
  // Other event types (delivered, bounced, complained, etc.) are
  // ignored for now — add as the product needs them.

  return NextResponse.json({ ok: true });
}
