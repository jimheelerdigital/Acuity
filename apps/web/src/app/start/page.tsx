import type { Metadata } from "next";

import { MobileAppBanner } from "@/components/mobile-app-banner";
import { StartPageClient } from "./client";
import { ENTRY_QUESTION } from "@/lib/funnel-config";

export const metadata: Metadata = {
  title: "Start Free Trial — Acuity",
  description:
    "Start your Acuity journey. See what one 60-second debrief can tell you about your life.",
  robots: { index: false, follow: false },
};

/**
 * Server component — renders Screen 1 (Entry Question) as real HTML in the
 * initial response so content is visible before any JS downloads. The client
 * component hydrates on top and takes over for step navigation.
 *
 * This is critical for FB in-app browser traffic where JS takes 3-5s to load.
 */
export default async function StartPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const step = typeof searchParams.step === "string" ? searchParams.step : null;

  // If returning to a specific step (refresh, OAuth, Stripe), skip SSR — let client handle
  if (step) {
    return (
      <>
        <MobileAppBanner />
        <StartPageClient skipSSR />
      </>
    );
  }

  const question = ENTRY_QUESTION.text;
  const options = ENTRY_QUESTION.options;

  return (
    <>
      <MobileAppBanner />
      {/* Critical inline CSS — styles Screen 1 before the CSS bundle loads */}
      <style dangerouslySetInnerHTML={{ __html: `
        .ssr-entry{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:1.5rem;background:#fff;color:#18181b;position:relative}
        .ssr-entry__inner{position:relative;max-width:28rem;width:100%}
        .ssr-entry h1{font-size:1.5rem;font-weight:700;letter-spacing:-.025em;line-height:1.3;text-align:center;margin-bottom:2rem}
        @media(min-width:640px){.ssr-entry h1{font-size:1.875rem}}
        .ssr-entry__opt{width:100%;text-align:left;border-radius:0.75rem;border:1px solid #e4e4e7;background:#fafafa;padding:1rem 1.25rem;font-size:0.9375rem;color:#3f3f46;margin-bottom:0.75rem;cursor:pointer;transition:background 0.15s}
        .ssr-entry__opt:hover{background:#f4f4f5}
        .ssr-entry__progress{position:fixed;top:0;left:0;right:0;height:2px;background:#e4e4e7}
        .ssr-entry__progress-bar{height:100%;width:6.25%;background:#7C5CFC}
      `}} />

      {/* Server-rendered Screen 1 — visible instantly, before JS loads */}
      <div id="ssr-entry" className="ssr-entry">
        <div className="ssr-entry__progress"><div className="ssr-entry__progress-bar" /></div>
        <div className="ssr-entry__inner">
          <h1>{question}</h1>
          <div>
            {options.map((opt) => (
              <button key={opt.label} className="ssr-entry__opt" data-branch={opt.branch}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Client component hydrates on top — hides SSR content and takes over */}
      <StartPageClient />
    </>
  );
}
