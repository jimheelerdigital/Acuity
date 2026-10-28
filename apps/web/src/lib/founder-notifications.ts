/**
 * Immediate founder notification on every new signup. Sends a simple
 * email to both cofounders with just name, email, signup method, and
 * timestamp. No attribution, no UTM data, no delays.
 *
 * Called inline from bootstrapNewUser — fail-soft so notification
 * failures never block signup.
 *
 * Toggle: set FOUNDER_NOTIFICATIONS_ENABLED=false to silence.
 * Slack: set SLACK_FOUNDER_WEBHOOK_URL for a one-liner to Slack.
 */

import "server-only";

import { escapeHtml } from "@/lib/escape-html";

const FOUNDER_NOTIFICATION_RECIPIENTS = [
  "keenan@heelerdigital.com",
  "jim@heelerdigital.com",
];

// goripple.io is verified in Resend (DKIM-signed, DMARC-aligned) as of
// 2026-09-23 — the API key must be authorized for the domain or Resend
// returns a 403 in the response's `error` field WITHOUT throwing.
// goripple.io has NO MX, so replyTo routes replies somewhere real.
const EMAIL_FROM = "hello@goripple.io";
const REPLY_TO = "keenan@heelerdigital.com";

export async function notifyFoundersOfSignup(params: {
  userId: string;
  name: string | null;
  email: string;
  signupMethod: string;
  timestamp: Date;
  campaign?: string | null;
  branch?: string | null;
  paymentStatus?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
}): Promise<void> {
  // Env toggle — default enabled
  if (process.env.FOUNDER_NOTIFICATIONS_ENABLED === "false") return;
  // Per-signup emails are replaced by the 11:59pm summary (2026-10-27, per
  // Keenan). FOUNDER_SIGNUP_EMAILS=on brings them back.
  if (process.env.FOUNDER_SIGNUP_EMAILS !== "on") return;

  const { userId, name, email, signupMethod, timestamp, campaign, branch, paymentStatus, utmSource, utmMedium, utmCampaign } = params;

  // Our own test signups aren't "new signups" (2026-09-29): skip internal
  // accounts, same rule as the funnel stats (lib/internal-traffic.ts).
  const { isInternalEmail } = await import("@/lib/internal-traffic");
  if (isInternalEmail(email)) return;

  const { prisma } = await import("@/lib/prisma");
  const { getResendClient } = await import("@/lib/resend");
  const {
    founderNotificationSubject,
    founderNotificationHtml,
  } = await import("@/emails/founder-signup-notification");

  const firstName = (name ?? "").trim().split(/\s+/)[0] || email.split("@")[0];

  // Where they came from (2026-10-19, per Keenan: a UGC signup email couldn't
  // say whether it was our paid Meta ad or the creator's own post). The /u/
  // creator link stamps utm_source=ugc on both, so the Meta click id decides.
  let cameFrom: string | null = null;
  try {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { signupUtmSource: true, signupUtmCampaign: true, signupUtmContent: true, signupUtmTerm: true } });
    const click = await prisma.onboardingEvent.findFirst({ where: { userId, fbclid: { not: null } }, select: { id: true } });
    const src = (u?.signupUtmSource ?? utmSource ?? "").toLowerCase();
    // Meta's URL parameters put the ad set id in utm_term, so a numeric term
    // also means a paid Meta click even before the fbclid is linked.
    const metaTerm = !!u?.signupUtmTerm && /^\d{10,}$/.test(u.signupUtmTerm);
    const viaMeta = !!click || metaTerm || ["meta", "facebook", "fb", "instagram", "ig"].includes(src);
    const creator = src === "ugc" ? (u?.signupUtmCampaign ?? utmCampaign ?? "").replace(/^ugc-/, "") : "";
    const parts: string[] = [];
    if (creator) parts.push(viaMeta ? "Meta ad" : "Creator's own post (organic)", `UGC @${creator}`);
    else if (viaMeta) parts.push("Meta ad");
    else if (src) parts.push(src);
    else parts.push("Direct / organic");
    if (u?.signupUtmContent) parts.push(u.signupUtmContent);
    if (viaMeta && metaTerm) parts.push(`ad set ${u!.signupUtmTerm}`);
    cameFrom = parts.join(" · ");
  } catch {
    // The label is a nicety; never block the notification.
  }

  const vars = {
    firstName,
    email,
    signupMethod,
    timestamp,
    campaign: campaign ?? null,
    branch: branch ?? null,
    paymentStatus: paymentStatus ?? null,
    utmSource: utmSource ?? null,
    cameFrom,
    utmMedium: utmMedium ?? null,
    utmCampaign: utmCampaign ?? null,
  };

  let success = false;
  let errorMessage: string | null = null;

  try {
    const resend = getResendClient();
    // The Resend SDK does NOT throw on API errors — it returns { data,
    // error }. Ignoring `error` is how a 403 got logged as SENT for a
    // month (2026-08-25 → 09-23). Always check it.
    const { error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: FOUNDER_NOTIFICATION_RECIPIENTS,
      replyTo: REPLY_TO,
      subject: founderNotificationSubject(vars),
      html: founderNotificationHtml(vars),
    });
    if (error) throw new Error(`${error.name}: ${error.message}`);
    success = true;
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[founder-notification] Email send failed:", errorMessage);
  }

  // Log the attempt
  try {
    await prisma.founderNotificationLog.create({
      data: {
        userId,
        recipientEmails: FOUNDER_NOTIFICATION_RECIPIENTS,
        success,
        errorMessage,
      },
    });
  } catch (logErr) {
    // Log table might not exist yet (pre-schema-push). Don't fail.
    console.warn("[founder-notification] Failed to write log:", logErr);
  }

  // Slack fallback (additive — never blocks)
  const slackUrl = process.env.SLACK_FOUNDER_WEBHOOK_URL;
  if (slackUrl) {
    try {
      const text = `\u{1F389} New Ripple signup: ${firstName} (${email}) via ${signupMethod}${campaign ? ` | campaign: ${campaign}` : ""}`;
      await fetch(slackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
    } catch {
      // Silent — Slack is best-effort
    }
  }
}

