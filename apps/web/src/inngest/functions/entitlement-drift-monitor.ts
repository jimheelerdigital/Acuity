import { inngest } from "@/inngest/client";
import {
  classifyDrift,
  resolveProviderActive,
  type DriftFinding,
} from "@/lib/entitlement-drift";
import { safeLog } from "@/lib/safe-log";

/**
 * Entitlement drift MONITOR (daily). READ-ONLY.
 *
 * Re-validates every entitled/at-risk subscriber (PRO or PAST_DUE) against its
 * source-of-truth provider (Stripe / Apple App Store Server API / Google Play)
 * and alerts the cofounders on any user whose DB status disagrees. It writes
 * NOTHING — it's the zero-risk companion to the self-healing reconciler (which
 * will reuse `resolveProviderActive` + `classifyDrift` to CORRECT drift).
 *
 * Sibling to stripe-webhook-health-check: that detects the webhook pipe being
 * DOWN; this detects the DB/provider disagreements a missed event leaves behind
 * (incident 2026-08-05 emily = Apple active but DB FREE; l.connolly/kayleigh =
 * Stripe unpaid but DB PAST_DUE). Reuses the same Slack + Resend founder infra.
 */

const FOUNDER_RECIPIENTS = ["keenan@heelerdigital.com", "jim@heelerdigital.com"];
const EMAIL_FROM = "hello@getacuity.io";
const BATCH = 5; // provider-API concurrency cap (Apple/Google quotas)

export const entitlementDriftMonitorFn = inngest.createFunction(
  {
    id: "entitlement-drift-monitor",
    name: "Entitlement drift monitor (daily)",
    triggers: [{ cron: "0 5 * * *" }],
    retries: 1,
  },
  async ({ step }) => {
    const scan = await step.run("scan-for-drift", async () => {
      const { prisma } = await import("@/lib/prisma");
      const users = await prisma.user.findMany({
        where: { subscriptionStatus: { in: ["PRO", "PAST_DUE"] } },
        select: {
          id: true,
          email: true,
          subscriptionStatus: true,
          subscriptionSource: true,
          appleOriginalTransactionId: true,
          googlePurchaseToken: true,
          stripeSubscriptionId: true,
        },
      });

      const findings: DriftFinding[] = [];
      let checked = 0;
      let unreadable = 0; // provider read failed (skipped — never a demotion signal)

      for (let i = 0; i < users.length; i += BATCH) {
        const slice = users.slice(i, i + BATCH);
        const results = await Promise.all(
          slice.map(async (u) => {
            const provider = await resolveProviderActive(u);
            return { u, provider };
          })
        );
        for (const { u, provider } of results) {
          if (!provider.ok) {
            unreadable++;
            continue;
          }
          checked++;
          const drift = classifyDrift({
            source: u.subscriptionSource ?? "unknown",
            dbStatus: u.subscriptionStatus,
            providerActive: provider.active,
          });
          if (drift) {
            findings.push({
              userId: u.id,
              email: u.email,
              source: u.subscriptionSource ?? "unknown",
              dbStatus: u.subscriptionStatus,
              providerActive: provider.active,
              providerDetail: provider.detail,
              expected: drift.expected,
              severity: drift.severity,
              kind: drift.kind,
            });
          }
        }
      }

      findings.sort((a, b) => a.severity.localeCompare(b.severity));
      return { total: users.length, checked, unreadable, findings };
    });

    safeLog.info("entitlement-drift-monitor.scan", {
      total: scan.total,
      checked: scan.checked,
      unreadable: scan.unreadable,
      driftCount: scan.findings.length,
    });

    if (scan.findings.length === 0) {
      return { ok: true, ...scan, findings: scan.findings.length };
    }

    await step.run("alert-founders", async () => {
      const bySev = (s: string) => scan.findings.filter((f) => f.severity === s);
      const line = (f: DriftFinding) =>
        `[${f.severity}] ${f.kind} — ${f.email ?? f.userId} (${f.source}): DB=${f.dbStatus}, provider=${f.providerDetail} → expected ${f.expected}`;
      const summary =
        `${scan.findings.length} drifted (${bySev("SEV1").length} SEV1 access-denied-but-paid, ` +
        `${bySev("SEV2").length} SEV2 revenue-leak, ${bySev("SEV3").length} SEV3 stale). ` +
        `Checked ${scan.checked}/${scan.total}; ${scan.unreadable} unreadable.`;
      const body = scan.findings.map(line).join("\n");

      const slackUrl = process.env.SLACK_FOUNDER_WEBHOOK_URL;
      if (slackUrl) {
        try {
          await fetch(slackUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: `⚠️ Entitlement drift detected. ${summary}\n\`\`\`${body}\`\`\``,
            }),
          });
        } catch {
          /* non-fatal */
        }
      }

      if (process.env.RESEND_API_KEY) {
        const { getResendClient } = await import("@/lib/resend");
        await getResendClient().emails.send({
          from: EMAIL_FROM,
          to: FOUNDER_RECIPIENTS,
          subject: `[Ripple] ⚠️ Entitlement drift: ${scan.findings.length} user(s) out of sync`,
          html: `<div style="font-family:-apple-system,system-ui,sans-serif;max-width:640px">
<h2 style="margin:0 0 12px;color:#b45309">Entitlement drift monitor</h2>
<p>${summary}</p>
<pre style="background:#f4f4f5;padding:12px;border-radius:8px;overflow:auto;font-size:12px">${body}</pre>
<p style="color:#71717A;font-size:12px">Read-only daily scan. Corrections are the reconciler's job — verify these against the provider dashboard before acting.</p>
</div>`,
        });
      }
      return { alerted: true };
    });

    return { ok: false, ...scan, findings: scan.findings.length };
  }
);
