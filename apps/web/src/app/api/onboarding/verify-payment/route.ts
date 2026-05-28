/**
 * GET /api/onboarding/verify-payment?session_id=cs_xxx
 *
 * Server-side verification that a Stripe Checkout Session actually
 * completed. Called by the web funnel before firing
 * funnel_payment_completed — prevents false "paid" events from
 * users who got redirected to the success URL but never finished
 * checkout (card declined, closed tab, browser back, etc).
 *
 * No auth required — the session_id itself is the secret. Stripe
 * Checkout Session IDs are unguessable (cs_test_xxx / cs_live_xxx).
 */

import { NextRequest, NextResponse } from "next/server";

import { stripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id");

  if (!sessionId || !sessionId.startsWith("cs_")) {
    return NextResponse.json(
      { paid: false, error: "Missing or invalid session_id" },
      { status: 400 }
    );
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    const paid =
      session.payment_status === "paid" ||
      session.status === "complete";

    return NextResponse.json({ paid });
  } catch (err) {
    console.error("[verify-payment] Stripe retrieve failed:", err);
    return NextResponse.json(
      { paid: false, error: "Could not verify payment" },
      { status: 500 }
    );
  }
}
