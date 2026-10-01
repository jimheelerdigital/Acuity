import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";

import { inngest } from "@/inngest/client";
import { stripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/**
 * Legendary Mythicals Stripe webhook (2026-10-01), a BACKUP trigger: the
 * /thanks page already sends the order event once Stripe says the session
 * is paid. This catches buyers who close the tab before /thanks loads.
 * Same Inngest event id, so the two never double-deliver.
 * Needs MYTHICALS_STRIPE_WEBHOOK_SECRET (its own endpoint in Stripe,
 * event checkout.session.completed). Without it, returns 503 and does
 * nothing, so it is safe to deploy before the endpoint exists.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.MYTHICALS_STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await req.text(), sig, secret);
  } catch (err) {
    console.error("[mythicals/stripe-webhook] bad signature:", err);
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const s = event.data.object as Stripe.Checkout.Session;
    if (s.metadata?.brand === "mythicals" && s.payment_status === "paid") {
      await inngest.send({
        id: `mythicals-order-${s.id}`,
        name: "mythicals/portrait.order",
        data: { sessionId: s.id },
      });
    }
  }
  return NextResponse.json({ received: true });
}
