/**
 * "App Store SEO Rankings" Google Sheet (2026-11-03, per Keenan): every
 * Sunday night a new tab "Week N · <date>" with each search's rank, last
 * week's rank and the change, plus an "Overview" tab with every week side by
 * side (the shift over time). The sheet lives in Keenan's Drive and is shared
 * (editor) with the GA4 service account, which writes it via the Sheets API.
 */
import type { RankSnapshot } from "./app-store-rank";
import { RANK_TERMS } from "./app-store-rank";

export const RANK_SHEET_ID = "1jTOCC-OEytvOu5BnDyt7IsGkV-PCdEqkCayCevVloG8";
export const RANK_SHEET_URL = `https://docs.google.com/spreadsheets/d/${RANK_SHEET_ID}/edit`;

/** Every stored weekly snapshot, oldest first (one per date). */
export async function allSnapshots(): Promise<RankSnapshot[]> {
  const { supabase } = await import("@/lib/supabase.server");
  const bucket = supabase.storage.from("content-factory");
  const { data } = await bucket.list("aso/ranks", { limit: 1000 });
  const dates = (data ?? []).map((f) => f.name.replace(/\.json$/, "")).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  const out: RankSnapshot[] = [];
  for (const d of dates) {
    const { data: file } = await bucket.download(`aso/ranks/${d}.json`);
    if (file) out.push(JSON.parse(await file.text()) as RankSnapshot);
  }
  return out;
}

const shown = (r: number | null | undefined) => (r === null || r === undefined ? "200+" : r);

function shift(now: number | null, before: number | null | undefined): string {
  if (before === undefined) return "";
  if (now === before) return "no change";
  if (before === null) return "new";
  if (now === null) return "dropped out";
  const d = before - now;
  return d > 0 ? `up ${d}` : `down ${-d}`;
}

export async function writeRankSheet(snapshots: RankSnapshot[]): Promise<{ tab: string }> {
  const { google } = await import("googleapis");
  const { getGoogleAuthClient } = await import("@/lib/google/auth");
  const auth = getGoogleAuthClient(["https://www.googleapis.com/auth/spreadsheets"]);
  if (!auth) throw new Error("No Google auth client (GA4_SERVICE_ACCOUNT_KEY)");
  const sheets = google.sheets({ version: "v4", auth });

  const n = snapshots.length;
  const now = snapshots[n - 1];
  const prev = n > 1 ? snapshots[n - 2] : null;
  const first = snapshots[0];
  const tab = `Week ${n} · ${now.date}`;

  const meta = await sheets.spreadsheets.get({ spreadsheetId: RANK_SHEET_ID });
  const existing = meta.data.sheets ?? [];
  const reqs: object[] = [];
  // The new file's default tab becomes the Overview.
  const overview = existing.find((s) => s.properties?.title === "Overview");
  if (!overview) {
    const firstTab = existing[0]?.properties;
    reqs.push({ updateSheetProperties: { properties: { sheetId: firstTab?.sheetId, title: "Overview", gridProperties: { frozenRowCount: 1, frozenColumnCount: 1 } }, fields: "title,gridProperties.frozenRowCount,gridProperties.frozenColumnCount" } });
  }
  if (!existing.some((s) => s.properties?.title === tab)) {
    reqs.push({ addSheet: { properties: { title: tab, index: 1, gridProperties: { frozenRowCount: 1 } } } });
  }
  if (reqs.length) await sheets.spreadsheets.batchUpdate({ spreadsheetId: RANK_SHEET_ID, requestBody: { requests: reqs } });

  const best = (t: string) => {
    const rs = snapshots.map((s) => s.ranks[t]).filter((r): r is number => typeof r === "number");
    return rs.length ? Math.min(...rs) : "200+";
  };

  // This week's tab.
  const weekRows = [
    ["Search", "Rank this week", "Last week", "Change vs last week", "Week 1 rank", "Change since week 1", "Best ever"],
    ...RANK_TERMS.map((t) => [t, shown(now.ranks[t]), prev ? shown(prev.ranks[t]) : "", prev ? shift(now.ranks[t], prev.ranks[t]) : "first week", shown(first.ranks[t]), n > 1 ? shift(now.ranks[t], first.ranks[t]) : "", best(t)]),
    [],
    [`Rank = Ripple's position in Apple's US App Store search results (top 200), read ${now.date}. Lower is better. "200+" = not in the top 200.`],
  ];
  await sheets.spreadsheets.values.update({ spreadsheetId: RANK_SHEET_ID, range: `'${tab}'!A1`, valueInputOption: "RAW", requestBody: { values: weekRows } });

  // Overview: every week side by side.
  const overviewRows = [
    ["Search", ...snapshots.map((s, i) => `Week ${i + 1} (${s.date})`), "Change vs last week", "Change since week 1", "Best ever"],
    ...RANK_TERMS.map((t) => [t, ...snapshots.map((s) => shown(s.ranks[t])), prev ? shift(now.ranks[t], prev.ranks[t]) : "first week", n > 1 ? shift(now.ranks[t], first.ranks[t]) : "", best(t)]),
  ];
  await sheets.spreadsheets.values.clear({ spreadsheetId: RANK_SHEET_ID, range: "'Overview'!A1:ZZ200" });
  await sheets.spreadsheets.values.update({ spreadsheetId: RANK_SHEET_ID, range: "'Overview'!A1", valueInputOption: "RAW", requestBody: { values: overviewRows } });

  // Bold headers and readable widths on both tabs.
  const after = await sheets.spreadsheets.get({ spreadsheetId: RANK_SHEET_ID });
  const ids = (after.data.sheets ?? []).filter((s) => ["Overview", tab].includes(s.properties?.title ?? "")).map((s) => s.properties!.sheetId!);
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: RANK_SHEET_ID,
    requestBody: {
      requests: ids.flatMap((sheetId) => [
        { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 1, green: 0.95, blue: 0.92 } } }, fields: "userEnteredFormat(textFormat,backgroundColor)" } },
        { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 220 }, fields: "pixelSize" } },
        { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 1, endIndex: 30 }, properties: { pixelSize: 150 }, fields: "pixelSize" } },
      ]),
    },
  });
  return { tab };
}
