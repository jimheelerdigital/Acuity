import { inngest } from "@/inngest/client";

/**
 * Stripe webhook health check (every 6h). Detects a silently-disabled or
 * broken Stripe webhook endpoint — the failure mode behind the 2026-06-12
 * incident, where the endpoint was auto-disabled by Stripe (its www URL began
 * 308-redirecting to the apex and Stripe won't follow redirects), and ~7 weeks
 * of subscription lifecycle events went unprocessed before anyone noticed.
 *
 * Alerts the cofounders (Slack + email) if no Stripe event has been recorded
 * (StripeEvent.processedAt) in the last 24h. In a live app with daily
 * subscription activity, a 24h gap means deliveries have stopped.
 *
 * Reuses the existing Resend + founder-Slack infra (no new env). Source:
 * apps/web/src/inngest/functions/rls-audit.ts pattern.
 * See docs/incidents/2026-06-12-stripe-webhook-down.md.
 */

const FOUNDER_RECIPIENTS = [
  "keenan@heelerdigital.com",
  "jim@heelerdigital.com",
];
const EMAIL_FROM = "hello@getacuity.io";
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export const stripeWebhookHealthFn = inngest.createFunction(
  {
    id: "stripe-webhook-health-check",
    name: "Stripe webhook health check (6h)",
    triggers: [{ cron: "0 */6 * * *" }],
    retries: 1,
  },
  async ({ step }) => {
    const check = await step.run("check-last-stripe-event", async () => {
      const { prisma } = await import("@/lib/prisma");
      const agg = await prisma.stripeEvent.aggregate({
        _max: { processedAt: true },
      });
      const last = agg._max.processedAt;
      const ageMs = last ? Date.now() - last.getTime() : null;
      return {
        last: last ? last.toISOString() : null,
        ageHours: ageMs == null ? null : Math.round(ageMs / 3_600_000),
        stale: ageMs == null || ageMs > STALE_THRESHOLD_MS,
      };
    });

    if (!check.stale) {
      return { ok: true, lastEvent: check.last, ageHours: check.ageHours };
    }

    await step.run("alert-founders", async () => {
      const detail = check.last
        ? `Last processed Stripe event was ${check.ageHours}h ago (${check.last}).`
        : "No Stripe events have ever been recorded.";
      const action =
        "Check https://dashboard.stripe.com/webhooks — confirm the endpoint is ENABLED and points at https://getacuity.io/api/stripe/webhook (apex, NO www — www 308-redirects and Stripe won't follow it).";

      // Slack (founder webhook), if configured — best-effort.
      const slackUrl = process.env.SLACK_FOUNDER_WEBHOOK_URL;
      if (slackUrl) {
        try {
          await fetch(slackUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: `🚨 Stripe webhook appears DOWN. ${detail} Subscription lifecycle events aren't being processed. ${action}`,
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
          subject: "[Ripple] 🚨 Stripe webhook appears DOWN (no events in >24h)",
          html: `
<div style="font-family:-apple-system,system-ui,sans-serif;max-width:560px">
<h2 style="margin:0 0 12px;color:#b91c1c">Stripe webhook health alert</h2>
<p>${detail}</p>
<p>In a live app this means subscription lifecycle events — payment failures,
cancellations, renewals, dunning — are <strong>not being processed</strong>,
so our DB subscription state will drift from Stripe.</p>
<p><strong>Check:</strong> <a href="https://dashboard.stripe.com/webhooks">Stripe
&rarr; Developers &rarr; Webhooks</a> — confirm the endpoint is
<strong>enabled</strong> and points at
<code>https://getacuity.io/api/stripe/webhook</code> (apex,
<strong>no www</strong>).</p>
<p style="color:#71717A;font-size:12px;margin-top:24px">Sent by the
stripe-webhook-health-check Inngest cron. See
<code>docs/incidents/2026-06-12-stripe-webhook-down.md</code>.</p>
</div>`,
        });
      } else {
        // eslint-disable-next-line no-console
        console.error(
          "[stripe-webhook-health] STALE + RESEND_API_KEY missing — email NOT sent.",
          detail
        );
      }
      return { alerted: true };
    });

    return { ok: false, lastEvent: check.last, ageHours: check.ageHours };
  }
);
