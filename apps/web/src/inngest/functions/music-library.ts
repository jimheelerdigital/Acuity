import { inngest } from "@/inngest/client";

/**
 * Replace each brand's music library with owned ElevenLabs tracks
 * (2026-10-03, per Keenan: "these ai tracks are good to go for all lanes,
 * let's start using these instead of the current library"). The old
 * TikTok-downloaded tracks were getting Facebook posts muted.
 *
 * 1. Budget: ElevenLabs credits left minus a reserve for voiceovers;
 *    up to `perBrand` (default 20) 60s tracks per brand, round-robin.
 * 2. Each track → music/<brand folder>/ai-<n>-<ts>.mp3 (flavor-varied brief).
 *    The 3 approved samples (music-samples/) are copied in too.
 * 3. A brand's old (non "ai-") tracks move to music-removed/<folder>/ only
 *    once it has ≥ MIN_NEW AI tracks, so no brand ever goes silent.
 * 4. Summary email. Manual: "content-factory/music.library"
 *    (POST /api/admin/music-library).
 */
const SECONDS = 60;
const CREDITS_PER_TRACK = 900; // ElevenLabs Music: 900 credits per minute
// Small buffer only: no voiced lanes are active (0 voiced posts in the 14
// days to 2026-10-03), so the library may use nearly all credits.
const RESERVE = 1000;
const MIN_NEW = 6;

