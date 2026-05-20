/**
 * Personal welcome email from Keenan to every new signup.
 *
 * Plain text only — no HTML, no images, no formatting. Should feel
 * like a real email from a real person, not a marketing blast.
 */

export function founderWelcomeEmail(params: {
  firstName: string | null;
  foundingMemberNumber: number | null;
}): { subject: string; text: string } {
  const { firstName, foundingMemberNumber } = params;

  const greeting = firstName ? `Hey ${firstName},` : "Hey,";
  const memberLine = foundingMemberNumber
    ? ` You're founding member #${foundingMemberNumber}.`
    : "";

  const text = `${greeting}

I'm Keenan, one of the founders of Acuity. Saw you just signed up — welcome!${memberLine}

If you don't mind me asking — how'd you hear about us? We're a small team and every early user means a lot.

We also greatly appreciate your feedback, both positive and negative — so don't hold back!

If you have any questions about getting started, just reply to this email. I read everything.

Kindly,
Keenan - Co-Founder, Acuity`;

  return {
    subject: "Welcome to Acuity — quick question",
    text,
  };
}
