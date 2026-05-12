import { escapeHtml } from "@/lib/escape-html";
import { trialButton, trialCard, trialLayout } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";

export const lifeMatrixReveal: TrialEmailTemplate = {
  subject: () => "You haven't seen this part of Acuity yet",
  html: (v: TrialVars) => {
    const name = escapeHtml(v.firstName);
    const appUrl = escapeHtml(v.appUrl);
    const lifeMatrixUrl = `${appUrl}/insights/state-of-me`;

    const content = `
      <tr>
        <td style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#FFFFFF;line-height:1.3;letter-spacing:-0.4px;">
            ${name}, you haven't seen this part of Acuity yet.
          </h1>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:20px;">
          <p style="margin:0;font-size:16px;color:#D8D8E8;line-height:1.7;">
            It's called the Life Matrix. Six life domains, each as a colored ring. It shows which parts of your life you're actively talking about — and which parts you're not.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:24px;">
          ${trialCard(`
            <p style="margin:0;font-size:15px;color:#D8D8E8;line-height:1.7;">
              This is probably the most uncomfortable part of the product. It shows the stuff you haven't said in 10 days.
            </p>
          `)}
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:20px;">
          <p style="margin:0;font-size:16px;color:#D8D8E8;line-height:1.7;">
            Most people open it and immediately see one ring that's almost empty. That's the part of your life the rest of your life is crowding out.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:28px;">
          <p style="margin:0;font-size:16px;color:#D8D8E8;line-height:1.7;">
            Go look at yours.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:8px;">
          ${trialButton(lifeMatrixUrl, "Open my Life Matrix")}
        </td>
      </tr>
      <tr>
        <td>
          <p style="margin:0;font-size:16px;color:#FFFFFF;font-weight:600;">— Jim &amp; Keenan</p>
        </td>
      </tr>
    `;

    return trialLayout({
      content,
      unsubscribeUrl: v.unsubscribeUrl,
      preheader: "The Life Matrix shows the stuff you haven't said in 10 days.",
    });
  },
};
