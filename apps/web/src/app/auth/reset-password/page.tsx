"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

// Must match the server policy in @/lib/passwords (PASSWORD_MIN_LENGTH = 8).
// Was previously 12 here, which silently rejected valid 8–11 char
// passwords client-side (the submit button was disabled with no message).
const PASSWORD_MIN = 8;

function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pwError, setPwError] = useState<string | null>(null);

  if (!token) {
    return (
      <div className="text-center">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
          Missing token
        </h2>
        <p className="text-zinc-500 dark:text-zinc-400 text-sm leading-relaxed">
          This page is only reachable via the reset link in your email.
        </p>
        <Link
          href="/auth/forgot-password"
          className="mt-6 inline-block text-sm text-acuity-primary dark:text-acuity-primary hover:text-violet-500"
        >
          Request a new link →
        </Link>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPwError(null);
    if (password.length < PASSWORD_MIN) {
      setPwError(`Password must be at least ${PASSWORD_MIN} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        if (body.error === "InvalidToken") setError("This reset link is invalid.");
        else if (body.error === "ExpiredToken")
          setError("This reset link has expired. Request a new one.");
        else if (body.error === "WeakPassword") setPwError(body.message ?? `Password must be at least ${PASSWORD_MIN} characters.`);
        else if (res.status === 429)
          setError("Too many attempts. Wait and try again.");
        else setError("Something went wrong. Please try again.");
        return;
      }
      setDone(true);
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="text-center">
        <div className="mb-4 text-4xl">✓</div>
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
          Password reset
        </h2>
        <p className="text-zinc-500 dark:text-zinc-400 text-sm leading-relaxed">
          You can sign in with your new password.
        </p>
        <Link
          href="/auth/signin"
          className="mt-6 inline-block rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-700"
        >
          Sign in →
        </Link>
        <p className="mt-4 text-xs text-zinc-400 dark:text-zinc-500">
          Using the mobile app? Open Acuity and sign in with your new password.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Set a new password</h1>
        <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
          Pick something you&apos;ll remember. {PASSWORD_MIN}+ characters.
        </p>
      </div>

      {error && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-400">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (pwError) setPwError(null);
            }}
            placeholder={`New password (at least ${PASSWORD_MIN} characters)`}
            autoComplete="new-password"
            required
            aria-invalid={pwError ? true : undefined}
            aria-describedby={pwError ? "reset-pw-error" : undefined}
            className={`w-full rounded-xl border bg-white dark:bg-acuity-card-bg px-4 py-3 text-sm text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 outline-none focus:ring-2 transition ${
              pwError
                ? "border-red-400 focus:border-red-400 focus:ring-red-200"
                : "border-zinc-200 dark:border-white/10 focus:border-acuity-primary focus:ring-violet-500/20"
            }`}
          />
          {pwError && (
            <p id="reset-pw-error" role="alert" className="mt-1.5 text-xs text-red-600 dark:text-red-400">
              {pwError}
            </p>
          )}
        </div>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Confirm new password"
          autoComplete="new-password"
          required
          className="w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-acuity-card-bg px-4 py-3 text-sm text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 outline-none focus:border-acuity-primary focus:ring-2 focus:ring-violet-500/20 transition"
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-zinc-700 disabled:opacity-50 active:scale-[0.98]"
        >
          {loading ? "Setting password..." : "Set new password"}
        </button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-acuity-card-bg p-8 shadow-lg animate-fade-in">
        <Suspense>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
