import type { Metadata, Viewport } from "next";
import { Cinzel, Inter } from "next/font/google";
import { headers } from "next/headers";
import Link from "next/link";

import { archetypeOgUrl } from "@/lib/mythicals/archetypes";
import { basePathFor, MYTHICALS_ORIGIN } from "@/lib/mythicals/site";

/**
 * Legendary Mythicals site shell (2026-10-01). Served at
 * legendarymythicals.com via the host rewrite in next.config.js, and at
 * goripple.io/lm for testing. Overrides Ripple's root metadata; Ripple's
 * nav, trackers, install banner and crisis footer self-gate off /lm.
 */

const display = Cinzel({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-lm-display", display: "swap" });
const body = Inter({ subsets: ["latin"], variable: "--font-lm-body", display: "swap" });

const DESCRIPTION =
  "Eight questions. Twelve legendary creatures. Find the one that lives in you: its strengths, its weakness and its lore.";

export const metadata: Metadata = {
  metadataBase: new URL(MYTHICALS_ORIGIN),
  title: { absolute: "Which Legendary Creature Are You? | Legendary Mythicals", template: "%s | Legendary Mythicals" },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Legendary Mythicals",
    url: MYTHICALS_ORIGIN,
    title: "Which Legendary Creature Are You?",
    description: DESCRIPTION,
    images: [{ url: archetypeOgUrl("storm-dragon"), width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Which Legendary Creature Are You?",
    description: DESCRIPTION,
    images: [archetypeOgUrl("storm-dragon")],
  },
  robots: { index: true, follow: true },
  other: { "theme-color": "#0b0a09" },
};

export const viewport: Viewport = { themeColor: "#0b0a09" };

const CSS = `
body{background:#0b0a09}
.lm-root{--lm-bg:#0b0a09;--lm-bone:#ede6d6;--lm-dim:#a79f8e;--lm-gold:#d9a441;--lm-ember:#c4502a;background:var(--lm-bg);color:var(--lm-bone);font-family:var(--font-lm-body),system-ui,sans-serif;min-height:100vh;min-height:100dvh}
.font-lm-display{font-family:var(--font-lm-display),Georgia,serif;letter-spacing:.02em}
.lm-btn-gold{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;border-radius:.5rem;padding:.9rem 1.4rem;font-weight:600;color:#0b0a09;background:linear-gradient(180deg,#e7b75a,#c98f2e);box-shadow:0 0 0 1px rgba(255,220,150,.25) inset,0 10px 30px -10px rgba(217,164,65,.6);transition:transform .15s,filter .15s}
.lm-btn-gold:hover{filter:brightness(1.08)}.lm-btn-gold:active{transform:scale(.98)}
.lm-btn-ghost{display:inline-flex;align-items:center;justify-content:center;border-radius:.5rem;padding:.9rem 1.4rem;font-weight:600;color:var(--lm-bone);border:1px solid rgba(255,255,255,.18);transition:border-color .15s}
.lm-btn-ghost:hover{border-color:rgba(217,164,65,.7)}
.lm-rise{animation:lmRise .5s cubic-bezier(.2,.7,.2,1) both}
@keyframes lmRise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.lm-ember{background:radial-gradient(circle,#f3c46b 0,#c4502a 45%,transparent 70%);animation:lmPulse 1.4s ease-in-out infinite}
@keyframes lmPulse{0%,100%{transform:scale(.8);opacity:.6}50%{transform:scale(1.15);opacity:1}}
@media (prefers-reduced-motion:reduce){.lm-rise,.lm-ember{animation:none}}
`;

export default function MythicalsLayout({ children }: { children: React.ReactNode }) {
  const base = basePathFor(headers().get("host"));
  return (
    <div className={`${display.variable} ${body.variable} lm-root flex flex-col`}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href={base || "/"} className="font-lm-display text-sm tracking-[0.3em] text-[var(--lm-gold)]">
          LEGENDARY MYTHICALS
        </Link>
        <a
          href="https://instagram.com/legendarymythicals"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs tracking-wider text-[var(--lm-dim)] hover:text-[var(--lm-bone)]"
        >
          @legendarymythicals
        </a>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="mx-auto w-full max-w-5xl px-4 pb-10 pt-16 text-xs leading-relaxed text-[var(--lm-dim)] sm:px-6">
        <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-white/10 pt-6">
          <Link href={`${base}/privacy`} className="hover:text-[var(--lm-bone)]">Privacy</Link>
          <Link href={`${base}/refunds`} className="hover:text-[var(--lm-bone)]">Refunds</Link>
          <a href="mailto:keenan@heelerdigital.com" className="hover:text-[var(--lm-bone)]">keenan@heelerdigital.com</a>
        </div>
        <p className="mt-3">Images are AI-generated. For entertainment. © {new Date().getFullYear()} Legendary Mythicals.</p>
      </footer>
    </div>
  );
}
