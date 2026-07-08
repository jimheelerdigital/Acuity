import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { APP_VERSION_CONFIG } from "@/lib/app-version-config";
import { GetAcuity } from "@/components/get-acuity";

/**
 * Canonical install URL — every QR + shareable "get the app" link points here.
 *
 * UA-aware (server):
 *   - iOS              → 302 to the App Store
 *   - Android + LIVE   → 302 to the Play Store (while the flag is off → render)
 *   - desktop / bots / Android-pre-launch → render the shareable "Get Acuity"
 *     page (QR primary on desktop, badges for mobile). Never redirects home.
 *
 * Carries ?src=<placement> for attribution.
 */

const PLAY_STORE_LIVE = process.env.NEXT_PUBLIC_PLAY_STORE_LIVE === "true";

export const dynamic = "force-dynamic"; // reads the request User-Agent

export const metadata: Metadata = {
  title: "Get Acuity — the AI voice journal",
  description:
    "Scan to install Acuity on your phone. Talk for a minute and Acuity turns it into tasks, moods, patterns, and a weekly report — no typing.",
  alternates: { canonical: "https://www.getacuity.io/install" },
  openGraph: {
    type: "website",
    url: "https://www.getacuity.io/install",
    siteName: "Acuity",
    title: "Get Acuity — talk it out, see it clearly",
    description:
      "Install Acuity — the AI voice journal. Talk for a minute; get tasks, moods, patterns, and a weekly report.",
    images: [
      { url: "/og-image.png?v=3", width: 1200, height: 630, alt: "Get Acuity" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Get Acuity — talk it out, see it clearly",
    description:
      "Install Acuity — the AI voice journal. Talk for a minute; get tasks, moods, patterns, and a weekly report.",
    images: ["/og-image.png?v=3"],
  },
  robots: { index: true, follow: true },
};

function detectPlatform(ua: string): "ios" | "android" | null {
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return null;
}

export default function InstallPage({
  searchParams,
}: {
  searchParams: { src?: string };
}) {
  const ua = headers().get("user-agent") ?? "";
  const platform = detectPlatform(ua);
  const src =
    typeof searchParams?.src === "string" && searchParams.src
      ? searchParams.src
      : "direct";

  if (platform === "ios") {
    redirect(APP_VERSION_CONFIG.ios.appStoreUrl);
  }
  if (platform === "android" && PLAY_STORE_LIVE) {
    redirect(APP_VERSION_CONFIG.android.appStoreUrl);
  }

  // Desktop, bots, or Android before Play launch → the shareable page.
  return <GetAcuity src={src} />;
}
