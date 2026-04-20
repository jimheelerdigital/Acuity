"use client";

import { signOut } from "next-auth/react";
import { useState } from "react";

import { ThemeToggle } from "@/components/theme-toggle";

interface Props {
  email: string;
  name: string | null;
}

export default function AccountClient({ email, name }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#FAFAF7] px-6 py-12 dark:bg-[#0B0B12]">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Account
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Manage your Acuity account.
        </p>

        {/* Account info */}
        <section className="mt-8 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] p-6">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Profile
          </h2>
          <dl className="mt-4 space-y-3 text-sm">
            {name && (
              <div className="flex justify-between">
                <dt className="text-zinc-500 dark:text-zinc-400">Name</dt>
                <dd className="text-zinc-900 dark:text-zinc-50">{name}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-zinc-500 dark:text-zinc-400">Email</dt>
              <dd className="text-zinc-900 dark:text-zinc-50">{email}</dd>
            </div>
          </dl>
        </section>

        {/* Appearance */}
        <section className="mt-8 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] p-6">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Appearance
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Light, dark, or follow your system preference.
          </p>
          <div className="mt-4">
            <ThemeToggle />
          </div>
        </section>

        {/* Privacy choices — entry point to re-open the cookie banner */}
        <section className="mt-8 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] p-6">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Privacy choices
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Revisit what categories of cookies you&rsquo;ve accepted (analytics +
            marketing). Strictly-necessary cookies for sign-in + recording are
            always on — the app doesn&rsquo;t function without them.
          </p>
          <button
            onClick={() => {
              try {
                window.localStorage.removeItem("acuity_consent");
                window.dispatchEvent(new CustomEvent("acuity:consent-changed"));
                window.location.reload();
              } catch {
                // ignore
              }
            }}
            className="mt-4 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-white/10 dark:bg-[#1E1E2E] dark:text-zinc-200 dark:hover:bg-white/5"
          >
            Manage cookie preferences
          </button>
        </section>

        {/* Danger zone */}
        <section className="mt-8 rounded-xl border border-red-200 bg-red-50/40 p-6 dark:border-red-900/40 dark:bg-red-950/20">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Delete account
          </h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            Permanently deletes your account and everything in it &mdash;
            recordings, transcripts, tasks, goals, weekly reports, life
            map, and your subscription. This cannot be undone.
          </p>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            See our{" "}
            <a
              href="/privacy"
              className="underline hover:text-zinc-900 dark:hover:text-zinc-50"
            >
              Privacy Policy
            </a>{" "}
            for details on what gets deleted and when.
          </p>
          <button
            onClick={() => setConfirmOpen(true)}
            className="mt-5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700"
          >
            Delete my account
          </button>
        </section>
      </div>

      {confirmOpen && (
        <DeleteConfirmModal
          email={email}
          onClose={() => setConfirmOpen(false)}
        />
      )}
    </div>
  );
}

function DeleteConfirmModal({
  email,
  onClose,
}: {
  email: string;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = typed.trim().toLowerCase() === email.toLowerCase();

  async function handleDelete() {
    if (!matches || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/user/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmEmail: email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Deletion failed (${res.status})`);
        setSubmitting(false);
        return;
      }
      // Sign out and redirect to landing with a confirmation flag.
      await signOut({ callbackUrl: "/?deleted=1" });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Network error — please try again."
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#1E1E2E] p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Delete your Acuity account?
        </h3>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          This will permanently delete your account and every entry,
          task, goal, weekly report, life-map score, and audio file
          associated with it. Any active subscription will be cancelled.
        </p>
        <p className="mt-3 text-sm font-medium text-zinc-900 dark:text-zinc-50">
          This cannot be undone.
        </p>

        <p className="mt-5 text-sm text-zinc-600 dark:text-zinc-300">
          To confirm, type your email address below:
        </p>
        <p className="mt-1 text-sm font-mono text-zinc-500 dark:text-zinc-400">{email}</p>
        <input
          type="email"
          autoComplete="off"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="your@email.com"
          className="mt-2 w-full rounded-lg border border-zinc-300 dark:border-white/10 bg-white dark:bg-[#1E1E2E] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
          disabled={submitting}
        />

        {error && (
          <p className="mt-3 text-sm text-red-600">{error}</p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-300 transition hover:bg-zinc-100 dark:hover:bg-white/10 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={!matches || submitting}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:bg-red-300 disabled:cursor-not-allowed"
          >
            {submitting ? "Deleting…" : "Delete my account"}
          </button>
        </div>
      </div>
    </div>
  );
}
