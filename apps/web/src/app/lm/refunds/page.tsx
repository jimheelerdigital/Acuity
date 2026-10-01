import type { Metadata } from "next";

export const metadata: Metadata = { title: "Refunds", alternates: { canonical: "/refunds" } };

export default function RefundsPage() {
  return (
    <article className="mx-auto max-w-2xl px-4 py-8 leading-relaxed text-[var(--lm-dim)] sm:px-6 [&_h2]:mt-8 [&_h2]:font-lm-display [&_h2]:text-lg [&_h2]:text-[var(--lm-bone)] [&_p]:mt-3">
      <h1 className="font-lm-display text-3xl text-[var(--lm-bone)]">Refunds</h1>
      <p>The Legendary Creature Portrait is a one-time $12 purchase. No subscription.</p>
      <h2>If delivery fails</h2>
      <p>If your portrait has not arrived within 24 hours, email keenan@heelerdigital.com. We will deliver it or refund you in full.</p>
      <h2>If you are unhappy</h2>
      <p>Not happy with your portrait? Email us within 7 days of purchase and we will refund you in full. No questions asked.</p>
      <h2>How refunds work</h2>
      <p>Refunds go back to the card you paid with through Stripe, usually within 5 to 10 business days.</p>
      <p>Images are AI-generated, so every portrait is unique and may not match exactly what you imagined.</p>
    </article>
  );
}
