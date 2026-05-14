/**
 * Waitlist drip email campaign — emails 2–5
 * Email 1 (confirmation) is sent immediately in the waitlist signup route.
 *
 * SECURITY_AUDIT.md §S8: every user-supplied value is routed through
 * `escapeHtml` before interpolation. Each `email2..5` function accepts
 * `name: string` and escapes it at the top before any template call
 * embeds it — if you add new interpolations of user content to these
 * templates, escape them the same way.
 */

import { escapeHtml } from "@/lib/escape-html";

function layout(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Acuity</title>
</head>
<body style="margin:0;padding:0;background-color:#0A0A0F;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0A0A0F;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:12px;">
              <img src="https://www.getacuity.io/AcuityLogo.png" alt="Acuity" width="48" height="48" />
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:40px;">
              <p style="margin:0;font-size:13px;color:#A0A0B8;letter-spacing:0.5px;">
                Debrief daily. See your life clearly.
              </p>
            </td>
          </tr>

          ${content}

          <!-- Purple Divider -->
          <tr>
            <td style="padding:32px 0 24px;">
              <div style="height:2px;background:linear-gradient(to right,transparent,#7C5CFC,transparent);"></div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-bottom:16px;">
              <p style="margin:0;font-size:13px;color:#A0A0B8;">
                <a href="https://getacuity.io" style="color:#7C5CFC;text-decoration:none;font-weight:600;">getacuity.io</a>
                <span style="margin:0 10px;color:#2A2A3A;">|</span>
                <a href="https://getacuity.io/unsubscribe" style="color:#A0A0B8;text-decoration:none;">Unsubscribe</a>
              </p>
            </td>
          </tr>
          <tr>
            <td align="center">
              <p style="margin:0;font-size:11px;color:#A0A0B8;opacity:0.6;">
                We never share your data. Audio deleted within 24hrs.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function bullet(text: string): string {
  return `<tr>
  <td style="padding:10px 0;font-size:15px;color:#A0A0B8;line-height:1.6;">
    <span style="color:#7C5CFC;font-weight:bold;margin-right:10px;font-size:18px;">&#8226;</span>
    ${text}
  </td>
</tr>`;
}

/* ─────────────────────────────────────────
   Email 2 — Day 2: What Acuity actually does
   ───────────────────────────────────────── */

function email2(rawName: string): string {
  const name = escapeHtml(rawName);
  return layout(`
          <!-- Headline -->
          <tr>
            <td style="padding-bottom:24px;">
              <h1 style="margin:0;font-size:28px;font-weight:800;color:#FFFFFF;letter-spacing:-0.5px;line-height:1.3;">
                ${name}, here's how Acuity actually works.
              </h1>
            </td>
          </tr>

          <tr>
            <td style="padding-bottom:24px;">
              <p style="margin:0;font-size:16px;color:#A0A0B8;line-height:1.7;">
                Every night, you open Acuity and talk for 60 seconds. No prompts, no structure — just whatever's on your mind. Then AI does the rest.
              </p>
            </td>
          </tr>

          <!-- The Core Loop -->
          <tr>
            <td style="padding-bottom:24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:#13131F;border-radius:12px;padding:32px;">
                    <p style="margin:0 0 20px 0;font-size:16px;color:#FFFFFF;font-weight:700;">
                      The 60-second core loop:
                    </p>
                    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
                      ${bullet("You talk for 60 seconds — about your day, your worries, your wins")}
                      ${bullet("AI extracts your tasks, goals, mood, and themes automatically")}
                      ${bullet("Everything is organized into a clean dashboard while you sleep")}
                      ${bullet("Every Sunday, you get a weekly narrative report — written by AI, about your week")}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- What the output looks like -->
          <tr>
            <td style="padding-bottom:24px;">
              <p style="margin:0 0 16px 0;font-size:16px;color:#FFFFFF;font-weight:700;">
                What you'll see after a single 60-second debrief:
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding-bottom:8px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:#13131F;border-radius:12px;padding:20px;border-left:4px solid #7C5CFC;">
                    <p style="margin:0 0 4px 0;font-size:11px;color:#7C5CFC;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Tasks extracted</p>
                    <p style="margin:0;font-size:14px;color:#A0A0B8;line-height:1.6;">
                      &#9745; Follow up with Sarah<br/>
                      &#9744; Review the Q2 proposal<br/>
                      &#9744; Book dentist appointment
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:8px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:#13131F;border-radius:12px;padding:20px;border-left:4px solid #7C5CFC;">
                    <p style="margin:0 0 4px 0;font-size:11px;color:#7C5CFC;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Mood</p>
                    <p style="margin:0;font-size:14px;color:#A0A0B8;">Tired but optimistic</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:#13131F;border-radius:12px;padding:20px;border-left:4px solid #7C5CFC;">
                    <p style="margin:0 0 4px 0;font-size:11px;color:#7C5CFC;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Goal detected</p>
                    <p style="margin:0;font-size:14px;color:#A0A0B8;">"Launch the MVP by end of month"</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding-bottom:8px;">
              <p style="margin:0;font-size:16px;color:#A0A0B8;line-height:1.7;">
                All from 60 seconds of talking. No typing. No effort. Just your voice.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:0;">
              <p style="margin:0;font-size:16px;color:#FFFFFF;font-weight:600;">
                — The Acuity Team
              </p>
            </td>
          </tr>
  `);
}

/* ─────────────────────────────────────────
   Email 3 — Day 5: The weekly report
   ───────────────────────────────────────── */

function email3(rawName: string): string {
  const name = escapeHtml(rawName);
  return layout(`
          <tr>
            <td style="padding-bottom:24px;">
              <h1 style="margin:0;font-size:28px;font-weight:800;color:#FFFFFF;letter-spacing:-0.5px;line-height:1.3;">
                ${name}, this is the feature people can't stop talking about.
              </h1>
            </td>
          </tr>

          <tr>
            <td style="padding-bottom:24px;">
              <p style="margin:0;font-size:16px;color:#A0A0B8;line-height:1.7;">
                Every Sunday morning, Acuity sends you a 400-word narrative about your week. Not bullet points. Not a summary. A <span style="color:#FFFFFF;font-weight:600;">story about your life</span> — written by AI from your own voice entries.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding-bottom:24px;">
              <p style="margin:0;font-size:16px;color:#A0A0B8;line-height:1.7;">
                It covers your mood arc (how your emotional state moved through the week), the themes that dominated your thinking, your wins, your blind spots, and the patterns you couldn't see while you were living it.
              </p>
            </td>
          </tr>

          <!-- Quote -->
          <tr>
            <td style="padding-bottom:24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:#13131F;border-radius:12px;padding:28px;border-left:4px solid #7C5CFC;">
                    <p style="margin:0 0 12px 0;font-size:18px;color:#FFFFFF;font-style:italic;line-height:1.6;">
                      "It reads like a therapist's notes about my life. Except I never had to explain anything — it already knew."
                    </p>
                    <p style="margin:0;font-size:13px;color:#A0A0B8;">
                      — Beta user, week 3
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- What the report includes -->
          <tr>
            <td style="padding-bottom:24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:#13131F;border-radius:12px;padding:32px;">
                    <p style="margin:0 0 20px 0;font-size:16px;color:#FFFFFF;font-weight:700;">
                      Every weekly report includes:
                    </p>
                    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
                      ${bullet("Your mood arc — how your emotional state shifted day to day")}
                      ${bullet("Top themes — what dominated your thinking this week")}
                      ${bullet("Blind spots — what the AI noticed that you didn't")}
                      ${bullet("Goal progress — what moved forward, what stalled")}
                      ${bullet("Life Matrix scores — 6 areas of your life, tracked over time")}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding-bottom:24px;">
              <p style="margin:0;font-size:16px;color:#A0A0B8;line-height:1.7;">
                You'll get your first weekly report within 7 days of joining. The longer you use it, the smarter it gets. By week 12, you'll have a detailed map of your inner life that no therapist, coach, or journal could match.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding-bottom:8px;">
              <p style="margin:0;font-size:16px;color:#A0A0B8;line-height:1.7;">
                We can't wait for you to read your first one.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:0;">
              <p style="margin:0;font-size:16px;color:#FFFFFF;font-weight:600;">
                — The Acuity Team
              </p>
            </td>
          </tr>
  `);
}

/* ─────────────────────────────────────────
   Email 4 — Day 10: Urgency + founding member pricing
   ───────────────────────────────────────── */

function email4(rawName: string): string {
  const name = escapeHtml(rawName);
  return layout(`
          <tr>
            <td style="padding-bottom:24px;">
              <h1 style="margin:0;font-size:28px;font-weight:800;color:#FFFFFF;letter-spacing:-0.5px;line-height:1.3;">
                ${name}, you're closer than you think.
              </h1>
            </td>
          </tr>

          <tr>
            <td style="padding-bottom:24px;">
              <p style="margin:0;font-size:16px;color:#A0A0B8;line-height:1.7;">
                Acuity is live — and as one of our earliest signups, you've got a head start most people won't get.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding-bottom:24px;">
              <p style="margin:0;font-size:16px;color:#A0A0B8;line-height:1.7;">
                As a founding member, you're getting something that won't be available much longer:
              </p>
            </td>
          </tr>

          <!-- Founding member benefits -->
          <tr>
            <td style="padding-bottom:24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:#13131F;border-radius:12px;padding:32px;">
                    <p style="margin:0 0 20px 0;font-size:16px;color:#FFFFFF;font-weight:700;">
                      Founding member benefits:
                    </p>
                    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
                      ${bullet("30-day free trial — no credit card required to start")}
                      ${bullet("Lock in $12.99/month — the lowest price Acuity will ever be")}
                      ${bullet("This price goes up after the first 100 members. Your rate stays forever.")}
                      ${bullet("Founding Member status — permanently on your account")}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Price highlight -->
          <tr>
            <td style="padding-bottom:24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:#13131F;border-radius:12px;padding:24px;border-left:4px solid #7C5CFC;">
                    <p style="margin:0;font-size:16px;color:#FFFFFF;line-height:1.7;">
                      <span style="font-size:32px;font-weight:800;">$12.99</span><span style="color:#A0A0B8;">/month</span>
                      <br/>
                      <span style="font-size:14px;color:#A0A0B8;">Founding member pricing — locked in forever. Goes up after the first 100.</span>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding-bottom:8px;">
              <p style="margin:0;font-size:16px;color:#A0A0B8;line-height:1.7;">
                Ready to start? Your account is waiting.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:0;">
              <p style="margin:0;font-size:16px;color:#FFFFFF;font-weight:600;">
                — The Acuity Team
              </p>
            </td>
          </tr>
  `);
}

/* ─────────────────────────────────────────
   Email 5 — Day 14: Doors opening soon
   ───────────────────────────────────────── */

function email5(rawName: string): string {
  const name = escapeHtml(rawName);
  return layout(`
          <tr>
            <td style="padding-bottom:24px;">
              <h1 style="margin:0;font-size:28px;font-weight:800;color:#FFFFFF;letter-spacing:-0.5px;line-height:1.3;">
                ${name}, your founding member spot is still open.
              </h1>
            </td>
          </tr>

          <tr>
            <td style="padding-bottom:24px;">
              <p style="margin:0;font-size:16px;color:#A0A0B8;line-height:1.7;">
                Acuity is live and your founding member spot is still reserved. Here's a quick reminder of what's waiting for you.
              </p>
            </td>
          </tr>

          <!-- Recap card -->
          <tr>
            <td style="padding-bottom:24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:#13131F;border-radius:12px;padding:32px;">
                    <p style="margin:0 0 20px 0;font-size:16px;color:#FFFFFF;font-weight:700;">
                      What you're about to get access to:
                    </p>
                    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
                      ${bullet("A 60-second nightly debrief that captures everything on your mind")}
                      ${bullet("AI that extracts your tasks, tracks your goals, and logs your mood")}
                      ${bullet("A weekly narrative report that reads like a story about your life")}
                      ${bullet("A Life Matrix that scores 6 areas of your life and tracks them over time")}
                      ${bullet("Pattern detection that reveals what you can't see from the inside")}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Founding member reminder -->
          <tr>
            <td style="padding-bottom:24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:#13131F;border-radius:12px;padding:24px;border-left:4px solid #7C5CFC;">
                    <p style="margin:0;font-size:16px;color:#FFFFFF;line-height:1.7;">
                      As a founding member, you get a 30-day free trial and lock in $12.99/month — the lowest price Acuity will ever be.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding-bottom:24px;">
              <p style="margin:0;font-size:16px;color:#A0A0B8;line-height:1.7;">
                We built this for people exactly like you — people who think too much, carry too much, and never have a system that actually sticks.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding-bottom:24px;">
              <p style="margin:0;font-size:16px;color:#FFFFFF;line-height:1.7;font-weight:600;">
                Your first debrief takes 60 seconds. Start today.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding-bottom:0;">
              <p style="margin:0;font-size:16px;color:#FFFFFF;font-weight:600;">
                — The Acuity Team
              </p>
            </td>
          </tr>
  `);
}

/* ─────────────────────────────────────────
   Drip schedule config + public API
   ───────────────────────────────────────── */

export interface DripEmail {
  step: number;
  daysAfterSignup: number;
  subject: string;
  buildHtml: (name: string) => string;
}

export const DRIP_SEQUENCE: DripEmail[] = [
  // Step 1 is the immediate confirmation email (handled in the waitlist route)
  {
    step: 2,
    daysAfterSignup: 2,
    subject: "While you wait — here's what Acuity actually does",
    buildHtml: email2,
  },
  {
    step: 3,
    daysAfterSignup: 5,
    subject: "The feature our beta users can't stop talking about",
    buildHtml: email3,
  },
  {
    step: 4,
    daysAfterSignup: 10,
    subject: "Your founding member benefits, {name}",
    buildHtml: email4,
  },
  {
    step: 5,
    daysAfterSignup: 14,
    subject: "Your founding member spot is still open, {name}",
    buildHtml: email5,
  },
];
