import { createHmac } from "crypto";

import { ARCHETYPES, archetypeImageUrl, type ArchetypeSlug } from "@/lib/mythicals/archetypes";
import { MYTHICALS_ORIGIN } from "@/lib/mythicals/site";
import type { PortraitOrder } from "@/lib/mythicals/store";

/**
 * Legendary Mythicals emails (2026-10-01). Sent from the verified
 * getacuity.io domain under the Mythicals display name, so no new Resend
 * domain is needed. Plain dark HTML, no images embedded (links only).
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

export function welcomeEmail(to: string, slug: ArchetypeSlug) {
  const a = ARCHETYPES[slug];
  const resultUrl = `${MYTHICALS_ORIGIN}/result/${slug}`;
  const html = shell(
    `<h1 style="margin:0 0 8px;font-size:28px;color:#ede6d6">You are the ${esc(a.name)}</h1>
<p style="margin:0 0 20px;font-style:italic;color:#d9a441">${esc(a.title)}</p>
<p style="line-height:1.6">${esc(a.essence)}</p>
<p style="margin:20px 0 6px;font-weight:bold">Your strengths</p>
<p style="margin:0;line-height:1.7">${a.strengths.map(esc).join("<br>")}</p>
<p style="margin:20px 0 6px;font-weight:bold">Your weakness</p>
<p style="margin:0;line-height:1.6">${esc(a.weakness)}</p>
<p style="margin:20px 0 6px;font-weight:bold">The lore</p>
<p style="margin:0;line-height:1.6">${esc(a.lore)}</p>
${button(archetypeImageUrl(slug), "Download your HD wallpaper")}
<p style="line-height:1.6">Want a creature that is yours alone, named for you and painted from your answers? <a href="${resultUrl}" style="color:#d9a441">See your result page</a>.</p>
<p style="line-height:1.6">More legends daily at <a href="https://instagram.com/legendarymythicals" style="color:#d9a441">@legendarymythicals</a>.</p>`,
    `You got this because you asked for your creature profile at legendarymythicals.com. Images are AI-generated. <a href="${unsubscribeUrl(to)}" style="color:#7d766a">Unsubscribe</a>.`
  );
  return {
    from: FROM,
    to,
    replyTo: REPLY_TO,
    subject: `Your creature profile: the ${a.name}`,
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
