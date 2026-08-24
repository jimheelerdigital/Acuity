import { inngest } from "@/inngest/client";
import {
  reconcileEntitlementDrift,
  type ReconcileEntry,
} from "@/lib/entitlement-drift";
import { safeLog } from "@/lib/safe-log";

/**
 * Self-healing entitlement RECONCILER (nightly).
 *
 * Re-validates every PRO/PAST_DUE subscriber against its source-of-truth
 * provider and CORRECTS DB drift — so a missed webhook/notification
 * self-recovers. Reuses the drift monitor's scan + classify core.
 *
 * DRY-RUN BY DEFAULT. Writes only when `ENTITLEMENT_RECON_APPLY === "true"`
 * (mirrors STRIPE_RECON_APPLY). Until that flag is flipped it logs + alerts
 * what it WOULD do and changes nothing. Corrections respect entitlement
 * precedence: grants PRO for any active provider; demotes only non-IAP sources
 * (Apple/Google demotions stay with their own webhooks); AdminAuditLog on every
 * applied correction.
 *
 * Runs at 04:30 UTC — before the 05:00 drift-monitor, so the monitor's alert
 * reflects the post-reconcile state.
 */

const FOUNDER_RECIPIENTS = ["keenan@heelerdigital.com", "jim@heelerdigital.com"];
// goripple.io is DKIM-signed for Resend and its DMARC (p=quarantine,
// aspf=r) aligns on DKIM alone, so this sends clean. Safe here because
// this alert only ever goes to the founders' @heelerdigital.com inboxes
// and nobody replies to it — goripple.io has NO MX, so a reply would
// bounce. Reply-capable senders stay on getacuity.io until MX exists.
const EMAIL_FROM = "hello@goripple.io";

export const entitlementReconcileNightlyFn = inngest.createFunction(
  {
    id: "entitlement-reconcile-nightly",
    name: "Entitlement reconciler (nightly, dry-run until flag)",
    triggers: [{ cron: "30 4 * * *" }],
    retries: 1,
  },
  async ({ step }) => {
    const apply = process.env.ENTITLEMENT_RECON_APPLY === "true";

    const report = await step.run("reconcile", () =>
      reconcileEntitlementDrift({ apply })
    );

    safeLog.info("entitlement-reconcile.run", {
      apply,
      scanned: report.scanned,
      checked: report.checked,
      unreadable: report.unreadable,
      drift: report.drift,
      applied: report.applied,
      skipped: report.skipped,
    });

    // Alert only when there was something to do (applied a correction, or
    // dry-run found drift it WOULD correct). A clean run stays quiet.
    const actionable = report.applied > 0 || report.entries.some((e) => e.outcome === "dry-run");
    if (!actionable) {
      return { ...report, entries: report.entries.length };
    }

    await step.run("alert-founders", async () => {
      const line = (e: ReconcileEntry) =>
        `[${e.outcome}] ${e.email ?? e.userId} (${e.source}): ${e.from} → ${e.to} — ${e.reason}`;
      const mode = apply ? "APPLIED" : "DRY-RUN (no writes — flip ENTITLEMENT_RECON_APPLY to enable)";
      const summary = `Reconciler ${mode}: ${report.applied} applied, ${report.skipped} skipped, of ${report.drift} drifted (checked ${report.checked}/${report.scanned}, ${report.unreadable} unreadable).`;
      const body = report.entries.map(line).join("\n");

      const slackUrl = process.env.SLACK_FOUNDER_WEBHOOK_URL;
      if (slackUrl) {
        try {
          await fetch(slackUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: `🔧 ${summary}\n\`\`\`${body}\`\`\`` }),
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
          subject: `[Ripple] 🔧 Entitlement reconciler ${apply ? "applied" : "dry-run"}: ${report.drift} drift`,
          html: `<div style="font-family:-apple-system,system-ui,sans-serif;max-width:640px">
<h2 style="margin:0 0 12px">Entitlement reconciler</h2><p>${summary}</p>
<pre style="background:#f4f4f5;padding:12px;border-radius:8px;overflow:auto;font-size:12px">${body}</pre></div>`,
        });
      }
      return { alerted: true };
    });

    return { ...report, entries: report.entries.length };
  }
);
