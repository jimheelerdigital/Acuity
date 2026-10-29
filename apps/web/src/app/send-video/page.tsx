"use client";

/**
 * /send-video?k=<VIDEO_INBOX_SECRET> — Keenan's home-screen "Send to Ripple"
 * icon for the video inbox (2026-10-29). The iOS Shortcuts editor was too
 * fiddly, so this is the no-setup version: copy a video link, open the icon,
 * tap Paste & Send. Posts to /api/video-inbox with the key as a Bearer token.
 * The key is remembered on the device, so the page also works without ?k=.
 */

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

const KEY_STORE = "video-inbox-key";
const BRANDS = [
  { id: "", label: "Auto" },
  { id: "ripple", label: "Ripple" },
  { id: "mythicals", label: "Mythicals" },
  { id: "bwk", label: "BWK" },
] as const;

type Phase = "idle" | "sending" | "sent" | "error";

function SendVideo() {
  const params = useSearchParams();
  const [key, setKey] = useState("");
  const [link, setLink] = useState("");
  const [note, setNote] = useState("");
  const [brand, setBrand] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const fromUrl = params?.get("k") ?? "";
    let stored = "";
    try {
      stored = localStorage.getItem(KEY_STORE) ?? "";
      if (fromUrl) localStorage.setItem(KEY_STORE, fromUrl);
    } catch {
      /* private mode: the ?k= in the bookmark still works */
    }
    setKey(fromUrl || stored);
    const shared = params?.get("url");
    if (shared) setLink(shared);
  }, [params]);

  async function send(url: string) {
    if (!url.trim()) {
      setPhase("error");
      setMessage("Copy a video link first, then tap Paste & Send.");
      return;
    }
    setPhase("sending");
    try {
      const res = await fetch("/api/video-inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ url, note: note || undefined, brand: brand || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (res.status === 401 || res.status === 403) {
        setPhase("error");
        setMessage("This icon is missing its key. Open the setup link from Claude again and re-add it to your home screen.");
        return;
      }
      setPhase(res.ok ? "sent" : "error");
      setMessage(data.message ?? (res.ok ? "Sent." : "Something went wrong. Try again."));
      if (res.ok) {
        setLink("");
        setNote("");
      }
    } catch {
      setPhase("error");
      setMessage("No connection. Try again.");
    }
  }

  async function pasteAndSend() {
    let url = link;
    if (!url) {
      try {
        url = await navigator.clipboard.readText();
        setLink(url);
      } catch {
        setPhase("error");
        setMessage("Couldn't read the clipboard. Paste the link into the box instead.");
        return;
      }
    }
    await send(url);
  }

  return (
    <div className="flex min-h-screen items-start justify-center bg-zinc-950 px-4 pb-8 pt-16">
      <div className="w-full max-w-sm">
        <h1 className="text-[24px] font-bold text-white">Send to Ripple</h1>
        <p className="mt-1 text-[14px] text-zinc-400">
          Copy a video&apos;s link (Share → Copy Link), then tap the button. The breakdown comes by email.
        </p>

        <button
          type="button"
          onClick={pasteAndSend}
          disabled={phase === "sending"}
          className="mt-6 block w-full rounded-full bg-[#F97E4E] px-6 py-4 text-[17px] font-bold text-white active:scale-[0.98] disabled:opacity-60"
        >
          {phase === "sending" ? "Sending…" : link ? "Send" : "Paste & Send"}
        </button>

        {phase === "sent" && <p className="mt-4 rounded-2xl bg-emerald-950 px-4 py-3 text-[15px] text-emerald-200">{message}</p>}
        {phase === "error" && <p className="mt-4 rounded-2xl bg-red-950 px-4 py-3 text-[15px] text-red-200">{message}</p>}

        <div className="mt-8 space-y-3">
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="Or paste the link here"
            inputMode="url"
            className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-[16px] text-white placeholder:text-zinc-500"
          />
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional): what you like, or never do this"
            rows={2}
            className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-[16px] text-white placeholder:text-zinc-500"
          />
          <div className="flex gap-2">
            {BRANDS.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setBrand(b.id)}
                className={`flex-1 rounded-full px-2 py-2 text-[14px] font-semibold ${
                  brand === b.id ? "bg-white text-zinc-950" : "bg-zinc-900 text-zinc-300"
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SendVideoPage() {
  return (
    <Suspense fallback={null}>
      <SendVideo />
    </Suspense>
  );
}
