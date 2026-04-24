"use client";

type SentimentTone = "positive" | "challenging" | "neutral";

const TONE_DOT: Record<SentimentTone, string> = {
  positive: "#34D399",
  challenging: "#F87171",
  neutral: "#94A3B8",
};

/**
 * Hero metrics card — three-column full-width rounded card with a
 * subtle purple-tinted dark gradient. Big numeric hero values, small
 * uppercase labels. Top Theme column includes a sentiment dot.
 *
 * Web parity with the mobile HeroMetricsCard.
 */
export function HeroMetricsCard({
  themeCount,
  mentionCount,
  topTheme,
  topSentiment,
}: {
  themeCount: number;
  mentionCount: number;
  topTheme: string | null;
  topSentiment: SentimentTone | null;
}) {
  const display = topTheme ? sentenceCase(topTheme) : "—";
  const fullLength = topTheme?.length ?? 1;
  const topFontSize = fullLength <= 6 ? 32 : fullLength <= 10 ? 24 : 20;

  return (
    <div
      className="overflow-hidden rounded-3xl border"
      style={{
        borderColor: "rgba(255,255,255,0.08)",
        background:
          "linear-gradient(135deg, #1E1B4B 0%, #17172A 60%, #13131F 100%)",
      }}
    >
      <div className="flex items-stretch px-4 py-6">
        <Cell value={String(themeCount)} label="Themes" />
        <Divider />
        <Cell value={String(mentionCount)} label="Mentions" />
        <Divider />
        <div className="flex flex-1 flex-col items-center justify-center px-2">
          <div className="flex max-w-full items-center gap-2">
            {topSentiment ? (
              <span
                className="inline-block shrink-0 rounded-full"
                style={{
                  width: 8,
                  height: 8,
                  backgroundColor: TONE_DOT[topSentiment],
                  boxShadow: `0 0 8px ${TONE_DOT[topSentiment]}`,
                }}
                aria-hidden
              />
            ) : null}
            <span
              className="truncate font-bold"
              style={{
                fontSize: topFontSize,
                letterSpacing: "-0.3px",
                color: "#FAFAFA",
                lineHeight: 1.1,
              }}
            >
              {display}
            </span>
          </div>
          <span
            className="mt-2 uppercase"
            style={{
              fontSize: 10,
              letterSpacing: "1.2px",
              color: "rgba(228,228,231,0.55)",
              fontWeight: 600,
            }}
          >
            Top theme
          </span>
        </div>
      </div>
    </div>
  );
}

function Cell({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-2">
      <span
        className="tabular-nums"
        style={{
          fontSize: 40,
          fontWeight: 700,
          letterSpacing: "-1.4px",
          color: "#FAFAFA",
          lineHeight: 1.05,
        }}
      >
        {value}
      </span>
      <span
        className="mt-2 uppercase"
        style={{
          fontSize: 10,
          letterSpacing: "1.2px",
          color: "rgba(228,228,231,0.55)",
          fontWeight: 600,
        }}
      >
        {label}
      </span>
    </div>
  );
}

function Divider() {
  return (
    <span
      className="mx-1 block w-px"
      style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
      aria-hidden
    />
  );
}

function sentenceCase(s: string): string {
  if (!s) return s;
  const lower = s.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
