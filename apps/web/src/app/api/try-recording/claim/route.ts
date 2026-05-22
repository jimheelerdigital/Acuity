/**
 * POST /api/try-recording/claim
 *
 * Called after signup to convert a TrySession into a real Entry + Tasks + Goals
 * on the new user's account. Reads the session token from the acuity_try_session
 * cookie or from the request body.
 *
 * Returns the created Entry ID so the post-signup flow can skip the recording step.
 */

import { NextRequest, NextResponse } from "next/server";
import type { ExtractionResult } from "@acuity/shared";

import { getAnySessionUserId } from "@/lib/mobile-auth";
import { extensionForMimeType, normalizeAudioMimeType } from "@/lib/audio";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TRY_STORAGE_BUCKET = "voice-entries-try";
const ENTRY_STORAGE_BUCKET = "voice-entries";

export async function POST(req: NextRequest) {
  // ── 1. Auth required ───────────────────────────────────────────────
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── 2. Get session token from cookie or body ───────────────────────
  let sessionToken = req.cookies.get("acuity_try_session")?.value ?? null;
  if (!sessionToken) {
    try {
      const body = await req.json();
      sessionToken = body.sessionToken ?? null;
    } catch {
      // No body, that's fine
    }
  }

  if (!sessionToken) {
    return NextResponse.json(
      { error: "No try session found" },
      { status: 404 }
    );
  }

  // ── 3. Look up TrySession ──────────────────────────────────────────
  const { prisma } = await import("@/lib/prisma");
  const trySession = await prisma.trySession.findUnique({
    where: { sessionToken },
  });

  if (!trySession) {
    return NextResponse.json(
      { error: "Try session not found or expired" },
      { status: 404 }
    );
  }

  if (trySession.claimed) {
    return NextResponse.json(
      { error: "Try session already claimed" },
      { status: 409 }
    );
  }

  if (trySession.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "Try session expired" },
      { status: 410 }
    );
  }

  // ── 4. Move audio from try bucket to user's folder ─────────────────
  const { supabase } = await import("@/lib/supabase.server");

  // Download from try bucket
  const { data: audioData, error: downloadError } = await supabase.storage
    .from(TRY_STORAGE_BUCKET)
    .download(trySession.audioPath);

  let userAudioPath: string | null = null;

  if (!downloadError && audioData) {
    // Determine the MIME type from the extension
    const ext = trySession.audioPath.split(".").pop() ?? "webm";
    const mimeMap: Record<string, string> = {
      webm: "audio/webm",
      m4a: "audio/mp4",
      mp4: "audio/mp4",
      ogg: "audio/ogg",
      mp3: "audio/mpeg",
      wav: "audio/wav",
    };
    const mimeType = mimeMap[ext] ?? "audio/webm";

    // Upload to the user's folder in the main bucket
    // Create a placeholder entry ID first
    const entry = await prisma.entry.create({
      data: {
        userId,
        status: "COMPLETE",
        transcript: trySession.transcript,
        summary: (trySession.extractionData as Record<string, unknown>).summary as string ?? null,
        mood: (trySession.extractionData as Record<string, unknown>).mood as string ?? null,
        moodScore: (trySession.extractionData as Record<string, unknown>).moodScore as number ?? null,
        energy: (trySession.extractionData as Record<string, unknown>).energy as number ?? null,
        themes: ((trySession.extractionData as Record<string, unknown>).themes as string[]) ?? [],
        wins: ((trySession.extractionData as Record<string, unknown>).wins as string[]) ?? [],
        blockers: ((trySession.extractionData as Record<string, unknown>).blockers as string[]) ?? [],
        rawAnalysis: trySession.extractionData as object,
        extracted: true,
        extractionCommittedAt: new Date(),
      },
    });

    userAudioPath = `${userId}/${entry.id}.${ext}`;
    const audioBuffer = Buffer.from(await audioData.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from(ENTRY_STORAGE_BUCKET)
      .upload(userAudioPath, audioBuffer, { contentType: mimeType, upsert: false });

    if (uploadError) {
      console.error("[try-claim] Audio move failed:", uploadError);
      // Non-fatal — entry still gets created, just without audio
    } else {
      await prisma.entry.update({
        where: { id: entry.id },
        data: { audioPath: userAudioPath },
      });
    }

    // ── 5. Create Task + Goal records from extraction ──────────────
    const extraction = trySession.extractionData as unknown as ExtractionResult;

    if (extraction.tasks?.length > 0) {
      await prisma.task.createMany({
        data: extraction.tasks.map((t) => ({
          userId,
          entryId: entry.id,
          title: t.title,
          text: t.title,
          description: t.description ?? null,
          priority: t.priority ?? "MEDIUM",
          dueDate: t.dueDate ? new Date(t.dueDate) : null,
          status: "OPEN",
        })),
      });
    }

    if (extraction.goals?.length > 0) {
      for (const g of extraction.goals) {
        // Check for existing goal with same title to prevent duplicates
        const existing = await prisma.goal.findFirst({
          where: { userId, title: g.title },
        });
        if (!existing) {
          await prisma.goal.create({
            data: {
              userId,
              title: g.title,
              description: g.description ?? null,
              targetDate: g.targetDate ? new Date(g.targetDate) : null,
              status: "NOT_STARTED",
            },
          });
        }
      }
    }

    // ── 6. Update recording stats on the user ────────────────────────
    await prisma.user.update({
      where: { id: userId },
      data: {
        totalRecordings: { increment: 1 },
        firstRecordingAt: new Date(),
        lastRecordingAt: new Date(),
      },
    });

    // ── 7. Mark TrySession as claimed ────────────────────────────────
    await prisma.trySession.update({
      where: { id: trySession.id },
      data: {
        claimed: true,
        claimedByUserId: userId,
      },
    });

    // ── 8. Clean up try audio ────────────────────────────────────────
    await supabase.storage.from(TRY_STORAGE_BUCKET).remove([trySession.audioPath]);

    // ── 9. Clear the cookie ──────────────────────────────────────────
    const response = NextResponse.json(
      { ok: true, entryId: entry.id },
      { status: 200 }
    );
    response.cookies.set("acuity_try_session", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });

    return response;
  }

  // Audio download failed — still claim the session, just skip audio
  console.error("[try-claim] Audio download failed:", downloadError);

  const extraction = trySession.extractionData as unknown as ExtractionResult;

  const entry = await prisma.entry.create({
    data: {
      userId,
      status: "COMPLETE",
      transcript: trySession.transcript,
      summary: extraction.summary ?? null,
      mood: extraction.mood ?? null,
      moodScore: extraction.moodScore ?? null,
      energy: extraction.energy ?? null,
      themes: extraction.themes ?? [],
      wins: extraction.wins ?? [],
      blockers: extraction.blockers ?? [],
      rawAnalysis: trySession.extractionData as object,
      extracted: true,
      extractionCommittedAt: new Date(),
    },
  });

  if (extraction.tasks?.length > 0) {
    await prisma.task.createMany({
      data: extraction.tasks.map((t) => ({
        userId,
        entryId: entry.id,
        title: t.title,
        text: t.title,
        description: t.description ?? null,
        priority: t.priority ?? "MEDIUM",
        dueDate: t.dueDate ? new Date(t.dueDate) : null,
        status: "OPEN",
      })),
    });
  }

  if (extraction.goals?.length > 0) {
    for (const g of extraction.goals) {
      const existing = await prisma.goal.findFirst({
        where: { userId, title: g.title },
      });
      if (!existing) {
        await prisma.goal.create({
          data: {
            userId,
            title: g.title,
            description: g.description ?? null,
            targetDate: g.targetDate ? new Date(g.targetDate) : null,
            status: "NOT_STARTED",
          },
        });
      }
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      totalRecordings: { increment: 1 },
      firstRecordingAt: new Date(),
      lastRecordingAt: new Date(),
    },
  });

  await prisma.trySession.update({
    where: { id: trySession.id },
    data: { claimed: true, claimedByUserId: userId },
  });

  const response = NextResponse.json(
    { ok: true, entryId: entry.id },
    { status: 200 }
  );
  response.cookies.set("acuity_try_session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });

  return response;
}
