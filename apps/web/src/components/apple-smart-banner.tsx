"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Renders the Apple Smart App Banner meta tag on all pages EXCEPT the
 * /start funnel. The banner sends high-intent traffic into the lossy
 * App Store handoff before the user enters the web funnel, bypassing
 * the web recording flow entirely.
 *
 * The /start Download screen already handles app download as the
 * intended end-of-funnel reward — users reach it after signup.
 */

const SUPPRESSED_PREFIXES = ["/start"];

export function AppleSmartBanner() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;
  if (SUPPRESSED_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  // Inject the meta tag into <head> via a portal-like approach.
  // Next.js Script component doesn't work for meta tags, so we
  // manipulate the DOM directly.
  return <SmartBannerMeta />;
}

function SmartBannerMeta() {
  useEffect(() => {
    const existing = document.querySelector('meta[name="apple-itunes-app"]');
    if (existing) return; // already present (e.g. from SSR)

    const meta = document.createElement("meta");
    meta.name = "apple-itunes-app";
    meta.content = "app-id=6762633410";
    document.head.appendChild(meta);
    return () => {
      meta.remove();
    };
  }, []);

  return null;
}
