"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Suspense, useEffect, useState } from "react";

const PASSWORD_MIN = 8;

const REFERRAL_KEY = "acuity_ref_code";

function SignUpForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [loading, setLoading] = useState<"google" | "password" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const { getClientAttribution } = require("@/lib/attribution");
      const posthog = require("posthog-js").default;
      const attr = getClientAttribution() ?? {};
      if (posthog?.capture) {
        posthog.capture("signup_page_viewed", {
          utm_source: attr.utm_source ?? null,
          utm_medium: attr.utm_medium ?? null,
          utm_campaign: attr.utm_campaign ?? null,
          utm_content: attr.utm_content ?? null,
          utm_term: attr.utm_term ?? null,
          referrer: attr.referrer ?? null,
          landingPath: attr.landingPath ?? null,
        });
      }
    } catch {
      // PostHog not loaded
    }
  }, []);

  useEffect(() => {
    const fromQuery = searchParams?.get("ref");
    if (fromQuery) {
      try {
        localStorage.setItem(REFERRAL_KEY, fromQuery.slice(0, 16));
      } catch {}
      setReferralCode(fromQuery.slice(0, 16));
      return;
    }
    try {
      const stored = localStorage.getItem(REFERRAL_KEY);
      if (stored) setReferralCode(stored);
    } catch {}
  }, [searchParams]);

  const handleGoogle = async () => {
    setError(null);
    setLoading("google");
    if (typeof fbq !== "undefined") {
      console.log('[meta-pixel] Firing Lead — Google signup click');
      fbq("track", "Lead", { content_name: 'Start Free Trial Click' });
      console.log('[meta-pixel] Firing CompleteRegistration — Google OAuth');
      fbq("track", "CompleteRegistration", { content_name: 'Free Trial Signup', currency: 'USD', value: 0 });
      console.log('[meta-pixel] Firing StartTrial — Google OAuth');
      fbq("track", "StartTrial", { currency: 'USD', value: 0, predicted_ltv: 12.99 });
    }
    await signIn("google", { callbackUrl: "/auth/signup/success" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < PASSWORD_MIN) {
      setError(`Password must be at least ${PASSWORD_MIN} characters.`);
      return;
    }
    setLoading("password");
    if (typeof fbq !== "undefined") {
      console.log('[meta-pixel] Firing Lead — email signup submit');
      fbq("track", "Lead", { content_name: 'Start Free Trial Click' });
    }
    try {
      let attribution: Record<string, string> | undefined;
      try {
        const { getClientAttribution } = require("@/lib/attribution");
        const attr = getClientAttribution();
        if (attr) attribution = attr;
      } catch {}

      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          name: name.trim() || null,
          referralCode: referralCode ?? undefined,
          attribution,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        if (res.status === 429) {
          setError("Too many attempts. Wait an hour before trying again.");
        } else if (body.error === "AlreadyRegistered") {
          setError("An account with that email already exists. Try signing in instead.");
        } else if (body.error === "WeakPassword") {
          setError(body.message ?? `Password must be at least ${PASSWORD_MIN} characters.`);
        } else if (body.error === "InvalidEmail") {
          setError("That doesn't look like a valid email address.");
        } else {
          setError("Something went wrong. Please try again.");
        }
        return;
      }
      if (typeof fbq !== "undefined") {
        console.log('[meta-pixel] Firing CompleteRegistration — email signup success');
        fbq("track", "CompleteRegistration", { content_name: 'Free Trial Signup', currency: 'USD', value: 0 });
        console.log('[meta-pixel] Firing StartTrial — email signup success');
        fbq("track", "StartTrial", { currency: 'USD', value: 0, predicted_ltv: 12.99 });
      }
      if (attribution) {
        fetch("/api/auth/set-attribution", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(attribution),
        }).catch(() => {});
      }
      try {
        localStorage.removeItem(REFERRAL_KEY);
      } catch {}
      router.push("/auth/signup/success");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#181614]">
      <div className="flex min-h-screen">
        {/* Left side — value reinforcement (desktop only) */}
        <div className="hidden lg:flex lg:w-[55%] flex-col justify-center px-16 xl:px-24">
          <h1 className="text-4xl xl:text-5xl font-bold text-[#F5EDE4] leading-tight tracking-tight">
            One minute a day.<br />A life of clarity.
          </h1>

          <ul className="mt-10 space-y-5">
            <li className="flex items-start gap-4">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#7C5CFC]/20">
                <svg className="h-3.5 w-3.5 text-[#7C5CFC]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              </span>
              <span className="text-[#F5EDE4]/80 text-base">Tasks extracted from your voice automatically</span>
            </li>
            <li className="flex items-start gap-4">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#7C5CFC]/20">
                <svg className="h-3.5 w-3.5 text-[#7C5CFC]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              </span>
              <span className="text-[#F5EDE4]/80 text-base">Goals tracked across weeks without lifting a finger</span>
            </li>
            <li className="flex items-start gap-4">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#7C5CFC]/20">
                <svg className="h-3.5 w-3.5 text-[#7C5CFC]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              </span>
              <span className="text-[#F5EDE4]/80 text-base">Patterns surfaced that you can&apos;t see on your own</span>
            </li>
            <li className="flex items-start gap-4">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#7C5CFC]/20">
                <svg className="h-3.5 w-3.5 text-[#7C5CFC]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              </span>
              <span className="text-[#F5EDE4]/80 text-base">Weekly report delivered every Sunday morning</span>
            </li>
          </ul>

          <blockquote className="mt-14 border-l-2 border-[#7C5CFC]/40 pl-5">
            <p className="text-[#F5EDE4]/70 text-sm italic leading-relaxed">
              &ldquo;The weekly reports are unreal. It&rsquo;s like having a therapist and a project manager rolled into one AI.&rdquo;
            </p>
            <cite className="mt-2 block text-xs text-[#F5EDE4]/40 not-italic">— Marcus T.</cite>
          </blockquote>
        </div>

        {/* Right side — signup form */}
        <div className="flex w-full lg:w-[45%] flex-col justify-center px-6 sm:px-12 lg:px-16">
          {/* Mobile value prop (hidden on desktop) */}
          <div className="lg:hidden mb-8 text-center">
            <h1 className="text-2xl font-bold text-[#F5EDE4]">Start your free trial</h1>
            <p className="mt-2 text-sm text-[#F5EDE4]/60 leading-relaxed">
              Talk for one minute. AI handles the rest — tasks, goals, patterns, and your weekly report.
            </p>
          </div>

          <div className="w-full max-w-sm mx-auto rounded-2xl border border-white/10 bg-[#1E1E2E] p-8 shadow-xl animate-fade-in">
            <div className="text-center mb-7">
              <img src="/AcuityLogo.png" alt="Acuity" className="mx-auto mb-4" style={{ width: 32, height: 32 }} />
              <h2 className="text-xl font-bold text-[#F5EDE4] hidden lg:block">Start your free trial</h2>
              <p className="mt-1.5 text-sm text-[#F5EDE4]/50">
                14 days free. No credit card.
              </p>
            </div>

            {error && (
              <div className="mb-5 rounded-lg border border-red-900/40 bg-red-950/40 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            {/* Google OAuth */}
            <button
              onClick={handleGoogle}
              disabled={loading !== null}
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white px-4 py-3 text-sm font-medium text-zinc-800 transition-all duration-200 hover:bg-zinc-50 hover:shadow-sm disabled:opacity-50"
            >
              <GoogleIcon />
              {loading === "google" ? "Redirecting..." : "Continue with Google"}
            </button>

            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-xs text-[#F5EDE4]/40">or</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name (optional)"
                autoComplete="name"
                className="w-full rounded-xl border border-white/10 bg-[#282838] px-4 py-3 text-sm text-[#F5EDE4] placeholder-[#F5EDE4]/30 outline-none focus:border-[#7C5CFC] focus:ring-2 focus:ring-[#7C5CFC]/20 transition"
              />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
                className="w-full rounded-xl border border-white/10 bg-[#282838] px-4 py-3 text-sm text-[#F5EDE4] placeholder-[#F5EDE4]/30 outline-none focus:border-[#7C5CFC] focus:ring-2 focus:ring-[#7C5CFC]/20 transition"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password (8+ characters)"
                autoComplete="new-password"
                required
                minLength={PASSWORD_MIN}
                className="w-full rounded-xl border border-white/10 bg-[#282838] px-4 py-3 text-sm text-[#F5EDE4] placeholder-[#F5EDE4]/30 outline-none focus:border-[#7C5CFC] focus:ring-2 focus:ring-[#7C5CFC]/20 transition"
              />
              <button
                type="submit"
                disabled={loading !== null || !email.trim() || password.length < PASSWORD_MIN}
                className="w-full rounded-xl bg-[#7C5CFC] px-4 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#6B4FE0] disabled:opacity-50 active:scale-[0.98]"
              >
                {loading === "password" ? "Creating account..." : "Start Free Trial"}
              </button>
            </form>

            <p className="mt-4 text-center text-xs text-[#F5EDE4]/40">
              You&apos;ll be redirected to download the app after signup.
            </p>

            <p className="mt-5 text-center text-xs text-[#F5EDE4]/50">
              Already have an account?{" "}
              <Link href="/auth/signin" className="font-semibold text-[#7C5CFC] hover:text-[#6B4FE0]">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SignUpPage() {
  return (
    <Suspense>
      <SignUpForm />
    </Suspense>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
    </svg>
  );
}
