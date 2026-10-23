/**
 * Every UGC outreach admin action in one POST (admin only):
 * { action, ...fields } → lib/ugc/actions.ts. Returns { ok } or { error }.
 */
import type { UgcStatus } from "@prisma/client";

import { requireAdmin } from "@/lib/admin-guard";
import * as A from "@/lib/ugc/actions";
import { ALL_STATUSES } from "@/lib/ugc/status";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Body = Record<string, unknown> & { action?: string };

const num = (v: unknown) => (v === "" || v == null ? null : Number(v));

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const b = (await req.json().catch(() => ({}))) as Body;
  const id = String(b.creatorId ?? "");
  try {
    let result: unknown = null;
    switch (b.action) {
      case "approve":
        await A.approve(id);
        break;
      case "skip":
        await A.skip(id, b.note ? String(b.note) : undefined);
        break;
      case "edit":
        result = await A.editDraft(id, String(b.subject ?? ""), String(b.email ?? ""), String(b.dm ?? ""));
        break;
      case "recheck":
        result = await A.recheckClaims(id);
        break;
      case "redraft":
        await A.draftCreator(id, "keenan");
        break;
      case "mark-sent":
        await A.markSent(id, (b.kind as "offer" | "followup" | "brief") ?? "offer", b.channel === "dm" ? "dm" : "email");
        break;
      case "status": {
        const to = String(b.to) as UgcStatus;
        if (!ALL_STATUSES.includes(to)) throw new Error(`Unknown status ${to}`);
        if (to === "deal") await A.markDeal(id); // code + invite + brief
        else await A.moveStatus(id, to, b.note ? String(b.note) : undefined);
        break;
      }
      case "deal":
        await A.markDeal(id);
        break;
      case "brief-edit":
        result = await A.editBrief(String(b.briefId), String(b.body ?? ""));
        break;
      case "brief-approve":
        await A.approveBrief(String(b.briefId));
        break;
      case "brief-regenerate":
        await A.generateBrief(id);
        break;
      case "delivered":
        await A.markDelivered(id);
        break;
      case "winner":
        await A.setWinner(String(b.videoId), Boolean(b.winner));
        break;
      case "video-numbers": {
        const toCents = (v: unknown) => (num(v) == null ? null : Math.round(Number(v) * 100));
        const patch: Record<string, number | null> = {};
        if ("adSpend" in b) patch.adSpendCents = toCents(b.adSpend);
        if ("trials" in b) patch.trials = num(b.trials);
        if ("paidConversions" in b) patch.paidConversions = num(b.paidConversions);
        await A.updateVideoNumbers(String(b.videoId), patch);
        break;
      }
      case "manual-add":
        result = await A.manualAdd({
          handle: String(b.handle ?? ""),
          platform: b.platform === "tiktok" ? "tiktok" : b.platform === "instagram" ? "instagram" : undefined,
          notes: b.notes ? String(b.notes) : undefined,
          quotedRate: num(b.quotedRate) ?? undefined,
          quotedVideos: num(b.quotedVideos) ?? undefined,
        });
        break;
      case "run": {
        const kind = b.kind === "dry-run" ? "dry-run" : b.kind === "manual" ? "manual" : "weekly";
        const { inngest } = await import("@/inngest/client");
        await inngest.send({ name: "ugc/discover.requested", data: { kind } });
        break;
      }
      case "digest": {
        const { inngest } = await import("@/inngest/client");
        await inngest.send({ name: "ugc/digest.requested", data: {} });
        break;
      }
      default:
        throw new Error(`Unknown action ${b.action}`);
    }
    return Response.json({ ok: true, result });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
