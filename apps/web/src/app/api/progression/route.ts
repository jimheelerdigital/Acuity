/**
 * POST /api/progression
 *
 * Body: { action: "complete"; key: string } | { action: "dismiss" }
 *
 * Mutates UserOnboarding.progressionChecklist to mark an item
 * completed or to dismiss the whole card. Auth-gated via
 * getAnySessionUserId so both web + mobile can call it.
 */

import { NextRequest, NextResponse } from "next/server";

import {
  type ProgressionItemKey,
  type ProgressionState,
} from "@acuity/shared";

import { getAnySessionUserId } from "@/lib/mobile-auth";
import { enforceUserRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_KEYS = new Set<ProgressionItemKey>([
  "day1",
  "day2",
  "day3",
  "day5",
  "day7",
  "day10",
  "day14",
]);

export async function POST(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await enforceUserRateLimit("userWrite", userId);
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as {
    action?: unknown;
    key?: unknown;
  } | null;

  if (!body || typeof body.action !== "string") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { prisma } = await import("@/lib/prisma");

  // Read the current state so we can merge rather than overwrite. If
  // UserOnboarding doesn't exist yet, create an empty shell — the
  // user is new enough that they're seeing this card.
  const onboarding = await prisma.userOnboarding.findUnique({
    where: { userId },
    select: { progressionChecklist: true },
  });
  const current =
    (onboarding?.progressionChecklist as ProgressionState | null) ?? {
      dismissedAt: null,
      items: {},
    };

  const next: ProgressionState = {
    dismissedAt: current.dismissedAt,
    items: { ...(current.items ?? {}) },
  };

  if (body.action === "complete") {
    const key = body.key;
    if (typeof key !== "string" || !VALID_KEYS.has(key as ProgressionItemKey)) {
      return NextResponse.json(
        { error: "Invalid item key" },
        { status: 400 }
      );
    }
    next.items[key as ProgressionItemKey] = new Date().toISOString();
  } else if (body.action === "dismiss") {
    next.dismissedAt = new Date().toISOString();
  } else {
    return NextResponse.json(
      { error: "Unknown action" },
      { status: 400 }
    );
  }

  await prisma.userOnboarding.upsert({
    where: { userId },
    create: {
      userId,
      progressionChecklist: next as unknown as object,
    },
    update: {
      progressionChecklist: next as unknown as object,
    },
  });

  return NextResponse.json({ ok: true });
}
