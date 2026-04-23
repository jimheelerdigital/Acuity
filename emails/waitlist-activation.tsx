/**
 * One-off email for Keenan to send to the 14 existing waitlist users.
 * Subject: "You're in — here's your access link"
 *
 * DO NOT send automatically. Keenan sends this manually via Resend
 * dashboard or a one-off script. Each waitlist user gets their
 * Founding Member number (#1-14) and a direct signup link.
 *
 * Usage:
 *   import { buildWaitlistActivationEmail } from "@/emails/waitlist-activation";
 *   const html = buildWaitlistActivationEmail("Sarah", 7);
 *   // Send via Resend with subject "You're in — here's your access link"
 */

const SIGNUP_URL = "https://www.getacuity.io/auth/signup";

export function buildWaitlistActivationEmail(
  name: string,
  foundingMemberNumber: number
): string {
  const safeName = name
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background-color:#0A0A0F;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0A0A0F;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

          <!-- Logo -->
          <tr>
            <td style="padding-bottom:32px;">
              <img src="https://www.getacuity.io/AcuityLogo.png" alt="Acuity" width="40" height="40" style="display:block;" />
            </td>
          </tr>

          <!-- Heading -->
          <tr>
            <td style="padding-bottom:24px;">
              <h1 style="margin:0;font-size:28px;font-weight:800;color:#FFFFFF;letter-spacing:-0.5px;line-height:1.3;">
                ${safeName}, you're in.
              </h1>
            </td>
          </tr>

          <!-- Founding member badge -->
          <tr>
            <td style="padding-bottom:24px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:#7C5CFC;border-radius:20px;padding:8px 16px;">
                    <span style="font-size:14px;font-weight:700;color:#FFFFFF;">Founding Member #${foundingMemberNumber}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding-bottom:24px;">
              <p style="margin:0;font-size:16px;color:#A0A0B8;line-height:1.7;">
                Acuity is live. You were one of the first people to sign up for the waitlist, and we kept a spot for you.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding-bottom:24px;">
              <p style="margin:0;font-size:16px;color:#A0A0B8;line-height:1.7;">
                As Founding Member #${foundingMemberNumber}, here's what you get:
              </p>
            </td>
          </tr>

          <!-- Benefits card -->
          <tr>
            <td style="padding-bottom:24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:#13131F;border-radius:12px;padding:24px;border-left:4px solid #7C5CFC;">
                    <p style="margin:0 0 8px;font-size:15px;color:#FFFFFF;line-height:1.7;">
                      <strong>30-day free trial</strong> (everyone else gets 14)
                    </p>
                    <p style="margin:0 0 8px;font-size:15px;color:#FFFFFF;line-height:1.7;">
                      <strong>$12.99/month locked in forever</strong> (price goes up after the first 100)
                    </p>
                    <p style="margin:0;font-size:15px;color:#FFFFFF;line-height:1.7;">
                      <strong>Founding Member badge</strong> on your account, permanently
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA Button -->
          <tr>
            <td style="padding-bottom:24px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:#7C5CFC;border-radius:999px;padding:16px 32px;">
                    <a href="${SIGNUP_URL}" style="font-size:16px;font-weight:700;color:#FFFFFF;text-decoration:none;display:block;">
                      Create your account
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding-bottom:24px;">
              <p style="margin:0;font-size:16px;color:#A0A0B8;line-height:1.7;">
                Your first brain dump takes 60 seconds. Talk about whatever is on your mind. By morning, your tasks are on a list, your mood is scored, and your goals are tracked.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding-bottom:24px;">
              <p style="margin:0;font-size:16px;color:#A0A0B8;line-height:1.7;">
                Every Sunday, a 400-word story of your week lands on your phone.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding-bottom:0;">
              <p style="margin:0;font-size:16px;color:#FFFFFF;font-weight:600;">
                — Keenan & the Acuity Team
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:40px;border-top:1px solid rgba(255,255,255,0.1);margin-top:40px;">
              <p style="margin:0;font-size:12px;color:#666;">
                You're receiving this because you joined the Acuity waitlist.
                <a href="https://www.getacuity.io" style="color:#7C5CFC;">getacuity.io</a>
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

/**
 * Subject line for this email.
 */
export const WAITLIST_ACTIVATION_SUBJECT = "You're in — here's your access link";
