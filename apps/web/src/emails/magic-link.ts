import { emailLayout } from "./layout";

export function magicLinkEmail(url: string): { subject: string; html: string } {
  return {
    subject: "Sign in to Acuity",
    html: emailLayout({
      title: "Sign in to Acuity",
      preheader: "Tap the button to sign in. No password needed.",
      intro:
        "Click the button below to sign in. This link expires in 24 hours and can only be used once.",
      ctaLabel: "Sign in to Acuity",
      ctaUrl: url,
    }),
  };
}
