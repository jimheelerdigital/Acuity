"use client";

import { useEffect, useState } from "react";

/**
 * Post-return banner shown to users who re-signed up after deletion
 * and got a reduced 3-day trial instead of the standard 14 (pentest
 * T-07 fix). Server decides eligibility: we render the banner only
 * when the dashboard passes `reduced={true}`.
 *
 * Dismissible via localStorage so the banner shows once per browser
 * session per account. A full cross-device dismiss tracker would need
 * a DB field; not worth the complexity for a one-time notice.
 */
interface Props {
  reduced: boolean;
  daysLeft: number;
}

const DISMISS_KEY = "acuity_welcome_back_dismissed";

export function WelcomeBackBanner({ reduced, daysLeft }: Props) {
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (!reduced) return;
    try {
      const dismissed = window.localStorage.getItem(DISMISS_KEY);
      if (!dismissed) setHidden(false);
    } catch {
      // localStorage disabled — show anyway. Non-fatal.
      setHidden(false);
    }
  }, [reduced]);

  if (!reduced || hidden) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore
    }
    setHidden(true);
  };

  return (
    <div className="mb-6 flex items-start justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 dark:border-violet-900/40 dark:bg-violet-950/30">
      <div className="flex-1 text-sm leading-relaxed text-violet-900 dark:text-violet-200">
        <strong>Welcome back.</strong> You have{" "}
        {daysLeft === 1 ? "1 day" : `${daysLeft} days`} to try Acuity again
        before subscribing — we shorten the trial for returning accounts so the
        clock doesn&rsquo;t reset every time.
      </div>
      <button
        onClick={dismiss}
        className="shrink-0 rounded-md px-2 py-0.5 text-xs text-violet-700 transition hover:bg-violet-100 dark:text-violet-300 dark:hover:bg-violet-900/40"
      >
        Dismiss
      </button>
    </div>
  );
}
