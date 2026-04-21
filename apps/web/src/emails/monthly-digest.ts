/**
 * Monthly reflection email. Sent on the 1st of the month (in user's
 * local timezone, via the hourly Inngest scanner) to users with ≥5
 * entries in the prior month. Big-picture, less frequent than the
 * weekly — think "scan the changes" rather than "relive the week".
 */

import { getResendClient } from "@/lib/resend";
import { signUnsubscribeToken } from "@/lib/email-tokens";

import {
  appUrl,
  digestLayout,
  escapeHtml,
  section,
} from "./digest-layout";

const EMAIL_FROM = process.env.EMAIL_FROM ?? "noreply@getacuity.io";

export interface MonthlyDigestInput {
  to: string;
  name: string | null;
  userId: string;
  monthLabel: string; // e.g. "March 2026"
  entryCount: number;
  longestStreak: number;
  moodDistribution: string; // e.g. "12 good · 8 steady · 3 low"
  lifeMatrixDeltas: Array<{ area: string; delta: number }>; // positive/negative point change vs last month
  topThemes: Array<{ name: string; mentions: number }>;
  goalsCompleted: number;
  goalsActive: number;
}

export async function sendMonthlyDigest(input: MonthlyDigestInput) {
  const resend = getResendClient();
  if (!resend) return;

  const firstName = input.name?.split(" ")[0] ?? "there";
  const unsubUrl = `${appUrl()}/api/emails/unsubscribe?token=${signUnsubscribeToken(
    input.userId,
    "monthly"
  )}`;

  const parts: string[] = [];

  parts.push(
    section(
      "This month, in numbers",
      `<p style="margin:0;">${escapeHtml(firstName)} — ${input.entryCount} entr${input.entryCount === 1 ? "y" : "ies"}, longest streak ${input.longestStreak} day${input.longestStreak === 1 ? "" : "s"}.</p>
       <p style="margin:8px 0 0;color:#A1A1AA;">${escapeHtml(input.moodDistribution)}</p>`
    )
  );

  if (input.lifeMatrixDeltas.length > 0) {
    const rows = input.lifeMatrixDeltas
      .filter((d) => d.delta !== 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 4)
      .map((d) => {
        const up = d.delta > 0;
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;">
          <span style="color:#E4E4E7;font-size:13px;">${escapeHtml(d.area)}</span>
          <span style="color:${up ? "#5DCAA5" : "#F59E0B"};font-size:13px;font-weight:600;">${up ? "↑" : "↓"} ${Math.abs(d.delta)}</span>
        </div>`;
      })
      .join("");
    if (rows) parts.push(section("Life Matrix movement", rows));
  }

  if (input.topThemes.length > 0) {
    const chips = input.topThemes
      .slice(0, 5)
      .map(
        (t) =>
          `<span style="display:inline-block;background:#27272A;color:#E4E4E7;border-radius:999px;padding:4px 10px;font-size:12px;margin-right:6px;margin-top:4px;">${escapeHtml(t.name)} · ${t.mentions}</span>`
      )
      .join("");
    parts.push(section("What you wrote about most", chips));
  }

  parts.push(
    section(
      "Goals",
      `<p style="margin:0;">${input.goalsCompleted} complete, ${input.goalsActive} active.</p>`
    )
  );

  const html = digestLayout({
    title: `Your ${input.monthLabel} reflection`,
    preheader: `${input.entryCount} entries · longest streak ${input.longestStreak}d`,
    dateRange: input.monthLabel,
    sectionsHtml: parts.join("\n"),
    unsubscribeUrl: unsubUrl,
    kindLabel: "monthly reflection",
    ctaLabel: "Open Insights",
    ctaUrl: `${appUrl()}/insights`,
  });

  await resend.emails.send({
    from: EMAIL_FROM,
    to: input.to,
    subject: `Your ${input.monthLabel} reflection`,
    html,
    headers: {
      "List-Unsubscribe": `<${unsubUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
}
