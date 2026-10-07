/**
 * Everything Keenan (or a job) does to a UGC creator after scoring: draft,
 * approve / edit / skip, mark sent by hand, status moves, deal → brief,
 * delivery and money tracking, and the daily send. Called from
 * /api/admin/ugc/action and the ugc-ops Inngest functions.
 *
 * Money: the system never pays anyone. It records what's owed and what
 * Keenan says he paid.
 */
import type { Prisma, UgcStatus } from "@prisma/client";

import {
  BUNDLE_SIZE,
  FOLLOWUP_AFTER_DAYS,
  HOOKS_PER_VIDEO,
  MAX_FEE_PER_VIDEO,
  MAX_SENDS_PER_DAY,
  OUTREACH_FROM_EMAIL,
  OUTREACH_SEND_ENABLED,
  RIGHTS_EXTENSION_FEE,
  USAGE_RIGHTS_MONTHS,
  WINNER_BONUS_PER_VIDEO,
} from "@/lib/ugc/config";
import { rowToCandidate } from "@/lib/ugc/pipeline";
import { isDoNotContact, setStatus } from "@/lib/ugc/status";

async function db() {
  return (await import("@/lib/prisma")).prisma;
}

// ─── Drafts ────────────────────────────────────────────────────────────────

/** Write + claims-check the offer drafts, then queue for review. Returns model cost. */
export async function draftCreator(creatorId: string, by: string): Promise<number> {
  const prisma = await db();
  const { draftForCandidate } = await import("@/lib/ugc/draft");
  const row = await prisma.ugcCreator.findUniqueOrThrow({ where: { id: creatorId } });
  const c = rowToCandidate(row);
  const { costUsd } = await draftForCandidate(c);
  await setStatus(creatorId, "queued", by, `claims: ${c.claimsStatus}`, {
    emailSubject: c.emailSubject,
    emailDraft: c.emailDraft,
    dmDraft: c.dmDraft,
    claimsStatus: c.claimsStatus,
    claimsNotes: c.claimsNotes ?? null,
  });
  return costUsd;
}

export async function editDraft(creatorId: string, subject: string, email: string, dm: string) {
  const prisma = await db();
  const { recheckDraft } = await import("@/lib/ugc/draft");
  const row = await prisma.ugcCreator.findUniqueOrThrow({ where: { id: creatorId } });
  const check = await recheckDraft(rowToCandidate(row), subject, email, dm);
  await prisma.ugcCreator.update({
    where: { id: creatorId },
    data: { emailSubject: subject, emailDraft: email, dmDraft: dm, claimsStatus: check.status, claimsNotes: check.notes },
  });
  return check;
}

export async function recheckClaims(creatorId: string) {
  const prisma = await db();
  const row = await prisma.ugcCreator.findUniqueOrThrow({ where: { id: creatorId } });
  return editDraft(creatorId, row.emailSubject ?? "", row.emailDraft ?? "", row.dmDraft ?? "");
}

// ─── Review ────────────────────────────────────────────────────────────────

export async function approve(creatorId: string) {
  const prisma = await db();
  const row = await prisma.ugcCreator.findUniqueOrThrow({ where: { id: creatorId } });
  if (row.claimsStatus !== "passed") {
    throw new Error(`Can't approve: claims check is "${row.claimsStatus ?? "missing"}". Edit the draft or re-check first.`);
  }
  if (row.status !== "queued") throw new Error(`Can't approve from status "${row.status}"`);
  await setStatus(creatorId, "approved", "keenan", OUTREACH_SEND_ENABLED ? "approved" : "approved → ready to send (sending off)");
}

export async function skip(creatorId: string, note?: string) {
  await setStatus(creatorId, "skipped", "keenan", note);
}

