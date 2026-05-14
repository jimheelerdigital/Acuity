"use client";

// AUTH-CRITICAL FILE
// Any change to this file REQUIRES manual verification of:
//   - Web Google OAuth (getacuity.io/auth/signin → Continue with Google)
//   - Web email + password sign-in
//   - Mobile Google OAuth (TestFlight)
//   - Mobile Apple sign-in
// before any production deploy.
//
// Past regressions:
//   - 2026-04-28: User.signupUtm* schema drift broke OAuth callback; fix in
//     04b729f hardened bootstrap-user.
//
// See docs/AUTH_HARDENING.md for the full test checklist.

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

type Loading = "google" | "password" | "magic" | null;

function SignInForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/home";
  const urlError = searchParams.get("error");
  const verified = searchParams.get("verified") === "1";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [magicSent, setMagicSent] = useState(false);
  const [loading, setLoading] = useState<Loading>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const handleGoogle = async () => {
    setFormError(null);
    setLoading("google");
    if (typeof fbq !== "undefined") fbq("track", "CompleteRegistration");
    await signIn("google", { callbackUrl });
  };

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!email.trim() || !password) return;
    setLoading("password");
    const result = await signIn("credentials", {
      email: email.trim(),
      password,
      redirect: false,
      callbackUrl,
    });
    setLoading(null);
    if (!result) {
      setFormError("Something went wrong. Please try again.");
      return;
    }
    if (result.error) {
      setFormError(credentialsErrorMessages[result.error] ?? credentialsErrorMessages.Default);
      return;
    }
    router.push(result.url ?? callbackUrl);
  };

  const handleMagic = async () => {
    setFormError(null);
    if (!email.trim()) {
      setFormError("Enter your email first.");
      return;
    }
    setLoading("magic");
    if (typeof fbq !== "undefined") fbq("track", "CompleteRegistration");
    await signIn("email", { email: email.trim(), callbackUrl, redirect: false });
    setLoading(null);
    setMagicSent(true);
  };

  if (magicSent) {
    return (
      <div className="text-center">
        <div className="mb-4 text-4xl">📬</div>
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
          Check your inbox
        </h2>
        <p className="text-zinc-500 dark:text-zinc-400 text-sm leading-relaxed">
          We sent a sign-in link to <strong className="text-zinc-700 dark:text-zinc-200">{email}</strong>.
          <br />
          Click the link to continue.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="text-center mb-8">
        <img src="/AcuityLogo.png" alt="Acuity logo" className="mx-auto mb-4" style={{ width: 32, height: 32 }} />
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Sign in to Acuity</h1>
        <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
          Debrief daily. See your life clearly.
        </p>
      </div>

      {verified && (
        <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-300">
          Email verified — you can sign in now.
        </div>
      )}

      {(urlError || formError) && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-400">
          {formError ?? nextAuthErrorMessages[urlError ?? ""] ?? "Something went wrong. Please try again."}
        </div>
      )}

      {/* Google */}
      <button
        onClick={handleGoogle}
        disabled={loading !== null}
        className="flex w-full items-center justify-center gap-3 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] px-4 py-3 text-sm font-medium text-zinc-800 dark:text-zinc-100 transition-all duration-200 hover:border-zinc-300 dark:hover:border-white/20 hover:shadow-sm disabled:opacity-50"
      >
        <GoogleIcon />
        {loading === "google" ? "Redirecting..." : "Continue with Google"}
      </button>

      {/* Divider */}
      <div className="my-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
        <span className="text-xs text-zinc-400 dark:text-zinc-500">or</span>
        <div className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
      </div>

      {/* Email + password */}
      <form onSubmit={handlePassword} className="space-y-3">
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
          placeholder="Password"
          autoComplete="current-password"
          className="w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] px-4 py-3 text-sm text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition"
        />
        <button
          type="submit"
          disabled={loading !== null || !email.trim() || !password}
          className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-zinc-700 disabled:opacity-50 active:scale-[0.98]"
        >
          {loading === "password" ? "Signing in..." : "Sign in"}
        </button>
      </form>

      {/* Magic link */}
      <button
        type="button"
        onClick={handleMagic}
        disabled={loading !== null}
        className="mt-3 w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-transparent px-4 py-3 text-sm font-medium text-zinc-600 dark:text-zinc-300 transition hover:border-zinc-300 dark:hover:border-white/20 disabled:opacity-50"
      >
        {loading === "magic" ? "Sending link..." : "Email me a sign-in link"}
      </button>

      <div className="mt-5 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
        <Link href="/auth/forgot-password" className="hover:text-zinc-700 dark:hover:text-zinc-200">
          Forgot password?
        </Link>
        <Link href="/auth/signup" className="font-semibold text-violet-600 dark:text-violet-400 hover:text-violet-500">
          Create account →
        </Link>
      </div>

      <p className="mt-6 text-center text-xs text-zinc-400 dark:text-zinc-500">
        By continuing you agree to our{" "}
        <a href="/terms" className="underline hover:text-zinc-700 dark:hover:text-zinc-200">
          Terms
        </a>{" "}
        and{" "}
        <a href="/privacy" className="underline hover:text-zinc-700 dark:hover:text-zinc-200">
          Privacy Policy
        </a>
        .
      </p>
    </>
  );
}

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] p-8 shadow-lg animate-fade-in">
        <Suspense>
          <SignInForm />
        </Suspense>
      </div>
    </div>
  );
}

