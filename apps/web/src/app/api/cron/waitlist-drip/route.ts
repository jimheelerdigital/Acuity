import { NextRequest, NextResponse } from "next/server";
import { getResendClient } from "@/lib/resend";
import { DRIP_SEQUENCE } from "@/lib/drip-emails";
import { safeLog } from "@/lib/safe-log";

export const dynamic = "force-dynamic";

/**
 * Daily cron job: checks all waitlist users and sends the next drip email
 * if enough days have passed since signup.
 *
 * Protect with a CRON_SECRET bearer token in production.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "Cron not configured" },
      { status: 500 }
    );
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");
  const resend = getResendClient();
  const now = new Date();

  // Fetch all users who haven't completed the sequence and aren't unsubscribed
  const users = await prisma.waitlist.findMany({
    where: {
      emailSequenceStep: { lt: 5 },
      unsubscribed: false,
    },
  });

  let sent = 0;
  let errors = 0;
  const details: { email: string; step: number; status: string }[] = [];

  safeLog.info("waitlist-drip.start", { totalUsers: users.length });

  for (const user of users) {
    const daysSinceSignup = Math.floor(
      (now.getTime() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Find ALL eligible emails this user should have received by now
    // (handles catch-up if cron was down for multiple days)
    const eligibleEmails = DRIP_SEQUENCE.filter(
      (e) =>
        e.step > user.emailSequenceStep &&
        daysSinceSignup >= e.daysAfterSignup
    ).sort((a, b) => a.step - b.step);

    if (eligibleEmails.length === 0) {
      safeLog.info("waitlist-drip.skip", {
        email: user.email,
        currentStep: user.emailSequenceStep,
        daysSinceSignup,
      });
      continue;
    }

    // Strip CR/LF to defend against header injection via a malicious
    // waitlist name. HTML body escaping happens inside buildHtml
    // (drip-emails.ts). Subject line doesn't need HTML escaping —
    // Resend's SDK treats it as a header value — but must reject
    // newlines.
    const displayName = (user.name || "Friend").replace(/[\r\n]/g, " ");

    // Send each eligible email in sequence order
    for (const dripEmail of eligibleEmails) {
      const subject = dripEmail.subject.replace("{name}", displayName);

      try {
        await resend.emails.send({
          from: "Acuity <hello@getacuity.io>",
          to: user.email,
          subject,
          html: dripEmail.buildHtml(displayName),
        });

        await prisma.waitlist.update({
          where: { id: user.id },
          data: { emailSequenceStep: dripEmail.step },
        });

        sent++;
        details.push({ email: user.email, step: dripEmail.step, status: "sent" });
        safeLog.info("waitlist-drip.sent", {
          email: user.email,
          step: dripEmail.step,
          daysSinceSignup,
        });
      } catch (err) {
        safeLog.error("waitlist-drip.send_failed", err, {
          step: dripEmail.step,
          email: user.email,
        });
        errors++;
        details.push({ email: user.email, step: dripEmail.step, status: "error" });
        break; // Don't send later emails if an earlier one failed
      }
    }
  }

  safeLog.info("waitlist-drip.complete", { processed: users.length, sent, errors });

  return NextResponse.json({
    processed: users.length,
    sent,
    errors,
    details,
    timestamp: now.toISOString(),
  });
}
