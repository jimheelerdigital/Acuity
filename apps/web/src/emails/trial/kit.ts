/**
 * Small building blocks for the 2026-10-01 email rewrite (variants picked by
 * Jev, lib/email-jev.ts). Keeps every variant short and on-voice:
 *   - one headline, 2-4 short paragraphs, ONE call to action
 *   - Keenan's voice: plain, warm, on her side; never preachy, never medical
 *   - no "brain dump", no fixed time of day, no recording-duration claims
 *   - examples follow her lane (women = Ripple, men = BWK)
 */
import { escapeHtml } from "@/lib/escape-html";
import { appAccessBlock, keenanSignature, para, primaryButton, secondaryButton, trialCard, trialLayout } from "./layout";
import type { EmailVariant, TrialVars } from "./types";

export { para, trialCard, primaryButton, secondaryButton, appAccessBlock, keenanSignature };

/** "Hi Sarah," — or "Hi there," when we don't have a real first name. */
export function hi(v: TrialVars): string {
  const first = (v.firstName ?? "").trim();
  return para(first && first !== "friend" ? `Hi ${escapeHtml(first)},` : "Hi there,");
}

export function h1(text: string): string {
  return `<tr><td style="padding-bottom:24px;"><h1 style="margin:0;font-size:26px;font-weight:800;color:#1a1a1a;line-height:1.3;letter-spacing:-0.4px;">${text}</h1></td></tr>`;
}

/** Wrap any block (button, card) as a row of the email body. */
export function row(inner: string, bottom = 20): string {
  return `<tr><td style="padding-bottom:${bottom}px;">${inner}</td></tr>`;
}

export function men(v: TrialVars): boolean {
  return v.lane === "men";
}

/** What she might say on a first debrief, and what Ripple hands back. */
export function sayThis(v: TrialVars): { said: string; back: string[] } {
  return men(v)
    ? {
        said: "Gym Monday and Thursday, I keep putting off the car insurance call, and I want to stop scrolling after midnight.",
        back: ["Call about car insurance", "Habit: gym, Mon + Thu", "Habit: phone down by midnight"],
      }
    : {
        said: "I need to call the dentist, the permission slip is due Friday, and I want to walk three times this week.",
        back: ["Call the dentist", "Sign the permission slip · Friday", "Habit: walk, 3x this week"],
      };
}

/** The "you say it → Ripple catches it" card. */
export function exampleCard(v: TrialVars, label = "Say something like:"): string {
  const ex = sayThis(v);
  return row(
    trialCard(`
    <p style="margin:0 0 10px;font-size:14px;font-weight:700;color:#C4451C;">${label}</p>
    <p style="margin:0 0 14px;font-size:16px;color:#1a1a1a;line-height:1.6;font-style:italic;">&ldquo;${ex.said}&rdquo;</p>
    <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#C4451C;">Ripple hands back:</p>
    <p style="margin:0;font-size:15px;color:#374151;line-height:1.7;">${ex.back.map((b) => `&#10003; ${b}`).join("<br/>")}</p>
  `)
  );
}

/** Get-into-the-app block (one-tap signed-in link when we have one). */
export function appBlock(v: TrialVars): string {
  return row(appAccessBlock(v), 8);
}

/** Quiet "or use the web version" link under the main CTA. */
export function webLink(v: TrialVars, label = "Or use Ripple on the web"): string {
  return row(secondaryButton(`${v.appUrl}/home`, label), 28);
}

export function button(href: string, label: string): string {
  return row(primaryButton(href, label), 28);
}

/** Assemble a variant: headline + body rows + signature, in the shared layout. */
export function variant(
  id: string,
  angle: string,
  subject: (v: TrialVars) => string,
  preheader: (v: TrialVars) => string,
  body: (v: TrialVars) => string
): EmailVariant {
  return {
    id,
    angle,
    subject,
    html: (v) =>
      trialLayout({
        content: `${body(v)}${keenanSignature()}`,
        unsubscribeUrl: v.unsubscribeUrl,
        preheader: preheader(v),
      }),
  };
}

/** Build a TrialEmailTemplate from variants; the first is the preview default. */
export function withVariants(variants: EmailVariant[]) {
  return { subject: variants[0].subject, html: variants[0].html, variants };
}
