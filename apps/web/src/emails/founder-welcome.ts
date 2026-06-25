/**
 * Personal welcome email from Keenan to every new signup.
 *
 * Contains App Store download button and web app button.
 * Sent from keenan@getacuity.io so replies go straight to him.
 */

const APP_STORE_URL =
  "https://apps.apple.com/us/app/acuity-daily/id6762633410";

function button(href: string, label: string, style: "primary" | "secondary" = "primary"): string {
  const bg = style === "primary" ? "#7C5CFC" : "#F3F4F6";
  const color = style === "primary" ? "#FFFFFF" : "#374151";
  const border = style === "secondary" ? "border:1px solid #D1D5DB;" : "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:4px 0;">
    <tr>
      <td style="background-color:${bg};border-radius:10px;text-align:center;${border}">
        <a href="${href}" style="display:block;padding:14px 28px;font-size:15px;font-weight:600;color:${color};text-decoration:none;letter-spacing:0.01em;">
          ${label}
        </a>
      </td>
    </tr>
  </table>`;
}

export function founderWelcomeEmail(params: {
  firstName: string | null;
  foundingMemberNumber: number | null;
}): { subject: string; html: string } {
  const { firstName, foundingMemberNumber } = params;

  const greeting = firstName ? `Hey ${firstName},` : "Hey,";
  const memberNumber = foundingMemberNumber ?? 85;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background-color:#F9FAFB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F9FAFB;">
  <tr><td align="center" style="padding:40px 16px;">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">

      <!-- Header accent bar -->
      <tr><td style="height:4px;background:linear-gradient(90deg,#7C5CFC,#A78BFA,#7C5CFC);"></td></tr>

      <!-- Content -->
      <tr><td style="padding:24px 36px 36px;">

        <p style="margin:0 0 20px;font-size:16px;color:#1F2937;line-height:1.7;">${greeting}</p>

        <p style="margin:0 0 20px;font-size:16px;color:#1F2937;line-height:1.7;">I'm Keenan, one of the founders of Acuity. Saw you just signed up &mdash; welcome! You're <strong style="color:#7C5CFC;">founding member #${memberNumber}</strong>.</p>

        <p style="margin:0 0 12px;font-size:16px;color:#1F2937;line-height:1.7;">If you haven't yet, here's the link to download the app in the App Store:</p>

        ${button(APP_STORE_URL, "\u{1F4F1}  Download on the App Store")}

        <p style="margin:20px 0 12px;font-size:15px;color:#6B7280;line-height:1.7;">If you're an Android user, the app should be live within the next week! In the meantime, use our web app:</p>

        ${button("https://getacuity.io/auth/signin", "\u{1F310}  Use the web app", "secondary")}

        <!-- Divider -->
        <div style="height:1px;background:#E5E7EB;margin:28px 0;"></div>

        <p style="margin:0 0 20px;font-size:15px;color:#4B5563;line-height:1.7;">We also greatly appreciate your feedback, both positive and negative &mdash; so don't hold back! Please let me know if you think of any ways we can improve the app.</p>

        <p style="margin:0 0 28px;font-size:15px;color:#4B5563;line-height:1.7;">If you have any questions about getting started, just reply to this email. I read everything.</p>

        <p style="margin:0 0 12px;font-size:16px;color:#1F2937;">Kindly,</p>
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr>
            <td valign="middle" style="padding-right:12px;">
              <img src="https://www.getacuity.io/email/keenan-updated-headshot.png" alt="Keenan, founder of Acuity" width="52" height="52" style="display:block;width:52px;height:52px;border-radius:50%;" />
            </td>
            <td valign="middle">
              <p style="margin:0;font-size:16px;color:#1a1a1a;font-weight:600;">Keenan</p>
              <p style="margin:0;font-size:13px;color:#6b7280;">Co-founder, Acuity</p>
            </td>
          </tr>
        </table>

      </td></tr>
    </table>

    <!-- Footer -->
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
      <tr><td align="center" style="padding:20px 0;">
        <p style="margin:0;font-size:12px;color:#9CA3AF;">
          <a href="https://getacuity.io" style="color:#7C5CFC;text-decoration:none;">getacuity.io</a>
          &nbsp;&middot;&nbsp; One minute a day.
        </p>
      </td></tr>
    </table>

  </td></tr>
</table>
</body>
</html>`;

  return {
    subject: "URGENT: Acuity; Next Steps",
    html,
  };
}
