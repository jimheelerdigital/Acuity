/**
 * The one creator shape every discovery source returns, so the rest of the
 * pipeline never knows where a creator came from. A run's working set is a
 * list of these (UgcRun.candidates) until the final step writes creators.
 */
import type { CreatorType, Persona, Platform } from "@/lib/ugc/config";

export interface CandidateVideo {
  url: string;
  caption: string | null;
  transcript: string | null;
  views: number | null;
  postedAt: string | null;
  thumbnailUrl: string | null;
}

export interface Candidate {
  platform: Platform;
  handle: string;
  source: "apify-hashtag" | "manual" | "meta-marketplace";
  /** Set for manual adds (the creator row already exists). */
  creatorId?: string;
  displayName?: string | null;
  profileUrl: string;
  bio?: string | null;
  followers?: number | null;
  lastPostAt?: string | null;
  linkInBio?: string | null;
  email?: string | null;
  portfolioUrl?: string | null;
  mentionsUgc?: boolean;
  listsRates?: boolean;
  credentials?: string | null;
  /** The hashtags / posts it was found through (short, for the scorer). */
  seenIn?: string[];
  /** Captions seen during discovery / the cheap profile scrape. */
  sampleCaptions?: string[];
  notes?: string | null;
  quotedRateCents?: number | null;
  quotedVideos?: number | null;
  costPerVideoCents?: number | null;

  // Expensive stage
  avgViews?: number | null;
  recentVideos?: CandidateVideo[];

  // Scoring
  roughScore?: number;
  persona?: Persona;
  creatorType?: CreatorType;
  score?: number;
  scoreReason?: string;
  scoreDetail?: Record<string, unknown>;
  dropped?: string;

  // Drafts
  emailSubject?: string;
  emailDraft?: string;
  dmDraft?: string;
  claimsStatus?: "passed" | "flagged" | "unchecked";
  claimsNotes?: string;
}

export interface SourceAdapter {
  name: Candidate["source"];
  /**
   * Return up to `max` new candidates. `budget` tracks the run's Apify
   * spend; adapters stop when it says so.
   */
  discover(opts: { max: number; budget: SpendBudget; skip: Set<string> }): Promise<Candidate[]>;
}

export interface SpendBudget {
  remainingUsd(): number;
  add(usd: number): void;
  spentUsd(): number;
}

export function candidateKey(c: { platform: string; handle: string }): string {
  return `${c.platform}:${normalizeHandle(c.handle)}`;
}

export function normalizeHandle(h: string): string {
  return h.trim().replace(/^@/, "").replace(/\/+$/, "").split("/").pop()!.toLowerCase();
}

export function profileUrlFor(platform: Platform, handle: string): string {
  return platform === "tiktok"
    ? `https://www.tiktok.com/@${handle}`
    : `https://www.instagram.com/${handle}/`;
}

/** Same platform + handle across sources → one candidate (first one wins, fields merged). */
export function dedupeCandidates(list: Candidate[]): Candidate[] {
  const byKey = new Map<string, Candidate>();
  for (const c of list) {
    const key = candidateKey(c);
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { ...c, handle: normalizeHandle(c.handle) });
      continue;
    }
    prev.seenIn = Array.from(new Set([...(prev.seenIn ?? []), ...(c.seenIn ?? [])])).slice(0, 8);
    prev.sampleCaptions = [...(prev.sampleCaptions ?? []), ...(c.sampleCaptions ?? [])].slice(0, 6);
    if (prev.followers == null && c.followers != null) prev.followers = c.followers;
    if (!prev.bio && c.bio) prev.bio = c.bio;
    if (!prev.linkInBio && c.linkInBio) prev.linkInBio = c.linkInBio;
    if (c.lastPostAt && (!prev.lastPostAt || c.lastPostAt > prev.lastPostAt)) prev.lastPostAt = c.lastPostAt;
  }
  return Array.from(byKey.values());
}
