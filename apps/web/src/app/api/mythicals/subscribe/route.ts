import { NextRequest, NextResponse } from "next/server";

import { isArchetypeSlug } from "@/lib/mythicals/archetypes";
import { welcomeEmail } from "@/lib/mythicals/emails";
import { addSubscriber, logEvent } from "@/lib/mythicals/store";
import { sendEmailOrThrow } from "@/lib/resend";

export const dynamic = "force-dynamic";

/**
 * Legendary Mythicals email capture (2026-10-01): stores the subscriber in
 * mythicals-site/subscribers.jsonl and sends the creature-profile email
 * with the HD wallpaper link. Repeat signups get the email again but are
 * not duplicated.
 */
export async function POST(req: NextRequest) {
  let body: { email?: string; slug?: string; source?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const email = (body.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 200) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  }
  const slug = body.slug && isArchetypeSlug(body.slug) ? body.slug : null;
  const source = typeof body.source === "string" ? body.source.slice(0, 30) : "result";
  // List-only signups (shop waitlist on the homepage) carry no creature
  // and get no profile email; everything else needs a valid creature.
  const listOnly = source.startsWith("list_");
  if (!slug && !listOnly) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  try {
    const { isNew } = await addSubscriber({ email, slug: slug ?? "", at: new Date().toISOString(), source });
    if (isNew) await logEvent("signup", { slug, source });
  } catch (err) {
    console.error("[mythicals/subscribe] store failed:", err);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }

  if (!slug) return NextResponse.json({ ok: true });
  try {
    await sendEmailOrThrow(welcomeEmail(email, slug));
  } catch (err) {
    // Stored already; the email is the nice-to-have.
    console.error("[mythicals/subscribe] email failed:", err);
  }
  return NextResponse.json({ ok: true });
}
