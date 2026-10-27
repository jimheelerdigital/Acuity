import Link from "next/link";

import { publishedReleases, releaseSlug } from "@/lib/releases/published";

export const metadata = {
  title: "What's new · Ripple",
  description: "Every Ripple update: what changed and where to find it.",
  alternates: { canonical: "/whats-new" },
};

export const revalidate = 600;

/** Release notes index (2026-10-27). Lists only versions users can download. */
export default async function WhatsNewPage() {
  const releases = await publishedReleases();
  return (
    <div className="min-h-screen bg-acuity-bg text-acuity-text">
      <main className="mx-auto max-w-2xl px-6 py-16 sm:py-24">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-acuity-text-sec transition hover:text-acuity-text">
          ← Back to Ripple
        </Link>
        <h1 className="mt-8 text-4xl font-bold tracking-tight sm:text-5xl">What&rsquo;s new</h1>
        <p className="mt-4 text-base leading-relaxed text-acuity-text-sec">
          What changed in each update and where to find it. Curious what&rsquo;s next?{" "}
          <Link href="/roadmap" className="underline underline-offset-2">See the roadmap</Link>.
        </p>
        <ul className="mt-10 space-y-4">
          {releases.map((r) => (
            <li key={releaseSlug(r)}>
              <Link
                href={`/whats-new/${releaseSlug(r)}`}
                className="block rounded-2xl border border-acuity-line p-6 transition hover:bg-acuity-bg-sub"
              >
                <p className="text-xs font-semibold uppercase tracking-widest text-acuity-text-sec">
                  Version {r.version} · {r.platform === "ios" ? "iPhone & Apple Watch" : "Android"}
                </p>
                <p className="mt-2 text-xl font-bold">{r.headline}</p>
                <p className="mt-1 text-acuity-text-sec">{r.preheader}</p>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
