"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Suspense, useEffect, useState } from "react";

const PASSWORD_MIN = 12;

/** localStorage key for the referral code so a user who clicked
 *  /?ref=CODE and wandered through landing → signup doesn't lose
 *  the attribution. Cleared on successful signup. */
const REFERRAL_KEY = "acuity_ref_code";

function SignUpForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [loading, setLoading] = useState<"google" | "password" | null>(null);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fire signup_page_viewed PostHog event on mount
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
      // PostHog not loaded — degrade silently
    }
  }, []);

  // Resolve ref code from (in order) query string → localStorage.
  // Storing it in localStorage lets the ?ref= → sign-up flow survive
  // a marketing landing detour without a server-side session.
  useEffect(() => {
    const fromQuery = searchParams?.get("ref");
    if (fromQuery) {
      try {
        localStorage.setItem(REFERRAL_KEY, fromQuery.slice(0, 16));
      } catch {
        // Safari Private Mode may reject; non-fatal.
      }
      setReferralCode(fromQuery.slice(0, 16));
      return;
    }
    try {
      const stored = localStorage.getItem(REFERRAL_KEY);
      if (stored) setReferralCode(stored);
    } catch {
      // ignore
    }
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
    await signIn("google", { callbackUrl: "/home" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < PASSWORD_MIN) {
      setError(`Password must be at least ${PASSWORD_MIN} characters.`);
      return;
    }
    setLoading("password");
    // Meta Pixel: Lead fires on signup form submission
    if (typeof fbq !== "undefined") {
      console.log('[meta-pixel] Firing Lead — email signup submit');
      fbq("track", "Lead", { content_name: 'Start Free Trial Click' });
    }
    try {
      // Read attribution cookie for UTM capture
      let attribution: Record<string, string> | undefined;
      try {
        const { getClientAttribution } = require("@/lib/attribution");
        const attr = getClientAttribution();
        if (attr) attribution = attr;
      } catch { /* ignore */ }

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
      // Persist UTM attribution to user record
      if (attribution) {
        fetch("/api/auth/set-attribution", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(attribution),
        }).catch(() => { /* non-critical */ });
      }
      // Clear the stored code so a subsequent signup from the same
      // browser doesn't mis-attribute.
      try {
        localStorage.removeItem(REFERRAL_KEY);
      } catch {
        // ignore
      }
      setSent(true);
    } finally {
      setLoading(null);
    }
  };

  if (sent) {
    return (
      <div className="text-center">
        <div className="mb-4 text-4xl">📬</div>
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
          Check your inbox
        </h2>
        <p className="text-zinc-500 dark:text-zinc-400 text-sm leading-relaxed">
          We sent a verification link to{" "}
          <strong className="text-zinc-700 dark:text-zinc-200">{email}</strong>.
          <br />
          Click it to activate your account, then sign in.
        </p>
        <Link
          href="/auth/signin"
          className="mt-6 inline-block text-sm text-violet-600 dark:text-violet-400 hover:text-violet-500"
        >
          Back to sign in →
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="text-center mb-8">
        <img src="/AcuityLogo.png" alt="Acuity logo" className="mx-auto mb-4" style={{ width: 32, height: 32 }} />
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Create your account</h1>
        <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
          30-day free trial. No credit card.
        </p>
      </div>

      {error && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-400">
          {error}
        </div>
      )}

      <button
        onClick={handleGoogle}
        disabled={loading !== null}
        className="flex w-full items-center justify-center gap-3 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] px-4 py-3 text-sm font-medium text-zinc-800 dark:text-zinc-100 transition-all duration-200 hover:border-zinc-300 dark:hover:border-white/20 hover:shadow-sm disabled:opacity-50"
      >
        {loading === "google" ? "Redirecting..." : "Continue with Google"}
      </button>

      <div className="my-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
        <span className="text-xs text-zinc-400 dark:text-zinc-500">or</span>
        <div className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name (optional)"
          autoComplete="name"
          className="w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] px-4 py-3 text-sm text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          required
          className="w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] px-4 py-3 text-sm text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={`Password (${PASSWORD_MIN}+ characters)`}
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN}
          className="w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] px-4 py-3 text-sm text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition"
        />
        <button
          type="submit"
          disabled={loading !== null || !email.trim() || password.length < PASSWORD_MIN}
          className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-zinc-700 disabled:opacity-50 active:scale-[0.98]"
        >
          {loading === "password" ? "Creating account..." : "Create account"}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
        Already have an account?{" "}
        <Link href="/auth/signin" className="font-semibold text-violet-600 dark:text-violet-400 hover:text-violet-500">
          Sign in
        </Link>
      </p>
    </>
  );
}

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] p-8 shadow-lg animate-fade-in">
        <Suspense>
          <SignUpForm />
        </Suspense>
      </div>
    </div>
  );
}
