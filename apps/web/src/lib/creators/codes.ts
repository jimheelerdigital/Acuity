import "server-only";

/**
 * Referral codes (2026-10-22). Every code a creator has ever had lives in
 * CreatorCode; the current one is mirrored on UgcCreator.referralCode.
 * Creators can pick a custom code from their dashboard; old codes keep
 * resolving to them (published posts never break) and stay reserved.
 *
 * No duplicates: CreatorCode.code and CreatorCode.codeKey (look-alike-proof)
 * are both unique in the database, so even two simultaneous requests for the
 * same code can't both win.
 */

import { prisma } from "@/lib/prisma";

import { CODE_LENGTH } from "./config";
import { codeKey, customCodeProblem, generateCreatorCode, normalizeCode } from "./money";

/** Max codes a creator can ever hold (current + retired). */
export const MAX_CODES_PER_CREATOR = 5;

export type CodeOwner = {
  id: string;
  referralCode: string;
  firstName: string | null;
  displayName: string | null;
  handle: string;
};

/** Resolve any current or retired code (any case, look-alikes forgiven). */
export async function resolveCode(raw: string | null | undefined): Promise<CodeOwner | null> {
  const code = normalizeCode(raw);
  if (!code) return null;
  const row = await prisma.creatorCode.findUnique({
    where: { codeKey: codeKey(code) },
    select: {
      creator: { select: { id: true, referralCode: true, firstName: true, displayName: true, handle: true } },
    },
  });
  // Fallback: a code issued before CreatorCode existed (or by an older deploy).
  const c =
    row?.creator ??
    (await prisma.ugcCreator.findUnique({
      where: { referralCode: code },
      select: { id: true, referralCode: true, firstName: true, displayName: true, handle: true },
    }));
  if (!c?.referralCode) return null;
  return { ...c, referralCode: c.referralCode };
}

export async function isCodeTaken(code: string): Promise<boolean> {
  const [n, legacy] = await Promise.all([
    prisma.creatorCode.count({ where: { OR: [{ code }, { codeKey: codeKey(code) }] } }),
    prisma.ugcCreator.count({ where: { referralCode: code } }),
  ]);
  return n + legacy > 0;
}

function isUnique(err: unknown) {
  return (err as { code?: string } | null)?.code === "P2002";
}

/** A fresh random 6-character code, recorded in CreatorCode. */
export async function assignGeneratedCode(creatorId: string): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateCreatorCode();
    if (code.length !== CODE_LENGTH) continue;
    try {
      await prisma.$transaction([
        prisma.creatorCode.create({ data: { code, codeKey: codeKey(code), creatorId, createdBy: "system" } }),
        prisma.ugcCreator.update({ where: { id: creatorId }, data: { referralCode: code } }),
      ]);
      return code;
    } catch (err) {
      if (!isUnique(err)) throw err;
    }
  }
  throw new Error("could not generate a unique referral code");
}

export type SetCodeResult = { ok: true; code: string } | { ok: false; message: string };

/**
 * Switch a creator to a custom code. The previous code is retired (still
 * works, still theirs). Switching back to one of their own retired codes
 * reactivates it.
 */
export async function setCustomCode(creatorId: string, raw: string, by: string): Promise<SetCodeResult> {
  const problem = customCodeProblem(raw);
  if (problem) return { ok: false, message: problem };
  const code = normalizeCode(raw)!;
  const key = codeKey(code);
  // Make sure the code being replaced is recorded, so it keeps working.
  await backfillCodes();

  const [creator, existing, count] = await Promise.all([
    prisma.ugcCreator.findUniqueOrThrow({ where: { id: creatorId }, select: { referralCode: true } }),
    prisma.creatorCode.findUnique({ where: { codeKey: key }, select: { id: true, code: true, creatorId: true } }),
    prisma.creatorCode.count({ where: { creatorId } }),
  ]);
  if (creator.referralCode === code) return { ok: true, code };
  if (existing && existing.creatorId !== creatorId) {
    return { ok: false, message: "That code is taken. Try another." };
  }
  const now = new Date();
  try {
    if (existing) {
      // One of their own old codes (maybe typed with a look-alike): reactivate it.
      await prisma.$transaction([
        prisma.creatorCode.updateMany({ where: { creatorId, retiredAt: null }, data: { retiredAt: now } }),
        prisma.creatorCode.update({ where: { id: existing.id }, data: { retiredAt: null } }),
        prisma.ugcCreator.update({ where: { id: creatorId }, data: { referralCode: existing.code } }),
      ]);
      return { ok: true, code: existing.code };
    }
    if (count >= MAX_CODES_PER_CREATOR && !by.startsWith("admin")) {
      return { ok: false, message: `You've used all ${MAX_CODES_PER_CREATOR} code changes. Reply to any of our emails if you need another.` };
    }
    await prisma.$transaction([
      prisma.creatorCode.updateMany({ where: { creatorId, retiredAt: null }, data: { retiredAt: now } }),
      prisma.creatorCode.create({ data: { code, codeKey: key, creatorId, createdBy: by } }),
      prisma.ugcCreator.update({ where: { id: creatorId }, data: { referralCode: code } }),
    ]);
    return { ok: true, code };
  } catch (err) {
    if (isUnique(err)) return { ok: false, message: "That code is taken. Try another." };
    throw err;
  }
}

/** Codes created before CreatorCode existed: make sure each is recorded. */
export async function backfillCodes(): Promise<number> {
  const creators = await prisma.ugcCreator.findMany({
    where: { referralCode: { not: null }, codes: { none: {} } },
    select: { id: true, referralCode: true },
  });
  for (const c of creators) {
    await prisma.creatorCode.create({
      data: { code: c.referralCode!, codeKey: codeKey(c.referralCode!), creatorId: c.id, createdBy: "system" },
    });
  }
  return creators.length;
}
