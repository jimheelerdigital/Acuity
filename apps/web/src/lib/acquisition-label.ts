/**
 * Admin "Source" label from stored UTMs (2026-10-19, per Keenan: "are these
 * UGC/Creator signups from meta ads with ugc posts? or directly from
 * instagram? i need you to be able to distinguish the two").
 *
 * Both routes land on /u/<creator> (app/u/[code]/route.ts), which stamps
 * utm_source=ugc, utm_medium=creator, utm_campaign=ugc-<creator>. The Meta
 * UGC ads add utm_content (video1, video1cut, …) to that link; the creator's
 * own Instagram link carries no utm_content. So:
 *   ugc + utm_content  → the paid Meta ad running the creator's video
 *   ugc, no content    → organic, the creator's own Instagram
 * Everything else keeps the old "source / medium" label.
 */
export function acquisitionLabel(a: {
  source: string | null | undefined;
  medium?: string | null;
  campaign?: string | null;
  content?: string | null;
}): string {
  const { source, medium, campaign, content } = a;
  if (!source) return "direct";
  if (source === "ugc") {
    const creator = campaign?.replace(/^ugc-/, "") || "creator";
    return content ? `UGC Meta ad · @${creator} · ${content}` : `UGC organic · @${creator}'s Instagram`;
  }
  return medium ? `${source} / ${medium}` : source;
}
