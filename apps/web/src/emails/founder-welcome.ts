/**
 * Personal welcome email from Keenan to every new signup.
 *
 * Body text is unstyled to feel like a real email from a real person.
 * Keenan's signature block is appended at the bottom for branding.
 */

import { keenanSignatureHtml } from "@/emails/keenan-signature";

export function founderWelcomeEmail(params: {
  firstName: string | null;
  foundingMemberNumber: number | null;
}): { subject: string; html: string } {
  const { firstName, foundingMemberNumber } = params;

  const greeting = firstName ? `Hey ${firstName},` : "Hey,";
  const memberLine = foundingMemberNumber
    ? ` You're founding member #${foundingMemberNumber}.`
    : "";

  const bodyText = `${greeting}

I'm Keenan, one of the founders of Acuity. Saw you just signed up — welcome!${memberLine}

If you don't mind me asking — how'd you hear about us? We're a small team and every early user means a lot.

We also greatly appreciate your feedback, both positive and negative — so don't hold back!

If you have any questions about getting started, just reply to this email. I read everything.`;

  // Convert newlines to <br> for HTML, keep it looking plain
  const bodyHtml = bodyText
    .split("\n")
    .map((line) => (line.trim() === "" ? "<br>" : line))
    .join("<br>\n");

  const html = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; line-height: 1.5; color: #333333;">
${bodyHtml}
<br><br>
${keenanSignatureHtml()}
</div>`;

  return {
    subject: "Welcome to Acuity — quick question",
    html,
  };
}
