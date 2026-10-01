import { inngest } from "@/inngest/client";
import type { Storyboard } from "@/lib/content-factory/storyboard";

/**
 * STORYBOARD TEST — event "content-factory/storyboard.test" (2026-09-30,
 * per Keenan: "create two storyboard videos for me with sound effects" and
 * "replace nothing yet while i see if this is viable"; then the "nature
 * reveal" frost-kirin concept as the candidate Mythicals scene format).
 *
 * TEST ONLY: never posts, never touches a lane or ContentLane row. Builds
 * the continuous take (Version B, primary) and optionally the cut version
 * (A) of a DATA-DRIVEN storyboard, adds synced sound (fal MMAudio) and a
 * music bed, and emails the result.
 *
 * Triggered by the 5-minute queue cron (carousel-living-reel.ts):
 *   storyboard-requests/<name>.json      = full build. Body:
 *     { "preset": "kirin" | "dragon" }  or  { "storyboard": { ...Storyboard } }
 *   storyboard-requests/<name>--sfx.json = re-run sound + assembly + email
 *     only, on the saved clips (no new image/video cost).
 *
 * data: { name, mode?: "full" | "sfx", preset?, storyboard? }
 */

interface Manifest {
  name: string;
  sb: Storyboard;
  refs: Record<string, string>;
  sheetUrl: string;
  a: { shots: { raw: string; base: string }[]; clips: (string | null)[] } | null;
  b: { shots: { raw: string; base: string }[]; clips: (string | null)[]; frames: (string | null)[]; notes: string[] } | null;
}