/** Keenan sent it himself (email or DM). Logs the outreach + moves to contacted. */
export async function markSent(creatorId: string, kind: "offer" | "followup" | "brief", channel: "email" | "dm") {
  const prisma = await db();
  const row = await prisma.ugcCreator.findUniqueOrThrow({ where: { id: creatorId } });
  const brief = kind === "brief" ? await latestBrief(creatorId) : null;
  const body =
    kind === "brief" ? brief?.body ?? "" : kind === "followup" ? (await import("@/lib/ugc/draft")).followUpBody(null) : channel === "dm" ? row.dmDraft ?? "" : row.emailDraft ?? "";
  await prisma.ugcOutreach.create({
    data: { creatorId, kind, channel: `manual-${channel}`, toEmail: row.email, subject: row.emailSubject, body },
  });
  if (kind === "offer") await setStatus(creatorId, "contacted", "keenan", `sent by hand (${channel})`);
  if (kind === "brief" && brief) {
    await prisma.ugcBrief.update({ where: { id: brief.id }, data: { sentAt: new Date() } });
    await setStatus(creatorId, "briefed", "keenan", "brief sent by hand");
  }
}

export async function moveStatus(creatorId: string, to: UgcStatus, note?: string) {
  await setStatus(creatorId, to, "keenan", note);
}

// ─── Deal + brief ──────────────────────────────────────────────────────────

/** Mark a deal at an agreed per-video fee; the brief job starts from here. */
export async function markDeal(creatorId: string, feePerVideo: number) {
  if (!(feePerVideo > 0)) throw new Error("Agreed fee per video is required");
  await setStatus(creatorId, "deal", "keenan", `$${feePerVideo}/video${feePerVideo > MAX_FEE_PER_VIDEO ? " (over cap)" : ""}`, {
    agreedFeeCents: Math.round(feePerVideo * 100),
  });
  const { inngest } = await import("@/inngest/client");
  await inngest.send({ name: "ugc/brief.requested", data: { creatorId } });
}

export async function latestBrief(creatorId: string) {
  const prisma = await db();
  return prisma.ugcBrief.findFirst({ where: { creatorId }, orderBy: { createdAt: "desc" } });
}

/** Generate, compose and claims-check a brief. Returns model cost. */
export async function generateBrief(creatorId: string): Promise<number> {
  const prisma = await db();
  const { checkBrief, composeBrief, generateBriefVideos } = await import("@/lib/ugc/brief");
  const row = await prisma.ugcCreator.findUniqueOrThrow({ where: { id: creatorId } });
  const bc = {
    handle: row.handle,
    displayName: row.displayName,
    persona: (row.persona as "midlife" | "ambitious" | null) ?? null,
    creatorType: row.creatorType,
    feePerVideoCents: row.agreedFeeCents ?? MAX_FEE_PER_VIDEO * 100,
    credentials: row.credentials,
  };
  const { videos, costUsd } = await generateBriefVideos(bc);
  const body = composeBrief(bc, videos);
  const check = await checkBrief(bc, body);
  await prisma.ugcBrief.create({
    data: {
      creatorId,
      body,
      videos: videos as unknown as Prisma.InputJsonValue,
      claimsStatus: check.status,
      claimsNotes: check.issues.join("; ") || null,
    },
  });
  return costUsd;
}

export async function editBrief(briefId: string, body: string) {
  const prisma = await db();
  const { checkBrief } = await import("@/lib/ugc/brief");
  const b = await prisma.ugcBrief.findUniqueOrThrow({ where: { id: briefId }, include: { creator: true } });
  const check = await checkBrief(
    {
      handle: b.creator.handle,
      displayName: b.creator.displayName,
      persona: (b.creator.persona as "midlife" | "ambitious" | null) ?? null,
      creatorType: b.creator.creatorType,
      feePerVideoCents: b.creator.agreedFeeCents ?? MAX_FEE_PER_VIDEO * 100,
      credentials: b.creator.credentials,
    },
    body
  );
  await prisma.ugcBrief.update({
    where: { id: briefId },
    data: { body, claimsStatus: check.status, claimsNotes: check.issues.join("; ") || null },
  });
  return check;
}

