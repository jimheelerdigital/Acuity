/**
 * GET/POST /api/admin/app-onboarding — read and save the app onboarding
 * config (variants + overrides) edited at /admin/app-onboarding. The body is
 * sanitized by the shared rules (packages/shared/src/app-onboarding.ts), so
 * only recognized fields are ever stored.
 */
import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { readOnboardingConfig } = await import("@/lib/remote-onboarding");
  return NextResponse.json(await readOnboardingConfig());
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const { saveOnboardingConfig } = await import("@/lib/remote-onboarding");
  const config = await saveOnboardingConfig(body, guard.adminUserId);
  return NextResponse.json({ ok: true, config });
}
