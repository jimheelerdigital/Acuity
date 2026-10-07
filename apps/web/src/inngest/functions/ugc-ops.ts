import { inngest } from "@/inngest/client";

/**
 * UGC outreach jobs after the pipeline (2026-10-06, per Keenan):
 *   ugc-brief          on "deal": generate + claims-check the creator brief
 *   ugc-send-daily     reply check, then up to MAX_SENDS_PER_DAY Gmail sends
 *                      (no-op while OUTREACH_SEND_ENABLED is false)
 *   ugc-weekly-digest  Mondays: one email with the week's creators to review
 *
 * Weekly by request: Keenan looks at this once a week, so the digest is
 * weekly; sending stays daily only because of the 5-a-day cap.
 */

export const ugcBriefFn = inngest.createFunction(
  {
    id: "ugc-brief",
    name: "UGC — Brief for a deal",
    retries: 1,
    triggers: [{ event: "ugc/brief.requested" }],
  },
  async ({ event, step }) => {
    const { creatorId } = event.data as { creatorId: string };
    await step.run("generate-brief", async () => {
      const { generateBrief } = await import("@/lib/ugc/actions");
      try {
        return await generateBrief(creatorId);
      } catch (err) {
        // Loud: a failed brief shows in the weekly digest's problems box.
        const { prisma } = await import("@/lib/prisma");
        await prisma.ugcRun.create({
          data: {
            kind: "brief",
            status: "failed",
            stage: "brief",
            errors: [{ stage: `brief ${creatorId}`, message: err instanceof Error ? err.message : String(err), at: new Date().toISOString() }],
            finishedAt: new Date(),
          },
        });
        throw err;
      }
    });
  }
);

export const ugcSendDailyFn = inngest.createFunction(
  {
    id: "ugc-send-daily",
    name: "UGC — Daily send (Gmail, max 5)",
    retries: 0,
    concurrency: { limit: 1 },
    triggers: [
      // 15:00 UTC = 10am Central.
      { cron: "0 15 * * *" },
      { event: "ugc/send.requested" },
    ],
  },
  async ({ step }) => {
    const ready = await step.run("mailbox", async () => {
      const { mailboxStatus } = await import("@/lib/ugc/gmail");
      return (await mailboxStatus()).connected;
    });
    if (ready) {
      await step.run("check-replies", async () => {
        const { checkReplies } = await import("@/lib/ugc/actions");
        return checkReplies();
      });
    }
    const { OUTREACH_SEND_ENABLED } = await import("@/lib/ugc/config");
    if (!OUTREACH_SEND_ENABLED) return { sent: 0, reason: "OUTREACH_SEND_ENABLED is false" };
    if (!ready) return { sent: 0, reason: "Gmail not connected" };

    const plan = await step.run("plan", async () => {
      const { planSends } = await import("@/lib/ugc/actions");
      return (await planSends()).plan;
    });
    let sent = 0;
    for (const item of plan) {
      const ok = await step.run(`send-${item.kind}-${item.creatorId}`, async () => {
        const { sendOne } = await import("@/lib/ugc/actions");
        try {
          await sendOne(item);
          return true;
        } catch (err) {
          // Loud: logged on a run row so the weekly digest shows it.
          const { prisma } = await import("@/lib/prisma");
          await prisma.ugcRun.create({
            data: {
              kind: "send",
              status: "failed",
              stage: "send",
              errors: [{ stage: `send ${item.kind} ${item.creatorId}`, message: err instanceof Error ? err.message : String(err), at: new Date().toISOString() }],
              finishedAt: new Date(),
            },
          });
          return false;
        }
      });
      if (ok) sent++;
    }
    return { sent };
  }
);

export const ugcWeeklyDigestFn = inngest.createFunction(
  {
    id: "ugc-weekly-digest",
    name: "UGC — Weekly review digest (Mondays)",
    retries: 2,
    triggers: [
      // Mondays 13:00 UTC = 8am Central, the morning after Sunday's run.
      { cron: "0 13 * * 1" },
      { event: "ugc/digest.requested" },
    ],
  },
  async ({ step }) => {
    return step.run("send-digest", async () => {
      const { sendWeeklyDigest } = await import("@/lib/ugc/digest");
      return sendWeeklyDigest();
    });
  }
);
