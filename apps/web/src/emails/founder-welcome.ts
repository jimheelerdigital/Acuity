/**
 * Personal welcome email from Keenan to every new signup.
 *
 * Contains App Store download button and web app button.
 * Sent from keenan@getacuity.io so replies go straight to him.
 */

const APP_STORE_URL =
  "https://apps.apple.com/us/app/acuity-daily/id6762633410";

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:8px 0;">
    <tr>
      <td style="background-color:#7C5CFC;border-radius:8px;text-align:center;">
        <a href="${href}" style="display:block;padding:14px 28px;font-size:15px;font-weight:700;color:#FFFFFF;text-decoration:none;">
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
<body style="margin:0;padding:0;background-color:#FFFFFF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;">
  <tr><td align="center" style="padding:40px 20px;">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
      <tr><td style="padding-bottom:20px;">
        <p style="margin:0;font-size:16px;color:#374151;line-height:1.7;">${greeting}</p>
      </td></tr>
      <tr><td style="padding-bottom:20px;">
        <p style="margin:0;font-size:16px;color:#374151;line-height:1.7;">I'm Keenan, one of the founders of Acuity. Saw you just signed up &mdash; welcome! You're founding member #${memberNumber}.</p>
      </td></tr>
      <tr><td style="padding-bottom:20px;">
        <p style="margin:0;font-size:16px;color:#374151;line-height:1.7;">If you haven't yet, here's the link to download the app in the App Store:</p>
      </td></tr>
      <tr><td style="padding-bottom:20px;">
        ${button(APP_STORE_URL, "Download on the App Store")}
      </td></tr>
      <tr><td style="padding-bottom:20px;">
        <p style="margin:0;font-size:16px;color:#374151;line-height:1.7;">If you're an Android user, the app should be live within the next week! In the meantime, use our web app:</p>
      </td></tr>
      <tr><td style="padding-bottom:20px;">
        ${button("https://getacuity.io/home", "Use the web app")}
      </td></tr>
      <tr><td style="padding-bottom:20px;">
        <p style="margin:0;font-size:16px;color:#374151;line-height:1.7;">We also greatly appreciate your feedback, both positive and negative &mdash; so don't hold back! Please let me know if you think of any ways we can improve the app.</p>
      </td></tr>
      <tr><td style="padding-bottom:20px;">
        <p style="margin:0;font-size:16px;color:#374151;line-height:1.7;">If you have any questions about getting started, just reply to this email. I read everything.</p>
      </td></tr>
      <tr><td style="padding-top:8px;">
        <p style="margin:0;font-size:16px;color:#1a1a1a;">Kindly,</p>
        <p style="margin:0;font-size:16px;color:#1a1a1a;font-weight:600;">Keenan - Co-Founder, Acuity</p>
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
