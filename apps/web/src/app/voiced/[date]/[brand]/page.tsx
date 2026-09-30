import type { Metadata } from "next";

import { VoicedClient } from "./client";

/**
 * /voiced/<date>/<brand>?t=<token> — Keenan's no-login page for the day's
 * voiced video (2026-09-30): read the script, upload the recording, then
 * watch and approve the finished video. The token is the HMAC from the
 * script email; nothing here is indexed.
 */

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Voiced video", robots: { index: false, follow: false } };

export default async function VoicedPage({
  params,
  searchParams,
}: {
  params: { date: string; brand: string };
  searchParams: { t?: string };
}) {
  const { isVoicedBrand, isVoicedDate, checkVoicedToken, readScript, readState } = await import(
    "@/lib/content-factory/voiced"
  );
  const { date, brand } = params;
  const t = searchParams.t ?? "";
  if (!isVoicedDate(date) || !isVoicedBrand(brand) || !checkVoicedToken(date, brand, t)) {
    return (
      <main className="min-h-screen bg-[#141210] px-4 py-16 text-center text-[#EDE7E0]">
        <p className="text-lg">This link isn&apos;t valid. Use the button in the latest email.</p>
      </main>
    );
  }
  const [script, state] = await Promise.all([readScript(date, brand), readState(date, brand)]);
  if (!script) {
    return (
      <main className="min-h-screen bg-[#141210] px-4 py-16 text-center text-[#EDE7E0]">
        <p className="text-lg">There&apos;s no script for this day yet.</p>
      </main>
    );
  }
  return (
    <VoicedClient
      date={date}
      brand={brand}
      token={t}
      lines={script.lines.map((l) => l.read)}
      caption={`${script.caption}\n\n${script.hashtags.join(" ")}`}
      status={state?.status ?? "scripted"}
      videoUrl={state?.videoUrl ?? null}
      error={state?.error ?? null}
    />
  );
}
