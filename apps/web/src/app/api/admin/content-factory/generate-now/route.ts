import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { getAuthOptions } from "@/lib/auth";
import { inngest } from "@/inngest/client";

export async function POST(req: NextRequest) {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true, email: true },
  });
  if (!me?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Accept optional types array: ["X_POST", "INSTAGRAM", "TIKTOK_SCRIPT"]
  // Default: generate all three
  let types = ["X_POST", "INSTAGRAM", "TIKTOK_SCRIPT"];
  try {
    const body = await req.json();
    if (Array.isArray(body.types) && body.types.length > 0) {
      types = body.types;
    }
  } catch {
    // No body or invalid JSON — use defaults
  }

  const totalSteps = types.length + 1;

  const job = await prisma.generationJob.create({
    data: {
      status: "QUEUED",
      totalSteps,
      stepLabel: "Queued…",
      triggeredBy: me.email ?? session.user.id,
    },
  });

  await inngest.send({
    name: "content-factory/generate.requested",
    data: { jobId: job.id, types },
  });

  return NextResponse.json({ ok: true, jobId: job.id });
}
