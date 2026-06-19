"use client";

// AUTH-CRITICAL FILE
// Any change to this file REQUIRES manual verification of:
//   - Web Google OAuth (getacuity.io/auth/signup → Continue with Google)
//   - Web Apple OAuth (getacuity.io/auth/signup → Continue with Apple)
//   - Email/password signup + redirect to /auth/signup/success
//   - Meta Pixel Lead + CompleteRegistration events
//   - PostHog signup_page_viewed event
//   - Attribution cookie propagation
//
// Visual overhaul (2026-05-25): conversion-focused layout with social
// proof, how-it-works steps, and urgency. All auth logic unchanged.

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Suspense, useEffect, useRef, useState } from "react";

import { SOCIAL_PROOF } from "@/lib/social-proof";

const PASSWORD_MIN = 8;
const REFERRAL_KEY = "acuity_ref_code";

// Rotating testimonials for social proof
const TESTIMONIALS = [
  {
    quote: "The weekly reports are unreal. It\u2019s like having a therapist and a project manager rolled into one.",
    name: "Marcus T.",
    role: "Founder",
  },
  {
    quote: "I used to lie awake running through my to-do list. Now I debrief before bed and sleep in minutes.",
    name: "Rachel K.",
    role: "Product Manager",
  },
  {
    quote: "I didn\u2019t expect the pattern detection to be this accurate. It noticed things I couldn\u2019t see.",
    name: "James L.",
    role: "Designer",
  },
];

function SignUpForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [loading, setLoading] = useState<
    "google" | "apple" | "password" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [pwError, setPwError] = useState<string | null>(null);
  const [testimonialIdx, setTestimonialIdx] = useState(0);
  const [showStickyCta, setShowStickyCta] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  // Rotate testimonials every 4 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setTestimonialIdx((i) => (i + 1) % TESTIMONIALS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Sticky CTA appears after scrolling past the form on mobile
  useEffect(() => {
    const el = formRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setShowStickyCta(!entry.isIntersecting),
      { threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Attribution cookie
  useEffect(() => {
    try {
      const { setAttributionCookie } = require("@/lib/attribution");
      setAttributionCookie();
    } catch {}
  }, []);

  // PostHog tracking
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
    } catch {}
  }, []);

  // Referral code
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
    await signIn("google", { callbackUrl: "/auth/signup/success" });
  };

  const handleApple = async () => {
    setError(null);
    setLoading("apple");
    await signIn("apple", { callbackUrl: "/auth/signup/success" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPwError(null);
    if (!email.trim()) {
      setError("Enter your email to continue.");
      return;
    }
    if (password.length < PASSWORD_MIN) {
      setPwError(`Password must be at least ${PASSWORD_MIN} characters.`);
      return;
    }
    setLoading("password");
    try {
      let attribution: Record<string, string> | undefined;
      try {
        const { getClientAttribution } = require("@/lib/attribution");
        const attr = getClientAttribution();
        if (attr) attribution = attr;
        console.log(
          "[attribution] email/password signup — cookie data:",
          attr
        );
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
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        if (res.status === 429) {
          setError("Too many attempts. Wait an hour before trying again.");
        } else if (body.error === "AlreadyRegistered") {
          setError(
            "An account with that email already exists. Try signing in instead."
          );
        } else if (body.error === "WeakPassword") {
          setPwError(
            body.message ??
              `Password must be at least ${PASSWORD_MIN} characters.`
          );
        } else if (body.error === "InvalidEmail") {
          setError("That doesn't look like a valid email address.");
        } else {
          setError("Something went wrong. Please try again.");
        }
        return;
      }
      const signupData = await res.json().catch(() => ({}));
      if (typeof window !== "undefined" && typeof window.fbq === "function") {
        console.log(
          "[meta-pixel] Firing CompleteRegistration — email signup success"
        );
        const pixelOpts = signupData.capiEventId ? { eventID: signupData.capiEventId } : {};
        window.fbq("track", "CompleteRegistration", {
          content_name: "Free Trial Signup",
          currency: "USD",
          value: 0,
        }, pixelOpts);
        console.log("[meta-pixel] Firing StartTrial — email signup success");
        window.fbq("track", "StartTrial", { value: 4.99, currency: "USD", predicted_ltv: 39.99 });
        // Guard so TrackCompleteRegistration on the success page doesn't double-fire
        try { sessionStorage.setItem("acuity_reg_pixel_fired", "1"); } catch {}
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

  const scrollToForm = () => {
    formRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-white">
      {/* ─── MOBILE STICKY CTA (appears after scrolling past form) ─── */}
      <div
        className={`fixed top-0 inset-x-0 z-50 lg:hidden transition-transform duration-300 ${showStickyCta ? "translate-y-0" : "-translate-y-full"}`}
      >
        <div className="flex items-center justify-between bg-white/95 backdrop-blur-sm border-b border-zinc-100 px-4 py-2.5">
          <span className="text-sm font-semibold text-zinc-900">Start your free trial</span>
          <button
            onClick={scrollToForm}
            className="rounded-full px-5 py-2.5 text-xs font-semibold text-white"
            style={{
              background: "var(--acuity-grad-primary)",
              // v1.4 mobile responsiveness pass: bump tap target to
              // 44pt minimum so iOS doesn't dock the chevron over it
              // and so users can hit it reliably one-handed.
              minHeight: 44,
            }}
          >
            Sign up
          </button>
        </div>
      </div>

      <div className="flex min-h-screen flex-col lg:flex-row">
        {/* ─── LEFT/TOP — Marketing content ─── */}
        <div className="flex flex-col justify-center bg-gradient-to-br from-[#F8F6FF] to-white px-6 py-10 lg:w-[55%] lg:px-16 lg:py-16 xl:px-24">
          {/* Headline */}
          <h1 className="font-display text-3xl font-bold leading-tight tracking-tight text-zinc-900 sm:text-4xl xl:text-5xl">
            One minute a day.
            <br />
            <span className="bg-gradient-to-r from-acuity-primary to-acuity-primary-hi bg-clip-text text-transparent">
              A life of clarity.
            </span>
          </h1>

          {/* Rotating testimonial — visible on all screens */}
          <div className="mt-8">
            <blockquote className="min-h-[72px]">
              <p className="text-sm italic leading-relaxed text-zinc-600">
                &ldquo;{TESTIMONIALS[testimonialIdx].quote}&rdquo;
              </p>
              <cite className="mt-2 block text-xs font-medium not-italic text-zinc-500">
                — {TESTIMONIALS[testimonialIdx].name}, {TESTIMONIALS[testimonialIdx].role}
              </cite>
            </blockquote>
          </div>

          {/* Social proof + urgency */}
          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-1.5">
              <span className="text-amber-400 text-sm">★★★★★</span>
              <span className="text-xs font-medium text-zinc-600">
                {SOCIAL_PROOF.rating} from {SOCIAL_PROOF.users} users
              </span>
            </div>
            <span className="text-xs font-medium text-acuity-primary">
              Your first weekly report arrives this Sunday.
            </span>
          </div>

          {/* How it works — below fold on mobile, visible on desktop */}
          <div className="mt-10 space-y-5 hidden lg:block">
            <HowItWorksStep
              icon={<MicIcon />}
              step="1"
              title="Talk"
              description="Record a 60-second debrief about your day"
            />
            <HowItWorksStep
              icon={<SparkleIcon />}
              step="2"
              title="Extract"
              description="AI pulls out tasks, goals, mood, and patterns"
            />
            <HowItWorksStep
              icon={<ChartIcon />}
              step="3"
              title="Grow"
              description="Get your weekly report every Sunday morning"
            />
          </div>
        </div>

        {/* ─── RIGHT/MIDDLE — Signup form ─── */}
        <div ref={formRef} className="flex w-full flex-col justify-center px-6 py-10 sm:px-12 lg:w-[45%] lg:px-16 lg:py-12">
          <div className="mx-auto w-full max-w-sm">
            {/* Form card */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
              <div className="mb-6 text-center">
                <Image
                  src="/AcuityLogo.png"
                  alt="Acuity"
                  width={36}
                  height={36}
                  className="mx-auto mb-3"
                />
                <h2 className="text-xl font-bold tracking-tight text-zinc-900">
                  Start your free trial
                </h2>
                <p className="mt-1 text-sm text-zinc-500">
                  7 days free. No credit card.
                </p>
              </div>

              {error && (
                <div
                  className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                  role="alert"
                >
                  {error}
                </div>
              )}

              {/* Google */}
              <button
                onClick={handleGoogle}
                disabled={loading !== null}
                className="flex w-full items-center justify-center gap-3 rounded-full border border-zinc-200 bg-white px-6 py-3.5 text-[15px] font-semibold text-zinc-700 transition hover:bg-zinc-50 active:scale-[0.98] disabled:opacity-50"
              >
                <GoogleIcon />
                {loading === "google" ? "Redirecting\u2026" : "Continue with Google"}
              </button>

              {/* Apple */}
              <button
                onClick={handleApple}
                disabled={loading !== null}
                className="mt-3 flex w-full items-center justify-center gap-3 rounded-full bg-black px-6 py-3.5 text-[15px] font-semibold text-white transition hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-50"
              >
                <AppleIcon />
                {loading === "apple" ? "Redirecting\u2026" : "Continue with Apple"}
              </button>

              {/* Divider */}
              <div className="my-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-zinc-200" />
                <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                  or
                </span>
                <div className="h-px flex-1 bg-zinc-200" />
              </div>

              {/* Email/password form */}
              <form onSubmit={handleSubmit} className="space-y-3">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name (optional)"
                  autoComplete="name"
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none transition focus:border-acuity-primary focus:ring-2 focus:ring-acuity-primary/20"
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none transition focus:border-acuity-primary focus:ring-2 focus:ring-acuity-primary/20"
                />
                <div>
                  <p className="mb-1.5 text-xs text-zinc-500">
                    Password &mdash; at least {PASSWORD_MIN} characters.
                  </p>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (pwError) setPwError(null);
                    }}
                    placeholder={`At least ${PASSWORD_MIN} characters`}
                    autoComplete="new-password"
                    aria-invalid={pwError ? true : undefined}
                    aria-describedby={pwError ? "signup-pw-error" : undefined}
                    className={`w-full rounded-lg border bg-zinc-50 px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none transition focus:ring-2 ${
                      pwError
                        ? "border-red-400 focus:border-red-400 focus:ring-red-200"
                        : "border-zinc-200 focus:border-acuity-primary focus:ring-acuity-primary/20"
                    }`}
                  />
                  {pwError && (
                    <p
                      id="signup-pw-error"
                      role="alert"
                      className="mt-1.5 text-xs text-red-600"
                    >
                      {pwError}
                    </p>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={loading !== null}
                  className="w-full rounded-full px-6 py-3.5 text-[15px] font-semibold text-white transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
                  style={{
                    background: "var(--acuity-grad-primary)",
                    boxShadow: "0 4px 16px var(--acuity-glow-soft)",
                  }}
                >
                  {loading === "password"
                    ? "Creating account\u2026"
                    : "Start free trial"}
                </button>
              </form>

              <p className="mt-4 text-center text-xs text-zinc-500">
                You&apos;ll do your first debrief right after signing up.
              </p>

              <p className="mt-4 text-center text-xs text-zinc-500">
                Already have an account?{" "}
                <Link
                  href="/auth/signin"
                  className="font-semibold text-acuity-primary transition hover:text-acuity-primary-lo"
                >
                  Sign in
                </Link>
              </p>
            </div>

          </div>
        </div>

        {/* ─── BOTTOM — How it works (mobile only, below form) ─── */}
        <div className="lg:hidden px-6 py-12 bg-zinc-50 border-t border-zinc-100">
          <div className="mx-auto max-w-sm space-y-5">
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-4">How it works</p>
            <HowItWorksStep
              icon={<MicIcon />}
              step="1"
              title="Talk"
              description="Record a 60-second debrief about your day"
            />
            <HowItWorksStep
              icon={<SparkleIcon />}
              step="2"
              title="Extract"
              description="AI pulls out tasks, goals, mood, and patterns"
            />
            <HowItWorksStep
              icon={<ChartIcon />}
              step="3"
              title="Grow"
              description="Get your weekly report every Sunday morning"
            />
            <p className="pt-4 text-center text-xs text-zinc-500">
              7 days free. Cancel anytime. No credit card required.
            </p>
            {/* Extra testimonial for scrollers */}
            <blockquote className="pt-4 border-t border-zinc-200">
              <p className="text-sm italic leading-relaxed text-zinc-600">
                &ldquo;{TESTIMONIALS[(testimonialIdx + 1) % TESTIMONIALS.length].quote}&rdquo;
              </p>
              <cite className="mt-2 block text-xs font-medium not-italic text-zinc-500">
                — {TESTIMONIALS[(testimonialIdx + 1) % TESTIMONIALS.length].name}, {TESTIMONIALS[(testimonialIdx + 1) % TESTIMONIALS.length].role}
              </cite>
            </blockquote>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function HowItWorksStep({
  icon,
  step,
  title,
  description,
}: {
  icon: React.ReactNode;
  step: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-acuity-primary-soft">
        {icon}
      </div>
      <div>
        <p className="text-sm font-bold text-zinc-900">
          <span className="text-acuity-primary">Step {step}:</span> {title}
        </p>
        <p className="mt-0.5 text-sm text-zinc-600">{description}</p>
      </div>
    </div>
  );
}

function MicIcon() {
  return (
    <svg className="h-5 w-5 text-acuity-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg className="h-5 w-5 text-acuity-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg className="h-5 w-5 text-acuity-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
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
