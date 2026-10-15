import { emailLayout } from "./layout";

/** 6-digit sign-in code email (app 1.9.1 passwordless sign-in). */
export function signInCodeEmail(code: string): { subject: string; html: string } {
  return {
    subject: `${code} is your Ripple code`,
    html: emailLayout({
      title: "Your Ripple sign-in code",
      preheader: `${code} — enter it in the app. It works for 10 minutes.`,
      intro:
        `Enter this code in the Ripple app to sign in:<br /><br />` +
        `<span style="display:block;text-align:center;font-size:34px;font-weight:700;letter-spacing:8px;color:#1a1a1a;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${code}</span><br />` +
        `It works for 10 minutes and only once. No password needed.`,
      footnote: "If you didn't ask for this code, you can ignore this email — no one can sign in without it.",
    }),
  };
}