/** Approve a brief: creates the delivery rows (video × hook) for tracking. */
export async function approveBrief(briefId: string) {
  const prisma = await db();
  const b = await prisma.ugcBrief.findUniqueOrThrow({ where: { id: briefId }, include: { creator: true } });
  if (b.claimsStatus !== "passed") throw new Error(`Can't approve: brief claims check is "${b.claimsStatus}"`);
  await prisma.ugcBrief.update({ where: { id: briefId }, data: { approvedAt: new Date() } });
  const videos = (b.videos as unknown as { n: number; painBranch: string }[]) ?? [];
  for (let n = 1; n <= BUNDLE_SIZE; n++) {
    const v = videos.find((x) => x.n === n);
    for (let h = 0; h < HOOKS_PER_VIDEO; h++) {
      const hookVersion = String.fromCharCode(65 + h);
      await prisma.ugcVideo.upsert({
        where: { creatorId_videoNumber_hookVersion: { creatorId: b.creatorId, videoNumber: n, hookVersion } },
        create: {
          creatorId: b.creatorId,
          videoNumber: n,
          hookVersion,
          persona: b.creator.persona,
          creatorType: b.creator.creatorType,
          painBranch: v?.painBranch ?? null,
        },
        update: { painBranch: v?.painBranch ?? null },
      });
    }
  }
}

// ─── Delivery + money ──────────────────────────────────────────────────────

export function addMonths(d: Date, months: number): Date {
  const out = new Date(d);
  out.setUTCMonth(out.getUTCMonth() + months);
  return out;
}

export async function markDelivered(creatorId: string) {
  const prisma = await db();
  const now = new Date();
  await prisma.ugcVideo.updateMany({
    where: { creatorId, deliveredAt: null },
    data: { deliveredAt: now, rightsEndAt: addMonths(now, USAGE_RIGHTS_MONTHS) },
  });
  await setStatus(creatorId, "delivered", "keenan");
}

/** Keenan paid the fee (outside this system). Split evenly across the cuts. */
export async function markPaid(creatorId: string, amount: number) {
  const prisma = await db();
  const cents = Math.round(amount * 100);
  const cuts = await prisma.ugcVideo.findMany({ where: { creatorId } });
  const per = cuts.length ? Math.round(cents / cuts.length) : 0;
  await prisma.ugcVideo.updateMany({ where: { creatorId }, data: { feePaidCents: per } });
  await setStatus(creatorId, "paid", "keenan", `$${amount} recorded as paid`, { feePaidCents: cents });
}

/** Winner flag. The bonus is owed once per video, whichever hook won. */
export async function setWinner(videoId: string, winner: boolean) {
  const prisma = await db();
  const v = await prisma.ugcVideo.findUniqueOrThrow({ where: { id: videoId } });
  const siblings = await prisma.ugcVideo.findMany({
    where: { creatorId: v.creatorId, videoNumber: v.videoNumber, id: { not: v.id } },
  });
  const siblingOwes = siblings.some((s) => s.bonusOwedCents > 0);
  await prisma.ugcVideo.update({
    where: { id: videoId },
    data: {
      winner,
      bonusOwedCents: winner && !siblingOwes ? WINNER_BONUS_PER_VIDEO * 100 : winner ? 0 : v.bonusPaidCents > 0 ? v.bonusOwedCents : 0,
    },
  });
}

/** Extend usage rights by another block. Winners only. */
export async function extendRights(videoId: string) {
  const prisma = await db();
  const v = await prisma.ugcVideo.findUniqueOrThrow({ where: { id: videoId } });
  if (!v.winner) throw new Error("Only winners get a rights extension");
  await prisma.ugcVideo.update({
    where: { id: videoId },
    data: {
      rightsEndAt: addMonths(v.rightsEndAt ?? new Date(), USAGE_RIGHTS_MONTHS),
      extensionOwedCents: v.extensionOwedCents + RIGHTS_EXTENSION_FEE * 100,
    },
  });
}

const VIDEO_FIELDS = ["adSpendCents", "trials", "paidConversions", "bonusPaidCents", "extensionPaidCents", "feePaidCents"] as const;

export async function updateVideoNumbers(videoId: string, patch: Partial<Record<(typeof VIDEO_FIELDS)[number], number | null>>) {
  const prisma = await db();
  const data: Record<string, number | null> = {};
  for (const k of VIDEO_FIELDS) {
    if (k in patch) {
      const val = patch[k];
      data[k] = val == null || Number.isNaN(val) ? (k.endsWith("Cents") && k !== "adSpendCents" ? 0 : null) : Math.round(val);
    }
  }
  await prisma.ugcVideo.update({ where: { id: videoId }, data });
}

