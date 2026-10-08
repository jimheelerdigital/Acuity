"use client";

/**
 * /save-video?path=<bucket path>&name=<file name> — the "Save to camera roll"
 * button in the content emails (2026-10-08, per Keenan: "i want to be able
 * to save to my camera roll right from the email").
 *
 * A plain download on iPhone lands in the Files app, not Photos. The share
 * sheet's "Save Video" goes straight to the camera roll, so this page loads
 * the MP4 first (through /api/content-factory/download, same origin), then
 * one tap opens the share sheet with the file. iOS only lets a page open the
 * share sheet from a tap, which is why the file is fetched before the button
 * is enabled rather than on tap.
 */

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type Phase = "loading" | "ready" | "saved" | "missing" | "error";

function SaveVideo() {
  const params = useSearchParams();
  const path = params.get("path") ?? "";
  const name = (params.get("name") ?? "video.mp4").replace(/[^A-Za-z0-9\-_.]/g, "_");
  const src = `/api/content-factory/download?path=${encodeURIComponent(path)}&name=${encodeURIComponent(name)}`;

  const [phase, setPhase] = useState<Phase>("loading");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [canShareFiles, setCanShareFiles] = useState(true);

  useEffect(() => {
    let revoke: string | null = null;
    (async () => {
      try {
        const res = await fetch(src);
        if (res.status === 404) return setPhase("missing");
        if (!res.ok) return setPhase("error");
        const blob = await res.blob();
        const f = new File([blob], name, { type: "video/mp4" });
        revoke = URL.createObjectURL(blob);
        setPreviewUrl(revoke);
        setFile(f);
        setCanShareFiles(typeof navigator.canShare === "function" && navigator.canShare({ files: [f] }));
        setPhase("ready");
      } catch {
        setPhase("error");
      }
    })();
    return () => {
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [src, name]);

  async function save() {
    if (!file) return;
    try {
      await navigator.share({ files: [file] });
      setPhase("saved");
    } catch {
      // Cancelled the sheet: stay ready so she can tap again.
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 py-8">
      <div className="w-full max-w-sm text-center">
        {previewUrl && (
          <video src={previewUrl} controls playsInline muted className="mb-5 max-h-[55vh] w-full rounded-2xl bg-black object-contain" />
        )}
        {phase === "loading" && <p className="text-[15px] text-zinc-300">Loading the video…</p>}
        {phase === "missing" && (
          <p className="text-[15px] text-zinc-300">This video is still rendering. Try again in a few minutes.</p>
        )}
        {phase === "error" && <p className="text-[15px] text-zinc-300">Couldn&apos;t load the video. Refresh to try again.</p>}
        {(phase === "ready" || phase === "saved") && canShareFiles && (
          <>
            <button
              onClick={save}
              className="block w-full rounded-full bg-[#F97E4E] px-6 py-4 text-[16px] font-bold text-white active:scale-[0.98]"
            >
              {phase === "saved" ? "Saved. Save again?" : "Save to camera roll"}
            </button>
            <p className="mt-3 text-[13px] text-zinc-400">Then tap <strong>Save Video</strong> in the menu that opens.</p>
          </>
        )}
        {(phase === "ready" || phase === "saved") && !canShareFiles && (
          <>
            <a href={src} className="block w-full rounded-full bg-[#F97E4E] px-6 py-4 text-[16px] font-bold text-white">
              Download video
            </a>
            <p className="mt-3 text-[13px] text-zinc-400">This browser can&apos;t save straight to Photos. Open this page in Safari on your iPhone for the camera roll button.</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function SaveVideoPage() {
  return (
    <Suspense fallback={null}>
      <SaveVideo />
    </Suspense>
  );
}
