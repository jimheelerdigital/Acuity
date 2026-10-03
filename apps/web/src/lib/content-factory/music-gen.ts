/**
 * AI music we own (2026-10-03, per Keenan: Facebook is muting Mythicals
 * posts over copyrighted music; "build three songs, one for each lane, and
 * send em"). ElevenLabs Music (POST /v1/music) on the project's existing
 * ELEVENLABS_API_KEY; paid plans include a commercial license, so the
 * tracks can't be claimed the way the TikTok-downloaded library is.
 *
 * Instrumental only (on-screen text carries the words) and long enough to
 * cover any reel (songs must outlast the video; no looping).
 */

export type MusicBrand = "mythicals" | "bwk" | "ripple";

export const MUSIC_BRIEFS: Record<MusicBrand, string> = {
  mythicals:
    "Epic cinematic orchestral trailer music. Thunderous taiko and war drums from the very first second, a massive brass motif, soaring choir, rising strings, building heroic tension like a colossal beast awakening. Huge, mythic, goosebumps. Instrumental, no vocals. Strong hook immediately, no slow intro.",
  bwk: "Dark motivational hip-hop / trap instrumental. Hard 808s and a crisp beat that drops in the first second, a moody cinematic piano riff, deep bass, confident and hungry, late-night luxury drive energy, the grind before the payoff. Instrumental, no vocals. No slow intro.",
  ripple:
    "Warm, uplifting acoustic instrumental. Soft fingerpicked guitar and gentle piano with a light, steady beat from the first second, airy and sunlit, the feeling of finally exhaling on a quiet terrace by the sea. Hopeful, calm, a little dreamy, modern. Instrumental, no vocals. No slow intro.",
};

/** Newest model first; fall back if the account's plan doesn't have it. */
const MODELS = ["music_v2_5", "music_v1"];

export async function composeTrack(prompt: string, seconds = 60): Promise<{ audio: Buffer; model: string }> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY is not set");
  let lastErr = "";
  for (const model of MODELS) {
    const res = await fetch("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128", {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        music_length_ms: Math.round(seconds * 1000),
        model_id: model,
        force_instrumental: true,
      }),
      signal: AbortSignal.timeout(280_000),
    });
    if (res.ok) {
      const audio = Buffer.from(await res.arrayBuffer());
      if (audio.length < 50_000) throw new Error(`ElevenLabs returned only ${audio.length} bytes`);
      return { audio, model };
    }
    lastErr = `${model} ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`;
    console.warn(`[music-gen] ${lastErr}`);
  }
  throw new Error(`ElevenLabs music failed: ${lastErr}`);
}

/**
 * Per-brand flavors (2026-10-03, per Keenan: "these ai tracks are good to go
 * for all lanes"). Library tracks rotate through these on top of the brand
 * brief so 20 tracks don't sound like one song.
 */
export const MUSIC_FLAVORS: Record<MusicBrand, string[]> = {
  mythicals: [
    "Norse war-horn battle march with pounding drums",
    "Dark choral dragon theme with deep cellos and timpani",
    "Fast heroic charge with racing strings and brass stabs",
    "Mystic ancient ritual percussion with ethnic flutes building to a full orchestra",
    "Colossal slow-motion titan reveal with sub-bass hits and soaring choir",
    "Celtic legendary quest theme with fiddle over epic drums",
    "Eastern epic with erhu, taiko and huge brass swells",
  ],
  bwk: [
    "Night-drive phonk with heavy cowbell and distorted 808",
    "Cinematic trap with orchestral strings and hard drums",
    "Moody piano trap, slow and confident, 70 bpm",
    "Dark luxury R&B-tinged hip-hop beat with smooth keys",
    "Gym-energy aggressive trap with big synth lead",
    "Minimal dark boom-bap with deep bass and vinyl texture",
    "Epic motivational hybrid trap with choir pads",
  ],
  ripple: [
    "Sunlit acoustic guitar with soft hand percussion",
    "Gentle solo piano with warm ambient pads",
    "Light indie-folk with ukulele and whistled melody feel (instrumental)",
    "Dreamy lo-fi with soft keys and vinyl warmth",
    "Breezy coastal bossa nova guitar",
    "Uplifting cinematic strings and piano, hopeful",
    "Calm morning chillhop with mellow Rhodes",
  ],
};

export function libraryBrief(brand: MusicBrand, i: number): string {
  const f = MUSIC_FLAVORS[brand];
  return `${MUSIC_BRIEFS[brand]} Style for this track: ${f[i % f.length]}.`;
}

/** ElevenLabs credits left this cycle, or null if the API won't say. */
export async function creditsRemaining(): Promise<number | null> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/user/subscription", { headers: { "xi-api-key": key } });
    if (!res.ok) return null;
    const j = (await res.json()) as { character_count?: number; character_limit?: number };
    if (typeof j.character_count !== "number" || typeof j.character_limit !== "number") return null;
    return j.character_limit - j.character_count;
  } catch {
    return null;
  }
}

export function isQuotaError(message: string): boolean {
  return /quota|credit|insufficient|limit exceeded|402|payment/i.test(message);
}

/** Live library folder per brand (BWK's dashboard-made folder is uppercase). */
export const LIBRARY_FOLDER: Record<MusicBrand, string> = {
  mythicals: "music/mythicals",
  bwk: "music/BWK",
  ripple: "music/ripple",
};
