import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy", alternates: { canonical: "/privacy" } };

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-2xl px-4 py-8 leading-relaxed text-[var(--lm-dim)] sm:px-6 [&_h2]:mt-8 [&_h2]:font-lm-display [&_h2]:text-lg [&_h2]:text-[var(--lm-bone)] [&_p]:mt-3">
      <h1 className="font-lm-display text-3xl text-[var(--lm-bone)]">Privacy</h1>
      <p>Last updated October 1, 2026. Legendary Mythicals is run by Heeler Digital. Contact: keenan@heelerdigital.com.</p>
      <h2>What we collect</h2>
      <p>Quiz answers and results, pages viewed, and the country and device type your browser reports, stored without your name or IP address. If you give us your email, we store it with your creature result. If you buy a portrait, we store your email, the hero name and element you enter, and the order details.</p>
      <h2>What we use it for</h2>
      <p>To show your result, send the profile and wallpaper you asked for, deliver portraits you buy, and understand which parts of the site work. We do not sell your data. We do not use advertising or analytics trackers on this site.</p>
      <h2>Who processes it</h2>
      <p>Payments are handled by Stripe; we never see your card number. Email is sent by Resend. Data is stored with Supabase and the site is hosted on Vercel. Portraits and lore are made with OpenAI and Anthropic AI models using only your hero name, element and quiz result.</p>
      <h2>Your choices</h2>
      <p>Every email has an unsubscribe link. To see or delete what we hold about you, email keenan@heelerdigital.com and we will do it within 30 days.</p>
    </article>
  );
}
