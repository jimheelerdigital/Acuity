/**
 * POST /api/admin/creators/action — every admin action on the creator
 * platform (2026-10-22). Money-moving actions are logged to AdminAuditLog.
 * Body: { action, ...params }. Returns { ok, result } or { error }.
 */
import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { logAdminAction } from "@/lib/admin-audit";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function need(v: string, what: string): string {
  if (!v) throw new Error(`${what} is required`);
  return v;
}

async function creatorIdByCode(code: string): Promise<string> {
  const { creatorByCode } = await import("@/lib/creators/attribution");
  const c = await creatorByCode(code);
  if (!c) throw new Error(`No creator with code ${code}`);
  return c.id;
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const by = guard.adminUserId;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = str(b.action);
  const audit = (name: string, metadata: Record<string, unknown>, targetUserId?: string | null) =>
    logAdminAction({ adminUserId: by, action: `creators.${name}`, targetUserId: targetUserId ?? null, metadata });

  try {
    let result: unknown = null;
    switch (action) {
      case "add-creator": {
        const { addCreatorDirect } = await import("@/lib/creators/admin");
        const added = await addCreatorDirect({
          handle: need(str(b.handle), "handle"),
          email: need(str(b.email), "email"),
          firstName: need(str(b.firstName), "firstName"),
          platform: str(b.platform) ?? undefined,
          code: str(b.code) ?? undefined,
          sendInvite: true,
          by,
        });
        result = {
          ...added,
          message: [`Added with code ${added.code}. Dashboard invite sent.`, added.codeNote, added.proNote].filter(Boolean).join(" "),
        };
        await audit("add-creator", { handle: b.handle, email: b.email, result });
        break;
      }
      case "issue-code": {
        const { issueReferralCode } = await import("@/lib/creators/admin");
        result = await issueReferralCode(need(str(b.creatorId), "creatorId"), { force: true });
        break;
      }
      case "set-code": {
        const { setCustomCode } = await import("@/lib/creators/codes");
        const creatorId = need(str(b.creatorId), "creatorId");
        const { prisma } = await import("@/lib/prisma");
        const c = await prisma.ugcCreator.findUniqueOrThrow({ where: { id: creatorId }, select: { referralCode: true } });
        if (!c.referralCode) {
          const { issueReferralCode } = await import("@/lib/creators/admin");
          await issueReferralCode(creatorId, { force: true });
        }
        const r = await setCustomCode(creatorId, need(str(b.code), "code"), `admin:${guard.adminUserId}`);
        if (!r.ok) throw new Error(r.message);
        result = r.code;
        break;
      }
      case "invite": {
        const { onCreatorDeal } = await import("@/lib/creators/admin");
        await onCreatorDeal(need(str(b.creatorId), "creatorId"), { resend: true });
        break;
      }
      case "agreement-update-email": {
        // One email per creator per agreement version: skips anyone already
        // sent this version (audit log), so a double click can't resend.
        const { AGREEMENT_VERSION } = await import("@/lib/creators/config");
        const { sendAgreementUpdateEmail } = await import("@/lib/creators/emails");
        const done = new Set(
          (
            await prisma.adminAuditLog.findMany({
              where: { action: "creators.agreement_update_email" },
              select: { metadata: true },
            })
          )
            .map((r) => r.metadata as { creatorId?: string; version?: string } | null)
            .filter((m) => m?.version === AGREEMENT_VERSION)
            .map((m) => m!.creatorId)
        );
        const creators = await prisma.ugcCreator.findMany({
          where: { status: "deal", referralCode: { not: null }, email: { not: null }, NOT: { handle: { startsWith: "zz_" } } },
          select: { id: true, handle: true },
        });
        const sent: string[] = [];
        const failed: string[] = [];
        for (const c of creators) {
          if (done.has(c.id)) continue;
          try {
            await sendAgreementUpdateEmail(c.id);
            await audit("agreement_update_email", { creatorId: c.id, version: AGREEMENT_VERSION });
            sent.push(c.handle);
          } catch {
            failed.push(c.handle);
          }
        }
        result = { message: `Sent to ${sent.length}: ${sent.join(", ") || "none"}${failed.length ? `. Failed: ${failed.join(", ")}` : ""}` };
        break;
      }
      case "grant-premium": {
        const { grantCreatorPremium } = await import("@/lib/creators/admin");
        result = await grantCreatorPremium(need(str(b.creatorId), "creatorId"), need(str(b.email), "email"), by);
        break;
      }
      case "payout-hold": {
        const creatorId = need(str(b.creatorId), "creatorId");
        const hold = Boolean(b.hold);
        await prisma.ugcCreator.update({ where: { id: creatorId }, data: { payoutHold: hold } });
        await audit("payout_hold", { creatorId, hold });
        break;
      }
      case "adjustment": {
        const creatorId = need(str(b.creatorId), "creatorId");
        const reason = need(str(b.reason), "Reason");
        const dollars = Number(b.amountDollars);
        if (!Number.isFinite(dollars) || dollars === 0) throw new Error("Amount must be a non-zero number");
        const { addAdjustment } = await import("@/lib/creators/ledger");
        const row = await addAdjustment({ creatorId, amount: Math.round(dollars * 100), reason, by });
        await audit("adjustment", { creatorId, amountCents: row.amount, reason });
        result = row.id;
        break;
      }
      case "view-bonus": {
        const postId = need(str(b.postId), "postId");
        const views = Number(b.views);
        const { awardViewBonus } = await import("@/lib/creators/ledger");
        const row = await awardViewBonus(postId, views, by);
        await audit("view_bonus", { postId, views, amountCents: row.amount });
        result = row.id;
        break;
      }
      case "add-post": {
        const creatorId = need(str(b.creatorId), "creatorId");
        const url = need(str(b.url), "URL");
        const postedAt = str(b.postedAt) ? new Date(str(b.postedAt)) : new Date();
        if (Number.isNaN(postedAt.getTime())) throw new Error("Bad date");
        const row = await prisma.creatorPost.create({
          data: { creatorId, url, platform: str(b.platform) || "other", postedAt },
        });
        result = row.id;
        break;
      }
      case "boost": {
        const postId = need(str(b.postId), "postId");
        const { markPostBoosted } = await import("@/lib/creators/ledger");
        const r = await markPostBoosted(postId, by);
        if (!r.ok) {
          const msg = {
            not_found: "Post not found",
            already_boosted: "This post already got its boost bonus",
            monthly_cap: "Monthly boost cap reached (5 across all creators)",
          }[r.reason];
          throw new Error(msg);
        }
        await audit("boost", { postId, entryId: r.entryId });
        result = r.entryId;
        break;
      }
      case "post-update": {
        const postId = need(str(b.postId), "postId");
        const num = (v: unknown) => (v === "" || v == null ? null : Number(v));
        const spend = num(b.adSpendDollars);
        const trials = num(b.trials);
        const paid = num(b.paidConversions);
        for (const v of [spend, trials, paid]) if (v != null && !Number.isFinite(v)) throw new Error("Numbers only");
        await prisma.creatorPost.update({
          where: { id: postId },
          data: {
            adSpend: spend == null ? null : Math.round(spend * 100),
            trials: trials == null ? null : Math.round(trials),
            paidConversions: paid == null ? null : Math.round(paid),
          },
        });
        break;
      }
      case "reassign":
      case "attribute": {
        const reason = need(str(b.reason), "Reason");
        const toCreatorId = await creatorIdByCode(need(str(b.toCode), "Creator code"));
        let userId = str(b.userId);
        if (action === "attribute") {
          const email = need(str(b.email), "Email").toLowerCase();
          const u = await prisma.user.findFirst({ where: { email }, select: { id: true } });
          if (!u) throw new Error("No account with that email");
          userId = u.id;
        }
        need(userId, "userId");
        const { reassignReferral } = await import("@/lib/creators/ledger");
        await reassignReferral({ userId, toCreatorId, reason, by });
        await audit(action, { toCreatorId, reason }, userId);
        break;
      }
      case "payout-preview": {
        const { previewRun } = await import("@/lib/creators/payouts");
        const off = str(b.offCycleCreatorId);
        result = await previewRun(off ? { offCycleCreatorId: off } : {});
        break;
      }
      case "payout-approve": {
        const runKey = need(str(b.runKey), "runKey");
        const ids = Array.isArray(b.payoutIds) ? (b.payoutIds as unknown[]).map(String) : undefined;
        if (ids && ids.length === 0) throw new Error("Select at least one payout");
        const { approveRun } = await import("@/lib/creators/payouts");
        result = await approveRun(runKey, by, ids);
        await audit("payout_approve", { runKey, payoutIds: ids ?? "all", approved: result });
        break;
      }
      case "payout-execute": {
        const runKey = need(str(b.runKey), "runKey");
        const { executeRun } = await import("@/lib/creators/payouts");
        result = await executeRun(runKey);
        await audit("payout_execute", { runKey, result });
        break;
      }
      case "payout-mark-sent": {
        const payoutId = need(str(b.payoutId), "payoutId");
        const ref = need(str(b.externalRef), "Reference (PayPal transaction id or note)");
        const { markPayoutSentManually } = await import("@/lib/creators/payouts");
        await markPayoutSentManually(payoutId, ref, by);
        await audit("payout_mark_sent", { payoutId, ref });
        break;
      }
      case "payout-reset": {
        const payoutId = need(str(b.payoutId), "payoutId");
        const { resetFailedPayout } = await import("@/lib/creators/payouts");
        await resetFailedPayout(payoutId);
        await audit("payout_reset", { payoutId });
        break;
      }
      case "flag": {
        const flagId = need(str(b.flagId), "flagId");
        const reason = need(str(b.reason), "Reason");
        const status = str(b.status);
        if (!["open", "held", "resolved"].includes(status)) throw new Error("Bad status");
        await prisma.creatorFlag.update({
          where: { id: flagId },
          data: {
            status: status as "open" | "held" | "resolved",
            resolvedReason: reason,
            resolvedBy: by,
            resolvedAt: new Date(),
          },
        });
        await audit("flag", { flagId, status, reason });
        break;
      }
      default:
        return NextResponse.json({ error: `Unknown action "${action}"` }, { status: 400 });
    }
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
