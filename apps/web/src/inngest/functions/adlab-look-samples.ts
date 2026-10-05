import { inngest } from "@/inngest/client";

/**
 * ADLAB LOOK SAMPLES — event "adlab/look-samples.requested" (2026-10-05, per
 * Keenan: overhaul the ad image builder for variety, then review the looks).
 * Renders one sample ad per look in lib/adlab/ad-looks.ts with realistic
 * copy (alternating the women's and men's lanes), uploads each, builds a
 * labeled contact sheet and emails it, so looks can be cut before a real
 * batch uses them. Four renders per step keeps each step inside the cap.
 */

type Sample = { key: string; label: string; lane: "women" | "men"; url: string | null; error?: string };

const COPY = {
  women: {
    headline: "The school form, said once",
    description: "Ripple turns what you say into a dated to-do list.",
    cta: "SIGN_UP",
    imageScene: "n/a",
    solutionLine: "Say it once. Ripple lists it with the date.",
    benefits: ["School form, due Friday", "Dentist, Tuesday 3pm", "Call Mom back, Sunday"],
    said: "Emma's form is due Friday, the dentist is Tuesday at 3, and I still haven't called Mom back.",
    caught: ["To-do: Emma's form, Friday", "To-do: dentist, Tue 3pm", "Repeat: call Mom, 3 weeks"],
    lines: ["Is the form due Friday?", "Yes. And the dentist moved to Tuesday.", "Did you write it down?", "I just said it to Ripple. It's on my list."],
    stats: [{ value: "14", label: "things handled" }, { value: "3", label: "slipped" }, { value: "4 wks", label: "same worry" }],
    insight: "Money came up every Sunday. Gone by Wednesday.",
  },
  men: {
    headline: "Said 5 workouts. Did 2.",
    description: "Ripple tracks the habits you mention and flags the misses.",
    cta: "SIGN_UP",
    imageScene: "n/a",
    solutionLine: "Say what you did. Ripple keeps the score.",
    benefits: ["Gym: 2 of 5 this week", "'Tomorrow' said 6 times", "Side project: 0 hours"],
    said: "Skipped the gym again, too tired. I'll start the side project Monday.",
    caught: ["Habit missed: gym, 3rd time", "Repeat: 'start Monday'", "Promise: side project"],
    lines: ["Gym Monday. Didn't go.", "Gym Wednesday. Didn't go.", "Said it out loud both times.", "Week 3 it flagged the pattern.", "Went Thursday."],
    stats: [{ value: "2/5", label: "workouts done" }, { value: "6x", label: "said 'tomorrow'" }, { value: "0h", label: "side project" }],
    insight: "Every skipped workout followed a night past 1am.",
  },
};

export const adlabLookSamplesFn = inngest.createFunction(
  {
    id: "adlab-look-samples",
    name: "AdLab — Look Library Samples",
    retries: 0,
    concurrency: { limit: 1 },
    triggers: [{ event: "adlab/look-samples.requested" }],
  },
  async ({ step }) => {
    const runId = `${Date.now()}`;
    const { LOOKS } = await import("@/lib/adlab/ad-looks");
    const looks = LOOKS.map((l, i) => ({ key: l.key, label: l.label, lane: (i % 2 === 0 ? "women" : "men") as "women" | "men" }));
    const samples: Sample[] = [];
    for (let i = 0; i < looks.length; i += 4) {
      const chunk = looks.slice(i, i + 4);
      const done = await step.run(`render-${i}`, async () => {
        const { renderLookSample } = await import("@/lib/adlab/weekly-batch");
        const { supabase } = await import("@/lib/supabase.server");
        return Promise.all(
          chunk.map(async (l): Promise<Sample> => {
            try {
              const buf = await renderLookSample(l.key, COPY[l.lane], l.lane);
              const p = `look-samples/${runId}/${l.key}.jpg`;
              const { error } = await supabase.storage.from("adlab-creatives").upload(p, buf, { contentType: "image/jpeg", upsert: true });
              if (error) throw new Error(error.message);
              return { ...l, url: supabase.storage.from("adlab-creatives").getPublicUrl(p).data.publicUrl };
            } catch (err) {
              return { ...l, url: null, error: String(err instanceof Error ? err.message : err).slice(0, 200) };
            }
          })
        );
      });
      samples.push(...done);
    }

    return step.run("sheet-and-email", async () => {
      const { default: sharp } = await import("sharp");
      const { supabase } = await import("@/lib/supabase.server");
      const ok = samples.filter((s) => s.url);
      const W = 270;
      const H = 338;
      const LABEL = 46;
      const cols = 6;
      const rows = Math.ceil(ok.length / cols);
      const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const tiles = await Promise.all(
        ok.map(async (s, i) => {
          const r = await fetch(s.url!);
          const img = await sharp(Buffer.from(await r.arrayBuffer())).resize(W, H, { fit: "cover" }).toBuffer();
          const label = Buffer.from(
            `<svg width="${W}" height="${LABEL}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#ffffff"/><text x="8" y="19" font-family="Helvetica, Arial" font-size="15" font-weight="700" fill="#111">${samples.indexOf(s) + 1}. ${esc(s.label).slice(0, 30)}</text><text x="8" y="38" font-family="Helvetica, Arial" font-size="12" fill="#777">${esc(s.key)} · ${s.lane}</text></svg>`
          );
          return [
            { input: img, left: (i % cols) * W, top: Math.floor(i / cols) * (H + LABEL) },
            { input: label, left: (i % cols) * W, top: Math.floor(i / cols) * (H + LABEL) + H },
          ];
        })
      );
      const sheet = await sharp({ create: { width: cols * W, height: rows * (H + LABEL), channels: 3, background: { r: 245, g: 245, b: 245 } } })
        .composite(tiles.flat())
        .jpeg({ quality: 82 })
        .toBuffer();
      const sheetPath = `look-samples/${runId}/contact-sheet.jpg`;
      await supabase.storage.from("adlab-creatives").upload(sheetPath, sheet, { contentType: "image/jpeg", upsert: true });
      const sheetUrl = supabase.storage.from("adlab-creatives").getPublicUrl(sheetPath).data.publicUrl;

      const { sendEmailOrThrow } = await import("@/lib/resend");
      const list = samples
        .map((s, i) => `<li>${s.url ? `<a href="${s.url}">${i + 1}. ${esc(s.label)}</a>` : `${i + 1}. ${esc(s.label)}: <i>failed (${esc(s.error ?? "")})</i>`} <span style="color:#888">(${s.key}, ${s.lane})</span></li>`)
        .join("");
      await sendEmailOrThrow({
        from: '"Ripple AdLab" <keenan@getacuity.io>',
        to: ["keenan@heelerdigital.com"],
        subject: `AdLab: ${ok.length} new ad looks to review`,
        html: `<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:680px;line-height:1.5;color:#1a1a1a">
<h2 style="margin:0 0 8px">The new ad look library</h2>
<p>One sample ad in every look the weekly batch can now use, with the same copy throughout so you can compare the looks. Every real ad also gets a random palette, type style, button style and (for photos) scene, light and camera, so no two ads look alike even in the same look.</p>
<p><b>Reply with the numbers of any looks to cut.</b> Nothing has launched.</p>
<p><a href="${sheetUrl}"><img src="${sheetUrl}" width="660" style="border-radius:8px"/></a></p>
<ol style="padding-left:18px">${list}</ol>
</div>`,
      });
      return { rendered: ok.length, failed: samples.length - ok.length, sheetUrl };
    });
  }
);
