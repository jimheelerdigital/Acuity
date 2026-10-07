/**
 * Creator status changes (every one logged with a timestamp in
 * UgcStatusEvent), the do-not-contact list, and tracking codes.
 *
 * Status path: found → scored → queued → approved → contacted → replied →
 * negotiating → deal → briefed → delivered → paid. Off-ramps: rejected,
 * skipped, do_not_contact. Skips, opt-outs and anyone ever contacted go on
 * the do-not-contact list and are never contacted again.
 */
import { randomBytes } from "crypto";

import type { UgcStatus } from "@prisma/client";

export const STATUS_ORDER: UgcStatus[] = [
  "found",
  "scored",
  "queued",
  "approved",
  "contacted",
  "replied",
  "negotiating",
  "deal",
  "briefed",
  "delivered",
  "paid",
];
export const OFF_RAMPS: UgcStatus[] = ["rejected", "skipped", "do_not_contact"];
export const ALL_STATUSES: UgcStatus[] = [...STATUS_ORDER, ...OFF_RAMPS];

/** At or past this status counts as "offer sent" / "replied" / "deal" in the stats. */
export function reached(status: UgcStatus, milestone: UgcStatus): boolean {
  const i = STATUS_ORDER.indexOf(status);
  return i >= 0 && i >= STATUS_ORDER.indexOf(milestone);
}

/** Short, unambiguous, URL-safe (no 0/o/1/l). */
export function newTrackingCode(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(7);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export function dncKeys(c: { platform: string; handle: string; email?: string | null }): string[] {
  return [`${c.platform}:${c.handle.toLowerCase()}`, ...(c.email ? [`email:${c.email.toLowerCase()}`] : [])];
}

export async function addDoNotContact(
  c: { platform: string; handle: string; email?: string | null },
  reason: string
): Promise<void> {
  const { prisma } = await import("@/lib/prisma");
  for (const key of dncKeys(c)) {
    await prisma.ugcDoNotContact.upsert({ where: { key }, create: { key, reason }, update: {} });
  }
}

export async function isDoNotContact(c: { platform: string; handle: string; email?: string | null }): Promise<boolean> {
  const { prisma } = await import("@/lib/prisma");
  const hit = await prisma.ugcDoNotContact.findFirst({ where: { key: { in: dncKeys(c) } } });
  return !!hit;
}

/** Statuses that put a creator on the do-not-contact list. */
const DNC_ON: Partial<Record<UgcStatus, string>> = {
  skipped: "skipped",
  do_not_contact: "opted out",
  rejected: "rejected",
};

export async function setStatus(
  creatorId: string,
  to: UgcStatus,
  by: string,
  note?: string,
  extra: Record<string, unknown> = {}
): Promise<void> {
  const { prisma } = await import("@/lib/prisma");
  const c = await prisma.ugcCreator.findUniqueOrThrow({ where: { id: creatorId } });
  if (c.status === to && Object.keys(extra).length === 0) return;
  const stamp: Record<string, Date> = {};
  const now = new Date();
  if (to === "queued") stamp.queuedAt = now;
  if (to === "approved") stamp.approvedAt = now;
  if (to === "contacted" && !c.contactedAt) stamp.contactedAt = now;
  if (to === "replied" && !c.repliedAt) stamp.repliedAt = now;
  await prisma.$transaction([
    prisma.ugcCreator.update({ where: { id: creatorId }, data: { status: to, ...stamp, ...extra } }),
    prisma.ugcStatusEvent.create({ data: { creatorId, from: c.status, to, by, note: note ?? null } }),
  ]);
  const reason = DNC_ON[to] ?? (to === "contacted" ? "contacted" : null);
  if (reason) await addDoNotContact(c, reason);
}
