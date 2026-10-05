import { MYTHICALS_SOCIALS } from "@/lib/mythicals/site";

const ICONS: Record<string, React.ReactNode> = {
  instagram: (
    <path d="M12 2.2c3.2 0 3.6 0 4.8.1 1.2.1 1.8.2 2.2.4.6.2 1 .5 1.4.9.4.4.7.9.9 1.4.2.4.4 1.1.4 2.2.1 1.3.1 1.6.1 4.8s0 3.6-.1 4.8c-.1 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.9.7-1.4.9-.4.2-1.1.4-2.2.4-1.3.1-1.6.1-4.8.1s-3.6 0-4.8-.1c-1.2-.1-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.9-.9-1.4-.2-.4-.4-1.1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.8c.1-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.9-.7 1.4-.9.4-.2 1.1-.4 2.2-.4C8.4 2.2 8.8 2.2 12 2.2zm0 4.9a4.9 4.9 0 1 0 0 9.8 4.9 4.9 0 0 0 0-9.8zm0 8.1a3.2 3.2 0 1 1 0-6.4 3.2 3.2 0 0 1 0 6.4zm5.1-9.4a1.1 1.1 0 1 0 0 2.3 1.1 1.1 0 0 0 0-2.3z" />
  ),
  facebook: (
    <path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.3v7A10 10 0 0 0 22 12z" />
  ),
  youtube: (
    <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31.6 31.6 0 0 0 0 12a31.6 31.6 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31.6 31.6 0 0 0 24 12a31.6 31.6 0 0 0-.5-5.8zM9.6 15.6V8.4l6.2 3.6-6.2 3.6z" />
  ),
  tiktok: (
    <path d="M16.6 2h-3.3v13.4a2.9 2.9 0 1 1-2.9-2.9c.3 0 .6 0 .8.1V9.2a6.3 6.3 0 1 0 5.4 6.2V8.6a8 8 0 0 0 4.6 1.5V6.8A4.6 4.6 0 0 1 16.6 2z" />
  ),
};

/** Follow links for the Mythicals profiles (hidden until a url is set). */
export function SocialLinks({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {MYTHICALS_SOCIALS.filter((s) => s.url).map((s) => (
        <a
          key={s.key}
          href={s.url!}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Legendary Mythicals on ${s.label}`}
          className="flex items-center justify-center rounded-full border border-white/10 p-2 text-[var(--lm-dim)] transition hover:border-[#d9a441]/60 hover:text-[var(--lm-gold)]"
        >
          <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            {ICONS[s.key]}
          </svg>
        </a>
      ))}
    </div>
  );
}
