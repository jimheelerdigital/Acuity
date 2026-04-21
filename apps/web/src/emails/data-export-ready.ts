/**
 * "Your data export is ready" email. Sent when the async export
 * Inngest function finishes writing the zip. Includes the signed
 * download URL + expiry notice.
 */

import { getResendClient } from "@/lib/resend";

import { emailLayout } from "./layout";

const EMAIL_FROM = process.env.EMAIL_FROM ?? "noreply@getacuity.io";

export async function sendDataExportReadyEmail(params: {
  to: string;
  name: string | null;
  url: string;
  expiresAt: Date;
}) {
  const resend = getResendClient();
  if (!resend) return;

  const firstName = params.name?.split(" ")[0] ?? "there";
  const expires = params.expiresAt.toLocaleString("en-US", {
    dateStyle: "long",
    timeStyle: "short",
  });

  const html = emailLayout({
    title: "Your Acuity export is ready",
    preheader: "Download your data — link expires in 24 hours.",
    intro: `Hi ${firstName} — your data export is ready. The zip contains all your entries, goals, tasks, Life Matrix history, weekly reports, and any retained audio files. The link expires at ${expires} (24 hours from now).`,
    ctaLabel: "Download export",
    ctaUrl: params.url,
    footnote:
      "Missed the window? You can request a new export from Account → Download my data. One request per 7 days.",
  });

  await resend.emails.send({
    from: EMAIL_FROM,
    to: params.to,
    subject: "Your Acuity data export is ready",
    html,
  });
}
