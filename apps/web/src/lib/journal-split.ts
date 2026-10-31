/**
 * /start-journal vs /start-test (2026-10-31, per Keenan: build the "journals
 * and planners have failed you" funnel and split-test it against the current
 * one). The Planners ads point at /start-journal.
 *
 *   - flag `funnel_journal_split` OFF → everyone sees the journal funnel
 *     (that's how it's previewed before launch).
 *   - flag ON, fresh landing (no ?step=) → the saved arm from the
 *     acuity_jsplit cookie, else a coin flip. "control" 307s to /start-test
 *     with every query param kept plus ?jsplit=control; FunnelV9 there sets
 *     the cookie and logs funnel_split_arm=journal-control. "journal" renders
 *     here with an inline script that sets the cookie; FunnelV9 logs
 *     funnel_split_arm=journal-journal.
 *
 * Compare in admin by flowVersion (v9-journal vs v9-test), limited to
 * sessions that logged a journal-* funnel_split_arm. The flag is read with a
 * 30-second memo so switching it off takes effect within a minute.
 */
import { prisma } from "@/lib/prisma";
import { JOURNAL_SPLIT_FLAG, JSPLIT_PARAM, parseJournalArm, type JournalArm } from "@/lib/journal-split-shared";

export * from "@/lib/journal-split-shared";

const TTL_MS = 30_000;
let memo: { at: number; on: boolean } | null = null;

export async function isJournalSplitOn(): Promise<boolean> {
  if (process.env.NODE_ENV !== "production" && process.env.JOURNAL_SPLIT_FORCE) {
    return process.env.JOURNAL_SPLIT_FORCE === "on";
  }
  if (memo && Date.now() - memo.at < TTL_MS) return memo.on;
  let on = false;
  try {
    const row = await prisma.featureFlag.findUnique({
      where: { key: JOURNAL_SPLIT_FLAG },
      select: { enabled: true, rolloutPercentage: true },
    });
    on = !!row?.enabled && row.rolloutPercentage > 0;
  } catch {
    on = false;
  }
  memo = { at: Date.now(), on };
  return on;
}

export function pickJournalArm(cookieValue: string | undefined): JournalArm {
  return parseJournalArm(cookieValue) ?? (Math.random() < 0.5 ? "journal" : "control");
}

/** /start-test URL carrying every incoming query param plus ?jsplit=control. */
export function journalControlUrl(searchParams: Record<string, string | string[] | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (k === JSPLIT_PARAM) continue;
    if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
    else if (typeof v === "string") qs.set(k, v);
  }
  qs.set(JSPLIT_PARAM, "control");
  return `/start-test?${qs.toString()}`;
}
