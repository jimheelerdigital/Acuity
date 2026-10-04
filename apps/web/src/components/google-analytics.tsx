"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { isPrivateAppSurface } from "@/lib/tracking-surfaces";

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

declare global {
  interface Window {
    gtag: (...args: unknown[]) => void;
  }
}

export function GoogleAnalytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (!GA_MEASUREMENT_ID || !window.gtag) return;
    // No page tracking on the private journal (2026-10-03, lib/tracking-surfaces.ts).
    if (isPrivateAppSurface(pathname)) return;
    window.gtag("config", GA_MEASUREMENT_ID, {
      page_path: pathname,
    });
  }, [pathname]);

  return null;
}
