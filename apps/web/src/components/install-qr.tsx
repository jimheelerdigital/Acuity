"use client";

import { useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";

import { trackClient } from "@/lib/analytics-client";

/**
 * Brand-styled QR that bridges a desktop visitor to the native app on their
 * phone. Encodes the canonical install URL (www.getacuity.io/install?src=…),
 * which UA-redirects the scanning phone straight to the right store.
 *
 * High-contrast dark-on-white modules (scannability first — NOT recolored to
 * a low-contrast brand tint), the Acuity app-icon glyph centered at ~18% with
 * level-H error correction so the logo never breaks the scan.
 *
 * Lazy-load this at call sites (next/dynamic ssr:false) so qrcode.react stays
 * out of the mobile marketing bundle — the QR is desktop-only.
 *
 * Fires install_qr_shown once when scrolled into view.
 */

const INSTALL_BASE = "https://www.getacuity.io/install";
const FG = "#1A1726"; // brand charcoal — guaranteed contrast on white

export function InstallQR({
  src,
  size = 152,
  location,
}: {
  src: string;
  size?: number;
  location?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useRef(false);
  const url = `${INSTALL_BASE}?src=${encodeURIComponent(src)}`;
  const logo = Math.round(size * 0.18);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !seen.current) {
            seen.current = true;
            trackClient("install_qr_shown", { src, location: location ?? src });
            obs.disconnect();
          }
        }
      },
      { threshold: 0.4 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [src, location]);

  return (
    <div
      ref={ref}
      className="inline-flex rounded-2xl bg-white p-3"
      style={{ boxShadow: "var(--acuity-shadow-soft)" }}
    >
      <QRCodeSVG
        value={url}
        size={size}
        level="H"
        bgColor="#FFFFFF"
        fgColor={FG}
        imageSettings={{
          src: "/apple-touch-icon.png",
          height: logo,
          width: logo,
          excavate: true,
        }}
      />
    </div>
  );
}
