import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { APP_STORE_URL, PLAY_STORE_URL } from "@/emails/announcements/release";
import { publishedReleases, releaseSlug } from "@/lib/releases/published";

export const revalidate = 600;

/**
 * One release's notes (2026-10-27): goripple.io/whats-new/1.9.6. Same content
 * as the release email, so the email, posts and the App Store can link here.
 * 404 until the App Store serves that version (lib/releases/published.ts).
 */
async function find(slug: string) {
  return (await publishedReleases()).find((r) => releaseSlug(r) === slug);
}

export async function generateMetadata({ params }: { params: { version: string } }): Promise<Metadata> {
  const r = await find(params.version);
  if (!r) return { title: "What's new · Ripple" };
  return {
    title: `${r.headline} · Ripple`,
    description: r.preheader,
    alternates: { canonical: `/whats-new/${releaseSlug(r)}` },
    openGraph: { title: r.headline, description: r.preheader },
  };
}

export default async function ReleasePage({ params }: { params: { version: string } }) {
  const r = await find(params.version);
  if (!r) notFound();
  const storeUrl = r.platform === "ios" ? APP_STORE_URL : PLAY_STORE_URL;
  const storeLabel = r.platform === "ios" ? "Get it on the App Store" : "Get it on Google Play";

  return (
    <div className="min-h-screen bg-acuity-bg text-acuity-text">
      <main className="mx-auto max-w-2xl px-6 py-16 sm:py-24">
        <Link href="/whats-new" className="inline-flex items-center gap-1 text-sm text-acuity-text-sec transition hover:text-acuity-text">
          ← All updates
        </Link>

        <p className="mt-8 text-xs font-semibold uppercase tracking-widest text-acuity-text-sec">
          Version {r.version} · {r.platform === "ios" ? "iPhone & Apple Watch" : "Android"}
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">{r.headline}</h1>
        <p className="mt-4 text-lg leading-relaxed text-acuity-text-sec">{r.intro}</p>

        <a
          href={storeUrl}
          className="mt-8 inline-flex rounded-full bg-acuity-primary px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
        >
          {storeLabel}
        </a>

        <div className="mt-14 space-y-14">
          {r.features.map((f) => (
            <section key={f.title}>
              {f.img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.img.src} alt={f.img.alt} className="mb-6 w-full rounded-3xl" loading="lazy" />
              ) : null}
              <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                {f.title}
                {f.pro ? (
                  <span className="rounded-full bg-acuity-primary-soft px-2 py-0.5 text-[11px] font-bold tracking-wide text-acuity-primary">PRO</span>
                ) : null}
              </h2>
              {/* Trusted HTML: written by us in releases.ts (same as the email). */}
              <p className="mt-3 text-base leading-relaxed text-acuity-text-sec" dangerouslySetInnerHTML={{ __html: f.body }} />
            </section>
          ))}
        </div>

        {r.also?.length ? (
          <section className="mt-14 rounded-2xl border border-acuity-line p-6">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-acuity-text-sec">Also in this update</h2>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-acuity-text-sec">
              {r.also.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <a
          href={storeUrl}
          className="mt-14 inline-flex rounded-full bg-acuity-primary px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
        >
          {storeLabel}
        </a>
      </main>
    </div>
  );
}
