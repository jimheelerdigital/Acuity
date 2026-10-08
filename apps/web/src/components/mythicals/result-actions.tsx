"use client";

import { useState } from "react";

import { beacon } from "./track";

/**
 * Share row (2026-10-08, per Keenan: "the share button should let them share
 * on facebook, instagram, x, social media channels"). Facebook, X, WhatsApp
 * and Reddit open their share pages. Instagram has no web share link, so it
 * shares the creature image through the phone's share sheet (where Instagram
 * Stories appears); on a computer it saves the image and copies the link.
 */
export function ShareButtons({ slug, name, path, imageUrl }: { slug: string; name: string; path: string; imageUrl?: string }) {
  const [note, setNote] = useState("");
  const url = () => `${window.location.origin}${path}`;
  const text = `I'm the ${name}. Which legendary creature are you?`;
  const flash = (t: string) => {
    setNote(t);
    setTimeout(() => setNote(""), 3500);
  };
  const open = (method: string, href: string) => {
    window.open(href, "_blank", "noopener,noreferrer");
    beacon("share", { slug, method });
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url());
      flash("Link copied");
      beacon("share", { slug, method: "copy" });
    } catch {
      // clipboard blocked; nothing to do
    }
  };
  const instagram = async () => {
    beacon("share", { slug, method: "instagram" });
    try {
      if (imageUrl && navigator.canShare) {
        const blob = await (await fetch(imageUrl)).blob();
        const file = new File([blob], `${slug}.jpg`, { type: blob.type || "image/jpeg" });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], text: `${text} ${url()}` });
          return;
        }
      }
    } catch {
      // cancelled or unsupported: fall back below
    }
    if (imageUrl) {
      const a = document.createElement("a");
      a.href = imageUrl;
      a.download = `${slug}.jpg`;
      a.target = "_blank";
      a.click();
    }
    await navigator.clipboard?.writeText(url()).catch(() => {});
    flash("Image saved. Open Instagram, add it to your Story, and paste the link sticker.");
  };
  const native = async () => {
    if (!navigator.share) return copy();
    try {
      await navigator.share({ title: "Legendary Mythicals", text, url: url() });
      beacon("share", { slug, method: "native" });
    } catch {
      // user cancelled
    }
  };
  const enc = encodeURIComponent;
  const btn = "lm-btn-ghost !px-3 !py-2.5 text-sm";
  return (
    <div className="grid gap-3">
      <button type="button" onClick={native} className="lm-btn-gold">
        Share my creature
      </button>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        <button type="button" className={btn} onClick={instagram}>IG Story</button>
        <button type="button" className={btn} onClick={() => open("facebook", `https://www.facebook.com/sharer/sharer.php?u=${enc(url())}`)}>Facebook</button>
        <button type="button" className={btn} onClick={() => open("x", `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url())}`)}>X</button>
        <button type="button" className={btn} onClick={() => open("whatsapp", `https://wa.me/?text=${enc(`${text} ${url()}`)}`)}>WhatsApp</button>
        <button type="button" className={btn} onClick={() => open("reddit", `https://www.reddit.com/submit?url=${enc(url())}&title=${enc(text)}`)}>Reddit</button>
        <button type="button" className={btn} onClick={copy}>Copy link</button>
      </div>
      {note && <p className="text-sm text-[var(--lm-gold)]">{note}</p>}
    </div>
  );
}

export function EmailCapture({
  slug,
  source = "result",
  cta = "Send my profile",
  doneText = "Sent. Check your inbox.",
}: {
  slug: string;
  source?: string;
  cta?: string;
  doneText?: string;
}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("sending");
    try {
      const res = await fetch("/api/mythicals/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, slug, source }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Something went wrong. Try again.");
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      setState("error");
    }
  };

  if (state === "done") {
    return <p className="rounded-lg border border-[#d9a441]/40 bg-[#d9a441]/10 px-4 py-3 text-sm text-[var(--lm-bone)]">{doneText}</p>;
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@email.com"
        autoComplete="email"
        className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/40 px-4 py-3 text-base text-[var(--lm-bone)] placeholder:text-white/30 focus:border-[var(--lm-gold)] focus:outline-none"
      />
      <button type="submit" disabled={state === "sending"} className="lm-btn-gold whitespace-nowrap disabled:opacity-60">
        {state === "sending" ? "Sending" : cta}
      </button>
      {state === "error" && <p className="text-sm text-red-300 sm:hidden">{error}</p>}
      {state === "error" && <p className="hidden text-sm text-red-300 sm:block sm:basis-full">{error}</p>}
    </form>
  );
}

export function PortraitOrder({ slug, answers }: { slug: string; answers: number[] }) {
  const [heroName, setHeroName] = useState("");
  const [element, setElement] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/mythicals/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, heroName, element, answers }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.url) throw new Error(json.error || "Checkout is unavailable right now.");
      window.location.href = json.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout is unavailable right now.");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-3">
      <label className="grid gap-1.5 text-sm text-[var(--lm-dim)]">
        Your hero name
        <input
          required
          maxLength={40}
          value={heroName}
          onChange={(e) => setHeroName(e.target.value)}
          placeholder="e.g. Aria Stormborn"
          className="rounded-lg border border-white/15 bg-black/40 px-4 py-3 text-base text-[var(--lm-bone)] placeholder:text-white/30 focus:border-[var(--lm-gold)] focus:outline-none"
        />
      </label>
      <label className="grid gap-1.5 text-sm text-[var(--lm-dim)]">
        Element or color (optional)
        <input
          maxLength={40}
          value={element}
          onChange={(e) => setElement(e.target.value)}
          placeholder="e.g. obsidian and violet fire"
          className="rounded-lg border border-white/15 bg-black/40 px-4 py-3 text-base text-[var(--lm-bone)] placeholder:text-white/30 focus:border-[var(--lm-gold)] focus:outline-none"
        />
      </label>
      <button type="submit" disabled={busy} className="lm-btn-gold mt-1 disabled:opacity-60">
        {busy ? "Opening checkout" : "Forge my portrait  ·  $12"}
      </button>
      {error && <p className="text-sm text-red-300">{error}</p>}
    </form>
  );
}
