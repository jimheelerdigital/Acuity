import { inngest } from "@/inngest/client";
import { safeLog } from "@/lib/safe-log";
import {
  assessWebhookHealth,
  collectWebhookHealthSignals,
  EXPECTED_WEBHOOK_URL,
  type WebhookFinding,
} from "@/lib/stripe-webhook-health";

/**
 * Stripe webhook health check (every 6h). Detects a silently-disabled or
 * broken Stripe webhook endpoint — the failure mode behind the 2026-06-12
 * incident, where the endpoint was auto-disabled by Stripe (its www URL began
 * 308-redirecting to the apex and Stripe won't follow redirects), and ~7 weeks
 * of subscription lifecycle events went unprocessed before anyone noticed.
 *
 * 2026-08-24 — this cron used to alert on "no StripeEvent processed in 24h".
 * At ~15 Stripe subscribers, quiet is the normal state: the ledger had 13
 * gaps over 24h in 90 days (longest 53.5h), so the cron emailed the founders
 * roughly 28 times, every one a false alarm, while the pipe was up. It now
 * asks Stripe directly — endpoint status, undelivered events, and events
 * Stripe recorded that never reached our ledger — and only emails when
 * Stripe itself confirms a failure. Quiet alone is a HEALTHY result.
 *
 * All the judgement lives in `lib/stripe-webhook-health` (pure + unit-tested);
 * this function is transport. Reuses the existing Resend + founder-Slack infra
 * (no new env). See docs/incidents/2026-06-12-stripe-webhook-down.md.
 */

const FOUNDER_RECIPIENTS = [
  "keenan@heelerdigital.com",
  "jim@heelerdigital.com",
];
const EMAIL_FROM = "hello@getacuity.io";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export const stripeWebhookHealthFn = inngest.createFunction(
  {
    id: "stripe-webhook-health-check",
    name: "Stripe webhook health check (6h)",
    triggers: [{ cron: "0 */6 * * *" }],
    retries: 1,
  },
  async ({ step }) => {
    const verdict = await step.run("assess-webhook-health", async () => {
      // A Stripe read failure is an ops error, not evidence of an outage.
      // Surfacing it through safeLog (→ Sentry) rather than the founder
      // inbox is the whole point of the 2026-08-24 rewrite: we only email
      // on a confirmed failure, never on an inference.
      const signals = await collectWebhookHealthSignals();
      return assessWebhookHealth(signals);
    });

    safeLog.info("stripe-webhook-health.assessed", {
      healthy: verdict.healthy,
      findings: verdict.findings.map((f) => f.kind),
      quietHours: verdict.quietHours,
      stripeEventCount: verdict.stripeEventCount,
      agedEventCount: verdict.agedEventCount,
    });

    if (verdict.healthy) {
      return {
        ok: true,
        quietHours: verdict.quietHours,
        stripeEventCount: verdict.stripeEventCount,
        summary: verdict.summary,
      };
    }

    await step.run("alert-founders", async () => {
      const line = (f: WebhookFinding) => `[${f.kind}] ${f.detail}`;
      const body = verdict.findings.map(line).join("\n");
      const action = `Check https://dashboard.stripe.com/webhooks — confirm the endpoint is ENABLED and points at ${EXPECTED_WEBHOOK_URL} (apex, NO www — www 308-redirects and Stripe won't follow it).`;

      // Slack (founder webhook), if configured — best-effort.
      const slackUrl = process.env.SLACK_FOUNDER_WEBHOOK_URL;
      if (slackUrl) {
        try {
          await fetch(slackUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: `🚨 Stripe webhook failure CONFIRMED by Stripe. ${verdict.summary}\n${body}\n${action}`,
            }),
          });
        } catch {
          /* non-fatal — email + Inngest logs are the backups */
        }
      }

      // Email (Resend), if configured.
      if (process.env.RESEND_API_KEY) {
        const { getResendClient } = await import("@/lib/resend");
        const resend = getResendClient();
        await resend.emails.send({
          from: EMAIL_FROM,
          to: FOUNDER_RECIPIENTS,
          subject: `[Ripple] 🚨 Stripe webhook failure confirmed (${verdict.findings
            .map((f) => f.kind)
            .join(", ")})`,
          html: `
<div style="font-family:-apple-system,system-ui,sans-serif;max-width:560px">
<h2 style="margin:0 0 12px;color:#b91c1c">Stripe webhook health alert</h2>
<p>${escapeHtml(verdict.summary)}</p>
<ul>${verdict.findings
            .map((f) => `<li><strong>${f.kind}</strong> — ${escapeHtml(f.detail)}</li>`)
            .join("")}</ul>
<p>This is <strong>not</strong> a quiet-period alert: every finding above is
confirmed against the live Stripe API (endpoint status, undelivered events, or
events Stripe recorded that never reached our ledger). Subscription lifecycle
events — payment failures, cancellations, renewals, dunning — may not be
reaching us, so our DB subscription state will drift from Stripe.</p>
<p><strong>Check:</strong> <a href="https://dashboard.stripe.com/webhooks">Stripe
&rarr; Developers &rarr; Webhooks</a> — confirm the endpoint is
<strong>enabled</strong> and points at
<code>${EXPECTED_WEBHOOK_URL}</code> (apex,
<strong>no www</strong>).</p>
<p style="color:#71717A;font-size:12px;margin-top:24px">Sent by the
stripe-webhook-health-check Inngest cron. See
<code>docs/incidents/2026-06-12-stripe-webhook-down.md</code>.</p>
</div>`,
        });
      } else {
        // eslint-disable-next-line no-console
        console.error(
          "[stripe-webhook-health] FAILURE CONFIRMED + RESEND_API_KEY missing — email NOT sent.",
          verdict.summary
        );
      }
      return { alerted: true };
    });

    return {
      ok: false,
      findings: verdict.findings.map((f) => f.kind),
      quietHours: verdict.quietHours,
      summary: verdict.summary,
    };
  }
);
