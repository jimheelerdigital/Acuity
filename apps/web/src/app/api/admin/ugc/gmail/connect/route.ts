/**
 * Start the one-time Gmail connect for UGC outreach (admin only). Sends
 * Keenan to Google's consent screen for keenan@heelerdigital.com with
 * gmail.send + gmail.metadata. See lib/ugc/gmail.ts.
 */
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { buildGmailAuthUrl, signState } from "@/lib/ugc/gmail";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  return NextResponse.redirect(buildGmailAuthUrl(signState(guard.adminUserId)), 302);
}
