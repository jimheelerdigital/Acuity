/**
 * GET /api/admin/adlab/interests/search?q=query — proxy Meta Interest Search API
 */

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const q = req.nextUrl.searchParams.get("q");
  if (!q || q.length < 2) {
    return NextResponse.json([]);
  }

  const token = process.env.META_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "META_ACCESS_TOKEN not configured" },
      { status: 500 }
    );
  }

  const version = process.env.META_API_VERSION || "v25.0";
  const url = `https://graph.facebook.com/${version}/search?type=adinterest&q=${encodeURIComponent(q)}&access_token=${token}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text();
      console.error("[adlab] Interest search failed:", res.status, body);
      return NextResponse.json({ error: "Meta API error" }, { status: res.status });
    }

    const data = await res.json();
    const interests = (data.data || []).map((i: { id: string; name: string; audience_size_lower_bound?: number; audience_size_upper_bound?: number }) => ({
      id: i.id,
      name: i.name,
      audienceSize: i.audience_size_upper_bound || i.audience_size_lower_bound || null,
    }));

    return NextResponse.json(interests);
  } catch (err) {
    console.error("[adlab] Interest search error:", err);
    return NextResponse.json({ error: "Failed to search interests" }, { status: 500 });
  }
}
