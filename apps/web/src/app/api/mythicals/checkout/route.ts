import { NextRequest, NextResponse } from "next/server";

import { isArchetypeSlug } from "@/lib/mythicals/archetypes";
import { basePathFor, PORTRAIT_PRICE_CENTS, shopLive } from "@/lib/mythicals/site";
import { logEvent } from "@/lib/mythicals/store";
import { stripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/**
 * Legendary Mythicals portrait checkout (2026-10-01): one-off $12 Stripe
 * Checkout on the existing Stripe account, price_data inline (no product
 * object to manage). metadata.brand=mythicals keeps it out of Ripple's
 * subscription webhook (which ignores sessions without a userId).
 * Gated by MYTHICALS_SHOP_LIVE=1.
 */
export async function POST(req: NextRequest) {
  if (!shopLive()) return NextResponse.json({ error: "The shop opens soon." }, { status: 403 });

  let body: { slug?: string; heroName?: string; element?: string; answers?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const slug = isArchetypeSlug(body.slug ?? "") ? body.slug! : null;
  const clean = (v: unknown, n: number) =>
    typeof v === "string" ? v.replace(/[^\p{L}\p{N} '\-.,]/gu, "").trim().slice(0, n) : "";
  const heroName = clean(body.heroName, 40);
  const element = clean(body.element, 40);
  if (!slug || !heroName) return NextResponse.json({ error: "Enter your hero name." }, { status: 400 });
  const answers = Array.isArray(body.answers)
    ? body.answers.slice(0, 8).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < 4).join(",")
    : "";

  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  const proto = req.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;
  const base = basePathFor(host);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: PORTRAIT_PRICE_CENTS,
            product_data: {
              name: "Legendary Creature Portrait",
              description: `A one-of-a-kind AI-generated creature portrait and lore card for ${heroName}, delivered by email.`,
            },
          },
        },
      ],
      metadata: { brand: "mythicals", slug, heroName, element, answers },
      payment_intent_data: { metadata: { brand: "mythicals", slug } },
      customer_creation: "if_required",
      success_url: `${origin}${base}/thanks?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${base}/result/${slug}`,
    });
    await logEvent("checkout_start", { slug, sessionId: session.id });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[mythicals/checkout] stripe error:", err);
    return NextResponse.json({ error: "Checkout is unavailable right now." }, { status: 502 });
  }
}
