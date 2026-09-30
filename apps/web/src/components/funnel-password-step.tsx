"use client";

/**
 * Create-your-password step (2026-09-30, per Keenan: email → paywall → "THEN
 * create password step, then download app step").
 *
 * Funnel accounts are made at the email step with a random password she
 * never sees, so this is where she picks the one she'll use in the app. It
 * sits between checkout and the download screen in /start, /start-bwk,
 * /start-test and /start-test-bwk. Skippable: the emailed one-tap link signs
 * her into the app without a password. Backed by /api/account/set-password
 * (signed-in owner, account < 48h old).
 */
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

const DONE_KEY = "acuity_pw_step_done";

/** Has the step been completed or skipped in this browser session? */
export function passwordStepDone(): boolean {
  try {
    return sessionStorage.getItem(DONE_KEY) === "1";
  } catch {
    return false;
  }
}

function markDone() {
  try {
    sessionStorage.setItem(DONE_KEY, "1");
  } catch {}
}

export function PasswordStep({
  onDone,
  track,
}: {
  onDone: () => void;
  track: (event: string, value?: string) => void;
}) {
  const { data: session, status } = useSession();
  const email = session?.user?.email ?? null;
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (status === "authenticated") track("funnel_password_step_viewed");
    // Not signed in here (shouldn't happen after checkout): nothing to set.
    if (status === "unauthenticated") {
      markDone();
      onDone();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const save = async () => {
    if (pw.length < 8) {
      setErr("Use at least 8 characters.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/account/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Couldn't save that. Try again.");
      track("funnel_password_set");
      markDone();
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save that. Try again.");
      setBusy(false);
    }
  };

  const skip = () => {
    track("funnel_password_skipped");
    markDone();
    onDone();
  };

  if (status !== "authenticated") return null;

  return (
    <div className="mx-auto flex min-h-[70svh] w-full max-w-md flex-col justify-center px-6 py-10">
      <p className="text-center text-[13px] font-semibold tracking-wide text-acuity-primary">You&rsquo;re in. One last thing.</p>
      <h2 className="mt-2 text-center text-[26px] font-bold leading-tight tracking-tight">Create your password</h2>
      <p className="mt-2 text-center text-[15px] leading-snug text-acuity-text-sec">
        You&rsquo;ll use it with <span className="font-semibold text-acuity-text">{email}</span> to sign in to the Ripple app.
      </p>
      <form
        className="mt-6 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {/* Hidden username field so the phone's password manager saves the pair. */}
        <input type="email" value={email ?? ""} autoComplete="username" readOnly hidden />
        <div className="relative">
          <input
            type={show ? "text" : "password"}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="Password (8+ characters)"
            autoComplete="new-password"
            autoFocus
            className="w-full rounded-[14px] border border-acuity-line-strong bg-acuity-bg-inset px-4 py-3.5 pr-16 text-[16px] text-acuity-text outline-none placeholder:text-acuity-text-ter focus:border-acuity-primary"
          />
          <button
            type="button"
            onClick={() => setShow(!show)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-acuity-text-ter hover:text-acuity-text"
          >
            {show ? "Hide" : "Show"}
          </button>
        </div>
        {err && <p className="px-1 text-[13px] text-acuity-bad">{err}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-acuity-primary py-3.5 text-[16px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save and get the app"}
        </button>
      </form>
      <button type="button" onClick={skip} className="mt-4 text-center text-[14px] font-medium text-acuity-text-sec underline-offset-4 hover:underline">
        Skip. I&rsquo;ll sign in with the email link
      </button>
    </div>
  );
}
