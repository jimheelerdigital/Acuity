/**
 * One-shot waitlist reactivation campaign. Sends a two-email sequence
 * to Waitlist records that never converted to User accounts.
 *
 * Trigger: manual fire only (admin button → inngest.send()).
 * NOT a cron. This function should fire once and never again.
 *
 * Flow per eligible waitlist user:
 *   1. Send Email 1 immediately (waitlist_reactivation_1)
 *   2. Sleep 4 days
 *   3. Check if they signed up during the 4-day window
 *   4. If not → send Email 2 (waitlist_reactivation_2)
 *
 * Idempotency: TrialEmailLog @@unique([waitlistId, emailKey]) prevents
 * double-sends even if the function is accidentally re-triggered.
 */

import { inngest } from "@/inngest/client";
import { signUnsubscribeToken } from "@/lib/email-tokens";

const EMAIL_FROM = "hello@getacuity.io";
const BASE_URL = "https://www.getacuity.io";

function signupUrl(emailNum: 1 | 2): string {
  return `${BASE_URL}/auth/signup?utm_source=email&utm_medium=reactivation&utm_campaign=waitlist&utm_content=email_${emailNum}`;
}

function firstNameFrom(name: string | null): string {
  const raw = (name ?? "").trim();
  if (!raw) return "there";
  return raw.split(/\s+/)[0] || "there";
}

