import { NextRequest, NextResponse } from "next/server";
import { getResendClient } from "@/lib/resend";

export const dynamic = "force-dynamic";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  console.log("RESEND_API_KEY exists:", !!process.env.RESEND_API_KEY);
  try {
    const body = await req.json();
    const email = (body.email ?? "").trim().toLowerCase();
    const name = (body.name ?? "").trim() || null;
    const source = body.source || null;

    if (!email || !EMAIL_REGEX.test(email)) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 },
      );
    }

    const { prisma } = await import("@/lib/prisma");

    // Check for duplicate
    const existing = await prisma.waitlist.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { message: "You're already on the list! We'll be in touch soon.", alreadyExists: true },
        { status: 200 },
      );
    }

    // Create record
    await prisma.waitlist.create({
      data: { email, name, source },
    });

    const totalCount = await prisma.waitlist.count();
    const timestamp = new Date().toLocaleString("en-US", {
      timeZone: "America/Chicago",
      dateStyle: "full",
      timeStyle: "short",
    });

    // Send emails in parallel (non-blocking — don't fail the request if email fails)
    const resend = getResendClient();
    const notificationEmail = resend.emails.send({
      from: "Acuity <noreply@getacuity.io>",
      to: "keenan@heelerdigital.com",
      subject: `New Acuity waitlist signup — ${email}`,
      html: [
        `<p><strong>Name:</strong> ${name || "Not provided"}</p>`,
        `<p><strong>Email:</strong> ${email}</p>`,
        `<p><strong>Source:</strong> ${source || "Direct"}</p>`,
        `<p><strong>Time:</strong> ${timestamp}</p>`,
        `<p><strong>Total waitlist count:</strong> ${totalCount}</p>`,
      ].join("\n"),
    });

    const welcomeEmail = resend.emails.send({
      from: "Acuity <noreply@getacuity.io>",
      to: email,
      subject: "You're on the Acuity waitlist — here's what's coming",
      html: buildWelcomeEmail(name),
    });

    // Fire and forget — log errors but don't fail the request
    Promise.allSettled([notificationEmail, welcomeEmail]).then((results) => {
      results.forEach((r, i) => {
        if (r.status === "rejected") {
          console.error(`Waitlist email ${i} failed:`, r.reason);
        }
      });
    });

    return NextResponse.json({
      message: "You're in! Check your inbox for a confirmation from noreply@getacuity.io",
      success: true,
    });
  } catch (err) {
    console.error("Waitlist POST error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}

function buildWelcomeEmail(name: string | null): string {
  const greeting = name ? `${name}, you're in.` : "You're in.";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to Acuity</title>
</head>
<body style="margin:0;padding:0;background-color:#18181b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#18181b;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <img src="https://getacuity.io/AcuityLogo.png" alt="Acuity" width="48" height="48" style="border-radius:12px;" />
            </td>
          </tr>

          <!-- Hero -->
          <tr>
            <td align="center" style="padding-bottom:8px;">
              <h1 style="margin:0;font-size:36px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">
                ${greeting} 🎉
              </h1>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <p style="margin:0;font-size:18px;color:#a1a1aa;line-height:1.6;">
                You're on the Acuity early access waitlist.
              </p>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding-bottom:32px;">
              <div style="height:1px;background:linear-gradient(to right,transparent,#3f3f46,transparent);"></div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding-bottom:24px;">
              <p style="margin:0;font-size:16px;color:#d4d4d8;line-height:1.7;">
                We're putting the finishing touches on something that's going to change how you end every day.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:32px;">
              <p style="margin:0 0 16px 0;font-size:16px;color:#d4d4d8;font-weight:600;">
                Here's what you're getting early access to:
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
                <tr>
                  <td style="padding:8px 0;font-size:15px;color:#a1a1aa;line-height:1.6;">
                    <span style="color:#7c3aed;font-weight:bold;margin-right:8px;">•</span>
                    60-second nightly voice brain dump
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;font-size:15px;color:#a1a1aa;line-height:1.6;">
                    <span style="color:#7c3aed;font-weight:bold;margin-right:8px;">•</span>
                    AI extracts your tasks, goals, mood, and insights automatically
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;font-size:15px;color:#a1a1aa;line-height:1.6;">
                    <span style="color:#7c3aed;font-weight:bold;margin-right:8px;">•</span>
                    Weekly narrative report written by AI — about your week, starring you
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;font-size:15px;color:#a1a1aa;line-height:1.6;">
                    <span style="color:#7c3aed;font-weight:bold;margin-right:8px;">•</span>
                    Life Matrix — your life scored across 6 areas and tracked over time
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;font-size:15px;color:#a1a1aa;line-height:1.6;">
                    <span style="color:#7c3aed;font-weight:bold;margin-right:8px;">•</span>
                    Mental pattern detection that surfaces what you can't see
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Highlight box -->
          <tr>
            <td style="padding-bottom:32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:#27272a;border-radius:12px;padding:24px;border-left:3px solid #7c3aed;">
                    <p style="margin:0;font-size:16px;color:#e4e4e7;line-height:1.7;">
                      You'll be among the first to try it — and you'll get your first month completely free.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding-bottom:32px;">
              <p style="margin:0;font-size:16px;color:#d4d4d8;line-height:1.7;">
                We'll email you the moment doors open.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding-bottom:40px;">
              <p style="margin:0;font-size:16px;color:#d4d4d8;font-weight:600;">
                — The Acuity Team
              </p>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding-bottom:24px;">
              <div style="height:1px;background:linear-gradient(to right,transparent,#3f3f46,transparent);"></div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center">
              <p style="margin:0;font-size:13px;color:#52525b;">
                <a href="https://getacuity.io" style="color:#7c3aed;text-decoration:none;">getacuity.io</a>
                <span style="margin:0 8px;color:#3f3f46;">|</span>
                <a href="https://getacuity.io/unsubscribe" style="color:#52525b;text-decoration:none;">Unsubscribe</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
