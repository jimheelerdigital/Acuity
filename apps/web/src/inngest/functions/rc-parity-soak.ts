import { inngest } from "@/inngest/client";
import {
  scanRcParity,
  rcParityReadyForCutover,
  type RcParityFinding,
} from "@/lib/entitlement-drift";
import { safeLog } from "@/lib/safe-log";

/**
 * RC observer-soak parity report (daily). READ-ONLY.
 *
 * The observer build ships RevenueCat watching alongside our billing. Before
 * RC_SOURCE_OF_TRUTH can flip, RC's view of every entitled user must match
 * the DB (`scanRcParity` + `rcParityReadyForCutover` — the cutover gate).
 * This function is the soak instrument: a daily scorecard emailed to the
 * founders showing
 *
 *   1. COVERAGE — how many entitled users RC knows about yet. This ramps as
 *      people update to the observer build and open the app; NOT_FOUND is
 *      the expected state early in the soak, not an error.
 *   2. AGREEMENT — where RC and the DB disagree (the findings that block or
 *      complicate cutover, SEV1 first).
 *   3. FLOW — RC webhook events landed in the last 24h (RevenueCatEvent),
 *      the pulse that proves data is moving at all.
 *   4. THE GATE — ready-for-cutover verdict with reasons.
 *
 * Unlike the drift monitor (alert-only), this emails EVERY day it can scan:
 * during a soak, "still green today" is the signal being collected. While
 * RC credentials are absent the scan is inert and the email is skipped —
 * logging only — so it cannot spam before the key exists.
 *
 * On-demand run: `GET /api/admin/entitlement-drift?mode=rc-parity` (same
 * scan, no email) or send the `rc/parity-soak.requested` event.
 */

const FOUNDER_RECIPIENTS = ["keenan@heelerdigital.com", "jim@heelerdigital.com"];
// Same sending posture as the drift monitor: goripple.io is DKIM-signed for
// Resend; no MX, so replyTo routes replies to Keenan.
const EMAIL_FROM = "hello@goripple.io";
const BATCH = 5;

export const rcParitySoakFn = inngest.createFunction(
  {
    id: "rc-parity-soak",
    name: "RC observer soak — daily parity report",
    // 13:00 UTC = 8am CDT, so the report is in inboxes in the morning.
    triggers: [{ cron: "0 13 * * *" }, { event: "rc/parity-soak.requested" }],
    retries: 1,
  },
  async ({ step }) => {
    const scan = await step.run("scan-rc-parity", () => scanRcParity(BATCH));
    const gate = rcParityReadyForCutover(scan);

    safeLog.info("rc-parity-soak.scan", {
      inert: scan.inert,
      total: scan.total,
      checked: scan.checked,
      unreadable: scan.unreadable,
      agreeing: scan.agreeing,
      findings: scan.findings.length,
      ready: gate.ready,
    });

    // No RC read key yet — nothing to report. Skip the email entirely so the
    // soak inbox only ever contains real scans.
    if (scan.inert) {
      return { ok: true, skipped: "inert — RC public read key not set", gate };
    }

    const events24h = await step.run("count-webhook-events", async () => {
      const { prisma } = await import("@/lib/prisma");
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const grouped = await prisma.revenueCatEvent.groupBy({
        by: ["type"],
        where: { processedAt: { gte: since } },
        _count: { _all: true },
      });
      return grouped
        .map((g) => ({ type: g.type, count: g._count._all }))
        .sort((a, b) => b.count - a.count);
    });

    await step.run("email-report", async () => {
      // NOT_FOUND = RC simply hasn't seen this user yet (device not on the
      // observer build / not imported) — expected during ramp. Anything else
      // unreadable is a real read problem worth eyes.
      const notSeen = scan.unreadableDetails.filter((u) =>
        u.detail.startsWith("rc:NOT_FOUND")
      );
      const readErrors = scan.unreadableDetails.filter(
        (u) => !u.detail.startsWith("rc:NOT_FOUND")
      );

      const sev = (s: string) => scan.findings.filter((f) => f.severity === s);
      const findingLine = (f: RcParityFinding) =>
        `[${f.severity}] ${f.kind} — ${f.email ?? f.userId}: DB=${f.dbStatus} (${f.dbSource ?? "?"}), RC=${f.rcStatus ?? "none"} (${f.rcSource ?? "?"})`;

      const healthy = gate.ready
        ? "✅ READY"
        : sev("SEV1").length > 0 || readErrors.length > 0
          ? "🔴 NOT READY"
          : "🟡 RAMPING";

      const coverageLine = `RC sees ${scan.checked} of ${scan.total} entitled users (${scan.agreeing} agreeing, ${scan.findings.length} mismatched); ${notSeen.length} not in RC yet, ${readErrors.length} read errors.`;
      const eventsLine =
        events24h.length === 0
          ? "No webhook events in the last 24h."
          : `Webhook events last 24h: ${events24h.map((e) => `${e.type}×${e.count}`).join(", ")}.`;

      const listBlock = (title: string, lines: string[]) =>
        lines.length === 0
          ? ""
          : `\n${title}\n${lines.join("\n")}\n`;

      const text =
        `${coverageLine}\n${eventsLine}\n` +
        listBlock(
          "Mismatches (SEV1 = cutover would revoke a paying user):",
          scan.findings.map(findingLine)
        ) +
        listBlock(
          "Read errors (NOT ramp — investigate):",
          readErrors.map((u) => `- ${u.email ?? u.userId} (${u.source ?? "?"}): ${u.detail}`)
        ) +
        listBlock(
          "Not in RC yet (expected to shrink as users update):",
          notSeen.map((u) => `- ${u.email ?? u.userId} (${u.source ?? "?"})`)
        ) +
        `\nCutover gate: ${gate.ready ? "READY" : "not ready"}${
          gate.reasons.length ? ` — ${gate.reasons.join("; ")}` : ""
        }`;

      const { sendEmailOrThrow } = await import("@/lib/resend");
      await sendEmailOrThrow({
        from: EMAIL_FROM,
        to: FOUNDER_RECIPIENTS,
        replyTo: "keenan@heelerdigital.com",
        subject: `[Ripple] RC soak ${healthy} — ${scan.checked}/${scan.total} in RC, ${scan.findings.length} mismatch(es)`,
        html: `<div style="font-family:-apple-system,system-ui,sans-serif;max-width:640px">
<h2 style="margin:0 0 12px">RC observer soak — daily parity</h2>
<p><strong>${healthy}</strong> · ${coverageLine}</p>
<p>${eventsLine}</p>
<pre style="background:#f4f4f5;padding:12px;border-radius:8px;overflow:auto;font-size:12px">${text}</pre>
<p style="color:#71717A;font-size:12px">Read-only daily scan during the RevenueCat observer soak. The gate must read READY before RC_SOURCE_OF_TRUTH flips. On-demand: /api/admin/entitlement-drift?mode=rc-parity</p>
</div>`,
      });
      return { emailed: true };
    });

    return {
      ok: true,
      ready: gate.ready,
      total: scan.total,
      checked: scan.checked,
      agreeing: scan.agreeing,
      mismatches: scan.findings.length,
      events24h: events24h.length,
    };
  }
);
