"use client";

import Link from "next/link";
import { useState, useEffect, useCallback, useRef, FormEvent } from "react";

export default function WaitlistPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "already" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/waitlist/count")
      .then((r) => r.json())
      .then((d) => setCount(d.count))
      .catch(() => {});
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");

    const params = new URLSearchParams(window.location.search);
    const source = params.get("utm_campaign") || "waitlist";

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim() || undefined,
          source,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setErrorMsg(data.error || "Something went wrong. Please try again.");
        return;
      }

      if (data.alreadyExists) {
        setStatus("already");
      } else {
        setStatus("success");
        setCount((c) => (c !== null ? c + 1 : c));
      }
    } catch {
      setStatus("error");
      setErrorMsg("Something went wrong. Please try again.");
    }
  }

  return (
    <div className="min-h-screen bg-[#FAFAF7] text-zinc-900 overflow-x-hidden">
      {/* Nav */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-[#FAFAF7]/80 backdrop-blur-md border-b border-zinc-200/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2 group">
            <img
              src="/AcuityLogo.png"
              alt="Acuity logo"
              className="shrink-0 rounded-lg"
              style={{ width: 36, height: 36 }}
            />
            <span className="text-lg font-bold tracking-tight">Acuity</span>
          </Link>
        </div>
      </nav>

      {/* Hero + form */}
      <section className="relative pt-32 pb-16 sm:pt-40 sm:pb-24 overflow-hidden">
        {/* Background */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-[#FAFAF7] via-[#F0EEFF] to-[#E8F4FD]" />
          <div className="absolute top-20 left-[15%] h-[400px] w-[400px] rounded-full bg-violet-300/20 blur-[100px] animate-pulse" />
          <div className="absolute top-40 right-[10%] h-[350px] w-[350px] rounded-full bg-blue-300/20 blur-[100px] animate-pulse" />
        </div>

        <div className="relative mx-auto max-w-xl px-6 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl leading-[1.1]">
            Acuity is almost ready.
          </h1>
          <p className="mt-5 text-lg text-zinc-500 leading-relaxed max-w-md mx-auto">
            Be first in line. Get early access + your first month completely
            free.
          </p>

          {/* Form */}
          <div className="mt-10">
            {status === "success" ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
                <div className="text-3xl mb-3">🎉</div>
                <p className="text-lg font-semibold text-emerald-800">
                  You&apos;re in!
                </p>
                <p className="mt-2 text-sm text-emerald-600">
                  Check your inbox for a confirmation from hello@getacuity.io
                </p>
              </div>
            ) : status === "already" ? (
              <div className="rounded-2xl border border-violet-200 bg-violet-50 p-8 text-center">
                <p className="text-lg font-semibold text-violet-800">
                  You&apos;re already on the list!
                </p>
                <p className="mt-2 text-sm text-violet-600">
                  We&apos;ll be in touch soon.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <input
                  type="text"
                  placeholder="First name (optional)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-5 py-3.5 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20"
                />
                <input
                  type="email"
                  required
                  placeholder="Your email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-5 py-3.5 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20"
                />
                <button
                  type="submit"
                  disabled={status === "loading"}
                  className="relative w-full overflow-hidden rounded-xl bg-[#7C3AED] px-8 py-4 text-sm font-semibold text-white transition-all duration-300 hover:bg-violet-500 hover:shadow-xl hover:shadow-violet-600/25 hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-70 disabled:pointer-events-none"
                >
                  {/* Animated gradient shimmer */}
                  <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full animate-[shimmer_2.5s_ease-in-out_infinite]" />
                  {/* Pulsing glow */}
                  <span className="absolute inset-0 rounded-xl bg-violet-400/30 animate-[pulse_2s_ease-in-out_infinite]" />
                  <span className="relative z-10">
                    {status === "loading"
                      ? "Joining..."
                      : "Join the waitlist \u2014 it\u2019s free"}
                  </span>
                </button>
                {status === "error" && (
                  <p className="text-sm text-red-500 mt-2">{errorMsg}</p>
                )}
              </form>
            )}
          </div>

          {/* Benefits */}
          <div className="mt-10 flex flex-col items-center gap-3 text-sm text-zinc-600">
            <div className="flex items-center gap-2">
              <svg
                className="h-4 w-4 text-emerald-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={3}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
              First month completely free
            </div>
            <div className="flex items-center gap-2">
              <svg
                className="h-4 w-4 text-emerald-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={3}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Early access before public launch
            </div>
            <div className="flex items-center gap-2">
              <svg
                className="h-4 w-4 text-emerald-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={3}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Your nightly debrief, ready in 60 seconds
            </div>
          </div>

          {/* Social proof */}
          {count !== null && count > 0 && (
            <p className="mt-8 text-sm text-zinc-400">
              Join{" "}
              <span className="font-semibold text-zinc-600">
                {count.toLocaleString()}
              </span>{" "}
              others waiting for early access
            </p>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-200 px-6 py-12 bg-[#FAFAF7]">
        <div className="mx-auto max-w-5xl text-center">
          <p className="text-xs text-zinc-400">
            <a
              href="https://getacuity.io"
              className="text-violet-500 hover:text-violet-600 transition"
            >
              getacuity.io
            </a>
          </p>
        </div>
      </footer>

      <style jsx>{`
        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }
      `}</style>
    </div>
  );
}
