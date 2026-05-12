/**
 * POST /api/admin/adlab/settings/test-meta — test Meta API connection
 */

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const token = process.env.META_ACCESS_TOKEN;
  const accountId = process.env.META_AD_ACCOUNT_ID;

  if (!token) {
    return NextResponse.json({ ok: false, error: "META_ACCESS_TOKEN not set" });
  }
  if (!accountId) {
    return NextResponse.json({ ok: false, error: "META_AD_ACCOUNT_ID not set" });
  }

  const version = process.env.META_API_VERSION || "v25.0";
  const actId = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
  const url = `https://graph.facebook.com/${version}/${actId}?fields=name,account_status,currency,timezone_name&access_token=${token}`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (data.error) {
      return NextResponse.json({
        ok: false,
        error: data.error.message || "Meta API error",
        code: data.error.code,
      });
    }

    return NextResponse.json({
      ok: true,
      account: {
        name: data.name,
        status: data.account_status === 1 ? "Active" : `Status ${data.account_status}`,
        currency: data.currency,
        timezone: data.timezone_name,
      },
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : "Connection failed",
    });
  }
}