/**
 * Map a raw payment `source` tag to a human-readable label + a subject
 * headline, so every founder payment email says AT A GLANCE which path
 * paid. Sources in the wild:
 *   - "in_app_upgrade"    → web /upgrade (existing user, Stripe)
 *   - "onboarding_funnel" → web-to-app funnel paywall (Stripe, trial)
 *   - "apple"             → mobile Apple IAP (verify-receipt write)
 *   - "google_play"       → mobile Google Play IAP (verify-receipt write)
 *   - anything else       → "Direct" fallback
 */
function describePaymentSource(source: string): {
  label: string;
  headline: string;
} {
  switch (source) {
    case "in_app_upgrade":
      return { label: "In-app upgrade", headline: "In-app Pro upgrade" };
    case "onboarding_funnel":
      return { label: "Onboarding funnel", headline: "Funnel conversion" };
    case "apple":
      return { label: "Mobile IAP (Apple)", headline: "Mobile IAP upgrade" };
    case "google_play":
      return {
        label: "Mobile IAP (Google Play)",
        headline: "Mobile IAP upgrade",
      };
    // App Store / Play purchases bought through the RevenueCat SDK (app 1.9+),
    // reported by the RevenueCat webhook (2026-10-22).
    case "app_store_trial":
      return { label: "App Store (in-app, via RevenueCat)", headline: "Paid trial started (App Store)" };
    case "app_store_purchase":
      return { label: "App Store (in-app, via RevenueCat)", headline: "Mobile IAP upgrade" };
    case "play_store_trial":
      return { label: "Google Play (in-app, via RevenueCat)", headline: "Paid trial started (Google Play)" };
    case "play_store_purchase":
      return { label: "Google Play (in-app, via RevenueCat)", headline: "Mobile IAP upgrade" };
    // RevenueCat Web Billing purchases made off goripple.io, attributed when
    // the buyer redeemed them in the app (RC webhook PURCHASE_REDEEMED).
    case "rc_funnel":
      return { label: "RevenueCat Funnel (redeemed in app)", headline: "Funnel conversion" };
    case "web_redemption":
      return { label: "Web purchase link (redeemed in app)", headline: "New payment" };
    // First real charge after the free trial (2026-10-23, per Keenan: "an
    // email upon every conversion").
    case "stripe_trial_converted":
      return { label: "Web (Stripe), first charge after the trial", headline: "Trial converted to paid" };
    case "app_store_trial_converted":
      return { label: "App Store, first charge after the trial", headline: "Trial converted to paid" };
    case "play_store_trial_converted":
      return { label: "Google Play, first charge after the trial", headline: "Trial converted to paid" };
    default:
      return { label: "Direct", headline: "New payment" };
  }
}

/**
 * Notify founders when someone completes a paid subscription. Fired from
 * the Stripe webhook (funnel + web /upgrade) and the IAP verify-receipt
 * write path (mobile Apple/Google). Same fail-soft pattern as signup
 * notifications. Idempotency is the CALLER's responsibility — the Stripe
 * webhook dedups on event.id, and the IAP path only calls this on a
 * genuinely new transaction (first write), so this never double-sends.
 *
 * The `source` tag drives a clear label in BOTH the subject and body so
 * we can tell in-app upgrades from funnel conversions at a glance.
 */