export const storyboardTestFn = inngest.createFunction(
  {
    id: "storyboard-test",
    name: "Content Factory — Storyboard Test",
    retries: 1,
    concurrency: { key: "event.data.name", limit: 1 },
    triggers: [{ event: "content-factory/storyboard.test" }],
    onFailure: async ({ event, error }) => {
      const name = (event.data as { event?: { data?: { name?: string } } })?.event?.data?.name;
      if (!name) return;
      try {
        const { supabase } = await import("@/lib/supabase.server");
        await supabase.storage
          .from("content-factory")
          .upload(`storyboards/${name}/error.txt`, Buffer.from(`${new Date().toISOString()}\n${error?.message ?? String(error)}`), {
            contentType: "text/plain",
            upsert: true,
          });
      } catch {
        // best effort
      }
    },
  },
  async ({ event, step, logger }) => {
    const data = event.data as { name: string; mode?: "full" | "sfx"; preset?: string; storyboard?: Partial<Storyboard> };
    const { name, mode = "full" } = data;
    const dir = `storyboards/${name}`;

    const upload = async (p: string, buf: Buffer, type: string): Promise<string> => {
      const { supabase } = await import("@/lib/supabase.server");
      const { error } = await supabase.storage.from("content-factory").upload(p, buf, { contentType: type, upsert: true });
      if (error) throw new Error(`Upload failed (${p}): ${error.message}`);
      return supabase.storage.from("content-factory").getPublicUrl(p).data.publicUrl;
    };

    // ── Higgsfield: animate a set of images, waves + model fallback ─────
    // Clip length for this storyboard (5 or 10s); set once the storyboard is known.
    let shotSec = 5;
    const animate = async (label: string, jobs: { key: number; imageUrl: string; prompt: string }[]) => {
      const { POST_VIDEO_WAVE, POST_VIDEO_MODEL, POST_VIDEO_FALLBACK_MODEL, POST_VIDEO_ROUNDS } = await import(
        "@/lib/content-factory/post-video"
      );
      const models = [...new Set([POST_VIDEO_MODEL, POST_VIDEO_FALLBACK_MODEL].filter(Boolean))];
      const out: Record<number, string | null> = {};
      for (let w = 0; w * POST_VIDEO_WAVE < jobs.length; w++) {
        let remaining = jobs.slice(w * POST_VIDEO_WAVE, (w + 1) * POST_VIDEO_WAVE);
        for (let a = 0; a < models.length && remaining.length > 0; a++) {
          const model = models[a];
          const batch = remaining;
          const submitted = await step.run(`${label}-submit-${w}-${a}`, async () => {
            const { submitCoverVideo } = await import("@/lib/content-factory/animate-cover");
            return Promise.all(
              batch.map(async (j) => {
                try {
                  return { key: j.key, id: (await submitCoverVideo({ startImageUrl: j.imageUrl, prompt: j.prompt, duration: shotSec, model })) as string | null };
                } catch (err) {
                  return { key: j.key, id: null as string | null, error: err instanceof Error ? err.message : String(err) };
                }
              })
            );
          });
          let pending = submitted.filter((s) => s.id);
          const rounds = POST_VIDEO_ROUNDS[a] ?? 20;
          for (let r = 0; r < rounds && pending.length > 0; r++) {
            await step.sleep(`${label}-wait-${w}-${a}-${r}`, "30s");
            const results = await step.run(`${label}-poll-${w}-${a}-${r}`, async () => {
              const { checkCoverVideo } = await import("@/lib/content-factory/animate-cover");
              return Promise.all(
                pending.map(async (j) => {
                  try {
                    const st = await checkCoverVideo(j.id!, model);
                    if (st.status === "completed" && st.videoUrl) return { key: j.key, state: "done" as const, url: st.videoUrl };
                    if (st.status === "queued" || st.status === "in_progress") return { key: j.key, state: "wait" as const };
                    return { key: j.key, state: "failed" as const, reason: st.status };
                  } catch {
                    return { key: j.key, state: "wait" as const };
                  }
                })
              );
            });
            for (const res of results) {
              if (res.state === "done") out[res.key] = res.url;
              if (res.state === "failed") logger.warn(`[storyboard] ${label} ${model} shot ${res.key} ended ${res.reason}`);
            }
            const settled = new Set(results.filter((x) => x.state !== "wait").map((x) => x.key));
            pending = pending.filter((j) => !settled.has(j.key));
          }
          remaining = batch.filter((j) => !out[j.key]);
        }
        for (const j of jobs.slice(w * POST_VIDEO_WAVE, (w + 1) * POST_VIDEO_WAVE)) if (!(j.key in out)) out[j.key] = null;
      }
      return out;
    };

    let manifest: Manifest;

    if (mode === "sfx") {
      manifest = await step.run("load-manifest", async () => {
        const { supabase } = await import("@/lib/supabase.server");
        const { data: file } = await supabase.storage.from("content-factory").download(`${dir}/manifest.json`);
        if (!file) throw new Error(`No manifest at ${dir}/manifest.json — run the full build first`);
        return JSON.parse(await file.text()) as Manifest;
      });
    } else {
      const sb = await step.run("resolve-storyboard", async () => {
        const { resolveStoryboard } = await import("@/lib/content-factory/storyboard");
        return resolveStoryboard({ preset: data.preset, storyboard: data.storyboard });
      });
      const shots = sb.shots;
      shotSec = sb.shotSec ?? 5;
      const { shotMotionPrompt } = await import("@/lib/content-factory/storyboard");

      // ── 1. References, generated once, into one sheet ──────────────
      const refs: Record<string, string> = {};
      for (const key of Object.keys(sb.refs)) {
        refs[key] = await step.run(`ref-${key}`, async () => {
          const { generateImage } = await import("@/lib/content-factory/carousel-generate");
          const { refPrompt } = await import("@/lib/content-factory/storyboard");
          return upload(`${dir}/ref-${key}.jpg`, await generateImage(refPrompt(sb, key), "cover"), "image/jpeg");
        });
      }
      const sheetUrl = await step.run("reference-sheet", async () => {
        const { buildCharacterSheet, fetchBuffer } = await import("@/lib/content-factory/storyboard");
        const bufs = await Promise.all(Object.keys(sb.refs).map((k) => fetchBuffer(refs[k])));
        return upload(`${dir}/sheet.jpg`, await buildCharacterSheet(bufs), "image/jpeg");
      });

      // Shot images from the sheet (shot 1 always; all shots for Version A).
      const sheetShot = (shot: (typeof shots)[number], prefix: string) =>
        step.run(`${prefix}-shot-${shot.n}`, async () => {
          const { generateImageWithReference, generateCheckedImage } = await import("@/lib/content-factory/carousel-generate");
          const { shotPrompt, toBaseFrame, fetchBuffer } = await import("@/lib/content-factory/storyboard");
          const sheet = await fetchBuffer(sheetUrl);
          const slot = shot.n === 1 ? "cover" : "item";
          const { buffer, qc } = await generateCheckedImage(() => generateImageWithReference(shotPrompt(sb, shot), sheet, slot), {
            scene: shot.scene,
            slot,
            personAllowed: true,
            fantasy: true,
          });
          logger.info(`[storyboard] ${prefix} shot ${shot.n} quality: ${qc}`);
          return {
            raw: await upload(`${dir}/${prefix}-shot-${shot.n}.jpg`, buffer, "image/jpeg"),
            base: await upload(`${dir}/${prefix}-base-${shot.n}.jpg`, await toBaseFrame(buffer), "image/jpeg"),
          };
        });

      const first = await sheetShot(shots[0], "s");
      const wantA = sb.versions.includes("a");
      const wantB = sb.versions.includes("b");

      // ── 2. Version A (cut): every shot from the sheet, independent ──
      let a: Manifest["a"] = null;
      if (wantA) {
        const aShots = [first];
        for (const shot of shots.slice(1)) aShots.push(await sheetShot(shot, "a"));
        const map = await animate(
          "a",
          shots.map((s, i) => ({ key: s.n, imageUrl: aShots[i].base, prompt: shotMotionPrompt(sb, s) }))
        );
        a = { shots: aShots, clips: shots.map((s) => map[s.n] ?? null) };
      }

      // ── 3. Version B (continuous): each shot edited from the previous
      // clip's last frame (+ the sheet; + the opening frame on the last
      // shot when the reel should loop) ──────────────────────────────
      let b: Manifest["b"] = null;
      if (wantB) {
        const firstClip = a?.clips[0] ?? (await animate("b1", [{ key: 1, imageUrl: first.base, prompt: shotMotionPrompt(sb, shots[0]) }]))[1] ?? null;
        const bShots = [first];
        const bClips: (string | null)[] = [firstClip];
        const bFrames: (string | null)[] = [null];
        const notes: string[] = [`shot 1 from the reference sheet${a ? " (shared with Version A)" : ""}`];
        for (let i = 1; i < shots.length; i++) {
          const shot = shots[i];
          const prevClip = bClips[i - 1];
          const frameUrl = prevClip
            ? await step.run(`b-frame-${shot.n}`, async () => {
                const { extractLastFrame, fetchBuffer } = await import("@/lib/content-factory/storyboard");
                return upload(`${dir}/b-frame-${shot.n}.jpg`, await extractLastFrame(await fetchBuffer(prevClip)), "image/jpeg");
              })
            : null;
          bFrames.push(frameUrl);
          const loopEnd = sb.endMatchesStart && i === shots.length - 1;
          if (frameUrl && sb.chain === "raw") {
            // Exact last frame, untouched: the join is pixel-identical.
            bShots.push({ raw: frameUrl, base: frameUrl });
            notes.push(`shot ${shot.n}: starts from shot ${shot.n - 1}'s exact last frame (nothing redrawn)`);
          } else if (!frameUrl) {
            bShots.push(a ? a.shots[i] : await sheetShot(shot, "b"));
            notes.push(`shot ${shot.n}: previous clip failed, generated from the sheet instead`);
          } else {
            bShots.push(
              await step.run(`b-shot-${shot.n}`, async () => {
                const { generateCheckedImage } = await import("@/lib/content-factory/carousel-generate");
                const { continuationPrompt, editWithReferences, toBaseFrame, fetchBuffer } = await import(
                  "@/lib/content-factory/storyboard"
                );
                const refBufs = await Promise.all([frameUrl, sheetUrl, ...(loopEnd ? [first.raw] : [])].map(fetchBuffer));
                const { buffer, qc } = await generateCheckedImage(
                  () => editWithReferences(continuationPrompt(sb, shot, { matchOpening: loopEnd }), refBufs, "medium"),
                  { scene: shot.scene, slot: "item", personAllowed: true, fantasy: true }
                );
                logger.info(`[storyboard] B shot ${shot.n} quality: ${qc}`);
                return {
                  raw: await upload(`${dir}/b-shot-${shot.n}.jpg`, buffer, "image/jpeg"),
                  base: await upload(`${dir}/b-base-${shot.n}.jpg`, await toBaseFrame(buffer), "image/jpeg"),
                };
              })
            );
            notes.push(`shot ${shot.n}: edited from shot ${shot.n - 1}'s last frame + sheet${loopEnd ? " + opening frame (loop)" : ""}`);
          }
          const one = await animate(`b${shot.n}`, [{ key: shot.n, imageUrl: bShots[i].base, prompt: shotMotionPrompt(sb, shot) }]);
          bClips.push(one[shot.n] ?? null);
        }
        b = { shots: bShots, clips: bClips, frames: bFrames, notes };
      }

      manifest = { name, sb, refs, sheetUrl, a, b };
      await step.run("save-manifest", async () => {
        await upload(`${dir}/manifest.json`, Buffer.from(JSON.stringify(manifest, null, 1)), "application/json");
      });
    }

    const sb = manifest.sb;
    const shots = sb.shots;
    shotSec = sb.shotSec ?? 5;
    const versions = (["b", "a"] as const).filter((v) => manifest[v]);

    // ── 4. Sound: fal MMAudio per clip (one call per unique clip) ──────
    let locked = "";
    const sfxByClip: Record<string, string | null> = {};
    let n = 0;
    for (const v of versions) {
      const ver = manifest[v]!;
      for (let i = 0; i < shots.length; i++) {
        const clip = ver.clips[i];
        if (!clip || clip in sfxByClip || locked) continue;
        const r = await step.run(`sfx-${v}-${shots[i].n}`, async () => {
          const { falVideoToAudio, FalLockedError } = await import("@/lib/content-factory/storyboard");
          try {
            const audio = await falVideoToAudio(clip, shots[i].sfx, shotSec);
            return { url: await upload(`${dir}/sfx/${v}-${shots[i].n}.m4a`, audio, "audio/mp4") };
          } catch (err) {
            if (err instanceof FalLockedError) return { locked: err.message };
            return { error: err instanceof Error ? err.message : String(err) };
          }
        });
        if ("locked" in r && r.locked) locked = r.locked;
        sfxByClip[clip] = "url" in r && r.url ? r.url : null;
        if ("url" in r && r.url) n++;
        if ("error" in r) logger.warn(`[storyboard] sfx ${v}-${shots[i].n} failed: ${r.error}`);
      }
    }

    // ── 5. Segments (optional text on first/last shot), then assembly ──
    const music = await step.run("music", async () => {
      const { pickMusicTrack } = await import("@/lib/content-factory/slideshow-reel");
      const { SHOT_SEC } = await import("@/lib/content-factory/storyboard");
      return pickMusicTrack("mythic-picks", undefined, { minSeconds: Math.ceil(shots.length * (manifest.sb.shotSec ?? SHOT_SEC)) });
    });
    const urls: Record<string, string> = {};
    for (const v of versions) {
      const ver = manifest[v]!;
      const segUrls: string[] = [];
      for (let i = 0; i < shots.length; i++) {
        segUrls.push(
          await step.run(`segment-${v}-${shots[i].n}`, async () => {
            const { renderShotSegment, renderStillSegment, fetchBuffer } = await import("@/lib/content-factory/storyboard");
            const text = i === 0 ? sb.coverText : i === shots.length - 1 ? sb.closingQuestion : null;
            let layer: Buffer | null = null;
            if (text) {
              const { renderChoiceOverlay, buildTextLayer } = await import("@/lib/content-factory/compose");
              layer = await buildTextLayer(await fetchBuffer(ver.shots[i].raw), await renderChoiceOverlay({ top: text, topSize: 66 }));
            }
            const clip = ver.clips[i];
            const buf = clip
              ? await renderShotSegment(await fetchBuffer(clip), layer, shotSec)
              : await renderStillSegment(await fetchBuffer(ver.shots[i].base), layer, shotSec);
            return upload(`${dir}/seg-${v}-${shots[i].n}.mp4`, buf, "video/mp4");
          })
        );
      }
      urls[v] = await step.run(`assemble-${v}`, async () => {
        const { assembleWithSound, fetchBuffer } = await import("@/lib/content-factory/storyboard");
        const segments = await Promise.all(segUrls.map(fetchBuffer));
        const sfx = await Promise.all(
          ver.clips.map((c) => (c && sfxByClip[c] ? fetchBuffer(sfxByClip[c]!) : Promise.resolve(null)))
        );
        const { buf } = await assembleWithSound({
          segments,
          sfx,
          music: music ? await fetchBuffer(music) : null,
          musicFromShot: sb.musicFromShot,
          seconds: shotSec,
        });
        return upload(`${dir}/version-${v}.mp4`, buf, "video/mp4");
      });
    }

    // ── 6. Email ─────────────────────────────────────────────────────
    await step.run("email", async () => {
      const { sendStoryboardEmail } = await import("@/lib/content-factory/storyboard");
      const failed = versions.reduce((acc, v) => acc + manifest[v]!.clips.filter((c) => !c).length, 0);
      const clips = Object.keys(sfxByClip).length + (locked ? 1 : 0);
      const images = Object.keys(sb.refs).length + 1 + (manifest.a ? shots.length - 1 : 0) + (manifest.b ? shots.length - 1 : 0);
      const animations = (manifest.a ? shots.length : 0) + (manifest.b ? shots.length - (manifest.a ? 1 : 0) : 0);
      await sendStoryboardEmail({
        sb,
        aUrl: urls.a ?? null,
        bUrl: urls.b ?? null,
        bApproach:
          "One continuous take: each shot starts from the last frame of the shot before it, edited toward the next moment with the same reference sheet, so the light, mist and creature carry over.",
        sfxNote: locked
          ? `No sound effects yet: fal.ai refused (${locked.slice(0, 120)}). Music only for now; the sound can be added onto these same clips with no new video cost.`
          : `Sound: synced effects on ${n} of ${clips} clips (fal MMAudio), with a soft music bed${sb.musicFromShot > 1 ? ` swelling in from shot ${sb.musicFromShot}` : ""} underneath.${failed ? ` ${failed} clip(s) failed and show as a slow push-in on the still.` : ""}`,
        costNote: `Approximate cost: $${(images * 0.1 + animations * 0.12 + clips * 0.005).toFixed(2)} (${images} images, ${animations} animated clips, ${clips} sound passes). ${manifest.b ? `Continuity notes: ${manifest.b.notes.join("; ")}` : ""}`,
      });
    });

    return { name, mode, urls, sfx: n, locked: !!locked };
  }
);
