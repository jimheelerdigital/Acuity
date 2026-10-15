/**
 * POST /api/oauth/authorize — the consent screen's Approve / Cancel.
 *
 * Body: { ticket, decision: "approve" | "deny" } → { redirectTo }.
 * The ticket (signed on /oauth/authorize) binds the signed-in user to the
 * exact request they saw, so another site can't approve on their behalf.
 * Approve re-checks the client, redirect URI and Pro before issuing a
 * single-use authorization code.
 */

import { getServerSession } from "next-auth";
import { NextResponse, type NextRequest } from "next/server";

import { getAuthOptions } from "@/lib/auth";
import { resolveEntitlement } from "@/lib/entitlements/resolve";
import { buildClientRedirect, oauthIssuer, verifyConsentTicket } from "@/lib/mcp-oauth/core";
import { checkClientAndRedirect, createAuthCode } from "@/lib/mcp-oauth/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // Same-origin only (belt and braces on top of the ticket + SameSite cookie).
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin && origin !== oauthIssuer()) {
    return NextResponse.json({ message: "Cross-origin request refused." }, { status: 403 });
  }

  const session = await getServerSession(getAuthOptions());
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ message: "Your session ended. Reload and sign in again." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { ticket?: unknown; decision?: unknown };
  const secret = process.env.NEXTAUTH_SECRET;
  const params =
    secret && typeof body.ticket === "string" ? verifyConsentTicket(body.ticket, secret) : null;
  if (!params || params.userId !== userId) {
    return NextResponse.json({ message: "This approval expired. Reload the page and try again." }, { status: 400 });
  }

  const client = await checkClientAndRedirect(params.clientId, params.redirectUri);
  if (!client) {
    return NextResponse.json({ message: "This app isn't recognised. Add the connector again." }, { status: 400 });
  }

  const back = (extra: Record<string, string>) =>
    buildClientRedirect(params.redirectUri, { ...extra, state: params.state, iss: oauthIssuer() });

  if (body.decision !== "approve") {
    return NextResponse.json({ redirectTo: back({ error: "access_denied" }) });
  }

  const resolved = await resolveEntitlement(userId);
  if (!resolved?.entitlement.canExtractEntries) {
    return NextResponse.json({ message: "Connecting your own AI is a Ripple Pro feature." }, { status: 403 });
  }

  const { userId: _u, ...authParams } = params;
  void _u;
  const code = await createAuthCode(userId, authParams);
  return NextResponse.json({ redirectTo: back({ code }) });
}
