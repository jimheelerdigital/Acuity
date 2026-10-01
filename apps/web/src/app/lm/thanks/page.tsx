import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";

import { inngest } from "@/inngest/client";
import { basePathFor } from "@/lib/mythicals/site";
import { stripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your portrait is being forged", robots: { index: false } };

/**
 * Stripe success page. Verifies the session server-side and, if paid,
 * sends the order event (id mythicals-order-<sid>, deduped by Inngest).
 * This is the primary fulfilment trigger, so the shop works without a
 * webhook endpoint; api/mythicals/stripe-webhook is the backup.
 */
async function confirm(sessionId: string): Promise<{ paid: boolean; email: string | null }> {
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return { paid: false, email: null };
  try {
    const s = await stripe.checkout.sessions.retrieve(sessionId);
    if (s.metadata?.brand !== "mythicals" || s.payment_status !== "paid") return { paid: false, email: null };
    await inngest.send({ id: `mythicals-order-${s.id}`, name: "mythicals/portrait.order", data: { sessionId: s.id } });
    return { paid: true, email: s.customer_details?.email ?? null };
  } catch (err) {
    console.error("[mythicals/thanks] confirm failed:", err);
    return { paid: false, email: null };
  }
}

export default async function ThanksPage({ searchParams }: { searchParams: { session_id?: string } }) {
  const base = basePathFor(headers().get("host"));
  const { paid, email } = await confirm(searchParams.session_id ?? "");
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 text-center">
      <div className="lm-ember mb-8 h-16 w-16 rounded-full" />
      {paid ? (
        <>
          <h1 className="font-lm-display text-3xl text-[var(--lm-bone)]">Your legend is being forged</h1>
          <p className="mt-4 leading-relaxed text-[var(--lm-dim)]">
            Your portrait and lore card will arrive at {email ? <span className="text-[var(--lm-bone)]">{email}</span> : "your inbox"} within about 10 minutes.
            Check spam if you do not see it. Problems? Email keenan@heelerdigital.com.
          </p>
        </>
      ) : (
        <>
          <h1 className="font-lm-display text-3xl text-[var(--lm-bone)]">We could not confirm that payment</h1>
          <p className="mt-4 leading-relaxed text-[var(--lm-dim)]">
            If you were charged, email keenan@heelerdigital.com and we will sort it out.
          </p>
        </>
      )}
      <Link href={base || "/"} className="lm-btn-ghost mt-8">Back to Legendary Mythicals</Link>
    </div>
  );
}
