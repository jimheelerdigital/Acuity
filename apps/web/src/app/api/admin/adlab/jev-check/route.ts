/**
 * POST /api/admin/adlab/jev-check
 *
 * Health + sanity check for the ads builder's Jev judge (2026-09-30): judges
 * one of our real winners and one of our moody losers and returns both
 * verdicts. A working setup should rank the winner higher.
 *
 * Auth: admin session OR `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const bearer = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!(cronSecret && bearer === `Bearer ${cronSecret}`)) {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;
  }
  const { adsJevEnabled } = await import("@/lib/adlab/jev");
  const { judgeDraft } = await import("@/lib/adlab/jev-judge");
  const ctx = {
    lane: "check",
    audience: "women roughly 40–50 carrying a heavy mental load",
    winners: [{ headline: "Two years of noticing. Zero record of it.", primaryText: "You talk. Ripple keeps the record and shows what keeps coming up.", result: "3 paid trials" }],
    losers: [{ headline: "Carrying it all quietly. Still.", primaryText: "Some weeks feel heavier than others.", result: "0 trials on $40" }],
    liveHeadlines: ["Two years of noticing. Zero record of it."],
  };
  const good = await judgeDraft(ctx, {
    format: "say-catch",
    headline: "The dentist is Tuesday. Only I know.",
    primaryText: "Say it out loud once. Ripple turns it into your to-do list with the dates, and shows what keeps coming up.",
    onScreen: ["Book dentist — Tue 3pm", "Sign Emma's field trip form — Fri"],
  });
  const weak = await judgeDraft(ctx, {
    format: "statement-card",
    headline: "Overwhelmed? Find your calm.",
    primaryText: "Life is a lot. Ripple helps you feel better.",
    onScreen: [],
  });
  return NextResponse.json({ enabled: adsJevEnabled(), good, weak });
}
