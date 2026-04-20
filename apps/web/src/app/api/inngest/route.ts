import { serve } from "inngest/next";
import { NextRequest, NextResponse } from "next/server";

import { inngest } from "@/inngest/client";
import { helloWorldFn } from "@/inngest/functions/hello-world";
import { processEntryFn } from "@/inngest/functions/process-entry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Upper bound for any single Inngest step invocation. On Hobby the effective
// ceiling is 10s; on Pro it's 60s. See INNGEST_MIGRATION_PLAN.md §12.
export const maxDuration = 60;

const handler = serve({
  client: inngest,
  functions: [helloWorldFn, processEntryFn],
});

function flagOff() {
  return NextResponse.json(
    { error: "Inngest pipeline not enabled (ENABLE_INNGEST_PIPELINE != '1')" },
    { status: 503 }
  );
}

function isEnabled() {
  return process.env.ENABLE_INNGEST_PIPELINE === "1";
}

export async function GET(req: NextRequest, ctx: unknown) {
  if (!isEnabled()) return flagOff();
  return handler.GET(req, ctx);
}

export async function POST(req: NextRequest, ctx: unknown) {
  if (!isEnabled()) return flagOff();
  return handler.POST(req, ctx);
}

export async function PUT(req: NextRequest, ctx: unknown) {
  if (!isEnabled()) return flagOff();
  return handler.PUT(req, ctx);
}
