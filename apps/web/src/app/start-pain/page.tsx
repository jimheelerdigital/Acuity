import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { isPainSplitOn, painArmUrl, pickPainArm, PSPLIT_COOKIE } from "@/lib/pain-split";

export const dynamic = "force-dynamic";

/**
 * /start-pain — entry link for the pain-funnel split (2026-11-02). Never
 * renders: sends her to one of the four pain-first funnels (lib/pain-split.ts).
 */
export default async function StartPainPage({ searchParams }: { searchParams: { [key: string]: string | string[] | undefined } }) {
  const on = await isPainSplitOn();
  const arm = on ? pickPainArm(cookies().get(PSPLIT_COOKIE)?.value) : "relief";
  redirect(painArmUrl(arm, searchParams, on));
}
