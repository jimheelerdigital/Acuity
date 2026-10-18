/**
 * /api/admin/rc-import-apple — backfill Apple purchases RevenueCat never saw.
 *
 * GET  → DRY RUN (default). Lists every DB-PRO Apple customer with a stored
 *        StoreKit 2 JWS, and whether RevenueCat already grants them `pro`.
 * POST → imports the JWS into RC (POST /v1/receipts, app_user_id = User.id)
 *        for exactly those RC does NOT entitle, then re-reads RC to confirm.
 *
 * Why: pre-1.9 builds buy outside the RC SDK, so RC (the Apple entitlement
 * source of truth) resolves those paying customers as FREE. Found by the
 * rc-parity gate on 2026-10-16 (2 SEV1 rc_missing_entitlement). Going
 * forward /api/iap/verify-receipt mirrors each purchase itself; this closes
 * the ones that happened before that.
 *
 * Only touches RC for users whose own verified Apple transaction we hold, under
 * their own User.id — the same thing their app would do with the RC SDK. Writes
 * nothing to our DB. Safe to re-run (RC import is idempotent).
 *
 * Auth: CRON_SECRET bearer token OR admin session (same as entitlement-drift).
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

async function authorize(req: NextRequest): Promise<Response | null> {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") === `Bearer ${cronSecret}`) return null;
  try {
    const { requireAdmin } = await import("@/lib/admin-guard");
    const guard = await requireAdmin();
    return guard.ok ? null : guard.response;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

async function run(apply: boolean) {
  const { prisma } = await import("@/lib/prisma");
  const { fetchRcEntitlementState } = await import("@/lib/revenuecat/client");
  const { importAppleTransactionToRc } = await import("@/lib/revenuecat/import-apple");

  const users = await prisma.user.findMany({
    where: {
      subscriptionStatus: "PRO",
      subscriptionSource: "apple",
      appleSignedTransactionJws: { not: null },
    },
    select: { id: true, appleSignedTransactionJws: true, appleProductId: true, appleEnvironment: true },
  });

  const rows: Array<Record<string, unknown>> = [];
  for (const u of users) {
    const before = await fetchRcEntitlementState(u.id);
    const rcPro = before !== null && before.subscriptionStatus !== "FREE";
    const row: Record<string, unknown> = {
      userId: u.id,
      product: u.appleProductId,
      environment: u.appleEnvironment,
      rcBefore: before === null ? "unreadable" : before.subscriptionStatus,
      needsImport: !rcPro && before !== null,
    };
    if (apply && row.needsImport) {
      const r = await importAppleTransactionToRc({ userId: u.id, signedTransactionJws: u.appleSignedTransactionJws });
      row.import = r.ok ? { ok: true, hasPro: r.hasPro } : { ok: false, code: r.code, detail: r.detail };
      const after = await fetchRcEntitlementState(u.id);
      row.rcAfter = after === null ? "unreadable" : after.subscriptionStatus;
    }
    rows.push(row);
  }

  return {
    ok: true,
    mode: apply ? "apply" : "dry-run",
    total: rows.length,
    needingImport: rows.filter((r) => r.needsImport).length,
    unreadable: rows.filter((r) => r.rcBefore === "unreadable").length,
    rows,
  };
}

export async function GET(req: NextRequest) {
  const denied = await authorize(req);
  if (denied) return denied;
  return NextResponse.json(await run(false));
}

export async function POST(req: NextRequest) {
  const denied = await authorize(req);
  if (denied) return denied;
  return NextResponse.json(await run(true));
}
