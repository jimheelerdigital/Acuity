/**
 * Obsidian-flavoured Markdown for a debrief.
 *
 * Pure and dependency-free: the file it produces is the whole product, so
 * it is worth pinning exactly rather than eyeballing in a share sheet.
 *
 * ── Format decisions (v1 defaults — flagged for review) ──────────────
 * The spec left naming and format open, so these are chosen, not derived:
 *
 *   1. FILENAME `YYYY-MM-DD-HHmm-debrief.md`. Date-first sorts
 *      chronologically in any file browser and matches how most Obsidian
 *      daily-note setups are organised. The time is included because more
 *      than one debrief a day is normal and `2026-08-21-debrief.md` would
 *      silently collide — Files.app resolves collisions by appending " 2",
 *      which sorts badly and reads worse.
 *
 *   2. YAML FRONTMATTER, not Dataview inline fields. Frontmatter is
 *      readable by Dataview, Templater, Bases and plain YAML parsers;
 *      inline fields are Dataview-only. This is the more portable of the
 *      two, and export is meant to be a way OUT of our storage.
 *
 *   3. TAGS ARE NOT AUTO-PREFIXED with `#`. Obsidian treats a frontmatter
 *      `tags:` list as tags without them, and a literal `#` inside YAML
 *      starts a comment unless quoted — a subtle way to silently truncate
 *      someone's theme list.
 *
 *   4. NOTHING IS INVENTED. A section with no data is omitted rather than
 *      emitted empty. An export that fabricates an "Insights" heading over
 *      nothing teaches the user the feature is noise.
 */

export interface ExportEntry {
  id: string;
  createdAt: string;
  transcript: string;
  summary: string | null;
  mood: string | null;
  moodScore: number | null;
  energy: number | null;
  themes: string[];
  wins: string[];
  blockers: string[];
  insights: string[];
}

export interface ExportTask {
  title: string;
  status: string;
  dueDate: string | null;
}

/**
 * YAML scalar escaping.
 *
 * Quote when the value could otherwise change the document's meaning: a
 * leading `#` (comment), a `:` (mapping), leading/trailing whitespace, or
 * anything that would parse as a non-string. A theme like "work: overload"
 * is entirely plausible and would corrupt the frontmatter unquoted.
 */
