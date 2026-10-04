/**
 * POST /api/onboarding/first-debrief-text
 *
 * The typed half of the funnel's first debrief (2026-09-28, per Keenan: after
 * payment, "a limited debrief screen, followed by it saving to their account,
 * followed by pushing them downloading the app"). Spoken debriefs use the
 * normal /api/record path; this is for people who'd rather type, or whose
 * in-app browser won't give up the mic.
 *
 * The typed text becomes the Entry transcript, and the entry goes through the
 * SAME Inngest pipeline as a recording (entry/process.requested with
 * skipTranscribe, the edit-reprocess path), so tasks, mood, Life Matrix and
 * memory all update exactly as they would from the app.
 *
 * 2026-10-04: restored for the no-wait first debrief after payment
 * (components/funnel-first-debrief.tsx). The client does NOT poll: it says
 * "saved" and moves on, and the results are waiting in the app.
 *
 * Limited on purpose: signed-in users with extraction entitlement only, and
 * only while they have no entries yet — it is the first debrief, not a web
 * journal.
 *
 * Body: { text: string }   202: { entryId, status: "QUEUED" }
 */
import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";
import { requireEntitlement } from "@/lib/paywall";
import { inngest } from "@/inngest/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MIN_CHARS = 10;
const MAX_CHARS = 2_000;

export async function POST(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (text.length < MIN_CHARS) {
    return NextResponse.json({ error: "Write a little more first." }, { status: 400 });
  }
  if (text.length > MAX_CHARS) {
    return NextResponse.json({ error: "That's a bit long for a first debrief." }, { status: 400 });
  }

  const gate = await requireEntitlement("canExtractEntries", userId);
  if (!gate.ok) return gate.response;

  const { prisma } = await import("@/lib/prisma");
  const existing = await prisma.entry.count({ where: { userId } });
  if (existing > 0) {
    return NextResponse.json({ error: "FIRST_DEBRIEF_DONE" }, { status: 409 });
  }

  const entry = await prisma.entry.create({
    data: { userId, status: "QUEUED", transcript: text },
  });
  await inngest.send({
    name: "entry/process.requested",
    data: { entryId: entry.id, userId, skipTranscribe: true },
  });

  return NextResponse.json({ entryId: entry.id, status: "QUEUED" }, { status: 202 });
}
