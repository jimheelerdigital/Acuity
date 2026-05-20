"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

const FeatureFlagsTab = dynamic(() => import("./FeatureFlagsTab"));
const GuideTab = dynamic(() => import("./GuideTab"));

type Section = "feature-flags" | "guide" | "links";

const QUICK_LINKS = [
  { label: "Supabase", href: "https://supabase.com/dashboard" },
  { label: "Vercel", href: "https://vercel.com" },
  { label: "GA4", href: "https://analytics.google.com" },
  { label: "Stripe", href: "https://dashboard.stripe.com" },
  { label: "Resend", href: "https://resend.com/emails" },
  { label: "Meta Ads", href: "https://adsmanager.facebook.com" },
  { label: "Inngest", href: "https://app.inngest.com" },
  { label: "App Store Connect", href: "https://appstoreconnect.apple.com" },
  { label: "Sentry", href: "https://sentry.io" },
];

export default function SettingsTab() {
  const [section, setSection] = useState<Section>("feature-flags");

  return (
    <div className="space-y-6">
      {/* Sub-section toggle */}
      <div className="flex gap-1 rounded-lg bg-[#13131F] p-1 w-fit">
        {(
          [
            { key: "feature-flags", label: "Feature Flags" },
            { key: "guide", label: "Guide" },
            { key: "links", label: "External Links" },
          ] as const
        ).map((s) => (
          <button
            key={s.key}
            onClick={() => setSection(s.key)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              section === s.key
                ? "bg-[#7C5CFC] text-white"
                : "text-white/50 hover:text-white/80"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === "feature-flags" && <FeatureFlagsTab />}
      {section === "guide" && <GuideTab />}
      {section === "links" && (
        <div className="rounded-lg bg-[#13131F] p-6">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/40">
            External Services
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {QUICK_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-md bg-white/5 px-4 py-3 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                <svg
                  className="h-4 w-4 shrink-0 text-white/30"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                  />
                </svg>
                {link.label}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
