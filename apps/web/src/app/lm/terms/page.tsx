import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of Service", alternates: { canonical: "/terms" } };

/** Terms of Service (2026-10-05): required for the YouTube API Services audit. */
export default function TermsPage() {
  return (
    <article className="mx-auto max-w-2xl px-4 py-8 leading-relaxed text-[var(--lm-dim)] sm:px-6 [&_h2]:mt-8 [&_h2]:font-lm-display [&_h2]:text-lg [&_h2]:text-[var(--lm-bone)] [&_p]:mt-3">
      <h1 className="font-lm-display text-3xl text-[var(--lm-bone)]">Terms of Service</h1>
      <p>Last updated October 5, 2026. Legendary Mythicals (legendarymythicals.com) is run by Heeler Digital. Contact: keenan@heelerdigital.com.</p>
      <h2>Using this site</h2>
      <p>Legendary Mythicals publishes original fantasy entertainment: videos, images and a creature quiz. Everything here is for entertainment. You may view and share our content for personal, non-commercial use; you may not resell or republish it as your own.</p>
      <h2>Our content</h2>
      <p>Our videos, images, names and lore are created by us, with the help of AI tools, and remain our property. Images and videos are AI-generated and are not real places, creatures or people.</p>
      <h2>Purchases</h2>
      <p>Paid items, such as a Legendary Creature Portrait, are one-time purchases handled by Stripe. See our <a href="/refunds" className="underline hover:text-[var(--lm-bone)]">refund policy</a>.</p>
      <h2>YouTube</h2>
      <p>We publish our videos on YouTube using YouTube API Services. By watching or interacting with our videos on YouTube, you agree to be bound by the <a href="https://www.youtube.com/t/terms" className="underline hover:text-[var(--lm-bone)]">YouTube Terms of Service</a>. Google&apos;s handling of your data on YouTube is described in the <a href="https://policies.google.com/privacy" className="underline hover:text-[var(--lm-bone)]">Google Privacy Policy</a>, and ours in our <a href="/privacy" className="underline hover:text-[var(--lm-bone)]">Privacy Policy</a>.</p>
      <h2>Changes</h2>
      <p>We may update these terms; the date above shows the latest version. Questions: keenan@heelerdigital.com.</p>
    </article>
  );
}
