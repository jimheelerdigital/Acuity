/**
 * POST /api/insights/:id/correction — record the user's verdict on an insight.
 *
 * Body: { state: "ACCURATE" | "INCOMPLETE" | "WRONG", note?: string }
 *        { state: null }  clears a previous correction.
 *
 * SCHEMA + API ONLY — there is no UI for this yet. Shipping the write path
 * first means corrections start being recordable (and the data model gets
 * exercised) before the interaction design is settled.
 *
 * Gated on EVIDENCE_RECEIPTS: with the flag off this 404s, so the route is
 * not discoverable and cannot write. 404 rather than 403 follows the
 * convention in lib/feature-flags.ts `gateFeatureFlag` — a disabled feature
 * should not leak its own existence.
 *
 * Why corrections matter beyond politeness: a user marking an insight WRONG
 * is the highest-quality signal we can get about generation quality, and
 * `classifyInsightConfidence` treats it as outranking both the model's
 * confidence AND the evidence — see packages/shared/src/evidence.ts. This
 * endpoint is where that signal enters the system.
 */

import { NextRequest, NextResponse } from "next/server";

import { normalizeCorrectionState } from "@acuity/shared";

import { evidenceReceiptsEnabled } from "@/lib/evidence/flags";
import { getAnySessionUserId } from "@/lib/mobile-auth";
import { enforceUserRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Cap so a pathological client can't write an unbounded blob. */
const MAX_NOTE_CHARS = 2000;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!evidenceReceiptsEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await enforceUserRateLimit("userWrite", userId);
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as {
    state?: unknown;
    note?: unknown;
  } | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // `state: null` is an explicit "undo my correction" and is distinct from a
  // missing key, which is a malformed request.
  const clearing = body.state === null;
  const state = clearing ? null : normalizeCorrectionState(body.state);
  if (!clearing && state === null) {
    return NextResponse.json(
      {
        error: "Invalid state",
        allowed: ["ACCURATE", "INCOMPLETE", "WRONG", null],
      },
      { status: 400 }
    );
  }

  let note: string | null = null;
  if (typeof body.note === "string") {
    const trimmed = body.note.trim();
    note = trimmed.length === 0 ? null : trimmed.slice(0, MAX_NOTE_CHARS);
  } else if (body.note !== undefined && body.note !== null) {
    return NextResponse.json({ error: "note must be a string" }, { status: 400 });
  }

  const { prisma } = await import("@/lib/prisma");

  // Scope by userId in the lookup, so one user can never correct another's
  // insight — and a miss is reported as 404, not 403, so the endpoint
  // doesn't confirm that someone else's insight id exists.
  const existing = await prisma.userInsight.findFirst({
    where: { id: params.id, userId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.userInsight.update({
    where: { id: params.id },
    data: {
      correctionState: state,
      // Clearing the state clears the note with it — a note explaining a
      // retracted correction is worse than nothing.
      correctionNote: clearing ? null : note,
      correctedAt: clearing ? null : new Date(),
    },
    select: {
      id: true,
      correctionState: true,
      correctionNote: true,
      correctedAt: true,
    },
  });

  return NextResponse.json({
    ok: true,
    insight: {
      id: updated.id,
      correctionState: updated.correctionState,
      correctionNote: updated.correctionNote,
      correctedAt: updated.correctedAt?.toISOString() ?? null,
    },
  });
}