export const musicLibraryFn = inngest.createFunction(
  {
    id: "music-library",
    name: "Content Factory — Build AI Music Library",
    retries: 0,
    concurrency: { limit: 1 },
    triggers: [{ event: "content-factory/music.library" }],
  },
  async ({ event, step }) => {
    const perBrand = Math.max(1, Math.min(40, Number((event.data as { perBrand?: number })?.perBrand) || 20));
    const brands = ["mythicals", "bwk", "ripple"] as const;

    const plan = await step.run("budget", async () => {
      const { creditsRemaining } = await import("@/lib/content-factory/music-gen");
      const left = await creditsRemaining();
      // Upper bound only: each track re-checks the real balance before
      // composing, so the estimate never caps what credits can actually buy.
      return { left, total: perBrand * 3 };
    });

    const made: Record<string, number> = { mythicals: 0, bwk: 0, ripple: 0 };
    const errors: string[] = [];
    let stopped = "";
    for (let n = 0; n < plan.total && !stopped; n++) {
      const brand = brands[n % 3];
      const idx = Math.floor(n / 3);
      const r = await step.run(`compose-${brand}-${idx}`, async () => {
        const { composeTrack, libraryBrief, LIBRARY_FOLDER, isQuotaError, creditsRemaining } = await import("@/lib/content-factory/music-gen");
        const left = await creditsRemaining();
        if (left != null && left < CREDITS_PER_TRACK + RESERVE) {
          return { ok: false as const, quota: true, error: `stopped: ${left} credits left` };
        }
        try {
          const { audio } = await composeTrack(libraryBrief(brand, idx), SECONDS);
          const { supabase } = await import("@/lib/supabase.server");
          const path = `${LIBRARY_FOLDER[brand]}/ai-${idx + 1}-${Date.now()}.mp3`;
          const { error } = await supabase.storage.from("content-factory").upload(path, audio, { contentType: "audio/mpeg", upsert: false });
          if (error) return { ok: false as const, quota: false, error: `upload ${path}: ${error.message}` };
          return { ok: true as const, path };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return { ok: false as const, quota: isQuotaError(msg), error: `${brand} #${idx + 1}: ${msg.slice(0, 300)}` };
        }
      });
      if (r.ok) made[brand]++;
      else {
        errors.push(r.error);
        if (r.quota) stopped = "ElevenLabs ran out of credits";
      }
    }

    // The 3 approved samples join their libraries.
    const samples = await step.run("copy-samples", async () => {
      const { supabase } = await import("@/lib/supabase.server");
      const { LIBRARY_FOLDER } = await import("@/lib/content-factory/music-gen");
      let copied = 0;
      const { data: days } = await supabase.storage.from("content-factory").list("music-samples", { limit: 50 });
      for (const d of days ?? []) {
        const { data: files } = await supabase.storage.from("content-factory").list(`music-samples/${d.name}`, { limit: 50 });
        for (const f of files ?? []) {
          const brand = f.name.split("-")[0] as keyof typeof LIBRARY_FOLDER;
          if (!LIBRARY_FOLDER[brand]) continue;
          const { error } = await supabase.storage
            .from("content-factory")
            .copy(`music-samples/${d.name}/${f.name}`, `${LIBRARY_FOLDER[brand]}/ai-sample-${f.name}`);
          if (!error) copied++;
        }
      }
      return copied;
    });

    const retired = await step.run("retire-old", async () => {
      const { supabase } = await import("@/lib/supabase.server");
      const { LIBRARY_FOLDER } = await import("@/lib/content-factory/music-gen");
      const out: Record<string, { ai: number; moved: number; kept: string }> = {};
      for (const brand of brands) {
        const folder = LIBRARY_FOLDER[brand];
        const { data } = await supabase.storage.from("content-factory").list(folder, { limit: 500 });
        const tracks = (data ?? []).filter((f) => f.id && /\.(mp3|m4a|wav|aac)$/i.test(f.name));
        const ai = tracks.filter((f) => f.name.startsWith("ai-"));
        const old = tracks.filter((f) => !f.name.startsWith("ai-"));
        if (ai.length < MIN_NEW) {
          out[brand] = { ai: ai.length, moved: 0, kept: `kept ${old.length} old tracks (only ${ai.length} AI tracks)` };
          continue;
        }
        let moved = 0;
        for (const f of old) {
          const { error } = await supabase.storage
            .from("content-factory")
            .move(`${folder}/${f.name}`, `music-removed/${folder.split("/")[1]}/${f.name}`);
          if (!error) moved++;
        }
        out[brand] = { ai: ai.length, moved, kept: old.length - moved ? `${old.length - moved} failed to move` : "" };
      }
      return out;
    });

    const leftAfter = await step.run("credits-after", async () => {
      const { creditsRemaining } = await import("@/lib/content-factory/music-gen");
      return creditsRemaining();
    });

    await step.run("email", async () => {
      const name: Record<string, string> = { mythicals: "Legendary Mythicals", bwk: "Build With Key", ripple: "Ripple" };
      const { sendEmailOrThrow } = await import("@/lib/resend");
      await sendEmailOrThrow({
        from: process.env.CONTENT_FACTORY_EMAIL_FROM ?? '"Ripple Content" <content@getacuity.io>',
        to: process.env.CONTENT_FACTORY_EMAIL_TO ?? "keenan@heelerdigital.com",
        subject: `AI music library: ${made.mythicals + made.bwk + made.ripple} new tracks${errors.length ? ` (${errors.length} failed)` : ""}`,
        html: `<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:640px;color:#1f2430">
<p style="font-size:17px;font-weight:700;margin:0 0 8px">AI music library update</p>
<p style="font-size:13px;color:#555;margin:0 0 10px">ElevenLabs credits: ${plan.left ?? "unknown"} at start → <b>${leftAfter ?? "unknown"} left</b> · up to ${perBrand} per brand · ${samples} approved samples added${stopped ? ` · stopped: ${stopped}` : ""}</p>
<ul style="font-size:14px;line-height:1.8">${brands.map((b) => `<li><b>${name[b]}</b>: ${made[b]} new · library now ${retired[b].ai} AI tracks · ${retired[b].moved} old TikTok tracks archived to music-removed/ ${retired[b].kept ? `· ${retired[b].kept}` : ""}</li>`).join("")}</ul>
${errors.length ? `<p style="font-size:13px;color:#b91c1c">Failures:<br>${errors.map((e) => e.replace(/</g, "&lt;")).join("<br>")}</p>` : ""}
<p style="font-size:13px;color:#555">Every new post video now picks from these. Brands with fewer than ${MIN_NEW} AI tracks keep their old library until topped up (re-run when credits reset).</p>
</div>`,
      });
    });
    return { plan, leftAfter, made, samples, retired, errors };
  }
);
