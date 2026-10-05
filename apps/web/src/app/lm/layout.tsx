import type { Metadata, Viewport } from "next";
import { Cinzel, Inter } from "next/font/google";
import { headers } from "next/headers";
import Link from "next/link";

import { archetypeOgUrl } from "@/lib/mythicals/archetypes";
import { SocialLinks } from "@/components/mythicals/socials";
import { basePathFor, MYTHICALS_EMBLEM_URL, MYTHICALS_FAVICON_URL, MYTHICALS_ORIGIN } from "@/lib/mythicals/site";

/**
 * Legendary Mythicals site shell (2026-10-01). Served at
 * legendarymythicals.com via the host rewrite in next.config.js, and at
 * goripple.io/lm for testing. Overrides Ripple's root metadata; Ripple's
 * nav, trackers, install banner and crisis footer self-gate off /lm.
 */

const display = Cinzel({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-lm-display", display: "swap" });
const body = Inter({ subsets: ["latin"], variable: "--font-lm-body", display: "swap" });

const DESCRIPTION =
  "Dragons, phoenixes, krakens and the beasts of a hundred myths. Take the quiz to find the legendary creature that lives in you.";

export const metadata: Metadata = {
  metadataBase: new URL(MYTHICALS_ORIGIN),
  title: { absolute: "Legendary Mythicals | Creatures of Legend, Every Day", template: "%s | Legendary Mythicals" },
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
  icons: { icon: MYTHICALS_FAVICON_URL, apple: MYTHICALS_FAVICON_URL },
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
.lm-eyebrow{font-size:.7rem;letter-spacing:.35em;text-transform:uppercase;color:var(--lm-gold)}
.lm-rule{display:flex;align-items:center;justify-content:center;gap:.9rem;color:var(--lm-gold)}
.lm-rule:before,.lm-rule:after{content:"";height:1px;width:4rem;background:linear-gradient(90deg,transparent,rgba(217,164,65,.6))}
.lm-rule:after{transform:scaleX(-1)}
.lm-card{border:1px solid rgba(255,255,255,.08);background:linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,.01));border-radius:1rem}
.lm-glow{filter:drop-shadow(0 0 40px rgba(217,164,65,.35))}
@media (prefers-reduced-motion:reduce){.lm-rise,.lm-ember{animation:none}}
`;

const NAV = [
  { label: "Creatures", hash: "#creatures" },
  { label: "Portraits", hash: "#portrait" },
  { label: "Shop", hash: "#shop" },
];

export default function MythicalsLayout({ children }: { children: React.ReactNode }) {
  const base = basePathFor(headers().get("host"));
  const home = base || "/";
  return (
    <div className={`${display.variable} ${body.variable} lm-root flex flex-col`}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#0b0a09]/85 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href={home} className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={MYTHICALS_EMBLEM_URL} alt="" width={40} height={40} className="h-10 w-10 rounded-full" />
            <span className="font-lm-display text-[13px] leading-tight tracking-[0.25em] text-[var(--lm-gold)] sm:text-sm">
              LEGENDARY
              <br className="sm:hidden" /> <span className="sm:ml-1">MYTHICALS</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-[var(--lm-dim)] md:flex">
            {NAV.map((n) => (
              <Link key={n.hash} href={`${home}${n.hash}`} className="transition hover:text-[var(--lm-bone)]">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <SocialLinks size={15} className="hidden lg:flex" />
            <Link href={`${base}/quiz`} className="lm-btn-gold !px-4 !py-2 text-sm">
              Take the quiz
            </Link>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="mt-24 border-t border-white/[0.06] bg-black/30">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={MYTHICALS_EMBLEM_URL} alt="" width={48} height={48} className="h-12 w-12 rounded-full" loading="lazy" />
              <p className="font-lm-display tracking-[0.25em] text-[var(--lm-gold)]">LEGENDARY MYTHICALS</p>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-[var(--lm-dim)]">
              Creatures of legend, new every day. Find the one that lives in you.
            </p>
            <p className="mb-3 mt-6 text-xs uppercase tracking-[0.25em] text-[var(--lm-dim)]">Follow the legends</p>
            <SocialLinks size={18} />
          </div>
          <div className="text-sm">
            <p className="lm-eyebrow mb-4">Explore</p>
            <ul className="space-y-2.5 text-[var(--lm-dim)]">
              <li><Link href={`${base}/quiz`} className="hover:text-[var(--lm-bone)]">The quiz</Link></li>
              {NAV.map((n) => (
                <li key={n.hash}>
                  <Link href={`${home}${n.hash}`} className="hover:text-[var(--lm-bone)]">{n.label}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="text-sm">
            <p className="lm-eyebrow mb-4">The fine print</p>
            <ul className="space-y-2.5 text-[var(--lm-dim)]">
              <li><Link href={`${base}/privacy`} className="hover:text-[var(--lm-bone)]">Privacy</Link></li>
              <li><Link href={`${base}/refunds`} className="hover:text-[var(--lm-bone)]">Refunds</Link></li>
              <li><Link href={`${base}/terms`} className="hover:text-[var(--lm-bone)]">Terms of Service</Link></li>
              <li><a href="mailto:keenan@heelerdigital.com?subject=Legendary%20Mythicals%20partnership" className="hover:text-[var(--lm-bone)]">Partnerships</a></li>
              <li><a href="mailto:keenan@heelerdigital.com" className="hover:text-[var(--lm-bone)]">Contact</a></li>
            </ul>
          </div>
        </div>
        <p className="mx-auto w-full max-w-6xl px-4 pb-10 text-xs text-[var(--lm-dim)]/70 sm:px-6">
          Images are AI-generated. For entertainment. © {new Date().getFullYear()} Legendary Mythicals.
        </p>
      </footer>
    </div>
  );
}
