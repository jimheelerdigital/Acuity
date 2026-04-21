import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { getAuthOptions } from "@/lib/auth";
import { inngest } from "@/inngest/client";

export async function POST() {
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

  const job = await prisma.generationJob.create({
    data: {
      status: "QUEUED",
      stepLabel: "Queued…",
      triggeredBy: me.email ?? session.user.id,
    },
  });

  await inngest.send({
    name: "content-factory/generate.requested",
    data: { jobId: job.id },
  });

  return NextResponse.json({ ok: true, jobId: job.id });
}
