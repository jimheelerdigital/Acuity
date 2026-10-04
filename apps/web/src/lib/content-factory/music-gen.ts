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
  // 2026-10-04 (Keenan: "darker and more epic ... deep epic mythical beats
  // for all posts ... add some deep house epic music"): darker baseline.
  mythicals:
    "DARK, deep, epic mythical music. Heavy and ominous from the very first second: thunderous war drums, deep sub-bass, low brass, a brooding minor-key motif and a menacing wordless choir, like an ancient colossal beast waking in the dark. Huge, powerful, goosebumps; never bright, cheerful, folky or whimsical. Instrumental, no vocals. Strong hook immediately, no slow intro.",
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
  // 2026-10-03, per Keenan: "deeper techno/house/progressive house ... or
  // even a combo of both house and mythical/norse". Alternates orchestral
  // and electronic so every batch gets both.
  mythicals: [
    // Rewritten 2026-10-04: every style dark and epic; deep / progressive /
    // melodic house alternates with dark orchestral (no folk, fiddle or bright themes).
    "Dark epic orchestral war march in D minor: crushing low brass, taiko, deep male choir chanting, relentless and ominous",
    "Deep progressive house, 122 bpm: dark rolling bassline, four-on-the-floor kick under Norse war drums, ominous throat-singing texture, a huge cinematic drop",
    "Dark dragon theme: sub-bass booms, distorted low cellos, menacing choir, slow and crushing like wings beating in a storm",
    "Dark melodic techno, 124 bpm: brooding minor-key synths, epic choir stabs, distant war horns, hypnotic and driving",
    "Colossal titan awakening: slow, crushing drums, deep horns and a haunting wordless female vocalise over dark strings",
    "Deep epic house, 120 bpm: hypnotic kick, dark atmospheric pads, tribal mythic percussion, a low horn motif that swells into a cinematic drop",
    "Dark Viking battle hymn: frame drums, deep lur horns and wordless chanting building to a massive dark orchestral climax",
    "Dark organic deep house, 118 bpm: shamanic percussion, deep sub-bass, mystic wordless chants, cinematic string swells",
    "Dark hybrid trailer: pulsing synth bass, huge braams, choir and taiko in a relentless, ominous build",
    "Dark progressive house with orchestral strings, 124 bpm: brooding arps rising into a cavernous, epic drop with choir",
    "Ancient dark ritual: deep drones and low chants exploding into thunderous war drums and dark brass",
    "Deep tech-house, 123 bpm: dark rolling groove with cinematic brass hits, Norse chants and a menacing sub-bass",
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
  // The flavor wins over the brand brief where they differ (house vs orchestral).
  return `${MUSIC_BRIEFS[brand]} STYLE FOR THIS TRACK (takes priority over the general direction above): ${f[i % f.length]}. Instrumental only (wordless chants/choir are fine), strong from the first second.`;
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
