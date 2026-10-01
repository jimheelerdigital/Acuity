"use client";

import { useState } from "react";

import { beacon } from "./track";

export function ShareButtons({ slug, name, path }: { slug: string; name: string; path: string }) {
  const [copied, setCopied] = useState(false);
  const url = () => `${window.location.origin}${path}`;
  const text = `I'm the ${name}. Which legendary creature are you?`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      beacon("share", { slug, method: "copy" });
    } catch {
      // clipboard blocked; nothing to do
    }
  };
  const share = async () => {
    if (!navigator.share) return copy();
    try {
      await navigator.share({ title: "Legendary Mythicals", text, url: url() });
      beacon("share", { slug, method: "native" });
    } catch {
      // user cancelled
    }
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      <button type="button" onClick={share} className="lm-btn-gold">
        Share my creature
      </button>
      <button type="button" onClick={copy} className="lm-btn-ghost">
        {copied ? "Link copied" : "Copy link"}
      </button>
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
