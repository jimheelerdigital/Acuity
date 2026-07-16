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
//
// Visual refresh (slice 2, 2026-05-22): swapped to canonical Ripple
// tokens + primitives. `data-theme="dark"` is scoped to the page
// container so the page renders against `bg-acuity-bg` even while
// the body inherits the legacy light/dark switching. All auth
// behavior (signIn calls, error handling, magic-link, callback URL)
// is byte-for-byte unchanged.

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { Button, Card } from "@/components/acuity";

type Loading = "google" | "apple" | "password" | "magic" | null;

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
    await signIn("google", { callbackUrl });
  };

  const handleApple = async () => {
    setFormError(null);
    setLoading("apple");
    await signIn("apple", { callbackUrl });
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
      setFormError(
        credentialsErrorMessages[result.error] ??
          credentialsErrorMessages.Default
      );
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
    await signIn("email", { email: email.trim(), callbackUrl, redirect: false });
    setLoading(null);
    setMagicSent(true);
  };

  if (magicSent) {
    return (
      <div className="text-center">
        <div className="mb-4 text-4xl">📬</div>
        <h2 className="mb-2 font-display text-xl font-semibold text-acuity-text">
          Check your inbox
        </h2>
        <p className="text-sm leading-relaxed text-acuity-text-sec">
          We sent a sign-in link to{" "}
          <strong className="text-acuity-text">{email}</strong>.
          <br />
          Click the link to continue.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-8 text-center">
        <img
          src="/ripple-mark-coral.png"
          alt="Ripple logo"
          className="mx-auto mb-4"
          style={{ width: 54, height: 32 }}
        />
        <h1 className="font-display text-2xl font-bold text-acuity-text">
          Sign in to Ripple
        </h1>
      </div>

      {verified && (
        <div
          className="mb-5 rounded-acuity-md border border-acuity-good bg-acuity-good-soft px-4 py-3 text-sm text-acuity-good"
          role="status"
        >
          Email verified. You can sign in now.
        </div>
      )}

      {(urlError || formError) && (
        <div
          className="mb-5 rounded-acuity-md border border-acuity-bad bg-acuity-bad-soft px-4 py-3 text-sm text-acuity-bad"
          role="alert"
        >
          {formError ??
            nextAuthErrorMessages[urlError ?? ""] ??
            "Something went wrong. Please try again."}
        </div>
      )}

      {/* Google — secondary variant for OAuth providers */}
      <Button
        variant="secondary"
        onClick={handleGoogle}
        disabled={loading !== null}
        className="w-full"
      >
        <GoogleIcon />
        {loading === "google" ? "Redirecting…" : "Continue with Google"}
      </Button>

      {/* Apple — branded affordance: keep the standard black-on-white
          Apple sign-in style. Apple's HIG mandates the black/white
          treatment for "Sign in with Apple"; it's not Ripple design. */}
      <button
        onClick={handleApple}
        disabled={loading !== null}
        className="mt-3 flex w-full items-center justify-center gap-3 rounded-acuity-pill bg-black px-6 py-[14px] text-[15px] font-semibold text-white transition-[transform,filter] duration-acuity-base ease-acuity-standard hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
      >
        <AppleIcon />
        {loading === "apple" ? "Redirecting…" : "Continue with Apple"}
      </button>

      <div className="my-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-acuity-line" />
        <span className="font-mono text-[10px] font-bold uppercase tracking-[1.4px] text-acuity-text-ter">
          or
        </span>
        <div className="h-px flex-1 bg-acuity-line" />
      </div>

      <form onSubmit={handlePassword} className="space-y-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          required
          className="w-full rounded-acuity-sm border border-acuity-line bg-acuity-bg-inset px-4 py-3 text-sm text-acuity-text placeholder:text-acuity-text-quiet outline-none transition focus:border-acuity-primary focus:ring-2 focus:ring-acuity-primary-soft"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoComplete="current-password"
          className="w-full rounded-acuity-sm border border-acuity-line bg-acuity-bg-inset px-4 py-3 text-sm text-acuity-text placeholder:text-acuity-text-quiet outline-none transition focus:border-acuity-primary focus:ring-2 focus:ring-acuity-primary-soft"
        />
        <Button
          type="submit"
          variant="primary"
          disabled={loading !== null || !email.trim() || !password}
          className="w-full"
        >
          {loading === "password" ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <Button
        type="button"
        variant="secondary"
        onClick={handleMagic}
        disabled={loading !== null}
        className="mt-3 w-full"
      >
        {loading === "magic" ? "Sending link…" : "Email me a sign-in link"}
      </Button>

      <div className="mt-5 flex items-center justify-between text-xs text-acuity-text-sec">
        <Link
          href="/auth/forgot-password"
          className="transition hover:text-acuity-text"
        >
          Forgot password?
        </Link>
        <Link
          href="/start"
          className="font-semibold text-acuity-primary transition hover:text-acuity-primary-hi"
        >
          Start Free Trial →
        </Link>
      </div>

      <p className="mt-6 text-center text-xs text-acuity-text-quiet">
        By continuing you agree to our{" "}
        <a href="/terms" className="underline hover:text-acuity-text-sec">
          Terms
        </a>{" "}
        and{" "}
        <a href="/privacy" className="underline hover:text-acuity-text-sec">
          Privacy Policy
        </a>
        .
      </p>
    </>
  );
}

export default function SignInPage() {
  return (
    <div
     
      className="flex min-h-screen items-center justify-center bg-acuity-bg px-6"
    >
      <div className="w-full max-w-sm">
        <Card variant="default" radius="xl" padding={6}>
          <Suspense>
            <SignInForm />
          </Suspense>
        </Card>
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
  OAuthCreateAccount:
    "Could not create account from Google. Please try again.",
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
  AccessDenied:
    "Sign-in was cancelled. Tap Continue with Google to try again.",

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

function AppleIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      aria-hidden="true"
      fill="currentColor"
    >
      <path d="M14.94 13.5c-.37.82-.55 1.19-.97 1.91-.59.99-1.42 2.24-2.45 2.25-.92.01-1.16-.6-2.41-.59-1.25.01-1.51.6-2.43.59-1.03-.01-1.81-1.13-2.4-2.12C2.92 13.39 2.8 10.77 3.68 9.39c.63-1 1.63-1.58 2.57-1.58.96 0 1.56.6 2.35.6.77 0 1.24-.6 2.35-.6.84 0 1.73.46 2.35 1.24-2.06 1.13-1.73 4.07.37 4.85-.29.7-.43.99-.73 1.6zM11.37 3c.47-.6.83-1.45.7-2.32-.77.05-1.67.54-2.2 1.17-.48.57-.88 1.43-.73 2.26.84.03 1.72-.47 2.23-1.11z" />
    </svg>
  );
}
