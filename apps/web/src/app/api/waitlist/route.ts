import { NextRequest, NextResponse } from "next/server";
import { getResendClient } from "@/lib/resend";

export const dynamic = "force-dynamic";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  console.log("[waitlist] POST hit");
  console.log("[waitlist] RESEND_API_KEY exists:", !!process.env.RESEND_API_KEY);

  try {
    const body = await req.json();
    const email = (body.email ?? "").trim().toLowerCase();
    const name = (body.name ?? "").trim() || null;
    const source = body.source || null;
    console.log("[waitlist] parsed body:", { email, name, source });

    if (!email || !EMAIL_REGEX.test(email)) {
      console.log("[waitlist] invalid email, returning 400");
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 },
      );
    }

    console.log("[waitlist] importing prisma...");
    const { prisma } = await import("@/lib/prisma");
    console.log("[waitlist] prisma imported");

    // Check for duplicate
    const existing = await prisma.waitlist.findUnique({ where: { email } });
    console.log("[waitlist] duplicate check:", existing ? "EXISTS" : "NEW");

    let alreadyExists = false;

    if (existing) {
      alreadyExists = true;
    } else {
      // Create record
      console.log("[waitlist] creating record...");
      await prisma.waitlist.create({
        data: { email, name, source },
      });
      console.log("[waitlist] record created");
    }

    const totalCount = await prisma.waitlist.count();
    const timestamp = new Date().toLocaleString("en-US", {
      timeZone: "America/Chicago",
      dateStyle: "full",
      timeStyle: "short",
    });
    console.log("[waitlist] total count:", totalCount);

    // Send emails — await them so they complete before the response is returned
    console.log("[waitlist] initializing Resend client...");
    const resend = getResendClient();
    console.log("[waitlist] Resend client ready, sending emails...");

    try {
      const [notifResult, welcomeResult] = await Promise.allSettled([
        resend.emails.send({
          from: "Acuity <hello@getacuity.io>",
          to: "keenan@heelerdigital.com",
          subject: `New Acuity waitlist signup — ${email}`,
          html: [
            `<p><strong>Name:</strong> ${name || "Not provided"}</p>`,
            `<p><strong>Email:</strong> ${email}</p>`,
            `<p><strong>Source:</strong> ${source || "Direct"}</p>`,
            `<p><strong>Time:</strong> ${timestamp}</p>`,
            `<p><strong>Total waitlist count:</strong> ${totalCount}</p>`,
          ].join("\n"),
        }),
        resend.emails.send({
          from: "Acuity <hello@getacuity.io>",
          to: email,
          subject: "You're on the Acuity waitlist — here's what's coming",
          html: buildWelcomeEmail(name),
        }),
      ]);

      console.log("[waitlist] notification email result:", JSON.stringify(notifResult));
      console.log("[waitlist] welcome email result:", JSON.stringify(welcomeResult));

      // Mark step 1 (confirmation email) as sent for the drip sequence
      if (welcomeResult.status === "fulfilled" && !alreadyExists) {
        await prisma.waitlist.update({
          where: { email },
          data: { emailSequenceStep: 1 },
        });
        console.log("[waitlist] emailSequenceStep set to 1");
      }
    } catch (emailErr) {
      console.error("[waitlist] email sending threw:", emailErr);
    }

    console.log("[waitlist] done, returning response");
    return NextResponse.json({
      message: alreadyExists
        ? "You're already on the list! We'll be in touch soon."
        : "You're in! Check your inbox for a confirmation from hello@getacuity.io",
      alreadyExists,
      success: true,
    });
  } catch (err) {
    console.error("[waitlist] TOP-LEVEL ERROR:", err);
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
<body style="margin:0;padding:0;background-color:#0A0A0F;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0A0A0F;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Logo + Tagline -->
          <tr>
            <td align="center" style="padding-bottom:12px;">
              <img src="https://getacuity.io/AcuityLogo.png" alt="Acuity" width="48" height="48" style="border-radius:12px;" />
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:40px;">
              <p style="margin:0;font-size:13px;color:#A0A0B8;letter-spacing:0.5px;">
                Brain dump daily. Get your life back.
              </p>
            </td>
          </tr>

          <!-- Hero -->
          <tr>
            <td align="center" style="padding-bottom:8px;">
              <h1 style="margin:0;font-size:36px;font-weight:800;color:#FFFFFF;letter-spacing:-0.5px;">
                ${greeting} &#127881;
              </h1>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:40px;">
              <p style="margin:0;font-size:18px;color:#A0A0B8;line-height:1.6;">
                You're on the Acuity early access waitlist.
              </p>
            </td>
          </tr>

          <!-- Value Section Card -->
          <tr>
            <td style="padding-bottom:24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:#13131F;border-radius:12px;padding:32px;">
                    <p style="margin:0 0 20px 0;font-size:16px;color:#FFFFFF;font-weight:700;">
                      Here's what you're getting early access to:
                    </p>
                    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
                      <tr>
                        <td style="padding:10px 0;font-size:15px;color:#A0A0B8;line-height:1.6;">
                          <span style="color:#7C5CFC;font-weight:bold;margin-right:10px;font-size:18px;">&#8226;</span>
                          60-second nightly voice brain dump
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:10px 0;font-size:15px;color:#A0A0B8;line-height:1.6;">
                          <span style="color:#7C5CFC;font-weight:bold;margin-right:10px;font-size:18px;">&#8226;</span>
                          AI extracts your tasks, goals, mood, and insights automatically
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:10px 0;font-size:15px;color:#A0A0B8;line-height:1.6;">
                          <span style="color:#7C5CFC;font-weight:bold;margin-right:10px;font-size:18px;">&#8226;</span>
                          Weekly narrative report written by AI — about your week, starring you
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:10px 0;font-size:15px;color:#A0A0B8;line-height:1.6;">
                          <span style="color:#7C5CFC;font-weight:bold;margin-right:10px;font-size:18px;">&#8226;</span>
                          Life Matrix — your life scored across 6 areas and tracked over time
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:10px 0;font-size:15px;color:#A0A0B8;line-height:1.6;">
                          <span style="color:#7C5CFC;font-weight:bold;margin-right:10px;font-size:18px;">&#8226;</span>
                          Mental pattern detection that surfaces what you can't see
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Highlight Card -->
          <tr>
            <td style="padding-bottom:32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:#13131F;border-radius:12px;padding:24px;border-left:4px solid #7C5CFC;">
                    <p style="margin:0;font-size:16px;color:#FFFFFF;line-height:1.7;">
                      You'll be among the first to try it — and you'll get your first month completely free.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Closing -->
          <tr>
            <td style="padding-bottom:8px;">
              <p style="margin:0;font-size:16px;color:#A0A0B8;line-height:1.7;">
                We'll email you the moment doors open.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:40px;">
              <p style="margin:0;font-size:16px;color:#FFFFFF;font-weight:600;">
                — The Acuity Team
              </p>
            </td>
          </tr>

          <!-- Purple Divider -->
          <tr>
            <td style="padding-bottom:24px;">
              <div style="height:2px;background:linear-gradient(to right,transparent,#7C5CFC,transparent);"></div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-bottom:16px;">
              <p style="margin:0;font-size:13px;color:#A0A0B8;">
                <a href="https://getacuity.io" style="color:#7C5CFC;text-decoration:none;font-weight:600;">getacuity.io</a>
                <span style="margin:0 10px;color:#2A2A3A;">|</span>
                <a href="https://getacuity.io/unsubscribe" style="color:#A0A0B8;text-decoration:none;">Unsubscribe</a>
              </p>
            </td>
          </tr>
          <tr>
            <td align="center">
              <p style="margin:0;font-size:11px;color:#A0A0B8;opacity:0.6;">
                We never share your data. Audio deleted within 24hrs.
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
