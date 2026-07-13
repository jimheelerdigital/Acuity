/**
 * POST /api/user/theme
 *
 * Bearer-token / cookie-auth symmetric endpoint that writes the
 * signed-in user's color-scheme + palette preferences. The web app
 * also persists `theme` via a server action (actions/save-theme.ts);
 * mobile can't use server actions over the REST boundary so it hits
 * this route. Web Profile-page palette picker will follow same path
 * once the web side of the visual refresh ships.
 *
 * Body shape (Slice Q2, 2026-05-19): both fields optional, at least
 * one required.
 *   {
 *     theme?:   "light" | "dark" | "system"
 *     palette?: "coral" | "sunset" | "citrus" | "cobalt"
 *   }
 *
 * `theme: "system"` stores NULL — we don't want a stale "system"
 * string to outlive an OS preference change (existing behavior, kept).
 *
 * `palette` always stores the literal string. Defaults to "coral" at
 * the schema level; mobile passes the user's explicit pick.
 *
 * Validation rejects unknown values per field; either field can be
 * omitted (partial updates supported so mobile can write mode + palette
 * independently if it wants).
 */

import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_THEMES = new Set(["light", "dark", "system"]);
const VALID_PALETTES = new Set([
  "coral",
  "sunset",
  "citrus",
  "cobalt",
  "rose",
  "amber",
  "jade",
  "sky",
]);

export async function POST(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    theme?: unknown;
    palette?: unknown;
  } | null;

  const themeRaw = body && typeof body.theme === "string" ? body.theme : null;
  const paletteRaw =
    body && typeof body.palette === "string" ? body.palette : null;

  // At least one field must be present for the request to be meaningful.
  if (!themeRaw && !paletteRaw) {
    return NextResponse.json(
      { error: "At least one of theme|palette is required" },
      { status: 400 }
    );
  }

  if (themeRaw && !VALID_THEMES.has(themeRaw)) {
    return NextResponse.json(
      { error: "Invalid theme — expected light|dark|system" },
      { status: 400 }
    );
  }
  if (paletteRaw && !VALID_PALETTES.has(paletteRaw)) {
    return NextResponse.json(
      {
        error:
          "Invalid palette — expected coral|sunset|citrus|cobalt",
      },
      { status: 400 }
    );
  }

  // Build a partial-update payload. Mode "system" stores as NULL
  // (legacy semantic preserved). Palette stores literal string.
  const data: { theme?: string | null; themePalette?: string } = {};
  if (themeRaw) {
    data.theme = themeRaw === "system" ? null : themeRaw;
  }
  if (paletteRaw) {
    data.themePalette = paletteRaw;
  }

  const { prisma } = await import("@/lib/prisma");
  await prisma.user.update({ where: { id: userId }, data });

  return NextResponse.json({ ok: true });
}
