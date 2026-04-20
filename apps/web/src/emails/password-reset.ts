import { emailLayout } from "./layout";

export function passwordResetEmail(url: string): { subject: string; html: string } {
  return {
    subject: "Reset your Acuity password",
    html: emailLayout({
      title: "Reset your password",
      preheader: "Pick a new password for Acuity.",
      intro:
        "We received a request to reset your password. Tap the button below to pick a new one. This link expires in 1 hour and can only be used once.",
      ctaLabel: "Reset password",
      ctaUrl: url,
      footnote:
        "If you didn't request a password reset, you can safely ignore this email — your password will stay the same.",
    }),
  };
}
