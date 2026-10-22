"use client";

/**
 * Interactive bits of the creator dashboard (/creators). The page itself is
 * a server component; everything here posts to /api/creators/* and reloads.
 */

import { useState } from "react";

import { Button } from "@/components/acuity";

const INPUT =
  "w-full rounded-acuity-sm border border-acuity-line bg-acuity-bg-inset px-4 py-3 text-[15px] text-acuity-text placeholder:text-acuity-text-quiet focus:border-acuity-line-strong focus:outline-none";

async function send(url: string, method: string, body?: unknown): Promise<{ error?: string }> {
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return { error: json.error ?? "Something went wrong. Try again." };
    return {};
  } catch {
    return { error: "Couldn't reach Ripple. Check your connection and try again." };
  }
}

export function RequestLinkForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  if (state === "sent") {
    return (
      <p className="text-[15px] text-acuity-text-sec">
        If that email belongs to a Ripple creator, a link is on its way.
      </p>
    );
  }
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setState("sending");
        const r = await send("/api/creators/request-link", "POST", { email });
        if (r.error) {
          setError(r.error);
          setState("idle");
        } else setState("sent");
      }}
    >
      <label className="font-mono text-[11px] font-bold uppercase tracking-[1.4px] text-acuity-text-ter" htmlFor="creator-email">
        Your email
      </label>
      <input
        id="creator-email"
        type="email"
        required
        autoComplete="email"
        className={INPUT}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
      />
      {error && <p className="text-[13px] text-acuity-bad">{error}</p>}
      <Button type="submit" disabled={state === "sending"}>
        {state === "sending" ? "Sending…" : "Email me a sign-in link"}
      </Button>
    </form>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          /* clipboard blocked; the text is visible to copy by hand */
        }
      }}
    >
      {copied ? "Copied" : label}
    </Button>
  );
}

export function AcceptAgreementButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await send("/api/creators/agreement", "POST");
          if (r.error) {
            setError(r.error);
            setBusy(false);
          } else window.location.reload();
        }}
      >
        {busy ? "Saving…" : "I accept the creator agreement"}
      </Button>
      {error && <p className="text-[13px] text-acuity-bad">{error}</p>}
    </div>
  );
}

export function PaypalForm({ current }: { current: string | null }) {
  const [email, setEmail] = useState(current ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await send("/api/creators/paypal", "POST", { email });
        setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: email ? "Saved" : "Removed" });
      }}
    >
      <input
        type="email"
        className={INPUT}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="PayPal email"
        aria-label="PayPal email"
      />
      <Button type="submit" variant="secondary" size="sm" className="shrink-0">
        Save
      </Button>
      {msg && <p className={`self-center text-[13px] ${msg.ok ? "text-acuity-text-ter" : "text-acuity-bad"}`}>{msg.text}</p>}
    </form>
  );
}

export function PostForm() {
  const today = new Date().toISOString().slice(0, 10);
  const [url, setUrl] = useState("");
  const [platform, setPlatform] = useState("instagram");
  const [postedAt, setPostedAt] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = await send("/api/creators/posts", "POST", { url, platform, postedAt });
        if (r.error) {
          setError(r.error);
          setBusy(false);
        } else window.location.reload();
      }}
    >
      <input
        type="url"
        required
        className={INPUT}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://www.instagram.com/p/…"
        aria-label="Link to your post"
      />
      <div className="flex flex-col gap-2 sm:flex-row">
        <select className={INPUT} value={platform} onChange={(e) => setPlatform(e.target.value)} aria-label="Platform">
          <option value="instagram">Instagram</option>
          <option value="tiktok">TikTok</option>
          <option value="youtube">YouTube</option>
          <option value="facebook">Facebook</option>
          <option value="other">Other</option>
        </select>
        <input
          type="date"
          className={INPUT}
          value={postedAt}
          max={today}
          onChange={(e) => setPostedAt(e.target.value)}
          aria-label="Date posted"
        />
        <Button type="submit" variant="secondary" disabled={busy} className="shrink-0">
          {busy ? "Adding…" : "Add post"}
        </Button>
      </div>
      {error && <p className="text-[13px] text-acuity-bad">{error}</p>}
    </form>
  );
}

export function DeletePostButton({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      className="text-[13px] text-acuity-text-ter hover:text-acuity-text hover:underline"
      onClick={async () => {
        setBusy(true);
        const r = await send(`/api/creators/posts?id=${encodeURIComponent(id)}`, "DELETE");
        if (r.error) setBusy(false);
        else window.location.reload();
      }}
    >
      Remove
    </button>
  );
}

export function SignOutButton() {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={async () => {
        await send("/api/creators/logout", "POST");
        window.location.href = "/creators";
      }}
    >
      Sign out
    </Button>
  );
}
