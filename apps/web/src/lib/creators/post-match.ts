/**
 * Pure helpers for creator post tracking (post-tracking.ts): which posts
 * count as Ripple posts, and post ids from URLs. No I/O, unit-tested.
 */
import { RIPPLE_SOCIAL_HANDLES } from "./config";

export interface ScannedPost {
  externalId: string;
  url: string;
  caption: string;
  views: number | null;
  postedAt: Date | null;
  /** Usernames tagged, mentioned or co-authoring, lowercased, no "@". */
  people: string[];
  hashtags: string[];
}

/** Instagram shortcode or TikTok video id from a post URL. */
export function externalIdFromUrl(url: string): string | null {
  const ig = url.match(/instagram\.com\/(?:[^/]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
  if (ig) return ig[1];
  const tt = url.match(/tiktok\.com\/.*\/video\/(\d+)/i);
  return tt ? tt[1] : null;
}

export function platformOfUrl(url: string): "instagram" | "tiktok" | null {
  if (/instagram\.com/i.test(url)) return "instagram";
  if (/tiktok\.com/i.test(url)) return "tiktok";
  return null;
}

/** Does this post count as a Ripple post? */
export function isRipplePost(p: Pick<ScannedPost, "caption" | "people" | "hashtags">, code: string | null): boolean {
  const caption = p.caption.toLowerCase();
  const ours = RIPPLE_SOCIAL_HANDLES.map((h) => h.toLowerCase());
  if (/(^|[^\w#])#ripple(?![\w])/i.test(p.caption)) return true;
  if (p.hashtags.some((h) => h.replace(/^#/, "").toLowerCase() === "ripple")) return true;
  if (p.people.some((u) => ours.includes(u))) return true;
  if (ours.some((h) => new RegExp(`@${h.replace(/\./g, "\\.")}(?![\\w.])`, "i").test(caption))) return true;
  if (caption.includes("goripple.io")) return true;
  if (code && new RegExp(`(^|[^A-Za-z0-9])${code}([^A-Za-z0-9]|$)`, "i").test(p.caption)) return true;
  return false;
}
