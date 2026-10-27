/**
 * POST /api/admin/release-email (2026-10-27)
 *
 * Send a release announcement from /admin/release-email. The Resend key
 * stays in Vercel. Logic and safety rails live in lib/release-announce.ts.
 *
 * Body: { version: string, mode: "dry-run" | "test" | "live", confirm?: string }
 *  - dry-run: audience counts. Sends nothing.
 *  - test: one "[TEST]" copy to the signed-in admin. No DB writes.
 *  - live: confirm must equal `SEND <version>`. iOS only, and only once
 *    the App Store serves that version. Safe to repeat: already-claimed
 *    users are skipped, and `remaining` > 0 means run it again.
 */
import { NextRequest, NextResponse } from "next/server";

import { releaseEmailFor } from "@/emails/announcements/releases";
import { logAdminAction } from "@/lib/admin-audit";
import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";
import {
  buildReleaseRecipients,
  fetchResendSuppressions,
  liveAppStoreVersion,
  sendReleaseLive,
  sendReleaseTest,
} from "@/lib/release-announce";
import { getResendClient } from "@/lib/resend";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/** Stop starting new sends this long before the function limit. */
const SAFETY_MARGIN_MS = 30_000;

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = (await req.json().catch(() => null)) as {
    version?: unknown;
    mode?: unknown;
    confirm?: unknown;
  } | null;
  const version = typeof body?.version === "string" ? body.version.trim() : "";
  const mode = body?.mode;
  const release = releaseEmailFor(version);
  if (!release) {
    return NextResponse.json({ error: `No release email for "${version}"` }, { status: 400 });
  }
  if (mode !== "dry-run" && mode !== "test" && mode !== "live") {
    return NextResponse.json({ error: "mode must be dry-run, test or live" }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "RESEND_API_KEY is not set" }, { status: 500 });
  }

  const liveVersion = release.platform === "ios" ? await liveAppStoreVersion() : null;
  const gateOpen = release.platform === "ios" && liveVersion === version;

  if (mode === "test") {
    const me = await prisma.user.findUnique({
      where: { id: guard.adminUserId },
      select: { email: true },
    });
    if (!me?.email) return NextResponse.json({ error: "Admin has no email" }, { status: 400 });
    const res = await sendReleaseTest(getResendClient(), release, me.email);
    await logAdminAction({
      adminUserId: guard.adminUserId,
      action: "release_email.test",
      metadata: { version, to: me.email, ok: !res.error },
    });
    if (res.error) {
      return NextResponse.json({ error: "Resend rejected the test send", detail: res.error }, { status: 502 });
    }
    return NextResponse.json({ ok: true, mode, sentTo: me.email, resendId: res.id });
  }

  let suppression: Set<string>;
  try {
    suppression = await fetchResendSuppressions(apiKey);
  } catch (err) {
    return NextResponse.json(
      { error: "Couldn't read the Resend suppression list; nothing sent", detail: String(err) },
      { status: 502 }
    );
  }
  const { recipients, suppressedCount } = await buildReleaseRecipients(prisma, release, suppression);
  const queued = recipients.filter((r) => !r.alreadySent).length;
  const summary = {
    version,
    platform: release.platform,
    appStoreVersion: liveVersion,
    releaseGateOpen: gateOpen,
    audience: recipients.length,
    alreadySent: recipients.length - queued,
    toSend: queued,
    suppressedExcluded: suppressedCount,
    suppressionListSize: suppression.size,
  };

  if (mode === "dry-run") {
    return NextResponse.json({ ok: true, mode, ...summary });
  }

  // ── live ──
  if (body?.confirm !== `SEND ${version}`) {
    return NextResponse.json({ error: `Type "SEND ${version}" to confirm` }, { status: 400 });
  }
  if (release.platform !== "ios") {
    return NextResponse.json(
      { error: "Live sends here are iOS-only (no public Play Store version check). Use the CLI." },
      { status: 400 }
    );
  }
  if (!gateOpen) {
    return NextResponse.json(
      { error: `The App Store shows "${liveVersion ?? "unknown"}", not "${version}". Nothing sent.` },
      { status: 409 }
    );
  }

  const result = await sendReleaseLive({
    db: prisma,
    mailer: getResendClient(),
    release,
    recipients,
    deadline: startedAt + maxDuration * 1000 - SAFETY_MARGIN_MS,
  });
  await logAdminAction({
    adminUserId: guard.adminUserId,
    action: "release_email.live",
    metadata: { ...summary, ...result, failures: result.failures.slice(0, 50) },
  });
  return NextResponse.json({ ok: true, mode, ...summary, ...result });
}
