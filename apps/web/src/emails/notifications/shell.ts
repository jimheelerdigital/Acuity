/**
 * Internal shell helpers for notification emails. Reuses the trial
 * email HTML shell (trialLayout/trialButton) so we don't rebuild the
 * outer table, logo, or width. Every notification body is:
 *
 *   intro paragraphs → single CTA button (vars.appUrl) → footer with
 *   "Manage notifications", "Turn this off", and an unsubscribe link.
 *
 * trialLayout already renders an unsubscribe link in its own footer
 * using `unsubscribeUrl`, so we pass vars.unsubscribeUrl straight
 * through to it and add the category-specific links above it.
 */

import { escapeHtml } from "@/lib/escape-html";
import { trialButton, trialLayout } from "../trial/layout";
import type { NotifVars } from "./types";

/** Standard body paragraph row. Caller passes already-escaped HTML. */
export function para(html: string): string {
  return `<tr><td style="padding-bottom:20px;"><p style="margin:0;font-size:16px;color:#374151;line-height:1.7;">${html}</p></td></tr>`;
}

/** Greeting line. firstName is escaped here. */
export function greeting(firstName: string): string {
  const name = escapeHtml(firstName);
  return `<tr><td style="padding-bottom:20px;"><p style="margin:0;font-size:16px;color:#374151;line-height:1.7;">Hi ${name},</p></td></tr>`;
}

/**
 * Notification-specific footer: manage + per-category opt-out links.
 * Sits above the trialLayout footer (which carries the global
 * unsubscribe link). All hrefs escaped.
 */
function notifFooter(vars: NotifVars): string {
  const manageUrl = escapeHtml(vars.manageUrl);
  const categoryOptOutUrl = escapeHtml(vars.categoryOptOutUrl);
  return `
    <tr>
      <td align="center" style="padding-top:32px;">
        <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.7;">
          <a href="${manageUrl}" style="color:#6b7280;text-decoration:underline;">Manage notifications</a>
          <span style="margin:0 8px;color:#E5E7EB;">&middot;</span>
          <a href="${categoryOptOutUrl}" style="color:#6b7280;text-decoration:underline;">Turn this off</a>
        </p>
      </td>
    </tr>`;
}

/**
 * Assemble a full notification email: intro rows + single CTA button
 * + notification footer, wrapped in trialLayout (which adds the
 * global unsubscribe link via vars.unsubscribeUrl).
 */
export function renderShell(opts: {
  bodyRows: string;
  ctaLabel: string;
  vars: NotifVars;
  preheader: string;
}): string {
  const { bodyRows, ctaLabel, vars, preheader } = opts;
  const appUrl = escapeHtml(vars.appUrl);

  const content = `
    ${bodyRows}
    <tr>
      <td style="padding-bottom:8px;">
        ${trialButton(appUrl, ctaLabel)}
      </td>
    </tr>
    ${notifFooter(vars)}
  `;

  return trialLayout({
    content,
    unsubscribeUrl: vars.unsubscribeUrl,
    preheader,
  });
}