export function yamlScalar(value: string): string {
  const v = value.replace(/\r?\n/g, " ").trim();
  if (v === "") return '""';
  const needsQuote =
    /["':#\-?*&!|>%@`{}[\],]/.test(v) ||
    /^\s|\s$/.test(value) ||
    /^(true|false|null|yes|no|on|off|~)$/i.test(v) ||
    /^[\d.+-]/.test(v);
  if (!needsQuote) return v;
  return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function yamlList(name: string, items: string[]): string[] {
  const clean = items.map((i) => i.trim()).filter(Boolean);
  if (clean.length === 0) return [];
  return [`${name}:`, ...clean.map((i) => `  - ${yamlScalar(i)}`)];
}

function section(heading: string, lines: string[]): string[] {
  if (lines.length === 0) return [];
  return [`## ${heading}`, "", ...lines, ""];
}

/**
 * `2026-08-21` from a DATE-ONLY value, without timezone conversion.
 *
 * A due date is a calendar date, not an instant. Running "2026-08-25"
 * through local-time conversion shifts it to the 24th for every user behind
 * UTC — a task quietly exports as due a day early. Take the date part as
 * authored instead.
 */
export function calendarDateStamp(iso: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
  if (m) return m[1];
  return localDateStamp(iso);
}

/**
 * `2026-08-21` in the device's local zone — the day the user experienced.
 *
 * Correct for createdAt, which IS an instant: a debrief recorded at 11pm
 * belongs to that evening's date in the user's own life, not to tomorrow
 * because UTC had already rolled over.
 */
export function localDateStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown-date";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function localTimeStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "0000";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}${p(d.getMinutes())}`;
}

/**
 * Filename for one debrief. Safe on iOS, macOS, Windows and Android.
 *
 * The time component prevents same-day collisions; see decision 1 above.
 */
export function entryFilename(entry: ExportEntry): string {
  return `${localDateStamp(entry.createdAt)}-${localTimeStamp(entry.createdAt)}-debrief.md`;
}

/**
 * Render one debrief.
 *
 * `observation` is the reveal-screen line when one exists. It is passed in
 * rather than derived because it is only ever hedged, low-confidence text —
 * synthesising one here would manufacture an insight the pipeline
 * deliberately declined to assert.
 */
export function renderEntryMarkdown(
  entry: ExportEntry,
  tasks: ExportTask[] = [],
  observation: string | null = null
): string {
  const date = localDateStamp(entry.createdAt);

  const fm: string[] = ["---", `date: ${date}`, `created: ${entry.createdAt}`];
  if (entry.mood) fm.push(`mood: ${yamlScalar(entry.mood)}`);
  if (typeof entry.moodScore === "number") fm.push(`mood_score: ${entry.moodScore}`);
  if (typeof entry.energy === "number") fm.push(`energy: ${entry.energy}`);
  fm.push(...yamlList("tags", entry.themes));
  fm.push(...yamlList("tasks", tasks.map((t) => t.title)));
  if (observation) fm.push(`observation: ${yamlScalar(observation)}`);
  // Provenance. Makes a re-export idempotent-ish for the user's own tooling
  // and marks the file as machine-generated rather than hand-written.
  fm.push("source: ripple", `entry_id: ${entry.id}`, "---");

  const body: string[] = [`# Debrief — ${date}`, ""];

  if (entry.summary) body.push(...section("Summary", [entry.summary]));
  if (observation) body.push(...section("Something worth noticing", [observation]));
  body.push(...section("Wins", entry.wins.map((w) => `- ${w}`)));
  body.push(...section("Blockers", entry.blockers.map((b) => `- ${b}`)));
  body.push(...section("Insights", entry.insights.map((i) => `- ${i}`)));
  body.push(
    ...section(
      "Tasks",
      tasks.map((t) => {
        // Obsidian/GFM checkbox. Reflects real status rather than exporting
        // everything unchecked.
        const done = t.status === "DONE" || t.status === "COMPLETED";
        const due = t.dueDate ? ` 📅 ${calendarDateStamp(t.dueDate)}` : "";
        return `- [${done ? "x" : " "}] ${t.title}${due}`;
      })
    )
  );
  body.push(...section("Transcript", [entry.transcript.trim()]));

  return [...fm, "", ...body].join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

/**
 * Filename for a bulk export.
 *
 * A single combined file rather than a zip of many: iOS share-sheet
 * delivery of one .md drops straight into a vault folder, whereas a zip
 * needs the user to find it, unzip it, and move the contents — three steps
 * where the export can be abandoned.
 */
export function bulkFilename(now: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `ripple-export-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.md`;
}

/**
 * Render many debriefs into one document, newest first.
 *
 * Separated by `---` horizontal rules rather than repeated frontmatter:
 * a Markdown file may only have ONE frontmatter block, at the top, and
 * repeating it would leave every block after the first rendered as literal
 * `---` noise in the middle of the note.
 */
export function renderBulkMarkdown(
  items: Array<{
    entry: ExportEntry;
    tasks?: ExportTask[];
    observation?: string | null;
  }>,
  now: Date
): string {
  const header = [
    "---",
    `exported: ${now.toISOString()}`,
    `count: ${items.length}`,
    "source: ripple",
    "---",
    "",
    "# Ripple export",
    "",
  ];

  const bodies = items.map(({ entry, tasks = [], observation = null }) => {
    // Strip the per-entry frontmatter, keeping the rendered body.
    const md = renderEntryMarkdown(entry, tasks, observation);
    const end = md.indexOf("\n---\n", 4);
    return end === -1 ? md : md.slice(end + 5).trimStart();
  });

  return [...header, bodies.join("\n\n---\n\n")].join("\n").trimEnd() + "\n";
}
