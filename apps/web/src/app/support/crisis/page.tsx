import Link from "next/link";

export const metadata = {
  title: "Crisis resources · Acuity",
  description:
    "If you're in crisis, here are 24/7 hotlines and text lines. Acuity is a journaling tool — not a substitute for professional support.",
  robots: { index: true, follow: true },
};

/**
 * Static crisis resources page. Surfaced from:
 *   - The persistent <CrisisFooter> on every authenticated page
 *   - /account → Support & safety section
 *   - /support main page (Common questions footer)
 *   - Gentle onboarding value-prop mention
 *
 * Copy is intentionally matter-of-fact. Emergencies first (988, 911),
 * then text-based options (Crisis Text Line), then international
 * redirect (IASP findahelpline.com), then a substance-use-specific
 * line (SAMHSA). No AI-assisted content, no personalized nudging,
 * no "if you're feeling..." preambles — the user knows why they're
 * on this page.
 */
export default function CrisisResourcesPage() {
  return (
    <div className="min-h-screen bg-[#13131F] text-zinc-100">
      <main className="mx-auto max-w-2xl px-6 py-16 sm:py-24">
        <Link
          href="/support"
          className="inline-flex items-center gap-1 text-sm text-[#A0A0B8] transition hover:text-white"
        >
          ← Support
        </Link>

        <h1 className="mt-8 text-4xl font-bold tracking-tight sm:text-5xl">
          Crisis resources
        </h1>

        <p className="mt-6 text-base leading-relaxed text-[#A0A0B8]">
          Acuity is a journaling tool. It&rsquo;s not a substitute for professional
          mental-health care, and it&rsquo;s not an appropriate first stop if
          you&rsquo;re in crisis. If you or someone you know is in immediate danger,
          please use the resources below.
        </p>

        <section className="mt-10 space-y-6">
          <Resource
            title="988 Suicide &amp; Crisis Lifeline"
            region="United States"
            lines={[
              { label: "Call", value: "988", href: "tel:988" },
              { label: "Text", value: "988", href: "sms:988" },
              {
                label: "Chat",
                value: "988lifeline.org",
                href: "https://988lifeline.org/chat/",
              },
            ]}
            note="Free, confidential, 24/7. Trained counselors for emotional distress or suicidal thoughts. Press 1 for the Veterans Crisis Line."
          />

          <Resource
            title="Crisis Text Line"
            region="US, UK, Canada, Ireland"
            lines={[
              { label: "Text", value: "HOME to 741741", href: "sms:741741?body=HOME" },
            ]}
            note="Text-based crisis support with trained volunteer counselors. Free and confidential."
          />

          <Resource
            title="International Association for Suicide Prevention"
            region="Worldwide"
            lines={[
              {
                label: "Directory",
                value: "findahelpline.com",
                href: "https://findahelpline.com/",
              },
            ]}
            note="Country-by-country directory of crisis helplines maintained by IASP + Throughline. Start here if you're outside the US/UK/Canada/Ireland."
          />

          <Resource
            title="SAMHSA's National Helpline"
            region="United States — substance use"
            lines={[
              {
                label: "Call",
                value: "1-800-662-HELP (4357)",
                href: "tel:18006624357",
              },
            ]}
            note="Free, confidential, 24/7 treatment referral and information for individuals and families facing mental or substance-use disorders."
          />
        </section>

        <section className="mt-12 rounded-lg border border-amber-500/20 bg-amber-500/5 p-5 text-sm leading-relaxed text-amber-100/90">
          <p className="font-semibold text-amber-100">
            If there&rsquo;s an immediate risk of harm, call your local emergency
            number (911 in the US, 999 in the UK, 112 across the EU).
          </p>
          <p className="mt-2 text-amber-100/70">
            A hotline counselor can stay on the line with you while emergency
            services respond.
          </p>
        </section>

        <section className="mt-12 border-t border-white/10 pt-8 text-sm text-[#A0A0B8]">
          <p>
            Acuity doesn&rsquo;t detect crisis signals in your entries and doesn&rsquo;t
            alert anyone based on what you write. The content you save here stays
            private — see our{" "}
            <Link
              href="/privacy"
              className="text-[#A78BFA] hover:underline"
            >
              privacy policy
            </Link>{" "}
            for the full retention + sub-processor detail. If you want to stop
            using Acuity, you can{" "}
            <Link
              href="/account"
              className="text-[#A78BFA] hover:underline"
            >
              delete your account
            </Link>{" "}
            at any time.
          </p>
        </section>
      </main>
    </div>
  );
}

type ResourceProps = {
  title: string;
  region: string;
  lines: Array<{ label: string; value: string; href: string }>;
  note: string;
};

function Resource({ title, region, lines, note }: ResourceProps) {
  return (
    <article className="rounded-lg border border-white/10 bg-white/5 p-5">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <p className="text-xs uppercase tracking-wider text-[#A0A0B8]">{region}</p>
      <ul className="mt-3 space-y-1 text-sm">
        {lines.map((l) => (
          <li key={l.label} className="flex flex-wrap items-baseline gap-2">
            <span className="text-xs uppercase tracking-wider text-[#A0A0B8]">
              {l.label}
            </span>
            <a
              href={l.href}
              target={l.href.startsWith("http") ? "_blank" : undefined}
              rel={l.href.startsWith("http") ? "noopener noreferrer" : undefined}
              className="font-medium text-[#A78BFA] hover:underline"
            >
              {l.value}
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm leading-relaxed text-[#A0A0B8]">{note}</p>
    </article>
  );
}