// NextAuth-native error codes (from ?error= in the URL on a failed
// OAuth / magic-link callback). Every error code NextAuth documents
// is listed here. Missing entries fall through to `Default`, which
// shows the generic "Something went wrong" — that's what triggered
// the 2026-04-24 diagnosis delay on the Callback-code outage. Any
// future NextAuth upgrade that adds error codes should extend this
// map; an unrecognized code is a diagnostic dead-end.
const nextAuthErrorMessages: Record<string, string> = {
  // OAuth flow
  OAuthSignin: "Could not start Google sign-in. Please try again.",
  OAuthCallback: "Google sign-in failed on return. Please try again.",
  OAuthCreateAccount: "Could not create account from Google. Please try again.",
  OAuthAccountNotLinked:
    "This email already has an account with a different sign-in method. Sign in the way you did originally.",

  // Magic link flow
  EmailCreateAccount: "Could not create account. Please try again.",
  EmailSignin: "Failed to send the magic link. Please try again.",
  Verification:
    "The sign-in link has expired or was already used. Request a new one.",

  // Credentials + session
  CredentialsSignin: "Incorrect email or password.",
  SessionRequired: "You must be signed in to access that page.",

  // User cancelled on the provider's consent screen
  AccessDenied: "Sign-in was cancelled. Tap Continue with Google to try again.",

  // Generic callback — usually means something threw inside our
  // server-side callback chain (events.createUser, callbacks.jwt,
  // callbacks.session, or the adapter). Sentry will have the stack.
  Callback:
    "Something went wrong during sign-in. Please try again, or visit /support if it keeps happening.",

  // Server-side misconfiguration — NEXTAUTH_SECRET or NEXTAUTH_URL
  // missing or wrong. Does not self-heal; needs env var fix in Vercel.
  Configuration:
    "Sign-in is temporarily unavailable. We've been notified and are looking into it.",

  // Fallback
  Default: "Something went wrong. Please try again.",
};

// Errors from our CredentialsProvider.authorize() (read off result.error
// from signIn({ redirect: false }) — these are the string messages we
// threw inside authorize()).
const credentialsErrorMessages: Record<string, string> = {
  CredentialsSignin: "Incorrect email or password.",
  EmailNotVerified:
    "Please verify your email. Check your inbox for the verification link.",
  RateLimited:
    "Too many sign-in attempts. Wait an hour before trying again.",
  Default: "Incorrect email or password.",
};

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}