// ─── Manual add ────────────────────────────────────────────────────────────

export async function manualAdd(input: { handle: string; platform?: "instagram" | "tiktok"; notes?: string; quotedRate?: number; quotedVideos?: number }) {
  const prisma = await db();
  const { parseManualHandle, quoteMath } = await import("@/lib/ugc/sources/manual");
  const { profileUrlFor } = await import("@/lib/ugc/sources/types");
  const { newTrackingCode } = await import("@/lib/ugc/status");
  const { platform, handle } = parseManualHandle(input);
  if (await isDoNotContact({ platform, handle })) throw new Error(`@${handle} is on the do-not-contact list`);
  const existing = await prisma.ugcCreator.findUnique({ where: { platform_handle: { platform, handle } } });
  if (existing) throw new Error(`@${handle} is already in the pipeline (status: ${existing.status})`);
  const quote = quoteMath(input.quotedRate, input.quotedVideos);
  const row = await prisma.ugcCreator.create({
    data: {
      platform,
      handle,
      source: "manual",
      trackingCode: newTrackingCode(),
      profileUrl: profileUrlFor(platform, handle),
      notes: input.notes?.trim() || null,
      ...quote,
    },
  });
  await prisma.ugcStatusEvent.create({ data: { creatorId: row.id, to: "found", by: "keenan", note: "manual add" } });
  const { inngest } = await import("@/inngest/client");
  await inngest.send({ name: "ugc/discover.requested", data: { kind: "manual" } });
  return row;
}

// ─── Daily send ────────────────────────────────────────────────────────────

