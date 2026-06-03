/**
 * POST /api/consent/record
 *
 * Append a row to the GDPR consent ledger (`ConsentRecord`). Used by:
 *   - mobile onboarding   → special_category_processing (Art. 9(2)(a))
 *   - mobile IAP / web checkout → distance_contract_immediate_performance
 *
 * Append-only: a withdrawal is a fresh row with granted=false. The server
 * stamps the exact wording the client says it displayed, so we can later
 * evidence what each user actually saw and agreed to.
 *
 * Auth: unified web-cookie / mobile-bearer via getAnySessionUserId.
 */

import { NextRequest, NextResponse } from "next/server";

import {
  CONSENT_PLATFORMS,
  CONSENT_TYPES,
  type ConsentPlatform,
  type ConsentType,
  writeConsentRecord,
} from "@/lib/consent";
import { getAnySessionUserId } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body = {
  consentType?: unknown;
  granted?: unknown;
  consentText?: unknown;
  wordingVersion?: unknown;
  policyVersion?: unknown;
  platform?: unknown;
  appVersion?: unknown;
  plan?: unknown;
  region?: unknown;
};

const MAX_TEXT = 4000;

export async function POST(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const consentType = body.consentType;
  if (
    typeof consentType !== "string" ||
    !CONSENT_TYPES.includes(consentType as ConsentType)
  ) {
    return NextResponse.json({ error: "InvalidConsentType" }, { status: 400 });
  }

  const platform = body.platform;
  if (
    typeof platform !== "string" ||
    !CONSENT_PLATFORMS.includes(platform as ConsentPlatform)
  ) {
    return NextResponse.json({ error: "InvalidPlatform" }, { status: 400 });
  }

  if (typeof body.granted !== "boolean") {
    return NextResponse.json({ error: "InvalidGranted" }, { status: 400 });
  }

  if (
    typeof body.consentText !== "string" ||
    body.consentText.trim().length === 0 ||
    body.consentText.length > MAX_TEXT
  ) {
    return NextResponse.json({ error: "InvalidConsentText" }, { status: 400 });
  }

  if (
    typeof body.wordingVersion !== "string" ||
    body.wordingVersion.trim().length === 0
  ) {
    return NextResponse.json(
      { error: "InvalidWordingVersion" },
      { status: 400 }
    );
  }

  const optStr = (v: unknown): string | null =>
    typeof v === "string" && v.trim().length > 0 ? v.slice(0, 200) : null;

  try {
    await writeConsentRecord({
      userId,
      consentType: consentType as ConsentType,
      granted: body.granted,
      consentText: body.consentText,
      wordingVersion: body.wordingVersion,
      platform: platform as ConsentPlatform,
      policyVersion: optStr(body.policyVersion) ?? undefined,
      appVersion: optStr(body.appVersion),
      plan: optStr(body.plan),
      region: optStr(body.region),
    });
  } catch (err) {
    console.error("[consent/record]", err);
    return NextResponse.json({ error: "WriteFailed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
