/**
 * "Your State of Me is ready" email. Sent by generateStateOfMeFn on
 * successful completion. Preview shows the headline + first ~200 chars
 * of the closing reflection. CTA deep-links to the detail page.
 */

import { getResendClient } from "@/lib/resend";

import { emailLayout } from "./layout";

const EMAIL_FROM = process.env.EMAIL_FROM ?? "noreply@getacuity.io";

function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXTAUTH_URL ??
    "https://www.getacuity.io"
  );
}

export async function sendStateOfMeReadyEmail(params: {
  to: string;
  name: string | null;
  reportId: string;
  headline: string;
  closingReflection: string;
}) {
  const resend = getResendClient();
  if (!resend) return;

  const firstName = params.name?.split(" ")[0] ?? "there";
  const preview =
    params.closingReflection.length > 220
      ? `${params.closingReflection.slice(0, 220).trim()}…`
      : params.closingReflection;

  const html = emailLayout({
    title: "Your State of Me is ready",
    preheader: params.headline,
    intro: `${firstName} — your quarterly State of Me is ready. Here's a preview:\n\n"${preview}"`,
    ctaLabel: "Read the full report",
    ctaUrl: `${appUrl()}/insights/state-of-me/${params.reportId}`,
    footnote:
      "State of Me arrives every ~90 days. You can also request one manually from /insights (once per 30 days).",
  });

  await resend.emails.send({
    from: EMAIL_FROM,
    to: params.to,
    subject: `Your State of Me — ${params.headline}`,
    html,
  });
}
