import { inngest } from "@/inngest/client";

/**
 * One AI track per brand, emailed to Keenan for a listen (2026-10-03). See
 * lib/content-factory/music-gen.ts. Tracks land in music-samples/<date>/ in
 * the content-factory bucket (not in the live music/ folders) until approved.
 * Manual only: "content-factory/music.sample" (POST /api/admin/music-sample).
 */
export const musicSampleFn = inngest.createFunction(
  {
    id: "music-sample",
    name: "Content Factory — AI Music Samples",
    retries: 0,
    triggers: [{ event: "content-factory/music.sample" }],
  },
  async ({ step }) => {
    const date = new Date().toISOString().slice(0, 10);
    const brands = ["mythicals", "bwk", "ripple"] as const;
    const tracks: { brand: string; url: string; model: string; path: string }[] = [];
    // Every failure is reported in the email (2026-10-03: the first run saved
    // nothing and sent nothing, so the ElevenLabs error was invisible).
    const errors: { brand: string; error: string }[] = [];
    for (const brand of brands) {
      const t = await step.run(`compose-${brand}`, async () => {
        const { composeTrack, MUSIC_BRIEFS } = await import("@/lib/content-factory/music-gen");
        let composed: { audio: Buffer; model: string };
        try {
          composed = await composeTrack(MUSIC_BRIEFS[brand], 60);
        } catch (e) {
          return { brand, error: e instanceof Error ? e.message : String(e) };
        }
        const { audio, model } = composed;
        const { supabase } = await import("@/lib/supabase.server");
        const path = `music-samples/${date}/${brand}-${Date.now()}.mp3`;
        const { error } = await supabase.storage
          .from("content-factory")
          .upload(path, audio, { contentType: "audio/mpeg", upsert: true });
        if (error) throw new Error(`upload failed: ${error.message}`);
        const url = supabase.storage.from("content-factory").getPublicUrl(path).data.publicUrl;
        return { brand, url, model, path };
      });
      if ("error" in t) errors.push({ brand: t.brand, error: t.error as string });
      else tracks.push(t);
    }
    await step.run("email", async () => {
      const files = await Promise.all(
        tracks.map(async (t) => {
          const res = await fetch(t.url);
          return { filename: `${t.brand}-ai-track.mp3`, content: Buffer.from(await res.arrayBuffer()) };
        })
      );
      const name: Record<string, string> = { mythicals: "Legendary Mythicals", bwk: "Build With Key", ripple: "Ripple" };
      const { sendEmailOrThrow } = await import("@/lib/resend");
      await sendEmailOrThrow({
        from: process.env.CONTENT_FACTORY_EMAIL_FROM ?? '"Ripple Content" <content@getacuity.io>',
        to: process.env.CONTENT_FACTORY_EMAIL_TO ?? "keenan@heelerdigital.com",
        subject: tracks.length
          ? `${tracks.length} AI music track${tracks.length === 1 ? "" : "s"} to listen to${errors.length ? ` (${errors.length} failed)` : " (one per brand)"}`
          : "AI music tracks FAILED — ElevenLabs error inside",
        html: `<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:620px;color:#1f2430">
<p style="font-size:17px;font-weight:700;margin:0 0 8px">AI music samples, one per brand</p>
<p style="font-size:14px;margin:0 0 12px">Made with ElevenLabs Music (commercial license, so Facebook can't mute them). 60 seconds each, instrumental. MP3s are attached; links below too. Reply with what to keep or change and I'll build a full library.</p>
<ul style="font-size:14px;line-height:1.8">${tracks.map((t) => `<li><b>${name[t.brand]}</b>: <a href="${t.url}">listen</a> <span style="color:#9aa1ad">(${t.model})</span></li>`).join("")}</ul>
${errors.length ? `<p style="font-size:14px;color:#b91c1c;margin:12px 0 4px"><b>Failed:</b></p><ul style="font-size:13px;color:#b91c1c">${errors.map((e) => `<li><b>${name[e.brand]}</b>: ${e.error.replace(/</g, "&lt;").slice(0, 400)}</li>`).join("")}</ul>` : ""}
</div>`,
        ...(files.length ? { attachments: files } : {}),
      });
    });
    return { tracks, errors };
  }
);
