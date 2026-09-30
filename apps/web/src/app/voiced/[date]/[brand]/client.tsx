"use client";

import { useRef, useState } from "react";

type Status = "scripted" | "recorded" | "building" | "built" | "approved" | "failed";

const BRAND_NAME: Record<string, string> = { ripple: "Ripple", bwk: "Build With Key" };

/** Pacing marks → spans: "/" and "//" in coral, *word* emphasized. */
function ReadLine({ text }: { text: string }) {
  const parts = text.split(/(\/\/|\/|\*[^*]+\*)/g).filter((p) => p !== "");
  return (
    <>
      {parts.map((p, i) =>
        p === "/" || p === "//" ? (
          <span key={i} className="mx-1 text-[#F28C62]">
            {p}
          </span>
        ) : p.startsWith("*") && p.endsWith("*") ? (
          <strong key={i} className="text-[#FFB895]">
            {p.slice(1, -1)}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

export function VoicedClient(props: {
  date: string;
  brand: string;
  token: string;
  lines: string[];
  caption: string;
  status: Status;
  videoUrl: string | null;
  error: string | null;
}) {
  const [status, setStatus] = useState<Status>(props.status);
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const auth = { date: props.date, brand: props.brand, t: props.token };

  async function upload(file: File) {
    setMessage(null);
    setBusy(true);
    try {
      const r = await fetch("/api/voiced/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...auth, filename: file.name || "recording.m4a" }),
      });
      const j = (await r.json()) as { signedUrl?: string; path?: string; error?: string };
      if (!r.ok || !j.signedUrl || !j.path) throw new Error(j.error ?? "Couldn't start the upload.");
      // Same request shape supabase-js uploadToSignedUrl sends.
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", j.signedUrl!);
        xhr.setRequestHeader("x-upsert", "true");
        xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));
        xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status}).`)));
        xhr.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
        const form = new FormData();
        form.append("cacheControl", "3600");
        form.append("", file);
        xhr.send(form);
      });
      const done = await fetch("/api/voiced/recorded", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...auth, path: j.path }),
      });
      const dj = (await done.json()) as { error?: string };
      if (!done.ok) throw new Error(dj.error ?? "Couldn't start the build.");
      setStatus("building");
      setMessage("Got it. Your video is being built and will land in your inbox in about 5 minutes.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
      setProgress(null);
      if (input.current) input.current.value = "";
    }
  }

  async function approve() {
    setMessage(null);
    setBusy(true);
    try {
      const r = await fetch("/api/voiced/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(auth),
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(j.error ?? "Approve failed.");
      setStatus("approved");
      setMessage("Approved. It posts to Instagram and Facebook at the next open slot.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const approved = status === "approved";
  return (
    <main className="min-h-screen bg-[#141210] px-4 pb-16 pt-8 text-[#EDE7E0]">
      <div className="mx-auto max-w-md">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#8A827A]">
          {BRAND_NAME[props.brand] ?? props.brand} · {props.date}
        </p>
        <h1 className="mt-1 text-2xl font-semibold">Today&apos;s voiced video</h1>

        {props.videoUrl && (status === "built" || approved) && (
          <section className="mt-6">
            <video src={props.videoUrl} controls playsInline className="w-full rounded-2xl bg-black" />
            {!approved && (
              <button
                onClick={approve}
                disabled={busy}
                className="mt-4 w-full rounded-2xl bg-[#F28C62] py-4 text-lg font-semibold text-[#141210] disabled:opacity-50"
              >
                Approve and post
              </button>
            )}
          </section>
        )}

        {message && <p className="mt-4 rounded-xl bg-[#1E1B18] p-4 text-sm leading-relaxed">{message}</p>}
        {status === "building" && !message && (
          <p className="mt-4 rounded-xl bg-[#1E1B18] p-4 text-sm">Your video is being built. It&apos;ll be emailed to you when it&apos;s ready.</p>
        )}
        {status === "failed" && props.error && !message && (
          <p className="mt-4 rounded-xl bg-[#2A1A1A] p-4 text-sm text-[#F2A0A0]">The last build failed: {props.error}. Upload again to retry.</p>
        )}

        <section className="mt-6 rounded-2xl bg-[#1E1B18] p-5">
          {props.lines.map((l, i) => (
            <p key={i} className="mb-4 text-xl leading-relaxed last:mb-0">
              <ReadLine text={l} />
            </p>
          ))}
        </section>
        <p className="mt-3 text-xs text-[#8A827A]">
          <span className="text-[#F28C62]">/</span> short pause · <span className="text-[#F28C62]">//</span> longer pause ·{" "}
          <strong className="text-[#FFB895]">bold</strong> = lean on it. One take is fine; the video follows what you actually say.
        </p>

        {!approved && (
          <>
            <input
              ref={input}
              type="file"
              accept="audio/*,.m4a,.mp3,.wav"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            />
            <button
              onClick={() => input.current?.click()}
              disabled={busy}
              className="mt-6 w-full rounded-2xl border border-[#F28C62] py-4 text-lg font-semibold text-[#F28C62] disabled:opacity-50"
            >
              {progress !== null
                ? `Uploading… ${progress}%`
                : busy
                  ? "Working…"
                  : status === "scripted"
                    ? "Upload your recording"
                    : "Upload a new take"}
            </button>
          </>
        )}

        <details className="mt-6 text-sm text-[#A39A91]">
          <summary className="cursor-pointer">Caption</summary>
          <pre className="mt-2 whitespace-pre-wrap font-sans">{props.caption}</pre>
        </details>
      </div>
    </main>
  );
}
