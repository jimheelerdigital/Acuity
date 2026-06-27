/**
 * Milestone Email — 50 Recordings
 *
 * Testimonial ask (no review button — story request instead).
 * Reply-to: keenan@getacuity.io.
 */

import { escapeHtml } from "@/lib/escape-html";
import { keenanSignature, trialLayout , para } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";


export const milestone50: TrialEmailTemplate = {
  subject: () => "what\u2019s it done for you?",
  html: (v: TrialVars) => {
    const rawFirst = (v.firstName ?? "").trim();
    const greeting = rawFirst && rawFirst !== "friend"
      ? `Hi ${escapeHtml(rawFirst)},`
      : "Hi there,";

    const content = `
      <tr>
        <td style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#1a1a1a;line-height:1.3;letter-spacing:-0.4px;">
            what\u2019s it done for you?
          </h1>
        </td>
      </tr>
      ${para(greeting)}
      ${para(`Fifty debriefs. You\u2019re officially one of our most committed users \u2014 the kind of person we built this for.`)}
      ${para(`Which is exactly why I want to ask: what has Acuity actually done for you? Has it helped you notice something you\u2019d been missing? Stay on top of things you used to drop? See a pattern that changed how you do things?`)}
      ${para(`I\u2019m asking partly because I love hearing it, and partly because real stories from real users are how we help other people understand what this is. If you\u2019re open to it, just hit reply and tell me \u2014 even a sentence or two. And if it\u2019s alright to share what you say (anonymously or with your first name, your call), that would mean the world.`)}
      ${para(`Genuinely grateful you\u2019re here.`)}
      ${keenanSignature()}
    `;

    return trialLayout({
      content,
      unsubscribeUrl: v.unsubscribeUrl,
      preheader: "Fifty debriefs in \u2014 I\u2019d love to hear your story.",
    });
  },
};
