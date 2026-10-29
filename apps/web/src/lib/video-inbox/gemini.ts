/**
 * Gemini as the video inbox's eyes and ears (2026-10-29). Gemini watches a
 * whole video, picture and sound: YouTube links go straight in as a
 * file_uri (Google fetches them), other videos are uploaded to the Files
 * API and deleted after the answer. REST over fetch, no SDK.
 *
 * Model chain: GEMINI_VIDEO_MODEL first, then newer → older flash models,
 * moving on when one is missing (404), rate-limited (429) or overloaded
 * (5xx). A 402/403 (no credits, bad key) stops the chain: no other model
 * will answer either.
 */

const API = "https://generativelanguage.googleapis.com";

const MODEL_CHAIN = [
  process.env.GEMINI_VIDEO_MODEL?.trim(),
  "gemini-3.8-flash",
  "gemini-flash-latest",
  "gemini-3.5-flash",
  "gemini-2.5-flash",
].filter((m, i, a): m is string => !!m && a.indexOf(m) === i);

/** The key works for no model (no credits, invalid, missing). Callers fall back. */
export class GeminiUnavailable extends Error {}

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new GeminiUnavailable("GEMINI_API_KEY not set");
  return key;
}

export interface GeminiWatch {
  text: string;
  model: string;
}

type FilePart = { file_data: { file_uri: string; mime_type?: string } };

async function generate(file: FilePart, prompt: string): Promise<GeminiWatch> {
  const key = apiKey();
  let lastError = "";
  for (const model of MODEL_CHAIN) {
    const res = await fetch(`${API}/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ parts: [file, { text: prompt }] }] }),
      signal: AbortSignal.timeout(240_000),
    });
    const body = await res.text();
    if (res.ok) {
      const data = JSON.parse(body) as {
        candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
      };
      const text = (data.candidates?.[0]?.content?.parts ?? [])
        .filter((p) => !p.thought && typeof p.text === "string")
        .map((p) => p.text)
        .join("")
        .trim();
      if (text) return { text, model };
      lastError = `${model}: empty answer`;
      continue;
    }
    lastError = `${model} ${res.status}: ${body.slice(0, 300)}`;
    if (res.status === 401 || res.status === 402 || res.status === 403) throw new GeminiUnavailable(lastError);
    if (res.status === 404 || res.status === 429 || res.status >= 500) continue;
    // 400 etc. is about the video itself (private, too long, unsupported).
    throw new Error(lastError);
  }
  throw new Error(`Gemini: no model answered (${lastError})`);
}

/** Gemini watches a YouTube video by its link. */
export function watchYouTube(url: string, prompt: string): Promise<GeminiWatch> {
  return generate({ file_data: { file_uri: url } }, prompt);
}

/** Upload a video to the Files API, wait until it's processed, watch it, delete it. */
export async function watchVideoFile(video: Buffer, mimeType: string, prompt: string): Promise<GeminiWatch> {
  const key = apiKey();
  const start = await fetch(`${API}/upload/v1beta/files`, {
    method: "POST",
    headers: {
      "x-goog-api-key": key,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(video.length),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: "video-inbox" } }),
  });
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!start.ok || !uploadUrl) {
    const msg = `Gemini upload start ${start.status}: ${(await start.text().catch(() => "")).slice(0, 300)}`;
    if (start.status === 401 || start.status === 402 || start.status === 403) throw new GeminiUnavailable(msg);
    throw new Error(msg);
  }
  const up = await fetch(uploadUrl, {
    method: "POST",
    headers: { "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize" },
    body: new Uint8Array(video),
    signal: AbortSignal.timeout(120_000),
  });
  if (!up.ok) throw new Error(`Gemini upload ${up.status}: ${(await up.text().catch(() => "")).slice(0, 300)}`);
  let file = ((await up.json()) as { file: { name: string; uri: string; mimeType: string; state: string } }).file;
  try {
    const deadline = Date.now() + 120_000;
    while (file.state === "PROCESSING" && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 3000));
      const r = await fetch(`${API}/v1beta/${file.name}`, { headers: { "x-goog-api-key": key } });
      if (r.ok) file = (await r.json()) as typeof file;
    }
    if (file.state !== "ACTIVE") throw new Error(`Gemini file ${file.state.toLowerCase()} after upload`);
    return await generate({ file_data: { file_uri: file.uri, mime_type: file.mimeType } }, prompt);
  } finally {
    // Uploads expire within 48h anyway; deleting is tidiness, not safety.
    await fetch(`${API}/v1beta/${file.name}`, { method: "DELETE", headers: { "x-goog-api-key": key } }).catch(() => {});
  }
}
