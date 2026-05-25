"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

function checkTryUsed(): boolean {
  try {
    return localStorage.getItem("acuity_try_used") === "1";
  } catch {
    return false;
  }
}

// In-app browsers (Facebook, Instagram) don't support MediaRecorder.
// Skip the try flow and send users straight to signup.
function isInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /FBAN|FBAV|Instagram|FB_IAB|FBIOS/i.test(ua);
}

/**
 * "Try it now — free" button that links to /try.
 *
 * After the first try, the button changes to "Sign up to continue"
 * and links to the signup page instead.
 */
export function TryItNowButton({
  variant = "primary",
  className = "",
}: {
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const [used, setUsed] = useState(false);
  const [inApp, setInApp] = useState(false);

  useEffect(() => { setUsed(checkTryUsed()); setInApp(isInAppBrowser()); }, []);

  const href = (used || inApp) ? "/auth/signup" : "/try";
  const label = used ? "Sign up to continue" : "Try it now \u2014 free";

  if (variant === "secondary") {
    return (
      <Link
        href={href}
        className={`rounded-full border border-[#7C5CFC]/30 bg-[#7C5CFC]/5 px-7 py-3.5 text-sm font-bold text-[#7C5CFC] transition hover:bg-[#7C5CFC]/10 active:scale-95 inline-block ${className}`}
      >
        {label}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={`rounded-full px-8 py-4 text-sm font-bold text-white transition hover:scale-[1.02] hover:-translate-y-0.5 active:scale-95 inline-block ${className}`}
      style={{
        background: "linear-gradient(135deg, #7C5CFC 0%, #9F7AEA 50%, #7C3AED 100%)",
        boxShadow: "0 8px 32px rgba(124,92,252,0.3), 0 2px 8px rgba(124,58,237,0.15)",
      }}
    >
      {label}
    </Link>
  );
}

/**
 * "Try It First" button with purple shining ring animation.
 * Light background, dark text — designed to sit next to the purple
 * "Start Free Trial" button on dark landing pages.
 */
export function TryItNowButtonDark({
  className = "",
}: {
  className?: string;
}) {
  const [used, setUsed] = useState(false);
  const [inApp, setInApp] = useState(false);

  useEffect(() => { setUsed(checkTryUsed()); setInApp(isInAppBrowser()); }, []);

  const href = (used || inApp) ? "/auth/signup" : "/try";
  const label = used ? "Sign up to continue" : "Try It First";

  return (
    <Link
      href={href}
      className={`group relative rounded-full p-[2px] transition active:scale-95 ${used ? "" : "hover:scale-[1.02]"} overflow-hidden inline-block ${className}`}
    >
      <span className="absolute inset-[-100%] animate-cta-shine" style={{ background: 'conic-gradient(from 0deg, transparent 0%, transparent 60%, #ffffff 75%, #B8A5FF 85%, transparent 100%)' }} />
      <span className="relative flex items-center justify-center rounded-full bg-[#F0EDE8] px-7 py-3.5 text-sm font-semibold text-[#181614]">
        {label}
      </span>
    </Link>
  );
}