export async function notifyFoundersOfPayment(params: {
  userId: string;
  email: string;
  plan: string;
  source: string;
  timestamp: Date;
}): Promise<void> {
  if (process.env.FOUNDER_NOTIFICATIONS_ENABLED === "false") return;

  const { email, plan, source, timestamp } = params;
  const { label, headline } = describePaymentSource(source);

  try {
    const { getResendClient } = await import("@/lib/resend");
    const resend = getResendClient();
    const timeStr = timestamp.toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" });

    const { error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: FOUNDER_NOTIFICATION_RECIPIENTS,
      replyTo: REPLY_TO,
      subject: `\u{1F4B0} ${headline} — ${email} (${plan})`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
          <h2 style="color:#C4451C;margin:0 0 16px;">${headline}</h2>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px 0;color:#666;">Email</td><td style="padding:8px 0;font-weight:600;">${escapeHtml(email)}</td></tr>
            <tr><td style="padding:8px 0;color:#666;">Plan</td><td style="padding:8px 0;font-weight:600;">${plan}</td></tr>
            <tr><td style="padding:8px 0;color:#666;">Source</td><td style="padding:8px 0;font-weight:600;">${label}</td></tr>
            <tr><td style="padding:8px 0;color:#666;">Time</td><td style="padding:8px 0;">${timeStr}</td></tr>
          </table>
        </div>
      `,
    });
    if (error) throw new Error(`${error.name}: ${error.message}`);
  } catch (err) {
    console.error("[founder-notification] Payment email failed:", err instanceof Error ? err.message : err);
  }
}


/**
 * Founder email for every app download (2026-10-23, per Keenan: "send me an
 * email upon every app download"). Fired when the app reports app_first_open,
 * which it sends once per install from app 1.9.5 on (older versions don't
 * send it, and Apple doesn't tell us about downloads that are never opened).
 * Internal/test devices are skipped by the caller. Never throws.
 */
export async function notifyFoundersOfInstall(params: {
  platform: string | null;
  appVersion: string | null;
  reinstall: boolean;
  installId: string | null;
  timestamp: Date;
}): Promise<void> {
  if (process.env.FOUNDER_NOTIFICATIONS_ENABLED === "false") return;
  const { platform, reinstall, timestamp } = params;
  // Both come from request headers / body on a public endpoint: cap the
  // length and escape before they touch the subject or HTML.
  const appVersion = params.appVersion ? params.appVersion.slice(0, 20) : null;
  const installId = params.installId ? params.installId.slice(0, 64) : null;
  const device = platform === "ios" ? "iPhone" : platform === "android" ? "Android" : "Unknown device";
  const headline = reinstall ? "App re-downloaded" : "New app download";
  try {
    const { getResendClient } = await import("@/lib/resend");
    const timeStr = timestamp.toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" });
    const { error } = await getResendClient().emails.send({
      from: EMAIL_FROM,
      to: FOUNDER_NOTIFICATION_RECIPIENTS,
      replyTo: REPLY_TO,
      subject: `\u{1F4F2} ${headline} — ${device}${appVersion ? ` (${appVersion.replace(/[^\w.\-]/g, "")})` : ""}`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
          <h2 style="color:#C4451C;margin:0 0 16px;">${headline}</h2>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px 0;color:#666;">Device</td><td style="padding:8px 0;font-weight:600;">${device}</td></tr>
            <tr><td style="padding:8px 0;color:#666;">App version</td><td style="padding:8px 0;font-weight:600;">${escapeHtml(appVersion ?? "unknown")}</td></tr>
            <tr><td style="padding:8px 0;color:#666;">Reinstall</td><td style="padding:8px 0;">${reinstall ? "Yes (installed before on this phone)" : "No"}</td></tr>
            <tr><td style="padding:8px 0;color:#666;">Time</td><td style="padding:8px 0;">${timeStr}</td></tr>
            ${installId ? `<tr><td style="padding:8px 0;color:#666;">Install id</td><td style="padding:8px 0;font-family:monospace;font-size:12px;">${escapeHtml(installId)}</td></tr>` : ""}
          </table>
          <p style="margin-top:16px;color:#888;font-size:12px;">Sent when the app opens for the first time (app 1.9.5+). Which ad brought them in isn't knowable per person on iPhone; see Meta for app-ad installs.</p>
        </div>
      `,
    });
    if (error) throw new Error(`${error.name}: ${error.message}`);
  } catch (err) {
    console.error("[founder-notification] Install email failed:", err instanceof Error ? err.message : err);
  }
}
