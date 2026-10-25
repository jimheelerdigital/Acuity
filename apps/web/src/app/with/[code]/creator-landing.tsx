"use client";

/**
 * Creator banner + store-badge email step for /with/<CODE>.
 *
 * Store badges inside the page are intercepted (capture phase) so HomeV2
 * itself stays untouched: the first tap opens a sheet, "Send me the link"
 * stores the email against the click for 30 days and emails the store links,
 * and either button then continues to the store. Play Store links carry the
 * code in the install referrer so the app can pre-fill it.
 *
 * Fixed light palette to match HomeV2.
 */
import { useCallback, useState, type ReactNode } from "react";

const STORE_HOSTS = ["apps.apple.com", "play.google.com"];

function withCode(href: string, code: string): string {
  try {
    const u = new URL(href);
    if (u.hostname === "play.google.com") {
      u.searchParams.set("referrer", `utm_source=creator&utm_campaign=${code}`);
    }
    return u.toString();
  } catch {
    return href;
  }
}

export function CreatorLanding({ code, name, children }: { code: string; name: string; children: ReactNode }) {
  const [storeHref, setStoreHref] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const onClickCapture = useCallback(
    (e: React.MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a");
      if (!a?.href) return;
      let host = "";
      try {
        host = new URL(a.href).hostname;
      } catch {
        return;
      }
      if (!STORE_HOSTS.includes(host)) return;
      e.preventDefault();
      e.stopPropagation();
      setStoreHref(withCode(a.href, code));
    },
    [code]
  );

  const go = () => {
    if (storeHref) window.location.href = storeHref;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("sending");
    try {
      const r = await fetch("/api/creators/capture-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      if (!r.ok) throw new Error(String(r.status));
      setState("sent");
      setTimeout(go, 900);
    } catch {
      setState("error");
    }
  };

  return (
    <div onClickCapture={onClickCapture}>
      <div className="bg-[#1B1815] px-4 py-2.5 text-center text-[14px] font-semibold text-[#FBF6EF]">
        Referred by {name} <span aria-hidden="true">·</span> your code{" "}
        <span className="rounded-full bg-[#FBF6EF]/10 px-2 py-0.5 font-mono tracking-[1.4px]">{code}</span> is saved
      </div>
      {children}

      {storeHref && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="creator-store-title"
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 min-[600px]:items-start min-[600px]:pt-[12vh]"
          onClick={() => setStoreHref(null)}
        >
          <div
            className="w-full max-w-[440px] rounded-t-[28px] bg-[#FBF6EF] p-6 text-[#1B1815] shadow-2xl min-[600px]:rounded-[28px]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="creator-store-title" className="m-0 text-[22px] font-extrabold leading-tight">
              Drop your email and we&apos;ll send the link
            </h2>
            <p className="mb-4 mt-2 text-[15px] leading-snug text-[#1B1815]/70">
              Handy if you&apos;re on a different phone. If the app asks, your code is{" "}
              <strong className="font-mono tracking-[1.4px]">{code}</strong>.
            </p>
            {state === "sent" ? (
              <p className="text-[15px] font-semibold">Sent. Taking you to the store…</p>
            ) : (
              <form onSubmit={submit} className="flex flex-col gap-3">
                <input
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="rounded-[14px] border border-[#1B1815]/15 bg-white px-4 py-3.5 text-[16px] outline-none focus:border-[#F27A55]"
                />
                <button
                  type="submit"
                  disabled={state === "sending"}
                  className="rounded-full bg-[#F27A55] px-6 py-3.5 text-[16px] font-bold text-white disabled:opacity-60"
                >
                  {state === "sending" ? "Sending…" : "Send me the link"}
                </button>
                {state === "error" && (
                  <p className="m-0 text-[14px] text-[#B4412B]">That didn&apos;t go through. You can still go to the store.</p>
                )}
                <button type="button" onClick={go} className="py-2 text-[15px] font-semibold text-[#1B1815]/70 underline">
                  Skip, go to the store
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
