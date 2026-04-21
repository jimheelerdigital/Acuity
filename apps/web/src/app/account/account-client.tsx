"use client";

import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";

import { ThemeToggle } from "@/components/theme-toggle";

import { LifeDimensionsSection } from "./life-dimensions-section";

interface Props {
  email: string;
  name: string | null;
  notificationTime: string;
  notificationDays: number[];
  notificationsEnabled: boolean;
  subscriptionStatus: string;
  hasStripeCustomer: boolean;
  periodEnd: string | null;
  trialEndsAt: string | null;
  weeklyEmailEnabled: boolean;
  monthlyEmailEnabled: boolean;
}

export default function AccountClient({
  email,
  name,
  notificationTime,
  notificationDays,
  notificationsEnabled,
  subscriptionStatus,
  hasStripeCustomer,
  periodEnd,
  trialEndsAt,
  weeklyEmailEnabled,
  monthlyEmailEnabled,
}: Props) {
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

        {/* Subscription */}
        <SubscriptionSection
          status={subscriptionStatus}
          hasStripeCustomer={hasStripeCustomer}
          periodEnd={periodEnd}
          trialEndsAt={trialEndsAt}
        />

        {/* Reminders */}
        <RemindersSection
          initialTime={notificationTime}
          initialDays={notificationDays}
          initialEnabled={notificationsEnabled}
        />

        {/* Life Matrix dimensions */}
        <LifeDimensionsSection />

        {/* Referrals */}
        <ReferralsSection />

        {/* Email preferences */}
        <EmailPrefsSection
          initialWeekly={weeklyEmailEnabled}
          initialMonthly={monthlyEmailEnabled}
        />

        {/* Data export */}
        <DataExportSection />

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
            recordings, transcripts, tasks, goals, weekly reports, Life
            Matrix, and your subscription. This cannot be undone.
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

const DAY_LABELS: Array<{ i: number; label: string }> = [
  { i: 0, label: "S" },
  { i: 1, label: "M" },
  { i: 2, label: "T" },
  { i: 3, label: "W" },
  { i: 4, label: "T" },
  { i: 5, label: "F" },
  { i: 6, label: "S" },
];

/**
 * Post-onboarding reminders editor. Same semantics as the onboarding
 * step 9 — time, day pattern, master on/off. Saves via the same
 * /api/onboarding/update endpoint (step=0 shorthand), which the
 * endpoint's field router accepts without requiring step-range.
 */
function RemindersSection({
  initialTime,
  initialDays,
  initialEnabled,
}: {
  initialTime: string;
  initialDays: number[];
  initialEnabled: boolean;
}) {
  const [time, setTime] = useState(initialTime);
  const [days, setDays] = useState<number[]>(initialDays);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const toggleDay = (i: number) => {
    setDays((prev) =>
      prev.includes(i) ? prev.filter((d) => d !== i) : [...prev, i].sort()
    );
  };

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/account/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notificationTime: time,
          notificationDays: days,
          notificationsEnabled: enabled,
        }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mt-8 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] p-6">
      <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
        Reminders
      </h2>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        When we nudge you to journal. Turn off entirely anytime.
      </p>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setEnabled((v) => !v)}
          aria-pressed={enabled}
          className={`relative h-6 w-11 rounded-full transition ${
            enabled ? "bg-violet-600" : "bg-zinc-300 dark:bg-white/10"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
              enabled ? "left-[22px]" : "left-0.5"
            }`}
          />
        </button>
        <span className="text-sm text-zinc-700 dark:text-zinc-200">
          {enabled ? "Reminders on" : "Reminders off"}
        </span>
      </div>

      <div
        className={`mt-5 space-y-5 transition-opacity ${
          enabled ? "opacity-100" : "opacity-40 pointer-events-none"
        }`}
      >
        <div>
          <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">
            Time
          </label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value || "21:00")}
            className="rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#13131F] px-3 py-1.5 text-sm font-mono text-zinc-900 dark:text-zinc-100 outline-none focus:border-violet-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">
            Days
          </label>
          <div className="flex gap-1.5">
            {DAY_LABELS.map((d) => {
              const on = days.includes(d.i);
              return (
                <button
                  key={d.i}
                  type="button"
                  onClick={() => toggleDay(d.i)}
                  className={`h-8 w-8 rounded-full text-xs font-semibold transition ${
                    on
                      ? "bg-violet-600 text-white"
                      : "bg-zinc-100 dark:bg-white/5 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-white/10"
                  }`}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          disabled={saving}
          onClick={save}
          className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {saved && (
          <span className="text-xs text-emerald-600 dark:text-emerald-400">
            Saved ✓
          </span>
        )}
      </div>
    </section>
  );
}

const STATUS_LABELS: Record<string, { label: string; hint: string; tone: "default" | "warn" | "good" }> = {
  PRO: { label: "Pro — active", hint: "Thanks for supporting Acuity.", tone: "good" },
  TRIAL: { label: "14-day trial", hint: "You have full access during your trial.", tone: "default" },
  PAST_DUE: {
    label: "Payment needed",
    hint: "Stripe couldn't charge your card. Update it to keep your subscription active.",
    tone: "warn",
  },
  FREE: { label: "Read-only", hint: "Your trial has ended. Upgrade to keep generating new insights.", tone: "default" },
};

/**
 * Subscription status block + Stripe Customer Portal entry. The
 * actual cancel / plan-change / update-card UI is inside Stripe's
 * hosted portal, so our job here is surface status + route.
 */
function SubscriptionSection({
  status,
  hasStripeCustomer,
  periodEnd,
  trialEndsAt,
}: {
  status: string;
  hasStripeCustomer: boolean;
  periodEnd: string | null;
  trialEndsAt: string | null;
}) {
  const meta = STATUS_LABELS[status] ?? STATUS_LABELS.FREE;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openPortal = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      if (res.ok) {
        const body = await res.json();
        if (body.url) window.location.assign(body.url);
      } else {
        const body = await res.json().catch(() => ({}));
        if (body.redirect) {
          window.location.assign(body.redirect);
        } else {
          setError(body.detail ?? body.error ?? "Couldn't open portal.");
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const periodEndLabel = periodEnd
    ? new Date(periodEnd).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;
  const trialEndLabel = trialEndsAt
    ? new Date(trialEndsAt).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <section
      className={`mt-8 rounded-xl border p-6 ${
        meta.tone === "warn"
          ? "border-amber-300 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/20"
          : "border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E]"
      }`}
    >
      <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
        Subscription
      </h2>

      <div className="mt-3 flex items-center gap-3">
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            meta.tone === "good"
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
              : meta.tone === "warn"
                ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                : "bg-zinc-100 text-zinc-700 dark:bg-white/5 dark:text-zinc-300"
          }`}
        >
          {meta.label}
        </span>
        {status === "PRO" && periodEndLabel && (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Renews {periodEndLabel}
          </span>
        )}
        {status === "TRIAL" && trialEndLabel && (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Ends {trialEndLabel}
          </span>
        )}
      </div>

      <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">{meta.hint}</p>

      <div className="mt-5 flex flex-wrap gap-3">
        {hasStripeCustomer ? (
          <button
            onClick={openPortal}
            disabled={loading}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-white disabled:opacity-50"
          >
            {loading ? "Opening…" : "Manage subscription"}
          </button>
        ) : (
          <a
            href="/upgrade"
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-500"
          >
            {status === "TRIAL" ? "Subscribe early" : "Upgrade"}
          </a>
        )}
      </div>
      {error && (
        <p className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </section>
  );
}

/**
 * Referrals section. Shows the user's unique share link, copy-to-
 * clipboard affordance, and simple stats (signups via / conversions
 * to paid). Reward fulfillment is stubbed server-side — Jim decides
 * the reward type. This UI stays honest about that:
 *   "Rewards coming soon" placeholder copy.
 */
function ReferralsSection() {
  const [data, setData] = useState<{
    referralCode: string | null;
    signups: number;
    conversions: number;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/user/referrals")
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => setData(b))
      .catch(() => {});
  }, []);

  const url =
    typeof window !== "undefined" && data?.referralCode
      ? `${window.location.origin}/?ref=${data.referralCode}`
      : data?.referralCode
        ? `https://www.getacuity.io/?ref=${data.referralCode}`
        : null;

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore — browser refused; user can select manually
    }
  };

  return (
    <section className="mt-8 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] p-6">
      <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
        Referrals
      </h2>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Share Acuity with someone who might want it. We&apos;ll track
        sign-ups; rewards are coming soon.
      </p>

      <div className="mt-4">
        <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">
          Your share link
        </label>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={url ?? "Loading…"}
            className="flex-1 rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-[#13131F] px-3 py-2 text-xs font-mono text-zinc-700 dark:text-zinc-200"
            onClick={(e) => (e.target as HTMLInputElement).select()}
          />
          <button
            onClick={copy}
            disabled={!url}
            className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white dark:bg-zinc-50 dark:text-zinc-900 hover:opacity-90 disabled:opacity-40"
          >
            {copied ? "Copied ✓" : "Copy"}
          </button>
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-xs text-zinc-500 dark:text-zinc-400">People joined</dt>
          <dd className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {data?.signups ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-500 dark:text-zinc-400">Converted to paid</dt>
          <dd className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {data?.conversions ?? "—"}
          </dd>
        </div>
      </dl>
    </section>
  );
}

/**
 * Email digest preferences. Two toggles:
 *   - Weekly summary — Sunday 9am local (see weekly-digest.ts cron)
 *   - Monthly reflection — 1st of month 9am local
 *
 * POSTs to /api/account/email-preferences which is userWrite-limited.
 * Optimistic state with revert-on-failure.
 */
function EmailPrefsSection({
  initialWeekly,
  initialMonthly,
}: {
  initialWeekly: boolean;
  initialMonthly: boolean;
}) {
  const [weekly, setWeekly] = useState(initialWeekly);
  const [monthly, setMonthly] = useState(initialMonthly);
  const [saving, setSaving] = useState(false);

  const updatePref = async (
    key: "weeklyEmailEnabled" | "monthlyEmailEnabled",
    value: boolean,
    setLocal: (v: boolean) => void
  ) => {
    const prior = key === "weeklyEmailEnabled" ? weekly : monthly;
    setLocal(value);
    setSaving(true);
    try {
      const res = await fetch("/api/account/email-preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      if (!res.ok) {
        setLocal(prior); // revert
      }
    } catch {
      setLocal(prior);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mt-8 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] p-6">
      <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
        Email digests
      </h2>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Short summary emails on a regular cadence. Always unsubscribable
        from any footer.
      </p>

      <div className="mt-5 space-y-4">
        <PrefRow
          label="Weekly summary email"
          sub="Sundays, 9am in your local timezone"
          checked={weekly}
          disabled={saving}
          onChange={(v) => updatePref("weeklyEmailEnabled", v, setWeekly)}
        />
        <PrefRow
          label="Monthly reflection email"
          sub="1st of each month, 9am local"
          checked={monthly}
          disabled={saving}
          onChange={(v) => updatePref("monthlyEmailEnabled", v, setMonthly)}
        />
      </div>
    </section>
  );
}

function PrefRow({
  label,
  sub,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  sub: string;
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
          {label}
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{sub}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full transition disabled:opacity-40 ${
          checked ? "bg-violet-600" : "bg-zinc-300 dark:bg-white/10"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
            checked ? "left-[22px]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}

type DataExportRow = {
  id: string;
  status: "PENDING" | "PROCESSING" | "READY" | "FAILED" | "EXPIRED";
  downloadUrl: string | null;
  expiresAt: string | null;
  createdAt: string;
  errorMessage: string | null;
};

/**
 * "Download my data" section. POST triggers an async Inngest export;
 * the user is emailed a signed link when ready. Status polls every
 * 10 seconds while a PROCESSING job is outstanding.
 */
function DataExportSection() {
  const [row, setRow] = useState<DataExportRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const res = await fetch("/api/user/export");
      if (res.ok) {
        const body = await res.json();
        setRow(body.export);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  // Poll when a job is in flight.
  useEffect(() => {
    if (!row) return;
    if (row.status !== "PENDING" && row.status !== "PROCESSING") return;
    const t = setInterval(refresh, 10_000);
    return () => clearInterval(t);
  }, [row]);

  const request = async () => {
    setRequesting(true);
    setError(null);
    try {
      const res = await fetch("/api/user/export", { method: "POST" });
      if (res.ok || res.status === 202) {
        const body = await res.json();
        setRow(body.export);
      } else {
        const body = await res.json().catch(() => ({}));
        if (res.status === 429) {
          setError(body.detail ?? "One export per 7 days.");
          if (body.export) setRow(body.export);
        } else {
          setError(body.detail ?? body.error ?? `HTTP ${res.status}`);
        }
      }
    } finally {
      setRequesting(false);
    }
  };

  const expiresAtDate = row?.expiresAt ? new Date(row.expiresAt) : null;
  const isExpired =
    expiresAtDate !== null && expiresAtDate.getTime() < Date.now();
  const canRequest =
    !row ||
    row.status === "FAILED" ||
    row.status === "EXPIRED" ||
    isExpired ||
    // More than 7 days since last successful READY — can re-request
    (row.status === "READY" &&
      Date.now() - new Date(row.createdAt).getTime() > 7 * 24 * 60 * 60 * 1000);

  return (
    <section className="mt-8 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] p-6">
      <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
        Download my data
      </h2>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Get a zip of everything Acuity has stored for you — entries,
        transcripts, goals, tasks, Life Matrix, weekly reports, audio
        where retained. The link expires in 24 hours.
      </p>

      {loading ? (
        <div className="mt-4 h-4 w-32 rounded bg-zinc-100 dark:bg-white/5 animate-pulse" />
      ) : row && (row.status === "PENDING" || row.status === "PROCESSING") ? (
        <div className="mt-4 flex items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-200 dark:border-white/10 border-t-violet-500" />
          Building your export — we&apos;ll email you the link when it&apos;s ready.
        </div>
      ) : row && row.status === "READY" && !isExpired && row.downloadUrl ? (
        <div className="mt-4 flex items-center gap-3">
          <a
            href={row.downloadUrl}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-900 hover:opacity-90"
          >
            Download zip
          </a>
          {expiresAtDate && (
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Expires {expiresAtDate.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
            </span>
          )}
        </div>
      ) : row && row.status === "FAILED" ? (
        <p className="mt-3 text-xs text-red-600 dark:text-red-400">
          Last export failed: {row.errorMessage ?? "unknown error"}. Try again.
        </p>
      ) : null}

      {canRequest && (
        <button
          onClick={request}
          disabled={requesting}
          className="mt-4 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-white/10 dark:bg-[#1E1E2E] dark:text-zinc-200 dark:hover:bg-white/5 disabled:opacity-40"
        >
          {requesting ? "Requesting…" : "Request data export"}
        </button>
      )}

      {error && (
        <p className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </section>
  );
}
