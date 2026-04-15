/**
 * One-off script to send all 5 drip emails to a test address.
 * Usage: npx tsx scripts/test-drip-emails.ts
 */

import { Resend } from "resend";
import { DRIP_SEQUENCE } from "../apps/web/src/lib/drip-emails";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const TO = "keenan@heelerdigital.com";
const NAME = "Keenan";
const FROM = "Acuity <hello@getacuity.io>";

// Build email 1 (confirmation) inline since it's defined in the route file
function buildEmail1(name: string): string {
  const greeting = `${name}, you're in.`;
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
          <tr>
            <td style="padding-bottom:24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:#13131F;border-radius:12px;padding:32px;">
                    <p style="margin:0 0 20px 0;font-size:16px;color:#FFFFFF;font-weight:700;">
                      Here's what you're getting early access to:
                    </p>
                    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
                      <tr><td style="padding:10px 0;font-size:15px;color:#A0A0B8;line-height:1.6;"><span style="color:#7C5CFC;font-weight:bold;margin-right:10px;font-size:18px;">&#8226;</span>60-second nightly voice brain dump</td></tr>
                      <tr><td style="padding:10px 0;font-size:15px;color:#A0A0B8;line-height:1.6;"><span style="color:#7C5CFC;font-weight:bold;margin-right:10px;font-size:18px;">&#8226;</span>AI extracts your tasks, goals, mood, and insights automatically</td></tr>
                      <tr><td style="padding:10px 0;font-size:15px;color:#A0A0B8;line-height:1.6;"><span style="color:#7C5CFC;font-weight:bold;margin-right:10px;font-size:18px;">&#8226;</span>Weekly narrative report written by AI — about your week, starring you</td></tr>
                      <tr><td style="padding:10px 0;font-size:15px;color:#A0A0B8;line-height:1.6;"><span style="color:#7C5CFC;font-weight:bold;margin-right:10px;font-size:18px;">&#8226;</span>Life Matrix — your life scored across 6 areas and tracked over time</td></tr>
                      <tr><td style="padding:10px 0;font-size:15px;color:#A0A0B8;line-height:1.6;"><span style="color:#7C5CFC;font-weight:bold;margin-right:10px;font-size:18px;">&#8226;</span>Mental pattern detection that surfaces what you can't see</td></tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
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
          <tr>
            <td style="padding-bottom:8px;">
              <p style="margin:0;font-size:16px;color:#A0A0B8;line-height:1.7;">We'll email you the moment doors open.</p>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:40px;">
              <p style="margin:0;font-size:16px;color:#FFFFFF;font-weight:600;">— The Acuity Team</p>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:24px;">
              <div style="height:2px;background:linear-gradient(to right,transparent,#7C5CFC,transparent);"></div>
            </td>
          </tr>
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
              <p style="margin:0;font-size:11px;color:#A0A0B8;opacity:0.6;">We never share your data. Audio deleted within 24hrs.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function main() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("RESEND_API_KEY not set");
    process.exit(1);
  }

  // Validate the key format
  console.log(`API key prefix: ${apiKey.slice(0, 8)}...`);
  console.log(`FROM: ${FROM}`);
  console.log(`TO: ${TO}`);
  console.log();

  if (!apiKey.startsWith("re_")) {
    console.error(
      "ERROR: RESEND_API_KEY does not start with 're_'. The value in .env is not a valid Resend API key."
    );
    console.error(
      "The production app works because Vercel has the correct key. Update RESEND_API_KEY in your .env file."
    );
    console.error(
      "You can find it at https://resend.com/api-keys or copy it from Vercel env vars."
    );
    process.exit(1);
  }

  const resend = new Resend(apiKey);

  const emails = [
    {
      step: 1,
      subject: "You're on the Acuity waitlist — here's what's coming",
      html: buildEmail1(NAME),
    },
    ...DRIP_SEQUENCE.map((e) => ({
      step: e.step,
      subject: e.subject.replace("{name}", NAME),
      html: e.buildHtml(NAME),
    })),
  ];

  for (const email of emails) {
    console.log(`Sending email ${email.step}/5: "${email.subject}"...`);
    try {
      const result = await resend.emails.send({
        from: FROM,
        to: TO,
        subject: `[TEST ${email.step}/5] ${email.subject}`,
        html: email.html,
      });

      if (result.error) {
        console.error(`  ✗ Resend error:`, JSON.stringify(result.error));
      } else {
        console.log(`  ✓ Sent (id: ${result.data?.id})`);
      }
    } catch (err) {
      console.error(`  ✗ Exception:`, err);
    }
    // Small delay between sends to preserve inbox order
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log("\nDone. All emails attempted to", TO);
}

main();
