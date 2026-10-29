/**
 * GET /api/video-inbox/lesson?id=…&action=approve|reject&sig=…
 *
 * The "Use it" / "Skip it" buttons in the weekly video-playbook email
 * (lib/video-inbox/playbook.ts). Signed per lesson and action, so the link
 * is the auth. Answers with a small page; tapping again is harmless.
 */
import { NextRequest, NextResponse } from "next/server";

import { escapeHtml } from "@/lib/escape-html";

export const dynamic = "force-dynamic";

function page(title: string, body: string, status = 200) {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
    <body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:480px;margin:60px auto;padding:0 20px;color:#1a1a1a;line-height:1.5">
    <h2 style="color:#C4451C">${escapeHtml(title)}</h2><p>${body}</p></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const action = req.nextUrl.searchParams.get("action");
  const sig = req.nextUrl.searchParams.get("sig") ?? "";
  if (!id || (action !== "approve" && action !== "reject")) return page("Link not recognized", "This link is incomplete.", 400);

  const { verifyLessonSignature } = await import("@/lib/video-inbox/playbook");
  if (!verifyLessonSignature(id, action, sig)) return page("Link not recognized", "This link isn't valid.", 403);

  const { prisma } = await import("@/lib/prisma");
  const lesson = await prisma.playbookLesson.findUnique({ where: { id } });
  if (!lesson) return page("Lesson not found", "It may have been removed.", 404);

  if (lesson.status === "PROPOSED" || lesson.status === "APPROVED" || lesson.status === "REJECTED") {
    await prisma.playbookLesson.update({
      where: { id },
      data: { status: action === "approve" ? "APPROVED" : "REJECTED", decidedAt: new Date() },
    });
  }
  return action === "approve"
    ? page("Added to the playbook", `The ${escapeHtml(lesson.brand)} writers will use this from the next post on:<br><br><em>${escapeHtml(lesson.lesson)}</em>`)
    : page("Skipped", `This won't be suggested again:<br><br><em>${escapeHtml(lesson.lesson)}</em>`);
}
