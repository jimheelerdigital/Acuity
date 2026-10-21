/**
 * Nav + footer in the 2026-10 homepage look, for content pages (blog,
 * voice-journaling guide, research). Server components; mirrors the nav in
 * home-v2/HomeV2.tsx and seo-landing/SeoLanding.tsx.
 */
import Image from "next/image";

import { CookieSettingsLink } from "@/components/cookie-consent";
import { LEARN_LINKS } from "@/lib/seo";

const WRAP = "mx-auto w-full max-w-[1200px] px-5 min-[900px]:px-10";
const LOGIN_URL = "https://app.goripple.io/auth/signin";

export function SiteNav() {
  return (
    <header
      className="sticky z-[60] border-b border-[#EEE7DE] bg-[rgba(251,248,244,0.9)] font-display backdrop-blur-[14px]"
      style={{ top: "var(--install-banner-h, 0px)" }}
    >
      <div className={`${WRAP} flex h-16 items-center justify-between gap-3 min-[900px]:h-[72px]`}>
        <a href="/" className="flex min-h-11 items-center gap-2.5 text-[#1B1815] no-underline">
          <Image src="/ripple-mark-coral-t.png" alt="" width={32} height={32} priority />
          <span className="text-[21px] font-extrabold tracking-[-0.02em]">Ripple</span>
        </a>
        <nav aria-label="Main" className="hidden items-center gap-8 min-[900px]:flex">
          {[
            ["How it works", "/#how"],
            ["Pricing", "/#pricing"],
            ["Guide", "/voice-journaling"],
            ["Blog", "/blog"],
          ].map(([label, href]) => (
            <a key={label} href={href} className="inline-flex min-h-11 items-center text-[15px] font-semibold text-[#3F3A35] no-underline hover:text-[#1B1815]">
              {label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2 min-[900px]:gap-[18px]">
          <a href={LOGIN_URL} className="inline-flex h-11 items-center px-1 text-[15px] font-semibold text-[#1B1815] no-underline">
            Log in
          </a>
          <a href="/start" className="inline-flex h-11 items-center whitespace-nowrap rounded-full bg-[#1B1815] px-4 text-[15px] font-bold text-white no-underline min-[400px]:px-5">
            Start free week
          </a>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-[#EEE7DE] pb-14 pt-10 font-display">
      <div className={`${WRAP} flex flex-col gap-6`}>
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="flex flex-wrap items-center gap-2.5">
            <Image src="/ripple-mark-coral-t.png" alt="" width={26} height={26} />
            <span className="text-[17px] font-extrabold text-[#1B1815]">Ripple</span>
            <span className="text-[14px] font-semibold text-[#57514B]">Your AI life optimizer.</span>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-1">
            {[
              ["Home", "/"],
              ["Blog", "/blog"],
              ["Support", "/support"],
              ["Privacy", "/privacy"],
              ["Terms", "/terms"],
            ].map(([label, href]) => (
              <a key={label} href={href} className="inline-flex min-h-11 items-center text-[14px] font-semibold text-[#57514B] no-underline hover:text-[#1B1815]">
                {label}
              </a>
            ))}
          </nav>
        </div>
        <nav aria-label="Learn" className="flex flex-wrap gap-x-6 gap-y-1 border-t border-[#EEE7DE] pt-4">
          {LEARN_LINKS.map(([label, href]) => (
            <a key={href} href={href} className="inline-flex min-h-11 items-center text-[14px] font-semibold text-[#57514B] no-underline hover:text-[#1B1815]">
              {label}
            </a>
          ))}
        </nav>
        <span className="text-[13px] text-[#57514B]">
          © 2026 Ripple · <CookieSettingsLink className="hover:text-[#1B1815]" />
        </span>
      </div>
    </footer>
  );
}

/** Layout shell for content pages: light palette, new nav and footer. */
export function ContentShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rb-light min-h-screen overflow-x-hidden font-display">
      <SiteNav />
      {children}
      <SiteFooter />
    </div>
  );
}
