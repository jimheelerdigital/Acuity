/**
 * Early Encouragement Email — Keep the Momentum
 *
 * Trigger: User has 2+ completed recordings AND first recording was
 *          at least 48 hours ago (habit forming across days, not a
 *          same-day burst). Only fires for users with < 5 recordings
 *          (above that, the first_insight email takes over).
 * Subject: "You've done two. Here's where it starts to click."
 * From: Keenan from Acuity <keenan@getacuity.io> (set centrally in sendTrialEmail)
 *
 * Fires once per user. NO CTA button, NO app/web link — this is
 * purely a warm reminder of why the habit pays off.
 */

import { escapeHtml } from "@/lib/escape-html";
import { keenanSignature, trialLayout , para } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";


export const keepMomentum: TrialEmailTemplate = {
  subject: () => "You\u2019ve done two. Here\u2019s where it starts to click.",
  html: (v: TrialVars) => {
    const rawFirst = (v.firstName ?? "").trim();
    const greeting = rawFirst && rawFirst !== "friend"
      ? `Hi ${escapeHtml(rawFirst)},`
      : "Hi there,";

    const content = `
      <tr>
        <td style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#1a1a1a;line-height:1.3;letter-spacing:-0.4px;">
            You\u2019ve done two. Here\u2019s where it starts to click.
          </h1>
        </td>
      </tr>
      ${para(greeting)}
      ${para(`You\u2019ve recorded two debriefs now. That\u2019s further than most people get.`)}
      ${para(`Here\u2019s the thing worth knowing: the value of Acuity isn\u2019t in any single debrief. It\u2019s in what shows up across them. One debrief is a snapshot. A handful is a pattern \u2014 the stuff you keep circling back to, the things that quietly run your week, the tasks you mention and then forget. Acuity is listening for that, and it gets sharper every time you talk.`)}
      ${para(`You\u2019re two in. A few more and it starts handing real things back to you \u2014 patterns you didn\u2019t notice, tasks you\u2019d have lost, a clearer read on where your time and energy actually go.`)}
      ${para(`That\u2019s why the habit matters. Not because more is better for its own sake, but because the picture only forms when there\u2019s enough to see. The good news is it asks almost nothing of you \u2014 a few spoken minutes, whenever it suits you. No writing, no blank page.`)}
      ${para(`Keep going. It compounds.`)}
      ${keenanSignature()}
    `;

    return trialLayout({
      content,
      unsubscribeUrl: v.unsubscribeUrl,
      preheader: "The pattern doesn\u2019t show up in one debrief. It shows up across them.",
    });
  },
};
