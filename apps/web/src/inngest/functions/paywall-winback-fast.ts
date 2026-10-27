/**
 * Paywall win-back #1, fast lane (2026-10-27, per Keenan: "send that
 * IMMEDIATELY upon a lost checkout... 15 mins after is the latest").
 *
 * Runs every 5 min. With the 5-min "still deciding" quiet period in
 * lib/paywall-winback.ts, #1 lands 5–10 min after her last paywall or
 * checkout view. #2 and #3 stay on the 15-min recovery orchestrator, which
 * skips #1 so the two never race on it.
 *
 * Same guards as the orchestrator: dry run, the daily send cap, and the 24h
 * per-user throttle, except for accounts under 24h old (a brand-new account
 * may already have had its welcome email). sendTrialEmail re-checks the
 * kill switch and once-per-user dedup before sending.
 */
import { inngest } from "@/inngest/client";

export const paywallWinbackFastFn = inngest.createFunction(
  {
    id: "paywall-winback-fast",
    name: "Paywall win-back #1 (5-min)",
    triggers: [{ cron: "*/5 * * * *" }],
    concurrency: { limit: 1 },
    retries: 2,
  },
  async ({ step }) => {
    return step.run("send-winback-1", async () => {
      const { prisma } = await import("@/lib/prisma");
      const { sendTrialEmail } = await import("@/lib/trial-emails");
      const { getRecoveryConfig } = await import("@/lib/recovery-config");
      const { findDueWinbacks } = await import("@/lib/paywall-winback-due");

      const config = getRecoveryConfig();
      const now = new Date();
      const due = (await findDueWinbacks(now)).filter((d) => d.key === "paywall_winback_1");
      if (!due.length) return { due: 0, sent: 0 };
      if (config.dryRun) return { due: due.length, sent: 0, dryRun: true };

      const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      let budget = Math.max(0, config.maxSendsPerDay - (await prisma.trialEmailLog.count({ where: { sentAt: { gte: todayStart } } })));

      const DAY = 24 * 3600_000;
      const recent = await prisma.trialEmailLog.findMany({
        where: { userId: { in: due.map((d) => d.userId) }, sentAt: { gte: new Date(now.getTime() - DAY) } },
        select: { userId: true },
        distinct: ["userId"],
      });
      const recentlyEmailed = new Set(recent.map((r) => r.userId));

      let sent = 0;
      let throttled = 0;
      for (const d of due) {
        if (budget <= 0) break;
        const newAccount = now.getTime() - d.createdAt.getTime() < DAY;
        if (!newAccount && recentlyEmailed.has(d.userId)) {
          throttled++;
          continue;
        }
        const r = await sendTrialEmail(d.userId, "paywall_winback_1");
        if (r.sent) {
          sent++;
          budget--;
        }
      }
      return { due: due.length, sent, throttled };
    });
  }
);
