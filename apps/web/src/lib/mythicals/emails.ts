import { createHmac } from "crypto";

import { ARCHETYPES, archetypeEmailHeroUrl, archetypeImageUrl, type ArchetypeSlug } from "@/lib/mythicals/archetypes";
import { MYTHICALS_ORIGIN, PORTRAIT_PRICE_CENTS, shopLive } from "@/lib/mythicals/site";
import type { PortraitOrder } from "@/lib/mythicals/store";

/**
 * Legendary Mythicals emails (2026-10-01). Sent from the verified
 * getacuity.io domain under the Mythicals display name, so no new Resend
 * domain is needed. Images are remote links to the public bucket.
 */

const FROM = '"Legendary Mythicals" <hello@getacuity.io>';
const REPLY_TO = "keenan@heelerdigital.com";
const KEENAN = "keenan@heelerdigital.com";

export function unsubscribeToken(email: string): string {
  return createHmac("sha256", process.env.NEXTAUTH_SECRET ?? "mythicals")
    .update(email.toLowerCase())
    .digest("hex")
    .slice(0, 24);
}

function unsubscribeUrl(email: string): string {
  const e = encodeURIComponent(email.toLowerCase());
  return `${MYTHICALS_ORIGIN}/api/mythicals/unsubscribe?e=${e}&t=${unsubscribeToken(email)}`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function shell(body: string, footer: string): string {
  return `<!doctype html><html><body style="margin:0;background:#0b0a09;padding:32px 16px;font-family:Helvetica,Arial,sans-serif;color:#ede6d6">
<div style="max-width:560px;margin:0 auto">
<p style="margin:0 0 24px;font-size:12px;letter-spacing:3px;color:#d9a441;text-transform:uppercase">Legendary Mythicals</p>
${body}
<p style="margin:40px 0 0;font-size:12px;line-height:1.6;color:#7d766a">${footer}</p>
</div></body></html>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${href}" style="display:inline-block;background:#d9a441;color:#0b0a09;text-decoration:none;font-weight:bold;padding:14px 22px;border-radius:6px">${label}</a></p>`;
}

const GOLD = "#d9a441";
const BONE = "#ede6d6";
const DIM = "#a59d8e";

/** A dark card with a small gold label, used for strengths/weakness/lore. */
function card(label: string, inner: string): string {
  return `<tr><td style="padding:0 24px 14px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#15120f;border:1px solid #2c261d;border-radius:10px"><tr><td style="padding:18px 20px">
<p style="margin:0 0 8px;font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:${GOLD}">${label}</p>
${inner}
</td></tr></table></td></tr>`;
}

/**
 * Welcome email (redesigned 2026-10-01, per Keenan: "needs more spruce with
 * an image of the final"). Leads with the creature art, then the profile as
 * cards, a phone-shaped preview of the wallpaper beside its download, and
 * the portrait offer (or its waitlist while the shop is off). Table layout
 * so Gmail/Outlook render it the same; images are remote (Supabase public
 * bucket), so the email still reads if images are blocked.
 */
export function welcomeEmail(to: string, slug: ArchetypeSlug) {
  const a = ARCHETYPES[slug];
  const resultUrl = `${MYTHICALS_ORIGIN}/result/${slug}`;
  const wallpaper = archetypeImageUrl(slug);
  const live = shopLive();
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"></head>
<body style="margin:0;background:#0b0a09;font-family:Georgia,'Times New Roman',serif;color:${BONE}">
<div style="display:none;max-height:0;overflow:hidden">${esc(a.title)}. Your wallpaper is inside.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0a09"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0f0d0b;border:1px solid #2c261d;border-radius:14px;overflow:hidden">
<tr><td align="center" style="padding:18px 24px;font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:4px;text-transform:uppercase;color:${GOLD}">&#10022; Legendary Mythicals &#10022;</td></tr>
<tr><td><a href="${resultUrl}"><img src="${archetypeEmailHeroUrl(slug)}" width="560" alt="The ${esc(a.name)}" style="display:block;width:100%;height:auto;border:0"></a></td></tr>
<tr><td align="center" style="padding:28px 24px 8px">
<p style="margin:0 0 6px;font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:${DIM}">Your creature is</p>
<h1 style="margin:0;font-size:34px;line-height:1.15;font-weight:normal;color:${BONE}">The ${esc(a.name)}</h1>
<p style="margin:10px 0 0;font-style:italic;font-size:17px;color:${GOLD}">${esc(a.title)}</p>
<p style="margin:18px 0 18px;font-size:16px;line-height:1.65;color:${BONE}">${esc(a.essence)}</p>
</td></tr>
${card("Your strengths", a.strengths.map((s) => `<p style="margin:0 0 6px;font-size:15px;line-height:1.5;color:${BONE}"><span style="color:${GOLD}">&#9670;</span>&nbsp; ${esc(s)}</p>`).join(""))}
${card("Your weakness", `<p style="margin:0;font-size:15px;line-height:1.6;color:${BONE}">${esc(a.weakness)}</p>`)}
${card("The lore", `<p style="margin:0;font-size:15px;line-height:1.7;font-style:italic;color:${BONE}">${esc(a.lore)}</p>`)}
<tr><td style="padding:14px 24px 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td width="150" valign="middle" style="padding-right:18px"><a href="${wallpaper}"><img src="${wallpaper}" width="140" alt="${esc(a.name)} phone wallpaper" style="display:block;width:140px;height:auto;border:4px solid #2c261d;border-radius:18px"></a></td>
<td valign="middle">
<p style="margin:0 0 6px;font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:${GOLD}">Your free wallpaper</p>
<p style="margin:0 0 14px;font-size:15px;line-height:1.5;color:${BONE}">Full-res and sized for your phone. Set it as your lock screen.</p>
<a href="${wallpaper}" style="display:inline-block;background:${GOLD};color:#0b0a09;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-weight:bold;font-size:14px;padding:12px 18px;border-radius:6px">Download wallpaper</a>
</td></tr></table></td></tr>
<tr><td style="padding:22px 24px 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${GOLD};border-radius:12px;background:#1a150d"><tr><td align="center" style="padding:24px 22px">
<p style="margin:0 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:${GOLD}">${live ? "Make it yours" : "Coming soon"}</p>
<p style="margin:0 0 10px;font-size:22px;line-height:1.3;color:${BONE}">A ${esc(a.name)} that is yours alone</p>
<p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:${DIM}">A one-of-a-kind portrait painted from your answers and named for you, with a lore card of its powers and legend.${live ? " Delivered by email in minutes." : " We will tell you the moment it opens."}</p>
<a href="${resultUrl}#portrait" style="display:inline-block;background:${GOLD};color:#0b0a09;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-weight:bold;font-size:15px;padding:14px 24px;border-radius:6px">${live ? `Get my portrait &middot; $${(PORTRAIT_PRICE_CENTS / 100).toFixed(0)}` : "See your result page"}</a>
</td></tr></table></td></tr>
<tr><td align="center" style="padding:26px 24px 8px;font-size:15px;line-height:1.6;color:${DIM}">New legends every day on Instagram<br><a href="https://instagram.com/legendarymythicals" style="color:${GOLD};text-decoration:none;font-weight:bold">@legendarymythicals</a></td></tr>
<tr><td align="center" style="padding:20px 24px 26px;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:1.6;color:#6f685c">You got this because you asked for your creature profile at legendarymythicals.com. Images are AI-generated.<br><a href="${unsubscribeUrl(to)}" style="color:#6f685c">Unsubscribe</a></td></tr>
</table></td></tr></table></body></html>`;
  return {
    from: FROM,
    to,
    replyTo: REPLY_TO,
    subject: `You are the ${a.name}`,
    html,
    headers: { "List-Unsubscribe": `<${unsubscribeUrl(to)}>` },
  };
}

export function portraitDeliveryEmail(p: {
  to: string;
  heroName: string;
  lore: { creatureName: string; title: string; powers: string[]; backstory: string };
  portraitUrl: string;
  cardUrl: string;
}) {
  const html = shell(
    `<h1 style="margin:0 0 8px;font-size:28px;color:#ede6d6">${esc(p.lore.creatureName)}</h1>
<p style="margin:0 0 20px;font-style:italic;color:#d9a441">${esc(p.lore.title)}</p>
<p style="line-height:1.6">${esc(p.heroName)}, your legendary creature has answered the call.</p>
<p style="margin:0;line-height:1.7">${p.lore.powers.map(esc).join("<br>")}</p>
<p style="line-height:1.6">${esc(p.lore.backstory)}</p>
${button(p.portraitUrl, "Download your portrait")}
${button(p.cardUrl, "Download your lore card")}
<p style="line-height:1.6">Not happy with it? Reply within 7 days and we will refund you.</p>`,
    `Order receipt from Legendary Mythicals. Images are AI-generated. Questions: ${REPLY_TO}.`
  );
  return {
    from: FROM,
    to: p.to,
    replyTo: REPLY_TO,
    subject: `Your Legendary Creature Portrait: ${p.lore.creatureName}`,
    html,
  };
}

export function orderNoticeEmail(p: {
  order: Pick<PortraitOrder, "sessionId" | "email" | "heroName" | "element" | "slug" | "amountCents">;
  ok: boolean;
  portraitUrl?: string;
  cardUrl?: string;
  error?: string;
}) {
  const o = p.order;
  const lines = [
    `Session: ${o.sessionId}`,
    `Buyer: ${o.email ?? "(no email)"}`,
    `Hero name: ${o.heroName}`,
    `Element: ${o.element || "-"}`,
    `Creature: ${o.slug}`,
    `Amount: ${o.amountCents != null ? `$${(o.amountCents / 100).toFixed(2)}` : "?"}`,
    p.ok ? `Portrait: ${p.portraitUrl}` : `ERROR: ${p.error}`,
    p.ok ? `Lore card: ${p.cardUrl}` : "Delivery failed. Refund per policy, or fix and re-send the mythicals/portrait.order event.",
  ];
  return {
    from: FROM,
    to: KEENAN,
    subject: p.ok ? `Mythicals portrait sold: ${o.heroName}` : `Mythicals portrait FAILED: ${o.sessionId}`,
    text: lines.join("\n"),
  };
}
