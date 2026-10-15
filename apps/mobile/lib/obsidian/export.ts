import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

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
 * Writes a Markdown file to the app's cache directory and hands it to the OS
 * share sheet. The user drops it wherever their vault lives. We never ask for
 * a vault location, never index their filesystem, and never upload anything —
 * the whole point of an export is to be a way OUT of our storage.
 *
 * ── Cross-platform (1.8) ─────────────────────────────────────────────
 * Uses `expo-sharing`, which shares a real file on BOTH iOS (share sheet →
 * "Save to Files") and Android (content:// provider → any file/vault app).
 * This replaces v1's RN `Share`, whose file `url` only worked on iOS. Note:
 * `expo-sharing` exposes no cancel signal, so a resolved share is reported
 * as `ok` (the previous `cancelled` result no longer occurs, but stays in the
 * union for callers).
 *
 * ── Not here: continuous vault sync ──────────────────────────────────
 * Writing new entries straight into a user-chosen vault folder across launches
 * needs persistent directory access. Android has the Storage Access Framework
 * (feasible via expo-file-system), but iOS requires security-scoped bookmarks —
 * a native module not available in managed Expo without a config plugin. Since
 * Ripple is iOS-first, continuous sync is deferred to a native task rather than
 * shipped Android-only. The share-sheet export above is the cross-platform
 * mechanism for now.
 */

export type ExportResult =
  | { ok: true; filename: string }
  | {
      ok: false;
      reason: "unsupported" | "write_failed" | "cancelled" | "error";
      message?: string;
    };

/** Where staged files live. Cache, not Documents: the OS may reclaim it. */
function stagingDir(): string | null {
  return FileSystem.cacheDirectory ?? null;
}

async function writeAndShare(
  filename: string,
  contents: string
): Promise<ExportResult> {
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
    const available = await Sharing.isAvailableAsync();
    if (!available) {
      // No share provider (rare — some Android ROMs, or a simulator without
      // Files). The staged file is written; nothing to hand it to.
      return { ok: false, reason: "unsupported" };
    }
    await Sharing.shareAsync(uri, {
      mimeType: "text/markdown",
      // iOS UTI so the sheet offers markdown-aware targets (Obsidian, Files).
      UTI: "net.daringfireball.markdown",
      dialogTitle: "Export to Obsidian",
    });
    return { ok: true, filename };
  } catch (err) {
    return {
      ok: false,
      reason: "error",
      message: err instanceof Error ? err.message : undefined,
    };
  }
  // The staged file is deliberately left in place. Deleting it immediately
  // races the share sheet, which reads the file AFTER this promise resolves.
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
  items: Array<{
    entry: ExportEntry;
    tasks?: ExportTask[];
    observation?: string | null;
  }>,
  now: Date = new Date()
): Promise<ExportResult> {
  return writeAndShare(bulkFilename(now), renderBulkMarkdown(items, now));
}
