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
export function ShareButtons({
  slug,
  name,
  path,
  imageUrl,
  shareText,
  label = "Share my creature",
}: {
  slug: string;
  name: string;
  path: string;
  imageUrl?: string;
  shareText?: string;
  label?: string;
}) {
  const [note, setNote] = useState("");
  const url = () => `${window.location.origin}${path}`;
  const text = shareText ?? `I'm the ${name}. Which legendary creature are you?`;
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
        {label}
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
  quiz = "beast",
  source = "result",
  cta = "Send my profile",
  doneText = "Sent. Check your inbox.",
  products,
}: {
  slug: string;
  quiz?: string;
  source?: string;
  cta?: string;
  doneText?: string;
  /** Product waitlist picks (2026-10-27), stored with the signup. */
  products?: string[];
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
        body: JSON.stringify({ email, slug, quiz, source, products }),
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

/**
 * Product interest (2026-10-27, per Keenan: "let people see the result and
 * then say which of these would you actually want? and then collect the
 * email so they can get an email when it's done"). A free read on what the
 * audience would buy before anything is made. Picks are logged as a
 * product_interest event; the email step joins the product waitlist and also
 * sends the result email with the HD wallpaper.
 */
export const PRODUCTS: { key: string; label: string; icon: string }[] = [
  { key: "tshirt", label: "T-shirt", icon: "M8 4l-5 3 2 4 2-1v10h10V10l2 1 2-4-5-3c-.5 1.5-2 2.5-4 2.5S8.5 5.5 8 4z" },
  { key: "hoodie", label: "Hoodie", icon: "M9 3c-1 1-1.5 2.5-1.5 4L3 9l1.5 4L7 12v9h10v-9l2.5 1L21 9l-4.5-2c0-1.5-.5-3-1.5-4-1.5 2-4.5 2-6 0zM10 14h4" },
  { key: "phone-case", label: "Phone case", icon: "M8 2h8a2 2 0 012 2v16a2 2 0 01-2 2H8a2 2 0 01-2-2V4a2 2 0 012-2zM9 5a1 1 0 100 2 1 1 0 000-2z" },
  { key: "mug", label: "Mug", icon: "M4 6h12v11a3 3 0 01-3 3H7a3 3 0 01-3-3V6zM16 9h2a2 2 0 012 2v1a2 2 0 01-2 2h-2" },
  { key: "desk-mat", label: "Desk mat", icon: "M2 8h20v8H2zM14 10.5h5v3h-5z" },
  { key: "poster", label: "Poster / wall art", icon: "M5 3h14v18H5zM8 15l3-4 2 3 1.5-2L17 16H8z" },
  { key: "stickers", label: "Sticker pack", icon: "M4 4h11l5 5v11H4zM15 4v5h5" },
  { key: "figurine", label: "Figurine / statue", icon: "M12 3l2 3-1 2h2l1 4-2 1 1 6H9l1-6-2-1 1-4h2l-1-2z" },
];

export function ProductInterest({ quiz, slug, name }: { quiz: string; slug: string; name: string }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [step, setStep] = useState<"pick" | "email" | "none">("pick");

  const toggle = (key: string) => setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));
  const send = (products: string[]) => {
    beacon("product_interest", { quiz, slug, products });
    setStep(products.length ? "email" : "none");
  };

  if (step === "none") {
    return (
      <div>
        <h2 className="font-lm-display text-lg text-[var(--lm-bone)]">Get your full profile + HD wallpaper</h2>
        <p className="mb-4 mt-1 text-sm text-[var(--lm-dim)]">Sent to your inbox. Unsubscribe any time.</p>
        <EmailCapture slug={slug} quiz={quiz} />
      </div>
    );
  }

  if (step === "email") {
    const first = PRODUCTS.find((p) => p.key === picked[0])?.label.split(" /")[0].toLowerCase() ?? "gear";
    return (
      <div>
        <p className="lm-eyebrow">Noted</p>
        <h2 className="font-lm-display mt-2 text-xl text-[var(--lm-bone)]">
          Want first dibs when the {name} {picked.length > 1 ? "gear" : first} drops?
        </h2>
        <p className="mb-4 mt-1 text-sm text-[var(--lm-dim)]">
          We&apos;ll email you when it&apos;s ready, and send your HD wallpaper now. Unsubscribe any time.
        </p>
        <EmailCapture
          slug={slug}
          quiz={quiz}
          source="product_waitlist"
          products={picked}
          cta="Put me on the list"
          doneText="You're on the list. Your wallpaper is on its way."
        />
      </div>
    );
  }

  return (
    <div>
      <p className="lm-eyebrow">One quick question</p>
      <h2 className="font-lm-display mt-2 text-xl text-[var(--lm-bone)]">Which of these would you actually want with your {name} on it?</h2>
      <p className="mt-1 text-sm text-[var(--lm-dim)]">Pick as many as you like. It helps us decide what to make first.</p>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PRODUCTS.map((p) => {
          const on = picked.includes(p.key);
          return (
            <button
              key={p.key}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(p.key)}
              className={`flex flex-col items-center gap-2 rounded-lg border px-2 py-3 text-sm transition ${
                on ? "border-[var(--lm-gold)] bg-[#d9a441]/15 text-[var(--lm-bone)]" : "border-white/10 bg-white/[0.03] text-[var(--lm-dim)] hover:border-white/30"
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
                <path d={p.icon} />
              </svg>
              {p.label}
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button type="button" disabled={picked.length === 0} onClick={() => send(picked)} className="lm-btn-gold flex-1 disabled:opacity-50">
          {picked.length ? `I'd want ${picked.length === 1 ? "this" : "these"}` : "Pick at least one"}
        </button>
        <button type="button" onClick={() => send([])} className="lm-btn-ghost">
          None of these
        </button>
      </div>
    </div>
  );
}
