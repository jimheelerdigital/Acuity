import { describe, expect, it } from "vitest";

import {
  bulkFilename,
  entryFilename,
  localDateStamp,
  renderBulkMarkdown,
  renderEntryMarkdown,
  yamlScalar,
  type ExportEntry,
} from "../../../../../apps/mobile/lib/obsidian/markdown";

const entry = (over: Partial<ExportEntry> = {}): ExportEntry => ({
  id: "e1",
  createdAt: "2026-08-21T14:05:00.000Z",
  transcript: "I said a thing.",
  summary: "A summary.",
  mood: "GOOD",
  moodScore: 7,
  energy: 5,
  themes: ["work", "family"],
  wins: [],
  blockers: [],
  insights: [],
  ...over,
});

describe("YAML safety", () => {
  it("quotes a value containing a colon", () => {
    // "work: overload" unquoted turns one tag into a nested mapping and
    // corrupts the rest of the frontmatter.
    expect(yamlScalar("work: overload")).toBe('"work: overload"');
  });

  it("quotes a leading hash", () => {
    // Unquoted, YAML reads it as a comment and the value vanishes.
    expect(yamlScalar("#burnout")).toBe('"#burnout"');
  });

  it("quotes YAML's magic words so they stay strings", () => {
    for (const w of ["true", "no", "null", "off"]) {
      expect(yamlScalar(w).startsWith('"')).toBe(true);
    }
  });

  it("escapes embedded quotes", () => {
    expect(yamlScalar('he said "hi"')).toBe('"he said \\"hi\\""');
  });

  it("flattens newlines that would break the block", () => {
    expect(yamlScalar("a\nb")).toBe("a b");
  });

  it("leaves a plain word alone", () => {
    expect(yamlScalar("work")).toBe("work");
  });
});

describe("entry markdown", () => {
  it("emits exactly one frontmatter block, at the top", () => {
    const md = renderEntryMarkdown(entry());
    expect(md.startsWith("---\n")).toBe(true);
    expect(md.split("\n").filter((l) => l === "---")).toHaveLength(2);
  });

  it("carries themes as tags without a # prefix", () => {
    // Obsidian treats frontmatter tags as tags already; a literal # would
    // start a YAML comment.
    const md = renderEntryMarkdown(entry());
    expect(md).toContain("tags:");
    expect(md).toContain("  - work");
    expect(md).not.toContain("- #work");
  });

  it("OMITS sections with no data rather than emitting them empty", () => {
    // An export that invents an empty "Insights" heading teaches the user
    // the feature is noise.
    const md = renderEntryMarkdown(entry({ wins: [], blockers: [], insights: [] }));
    expect(md).not.toContain("## Wins");
    expect(md).not.toContain("## Blockers");
    expect(md).not.toContain("## Insights");
  });

  it("includes sections that do have data", () => {
    const md = renderEntryMarkdown(
      entry({ wins: ["shipped it"], insights: ["a pattern"] })
    );
    expect(md).toContain("## Wins");
    expect(md).toContain("- shipped it");
    expect(md).toContain("## Insights");
  });

  it("always includes the transcript", () => {
    expect(renderEntryMarkdown(entry())).toContain("I said a thing.");
  });

  it("omits the observation entirely when there isn't one", () => {
    // Never synthesised — the pipeline declining to assert one is a real
    // signal, not a gap to fill.
    const md = renderEntryMarkdown(entry(), [], null);
    expect(md).not.toContain("observation:");
    expect(md).not.toContain("Something worth noticing");
  });

  it("includes the observation when there is one", () => {
    const md = renderEntryMarkdown(entry(), [], "Sounds like a heavy week.");
    expect(md).toContain("observation:");
    expect(md).toContain("Something worth noticing");
  });

  it("renders tasks as checkboxes reflecting real status", () => {
    const md = renderEntryMarkdown(entry(), [
      { title: "call mum", status: "TODO", dueDate: null },
      { title: "pay bill", status: "DONE", dueDate: "2026-08-25T00:00:00.000Z" },
    ]);
    expect(md).toContain("- [ ] call mum");
    expect(md).toContain("- [x] pay bill");
    expect(md).toContain("📅 2026-08-25");
  });

  it("never leaves three consecutive newlines", () => {
    expect(renderEntryMarkdown(entry())).not.toMatch(/\n{3}/);
  });
});

describe("filenames", () => {
  it("is date-first so it sorts chronologically", () => {
    expect(entryFilename(entry())).toMatch(/^\d{4}-\d{2}-\d{2}-\d{4}-debrief\.md$/);
  });

  it("distinguishes two debriefs on the same day", () => {
    // Without the time component these collide and Files.app appends " 2",
    // which sorts badly and reads worse.
    const a = entryFilename(entry({ createdAt: "2026-08-21T09:00:00.000Z" }));
    const b = entryFilename(entry({ createdAt: "2026-08-21T21:00:00.000Z" }));
    expect(a).not.toBe(b);
  });

  it("degrades safely on an unparseable date", () => {
    expect(entryFilename(entry({ createdAt: "nonsense" }))).toContain("unknown-date");
  });

  it("names the bulk file by export date", () => {
    expect(bulkFilename(new Date("2026-08-21T00:00:00.000Z"))).toMatch(
      /^ripple-export-\d{4}-\d{2}-\d{2}\.md$/
    );
  });
});

describe("bulk export", () => {
  const now = new Date("2026-08-21T00:00:00.000Z");

  it("still has exactly one frontmatter block", () => {
    // A Markdown file may only have one, at the top. Repeating per entry
    // renders literal `---` noise through the middle of the note.
    const md = renderBulkMarkdown(
      [{ entry: entry({ id: "a" }) }, { entry: entry({ id: "b" }) }],
      now
    );
    const head = md.slice(0, md.indexOf("# Ripple export"));
    expect(head.split("\n").filter((l) => l === "---")).toHaveLength(2);
  });

  it("records a real count", () => {
    const md = renderBulkMarkdown([{ entry: entry() }, { entry: entry() }], now);
    expect(md).toContain("count: 2");
  });

  it("keeps every transcript", () => {
    const md = renderBulkMarkdown(
      [
        { entry: entry({ transcript: "first one" }) },
        { entry: entry({ transcript: "second one" }) },
      ],
      now
    );
    expect(md).toContain("first one");
    expect(md).toContain("second one");
  });

  it("handles an empty export without crashing", () => {
    const md = renderBulkMarkdown([], now);
    expect(md).toContain("count: 0");
  });
});

describe("local date", () => {
  it("uses the day the user experienced, not UTC", () => {
    // Whatever the runner's zone, the stamp must agree with local time.
    const iso = "2026-08-21T14:05:00.000Z";
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, "0");
    expect(localDateStamp(iso)).toBe(
      `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
    );
  });
});
