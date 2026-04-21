/**
 * Weekly digest email. Sent by the Sunday Inngest cron to users who
 * journaled at least 3 times in the past week. Quiet if not.
 *
 * Content shape:
 *   - Session count + streak status header
 *   - Top 3 themes (with optional sentiment tint)
 *   - 1–2 observations (from UserInsight)
 *   - Up to 3 goal updates (progress movers + recent activity)
 *   - CTA → /insights
 *
 * Charts-as-PNG were requested in the spec. Skipped this sprint — a
 * static mood bar or theme chart requires @vercel/og or node-canvas,
 * neither of which is in the bundle. Shipped as a textual mood
 * summary; document as partial. Adding OG-image rendering is ~1hr
 * of follow-up.
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

export interface WeeklyDigestInput {
  to: string;
  name: string | null;
  userId: string;
  weekStartISO: string;
  weekEndISO: string;
  entryCount: number;
  streak: number; // currentStreak as of send time
  moodSummary: string; // e.g. "Mostly steady — 4 good, 2 neutral days"
  topThemes: Array<{ name: string; mentions: number }>;
  observations: string[]; // up to 2
  goalUpdates: Array<{ title: string; progress: number; delta?: number }>; // up to 3
  /** Optional link to the just-generated weekly report detail. */
  reportUrl?: string;
}

export async function sendWeeklyDigest(input: WeeklyDigestInput) {
  const resend = getResendClient();
  if (!resend) return;

  const firstName = input.name?.split(" ")[0] ?? "there";
  const unsubUrl = `${appUrl()}/api/emails/unsubscribe?token=${signUnsubscribeToken(
    input.userId,
    "weekly"
  )}`;
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  const range = `${fmt(input.weekStartISO)} – ${fmt(input.weekEndISO)}`;

  const parts: string[] = [];

  // Header section — session count + streak.
  parts.push(
    section(
      "Your week at a glance",
      `<p style="margin:0;">Hi ${escapeHtml(firstName)} — you recorded ${input.entryCount} debrief${input.entryCount === 1 ? "" : "s"} this week${
        input.streak >= 2 ? `, and you're on a ${input.streak}-day streak 🔥` : "."
      }</p>
       <p style="margin:8px 0 0;color:#A1A1AA;">${escapeHtml(input.moodSummary)}</p>`
    )
  );

  if (input.topThemes.length > 0) {
    const chips = input.topThemes
      .slice(0, 3)
      .map(
        (t) =>
          `<span style="display:inline-block;background:#27272A;color:#E4E4E7;border-radius:999px;padding:4px 10px;font-size:12px;margin-right:6px;margin-top:4px;">${escapeHtml(t.name)} · ${t.mentions}</span>`
      )
      .join("");
    parts.push(section("Top themes", chips));
  }

  if (input.observations.length > 0) {
    const bullets = input.observations
      .slice(0, 2)
      .map(
        (o) =>
          `<li style="margin:6px 0;list-style:none;padding-left:16px;position:relative;">
             <span style="position:absolute;left:0;color:#A78BFA;">→</span>
             ${escapeHtml(o)}
           </li>`
      )
      .join("");
    parts.push(section("What we noticed", `<ul style="padding:0;margin:0;">${bullets}</ul>`));
  }

  if (input.goalUpdates.length > 0) {
    const rows = input.goalUpdates
      .slice(0, 3)
      .map((g) => {
        const bar = `<div style="height:4px;background:#27272A;border-radius:2px;margin-top:4px;">
          <div style="height:4px;background:#7C3AED;border-radius:2px;width:${Math.max(0, Math.min(100, g.progress))}%;"></div>
        </div>`;
        const deltaLabel =
          typeof g.delta === "number" && g.delta !== 0
            ? `<span style="color:${g.delta > 0 ? "#5DCAA5" : "#F59E0B"};margin-left:8px;font-size:11px;">${g.delta > 0 ? "↑" : "↓"} ${Math.abs(g.delta)}%</span>`
            : "";
        return `<div style="margin:10px 0;">
          <p style="margin:0;color:#FAFAFA;font-size:13px;">${escapeHtml(g.title)}${deltaLabel}</p>
          ${bar}
        </div>`;
      })
      .join("");
    parts.push(section("Goals this week", rows));
  }

  const html = digestLayout({
    title: `Your week in review`,
    preheader: `${input.entryCount} entries · ${input.topThemes.map((t) => t.name).slice(0, 3).join(", ")}`,
    dateRange: range,
    sectionsHtml: parts.join("\n"),
    unsubscribeUrl: unsubUrl,
    kindLabel: "weekly summary",
    ctaLabel: input.reportUrl ? "View full report" : "Open Insights",
    ctaUrl: input.reportUrl ?? `${appUrl()}/insights`,
  });

  await resend.emails.send({
    from: EMAIL_FROM,
    to: input.to,
    subject: `Your week in review · ${range}`,
    html,
    // RFC 8058 one-click unsubscribe (Google + Microsoft reward senders
    // who expose this). List-Unsubscribe-Post tells the mail client the
    // POST is safe.
    headers: {
      "List-Unsubscribe": `<${unsubUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
}
