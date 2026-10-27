import { NextRequest, NextResponse } from "next/server";

import { welcomeEmail } from "@/lib/mythicals/emails";
import { isQuizKind, quizResult, type QuizKind } from "@/lib/mythicals/quizzes";
import { PRODUCT_KEYS } from "@/lib/mythicals/products";
import { addProductWaitlist, addSubscriber, logEvent } from "@/lib/mythicals/store";
import { sendEmailOrThrow } from "@/lib/resend";

export const dynamic = "force-dynamic";

/**
 * Legendary Mythicals email capture (2026-10-01): stores the subscriber in
 * mythicals-site/subscribers.jsonl and sends the creature-profile email
 * with the HD wallpaper link. Repeat signups get the email again but are
 * not duplicated. Since 2026-10-27: any quiz (beast/armor/weapon), and the
 * result page's product waitlist step (source "product_waitlist" + products).
 */
export async function POST(req: NextRequest) {
  let body: { email?: string; slug?: string; quiz?: string; source?: string; products?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const email = (body.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 200) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  }
  const quiz: QuizKind = body.quiz && isQuizKind(body.quiz) ? body.quiz : "beast";
  const slug = body.slug && quizResult(quiz, body.slug) ? body.slug : null;
  const source = typeof body.source === "string" ? body.source.slice(0, 30) : "result";
  const products = Array.isArray(body.products)
    ? [...new Set(body.products.map(String).filter((p) => PRODUCT_KEYS.includes(p)))]
    : [];
  // List-only signups (shop waitlist on the homepage) carry no creature
  // and get no profile email; everything else needs a valid creature.
  const listOnly = source.startsWith("list_");
  if (!slug && !listOnly) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  try {
    const { isNew } = await addSubscriber({
      email,
      slug: slug ?? "",
      at: new Date().toISOString(),
      source,
      quiz,
      ...(products.length ? { products } : {}),
    });
    if (source === "product_waitlist" && slug) {
      await addProductWaitlist({ email, quiz, slug, products });
      await logEvent("signup", { quiz, slug, source, products, isNew });
    } else if (isNew) {
      await logEvent("signup", { quiz, slug, source });
    }
  } catch (err) {
    console.error("[mythicals/subscribe] store failed:", err);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }

  if (!slug) return NextResponse.json({ ok: true });
  try {
    await sendEmailOrThrow(welcomeEmail(email, quiz, slug, { waitlist: source === "product_waitlist" }));
  } catch (err) {
    // Stored already; the email is the nice-to-have.
    console.error("[mythicals/subscribe] email failed:", err);
  }
  return NextResponse.json({ ok: true });
}
