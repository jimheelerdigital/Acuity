import { escapeHtml } from "@/lib/escape-html";
import { trialButton, trialCard, trialLayout } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";

/**
 * Day-14 trial-ended transactional email. v1.1 free-tier redesign:
 * the post-trial experience changed — recording stays free forever,
 * only the intelligence layer (themes, weekly insights, Life Matrix)
 * is PRO. This email tells the user the new shape so they don't
 * assume their journal is gone.
 *
 * Trigger: trialEndsAt has just passed (within ~24h, gated in the
 * orchestrator's nextEmailForUser branch). Idempotent via the
 * existing TrialEmailLog (userId, emailKey) unique constraint —
 * no User.day14EmailSentAt column needed (matches the pattern of
 * the other 14 trial-sequence emails).
 *
 * Option C compliance: no "$", no "/mo", no "Subscribe", no
 * "Upgrade now". CTA reads "Continue on web to unlock" and routes
 * to /upgrade?src=trial_end_email so post-launch attribution can
 * separate this surface from in-app paywall hits.
 */
export const trialEndedDay14: TrialEmailTemplate = {
  subject: () => "Your Acuity trial just ended",
  html: (v: TrialVars) => {
    const name = escapeHtml(v.firstName);
    const appUrl = escapeHtml(v.appUrl);
    const upgradeUrl = `${appUrl}/upgrade?src=trial_end_email`;

    const content = `
      <tr>
        <td style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#FFFFFF;line-height:1.3;letter-spacing:-0.4px;">
            Your Acuity trial just ended, ${name}.
          </h1>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:20px;">
          <p style="margin:0;font-size:16px;color:#D8D8E8;line-height:1.7;">
            Acuity isn&rsquo;t going anywhere. Recording stays free forever &mdash; you can keep capturing your daily debriefs and we&rsquo;ll keep transcribing them.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:24px;">
          ${trialCard(`
            <p style="margin:0 0 12px 0;font-size:14px;font-weight:700;color:#FFFFFF;letter-spacing:0.2px;text-transform:uppercase;">
              What changed
            </p>
            <p style="margin:0;font-size:15px;color:#D8D8E8;line-height:1.7;">
              New entries land as transcripts and a short summary. Themes, weekly insights, and your Life Matrix are on Pro &mdash; everything you generated during your trial stays where you left it.
            </p>
          `)}
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:8px;">
          ${trialButton(upgradeUrl, "Continue on web to unlock")}
        </td>
      </tr>
      <tr>
        <td style="padding-top:24px;padding-bottom:24px;">
          <p style="margin:0;font-size:15px;color:#A0A0B8;line-height:1.7;">
            Questions or feedback? Hit reply &mdash; I read every one.
          </p>
        </td>
      </tr>
      <tr>
        <td>
          <p style="margin:0;font-size:16px;color:#FFFFFF;font-weight:600;">&mdash; Keenan</p>
        </td>
      </tr>
    `;

    return trialLayout({
      content,
      unsubscribeUrl: v.unsubscribeUrl,
      preheader: "Recording stays free. The intelligence layer is on Pro.",
    });
  },
};
