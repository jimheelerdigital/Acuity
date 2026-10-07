/** Google redirects here after the UGC Gmail consent. Stores the token, back to /admin/ugc. */
import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { completeGmailConnect, verifyState } from "@/lib/ugc/gmail";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const back = new URL("/admin/ugc", req.nextUrl.origin);
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state") ?? "";
  if (!code || !verifyState(state, guard.adminUserId)) {
    back.searchParams.set("gmail", "error: bad or expired state — try Connect Gmail again");
    return NextResponse.redirect(back, 302);
  }
  try {
    const email = await completeGmailConnect(code);
    back.searchParams.set("gmail", `connected ${email}`);
  } catch (err) {
    back.searchParams.set("gmail", `error: ${err instanceof Error ? err.message : String(err)}`);
  }
  return NextResponse.redirect(back, 302);
}