export function startOfUtcDay(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export interface SendPlanItem {
  creatorId: string;
  kind: "brief" | "followup" | "offer";
}

/**
 * Today's send order: approved briefs, then follow-ups that are due, then
 * new offers by highest score, capped at what's left of MAX_SENDS_PER_DAY.
 */
export async function planSends(now = new Date()): Promise<{ plan: SendPlanItem[]; sentToday: number }> {
  const prisma = await db();
  const sentToday = await prisma.ugcOutreach.count({ where: { channel: "gmail", sentAt: { gte: startOfUtcDay(now) } } });
  const left = Math.max(0, MAX_SENDS_PER_DAY - sentToday);
  if (left === 0) return { plan: [], sentToday };

  const briefs = await prisma.ugcBrief.findMany({
    where: { approvedAt: { not: null }, sentAt: null, creator: { email: { not: null } } },
    orderBy: { approvedAt: "asc" },
    select: { creatorId: true },
  });
  const dueBefore = new Date(now.getTime() - FOLLOWUP_AFTER_DAYS * 86_400_000);
  const contacted = await prisma.ugcCreator.findMany({
    where: { status: "contacted", repliedAt: null },
    include: { outreach: true },
  });
  const followups = contacted
    .filter((c) => {
      const offers = c.outreach.filter((o) => o.kind === "offer" && o.channel === "gmail");
      const already = c.outreach.some((o) => o.kind === "followup");
      return offers.length > 0 && !already && offers.every((o) => o.sentAt <= dueBefore && !o.repliedAt);
    })
    .map((c) => c.id);
  const offers = await prisma.ugcCreator.findMany({
    where: { status: "approved", claimsStatus: "passed", email: { not: null } },
    orderBy: { score: "desc" },
  });
  const fresh: string[] = [];
  for (const o of offers) {
    // "contacted" DNC entries come from this creator's own past sends; any
    // DNC hit on an approved creator means skip.
    if (await isDoNotContact(o)) continue;
    fresh.push(o.id);
  }
  const plan: SendPlanItem[] = [
    ...briefs.map((b) => ({ creatorId: b.creatorId, kind: "brief" as const })),
    ...followups.map((id) => ({ creatorId: id, kind: "followup" as const })),
    ...fresh.map((id) => ({ creatorId: id, kind: "offer" as const })),
  ].slice(0, left);
  return { plan, sentToday };
}

/** Send one planned item. Refuses unless sending is on and the mailbox is set. */
export async function sendOne(item: SendPlanItem): Promise<void> {
  if (!OUTREACH_SEND_ENABLED) throw new Error("OUTREACH_SEND_ENABLED is false — refusing to send");
  if (!OUTREACH_FROM_EMAIL) throw new Error("OUTREACH_FROM_EMAIL is empty — refusing to send");
  const prisma = await db();
  const sentToday = await prisma.ugcOutreach.count({ where: { channel: "gmail", sentAt: { gte: startOfUtcDay() } } });
  if (sentToday >= MAX_SENDS_PER_DAY) throw new Error(`Daily limit reached (${MAX_SENDS_PER_DAY}) — refusing to send`);

  const { sendGmail } = await import("@/lib/ugc/gmail");
  const { followUpBody, firstName } = await import("@/lib/ugc/draft");
  const c = await prisma.ugcCreator.findUniqueOrThrow({ where: { id: item.creatorId }, include: { outreach: { orderBy: { sentAt: "asc" } } } });
  if (!c.email) throw new Error(`@${c.handle} has no email`);
  const first = c.outreach.find((o) => o.channel === "gmail" && o.gmailThreadId);

  let subject = c.emailSubject ?? "Ripple: paid UGC videos";
  let body: string;
  if (item.kind === "offer") {
    if (c.status !== "approved" || c.claimsStatus !== "passed") throw new Error(`@${c.handle} isn't approved with a passed draft`);
    if (await isDoNotContact(c)) throw new Error(`@${c.handle} is on the do-not-contact list`);
    body = c.emailDraft ?? "";
  } else if (item.kind === "followup") {
    if (c.status !== "contacted" || c.repliedAt) throw new Error(`@${c.handle} isn't waiting on a reply`);
    if (c.outreach.some((o) => o.kind === "followup")) throw new Error(`@${c.handle} already had a follow-up`);
    subject = `Re: ${subject}`;
    body = followUpBody(firstName(rowToCandidate(c)));
  } else {
    const brief = await latestBrief(c.id);
    if (!brief?.approvedAt || brief.sentAt) throw new Error(`@${c.handle} has no approved, unsent brief`);
    subject = `Re: ${subject}`;
    body = brief.body;
  }
  if (!body.trim()) throw new Error(`@${c.handle}: empty ${item.kind} body`);

  const sent = await sendGmail({
    to: c.email,
    subject,
    body,
    threadId: item.kind === "offer" ? null : first?.gmailThreadId ?? null,
    inReplyTo: item.kind === "offer" ? null : first?.gmailMessageId ?? null,
  });
  await prisma.ugcOutreach.create({
    data: {
      creatorId: c.id,
      kind: item.kind,
      channel: "gmail",
      toEmail: c.email,
      subject,
      body,
      // Message-ID header (for In-Reply-To on the follow-up).
      gmailMessageId: sent.messageIdHeader,
      gmailThreadId: sent.threadId,
    },
  });
  if (item.kind === "offer") await setStatus(c.id, "contacted", "ugc-send", "offer emailed");
  if (item.kind === "brief") {
    const brief = await latestBrief(c.id);
    if (brief) await prisma.ugcBrief.update({ where: { id: brief.id }, data: { sentAt: new Date() } });
    await setStatus(c.id, "briefed", "ugc-send", "brief emailed");
  }
}

/** Mark replies on emailed threads (status → replied). Never auto-replies. */
export async function checkReplies(): Promise<number> {
  const prisma = await db();
  const { threadReplyAt } = await import("@/lib/ugc/gmail");
  const open = await prisma.ugcOutreach.findMany({
    where: { channel: "gmail", kind: "offer", repliedAt: null, gmailThreadId: { not: null } },
    include: { creator: true },
  });
  let n = 0;
  for (const o of open) {
    const at = await threadReplyAt(o.gmailThreadId!);
    if (!at) continue;
    await prisma.ugcOutreach.update({ where: { id: o.id }, data: { repliedAt: at } });
    if (o.creator.status === "contacted") await setStatus(o.creatorId, "replied", "ugc-send", "reply in Gmail");
    n++;
  }
  return n;
}
