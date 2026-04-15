import { NextRequest, NextResponse } from "next/server";
import { getResendClient } from "@/lib/resend";
import { DRIP_SEQUENCE } from "@/lib/drip-emails";

export const dynamic = "force-dynamic";

/**
 * Daily cron job: checks all waitlist users and sends the next drip email
 * if enough days have passed since signup.
 *
 * Protect with a CRON_SECRET bearer token in production.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
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

  for (const user of users) {
    const daysSinceSignup = Math.floor(
      (now.getTime() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Find the next email in the sequence for this user
    const nextEmail = DRIP_SEQUENCE.find(
      (e) => e.step === user.emailSequenceStep + 1
    );

    if (!nextEmail) continue;
    if (daysSinceSignup < nextEmail.daysAfterSignup) continue;

    const displayName = user.name || "Friend";
    const subject = nextEmail.subject.replace("{name}", displayName);

    try {
      await resend.emails.send({
        from: "Acuity <hello@getacuity.io>",
        to: user.email,
        subject,
        html: nextEmail.buildHtml(displayName),
      });

      await prisma.waitlist.update({
        where: { id: user.id },
        data: { emailSequenceStep: nextEmail.step },
      });

      sent++;
    } catch (err) {
      console.error(
        `[waitlist-drip] Failed to send email ${nextEmail.step} to ${user.email}:`,
        err
      );
      errors++;
    }
  }

  return NextResponse.json({
    processed: users.length,
    sent,
    errors,
    timestamp: now.toISOString(),
  });
}
