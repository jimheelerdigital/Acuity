import { emailLayout } from "./layout";

export function verificationEmail(url: string): { subject: string; html: string } {
  return {
    subject: "Verify your email for Ripple",
    html: emailLayout({
      title: "Verify your email",
      preheader: "One click to activate your Ripple account.",
      intro:
        "Welcome to Ripple. Tap the button below to verify your email and activate your account. This link expires in 24 hours.",
      ctaLabel: "Verify email",
      ctaUrl: url,
      footnote:
        "If you didn't sign up for Ripple, you can safely ignore this email — your address won't be added.",
    }),
  };
}
