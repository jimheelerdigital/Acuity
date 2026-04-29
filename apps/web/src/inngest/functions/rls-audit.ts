import { inngest } from "@/inngest/client";

/**
 * Daily RLS audit cron. Catches the bug class that produced the
 * 2026-04-29 Supabase exposure — a feature ships a new table without
 * remembering to enable Row-Level Security, leaving it readable via
 * the public anon key.
 *
 * Runs at 09:00 UTC every day. Queries pg_tables for any public-schema
 * table where rowsecurity = false; if the result is non-empty,
 * sends an email to the cofounders.
 *
 * Email infrastructure is the existing Resend pipeline used by
 * founder-notifications. No new infra; same EMAIL_FROM, same
 * recipient list. Resend is required for email delivery — gated on
 * RESEND_API_KEY at send time, not registration time, so the cron
 * always runs even if email is unavailable.
 *
 * Required env (already set in Vercel for other features):
 *   - DATABASE_URL: read access to public schema (already set)
 *   - RESEND_API_KEY: email delivery (already set)
 *
 * No new env vars introduced by this function.
 */

const FOUNDER_RECIPIENTS = [
  "keenan@heelerdigital.com",
  "jim@heelerdigital.com",
];
const EMAIL_FROM = "hello@getacuity.io";

export const rlsAuditFn = inngest.createFunction(
  {
    id: "rls-audit-daily",
    name: "RLS Audit (daily)",
    triggers: [{ cron: "0 9 * * *" }],
    retries: 1,
  },
  async ({ step }) => {
    const exposed = await step.run("scan-public-schema", async () => {
      const { prisma } = await import("@/lib/prisma");
      // pg_tables is the canonical view for table-level RLS state.
      // rowsecurity = false means the table accepts traffic via the
      // PostgREST auto-API without the row filter — anyone with the
      // anon key can read/write it. forcerowsecurity is separate
      // (forces RLS even for the table owner) — we don't require it.
      const rows = await prisma.$queryRawUnsafe<
        Array<{ tablename: string; rowsecurity: boolean }>
      >(
        `SELECT tablename, rowsecurity FROM pg_tables
         WHERE schemaname = 'public' AND rowsecurity = false
         ORDER BY tablename`
      );
      return rows.map((r) => r.tablename);
    });

    if (exposed.length === 0) {
      return { ok: true, exposed: [], message: "No tables without RLS." };
    }

    // Send the alert. Mirror the pattern in founder-notifications.ts.
    await step.run("send-alert-email", async () => {
      if (!process.env.RESEND_API_KEY) {
        // Don't fail the function — email is the alert channel, but
        // a missing key is operator-visible via Inngest logs anyway.
        // eslint-disable-next-line no-console
        console.error(
          "[rls-audit] RESEND_API_KEY missing — alert NOT sent. Exposed tables:",
          exposed
        );
        return { sent: false };
      }

      const { getResendClient } = await import("@/lib/resend");
      const resend = getResendClient();

      const list = exposed
        .map((t: string) => `<li><code>${t}</code></li>`)
        .join("");
      const html = `
<div style="font-family:-apple-system,system-ui,sans-serif;max-width:560px">
<h2 style="margin:0 0 12px;color:#b91c1c">RLS audit — ${exposed.length} ${
        exposed.length === 1 ? "table" : "tables"
      } exposed</h2>
<p>The daily Row-Level-Security audit found tables in the
<code>public</code> schema with RLS disabled. These are reachable via
Supabase's PostgREST auto-API using the publicly-distributed anon key.</p>
<p><strong>Tables:</strong></p>
<ul>${list}</ul>
<p><strong>Fix:</strong></p>
<pre style="background:#f4f4f5;padding:12px;border-radius:6px;font-size:12px">
ALTER TABLE public."${exposed[0]}" ENABLE ROW LEVEL SECURITY;
${exposed
  .slice(1)
  .map((t: string) => `ALTER TABLE public."${t}" ENABLE ROW LEVEL SECURITY;`)
  .join("\n")}
</pre>
<p style="color:#71717A;font-size:12px;margin-top:24px">
Sent by the rls-audit-daily Inngest cron. Source:
<code>apps/web/src/inngest/functions/rls-audit.ts</code>.
See <code>docs/launch-audit-2026-04-26/14-rls-prevention.md</code>
for the prevention plan and the 2026-04-29 incident context.
</p>
</div>`;

      const result = await resend.emails.send({
        from: EMAIL_FROM,
        to: FOUNDER_RECIPIENTS,
        subject: `[Acuity] RLS audit — ${exposed.length} ${
          exposed.length === 1 ? "table" : "tables"
        } exposed`,
        html,
      });
      return { sent: true, id: result.data?.id ?? null };
    });

    return { ok: false, exposed, count: exposed.length };
  }
);
