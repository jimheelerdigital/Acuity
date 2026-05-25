/**
 * PATCH /api/people/[id]
 *
 * Body: { displayName: string }
 *
 * Renames a Person's displayName. Slice 5 v1.2 Anchor People. Surfaces
 * in the inline editor on the Person detail page. We deliberately do
 * NOT touch canonicalName — that's the resolver's matching key and
 * changing it would orphan past mention resolution. Renames are
 * cosmetic; resolution stays bound to the original.
 *
 * Validation: 1-80 chars, trim, no other normalization.
 *
 * Authorization: caller must own the Person.
 */

import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Body {
  displayName?: unknown;
}

const MAX_LEN = 80;

export async function PATCH(
  req: NextRequest,
  ctx: { params: { id: string } }
) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const next = typeof body.displayName === "string" ? body.displayName.trim() : "";
  if (next.length === 0 || next.length > MAX_LEN) {
    return NextResponse.json({ ok: false, error: "InvalidName" }, { status: 400 });
  }

  const { prisma } = await import("@/lib/prisma");
  const person = await prisma.person.findFirst({
    where: { id: ctx.params.id, userId },
    select: { id: true },
  });
  if (!person) {
    return NextResponse.json({ ok: false, error: "NotFound" }, { status: 404 });
  }

  await prisma.person.update({
    where: { id: person.id },
    data: { displayName: next },
  });

  return NextResponse.json({ ok: true, displayName: next });
}
