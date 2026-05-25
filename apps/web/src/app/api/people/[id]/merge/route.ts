/**
 * POST /api/people/[id]/merge
 *
 * Body: { targetPersonId: string }
 *
 * Merges Person `[id]` (source) INTO Person `targetPersonId` (target):
 * all EntityMentions get re-pointed, source aliases are merged into
 * the target's alias list (deduped, case-insensitive), source
 * mentionCount is added to the target's, then the source Person is
 * deleted.
 *
 * Slice 3 v1.2 Anchor People. Surfaces in the user-confirmable merge
 * UI on the Person detail page (slice 5+). The "split" inverse is
 * deferred to v2 — needs richer per-mention attribution than we keep
 * today.
 *
 * Authorization: both source and target must belong to the caller.
 * Same-person merges (id === targetPersonId) return 400.
 *
 * Idempotent: re-running with the same arguments after success
 * returns 404 because the source is already gone. The UI handles
 * that gracefully (refresh shows the merged person).
 */

import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";
import { safeLog } from "@/lib/safe-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Body {
  targetPersonId?: unknown;
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

export async function POST(
  req: NextRequest,
  ctx: { params: { id: string } }
) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const targetId =
    typeof body.targetPersonId === "string" ? body.targetPersonId : "";
  if (!targetId) {
    return NextResponse.json({ ok: false, error: "InvalidBody" }, { status: 400 });
  }
  const sourceId = ctx.params.id;
  if (sourceId === targetId) {
    return NextResponse.json(
      { ok: false, error: "SamePerson" },
      { status: 400 }
    );
  }

  const { prisma } = await import("@/lib/prisma");

  // Ownership check on both. We do a single findMany with both ids
  // and require length === 2 — cheaper than two findFirst round-trips.
  const both = await prisma.person.findMany({
    where: { userId, id: { in: [sourceId, targetId] } },
    select: { id: true, aliases: true, mentionCount: true, displayName: true },
  });
  if (both.length !== 2) {
    return NextResponse.json(
      { ok: false, error: "NotFound" },
      { status: 404 }
    );
  }
  const source = both.find((p) => p.id === sourceId);
  const target = both.find((p) => p.id === targetId);
  if (!source || !target) {
    return NextResponse.json(
      { ok: false, error: "NotFound" },
      { status: 404 }
    );
  }

  // Dedupe aliases by normalized form; preserve target's existing
  // alias case ordering and append new strings from the source that
  // don't normalize-collide. The source's displayName is also added
  // as an alias — it's a former canonical that may show up in future
  // mentions.
  const seen = new Set(target.aliases.map(normalize));
  const mergedAliases = [...target.aliases];
  for (const a of source.aliases) {
    if (!seen.has(normalize(a))) {
      mergedAliases.push(a);
      seen.add(normalize(a));
    }
  }
  if (!seen.has(normalize(source.displayName))) {
    mergedAliases.push(source.displayName);
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.entityMention.updateMany({
        where: { personId: sourceId },
        data: { personId: targetId },
      });
      await tx.person.update({
        where: { id: targetId },
        data: {
          aliases: mergedAliases,
          mentionCount: { increment: source.mentionCount },
        },
      });
      await tx.person.delete({ where: { id: sourceId } });
    });
  } catch (err) {
    safeLog.error("people.merge.failed", {
      userId,
      sourceId,
      targetId,
      err: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json({ ok: false, error: "MergeFailed" }, { status: 500 });
  }

  safeLog.info("people.merge.done", { userId, sourceId, targetId });
  return NextResponse.json({ ok: true, mergedInto: targetId });
}
