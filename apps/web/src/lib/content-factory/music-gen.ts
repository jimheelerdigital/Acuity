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