export const waitlistReactivationFn = inngest.createFunction(
  {
    id: "waitlist-reactivation",
    name: "Waitlist — Reactivation Campaign",
    triggers: [{ event: "waitlist/reactivation.requested" }],
    retries: 1,
  },
  async ({ step, logger }) => {
    // ── Step 1: Find eligible waitlist users ─────────────────────────
    const eligible = await step.run("find-eligible", async () => {
      const { prisma } = await import("@/lib/prisma");

      // All waitlist emails that do NOT have a matching User account
      const waitlistUsers = await prisma.waitlist.findMany({
        where: {
          unsubscribed: false,
        },
        select: {
          id: true,
          email: true,
          name: true,
        },
      });

      // Get all User emails for matching
      const userEmails = new Set(
        (
          await prisma.user.findMany({
            select: { email: true },
          })
        ).map((u: { email: string }) => u.email.toLowerCase())
      );

      return waitlistUsers
        .filter((w: { email: string }) => !userEmails.has(w.email.toLowerCase()))
        .map((w: { id: string; email: string; name: string | null }) => ({
          id: w.id,
          email: w.email,
          name: w.name,
        }));
    });

    if (eligible.length === 0) {
      logger.info("[waitlist-reactivation] No eligible users found");
      return { status: "skipped", reason: "no_eligible_users" };
    }

    logger.info(
      `[waitlist-reactivation] Found ${eligible.length} eligible waitlist users`
    );

    // ── Step 2: Send Email 1 to all eligible ─────────────────────────
    const email1Results = await step.run("send-email-1", async () => {
      const { prisma } = await import("@/lib/prisma");
      const { getResendClient } = await import("@/lib/resend");
      const {
        waitlistReactivation1Subject,
        waitlistReactivation1Html,
      } = await import("@/emails/waitlist-reactivation");

      const resend = getResendClient();
      let sent = 0;
      let skipped = 0;

      for (const w of eligible) {
        // Idempotency check
        const existing = await prisma.trialEmailLog.findUnique({
          where: {
            waitlistId_emailKey: {
              waitlistId: w.id,
              emailKey: "waitlist_reactivation_1",
            },
          },
        });

        if (existing) {
          skipped++;
          continue;
        }

        const firstName = firstNameFrom(w.name);
        const unsubToken = signUnsubscribeToken(w.id, "waitlist");
        const unsubscribeUrl = `${BASE_URL}/api/emails/unsubscribe?token=${encodeURIComponent(unsubToken)}`;

        try {
          const result = await resend.emails.send({
            from: EMAIL_FROM,
            to: w.email,
            subject: waitlistReactivation1Subject(firstName),
            html: waitlistReactivation1Html({
              firstName,
              signupUrl: signupUrl(1),
              unsubscribeUrl,
            }),
          });

          await prisma.trialEmailLog.create({
            data: {
              waitlistId: w.id,
              emailKey: "waitlist_reactivation_1",
              resendId: result.data?.id ?? null,
            },
          });

          sent++;
        } catch (err) {
          logger.error(`[waitlist-reactivation] Failed to send email 1 to ${w.email}:`, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      return { sent, skipped };
    });

    logger.info(
      `[waitlist-reactivation] Email 1: ${email1Results.sent} sent, ${email1Results.skipped} skipped`
    );

    // ── Step 3: Wait 4 days ──────────────────────────────────────────
    await step.sleep("wait-4-days", "4d");

    // ── Step 4: Send Email 2 to those who still haven't signed up ────
    const email2Results = await step.run("send-email-2", async () => {
      const { prisma } = await import("@/lib/prisma");
      const { getResendClient } = await import("@/lib/resend");
      const {
        waitlistReactivation2Subject,
        waitlistReactivation2Html,
      } = await import("@/emails/waitlist-reactivation");

      const resend = getResendClient();
      let sent = 0;
      let skipped = 0;
      let converted = 0;

      // Re-fetch current User emails (some may have signed up in 4 days)
      const userEmails = new Set(
        (
          await prisma.user.findMany({
            select: { email: true },
          })
        ).map((u: { email: string }) => u.email.toLowerCase())
      );

      // Re-fetch unsubscribe status
      const waitlistRows = await prisma.waitlist.findMany({
        where: {
          id: { in: eligible.map((w: { id: string }) => w.id) },
        },
        select: { id: true, email: true, name: true, unsubscribed: true },
      });

      const waitlistMap = new Map(
        waitlistRows.map((w: { id: string; email: string; name: string | null; unsubscribed: boolean }) => [w.id, w])
      );

      for (const w of eligible) {
        const current = waitlistMap.get(w.id);
        if (!current) continue;

        // Skip if they converted during the 4-day window
        if (userEmails.has(current.email.toLowerCase())) {
          converted++;
          continue;
        }

        // Skip if they unsubscribed
        if (current.unsubscribed) {
          skipped++;
          continue;
        }

        // Idempotency check
        const existing = await prisma.trialEmailLog.findUnique({
          where: {
            waitlistId_emailKey: {
              waitlistId: w.id,
              emailKey: "waitlist_reactivation_2",
            },
          },
        });

        if (existing) {
          skipped++;
          continue;
        }

        const firstName = firstNameFrom(current.name);
        const unsubToken = signUnsubscribeToken(w.id, "waitlist");
        const unsubscribeUrl = `${BASE_URL}/api/emails/unsubscribe?token=${encodeURIComponent(unsubToken)}`;

        try {
          const result = await resend.emails.send({
            from: EMAIL_FROM,
            to: current.email,
            subject: waitlistReactivation2Subject(),
            html: waitlistReactivation2Html({
              firstName,
              signupUrl: signupUrl(2),
              unsubscribeUrl,
            }),
          });

          await prisma.trialEmailLog.create({
            data: {
              waitlistId: w.id,
              emailKey: "waitlist_reactivation_2",
              resendId: result.data?.id ?? null,
            },
          });

          sent++;
        } catch (err) {
          logger.error(`[waitlist-reactivation] Failed to send email 2 to ${current.email}:`, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      return { sent, skipped, converted };
    });

    logger.info(
      `[waitlist-reactivation] Email 2: ${email2Results.sent} sent, ${email2Results.skipped} skipped, ${email2Results.converted} converted in window`
    );

    return {
      status: "completed",
      eligible: eligible.length,
      email1: email1Results,
      email2: email2Results,
    };
  }
);
