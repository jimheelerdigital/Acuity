/**
 * Three-column summary strip: themes count | mentions count | top theme.
 * Rendered as a single rounded card with 1px vertical dividers between
 * columns. Values 22px/700, labels 10px/uppercase/tracking-wide.
 */
export function SummaryStrip({
  themeCount,
  mentionCount,
  topTheme,
}: {
  themeCount: number;
  mentionCount: number;
  topTheme: string | null;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] p-4">
      <div className="grid grid-cols-3 divide-x divide-zinc-200 dark:divide-white/10">
        <Cell value={String(themeCount)} label="Themes" />
        <Cell value={String(mentionCount)} label="Mentions" />
        <Cell
          value={topTheme ?? "—"}
          label="Top theme"
          small={Boolean(topTheme && topTheme.length > 8)}
        />
      </div>
    </div>
  );
}

function Cell({
  value,
  label,
  small,
}: {
  value: string;
  label: string;
  small?: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-2">
      <span
        className="text-zinc-900 dark:text-zinc-50 font-bold tabular-nums"
        style={{
          fontSize: small ? 16 : 22,
          letterSpacing: "-0.4px",
          lineHeight: 1.1,
          textAlign: "center",
        }}
      >
        {value}
      </span>
      <span
        className="text-zinc-400 dark:text-zinc-500 mt-1 uppercase"
        style={{ fontSize: 10, letterSpacing: "0.8px" }}
      >
        {label}
      </span>
    </div>
  );
}
