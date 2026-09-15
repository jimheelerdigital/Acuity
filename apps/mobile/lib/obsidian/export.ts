import * as FileSystem from "expo-file-system/legacy";
import { Platform, Share } from "react-native";

import {
  bulkFilename,
  entryFilename,
  renderBulkMarkdown,
  renderEntryMarkdown,
  type ExportEntry,
  type ExportTask,
} from "./markdown";

/**
 * Deliver a debrief export to the user's own storage.
 *
 * ── No server, no OAuth, no vault path ───────────────────────────────
 * v1 writes a Markdown file to the app's cache directory and hands it to
 * the OS share sheet. The user drops it wherever their vault lives. We
 * never ask for a vault location, never index their filesystem, and never
 * upload anything — the whole point of an export is to be a way OUT of our
 * storage, and asking for filesystem access to "help" would undercut that.
 *
 * ── Platform reality (v1 is iOS-first, stated not implied) ───────────
 * React Native's built-in Share supports a file `url` on iOS, which is what
 * puts "Save to Files" in the sheet. On ANDROID the same API only carries
 * text/message — a file url is ignored — so Android would silently share
 * nothing. Rather than pretend, exportEntry() reports `unsupported` there.
 *
 * Making Android work needs a content:// provider (expo-sharing), which is
 * a native module and a new build. Deliberately not pulled in for v1: the
 * flag exists so this can ship to iOS and be measured before taking on a
 * native dependency for it.
 */

export type ExportResult =
  | { ok: true; filename: string }
  | { ok: false; reason: "unsupported" | "write_failed" | "cancelled" | "error"; message?: string };

/** Where staged files live. Cache, not Documents: the OS may reclaim it. */
function stagingDir(): string | null {
  return FileSystem.cacheDirectory ?? null;
}

async function writeAndShare(
  filename: string,
  contents: string
): Promise<ExportResult> {
  if (Platform.OS !== "ios") {
    return { ok: false, reason: "unsupported" };
  }

  const dir = stagingDir();
  if (!dir) return { ok: false, reason: "write_failed" };

  // Encode the name: a theme or title could contribute characters that are
  // legal in a filename but not in a URI, and FileSystem takes a URI.
  const uri = `${dir}${encodeURIComponent(filename)}`;

  try {
    await FileSystem.writeAsStringAsync(uri, contents, {
      encoding: FileSystem.EncodingType.UTF8,
    });
  } catch (err) {
    return {
      ok: false,
      reason: "write_failed",
      message: err instanceof Error ? err.message : undefined,
    };
  }

  try {
    const res = await Share.share({ url: uri });
    if (res.action === Share.dismissedAction) {
      return { ok: false, reason: "cancelled" };
    }
    return { ok: true, filename };
  } catch (err) {
    return {
      ok: false,
      reason: "error",
      message: err instanceof Error ? err.message : undefined,
    };
  }
  // The staged file is deliberately left in place. Deleting it immediately
  // races the share sheet, which reads the file AFTER this promise
  // resolves — removing it here produced an empty share on the first try.
  // The OS reclaims the cache directory on its own schedule.
}

export async function exportEntry(
  entry: ExportEntry,
  tasks: ExportTask[] = [],
  observation: string | null = null
): Promise<ExportResult> {
  return writeAndShare(
    entryFilename(entry),
    renderEntryMarkdown(entry, tasks, observation)
  );
}

export async function exportAll(
  items: Array<{ entry: ExportEntry; tasks?: ExportTask[]; observation?: string | null }>,
  now: Date = new Date()
): Promise<ExportResult> {
  return writeAndShare(bulkFilename(now), renderBulkMarkdown(items, now));
}
