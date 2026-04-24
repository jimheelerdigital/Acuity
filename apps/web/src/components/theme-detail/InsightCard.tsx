"use client";

/**
 * "What Acuity notices" card — soft purple gradient background,
 * uppercase accent label, readable body copy. Web parity with the
 * mobile InsightCard.
 */
export function InsightCard({ text }: { text: string }) {
  return (
    <div
      className="overflow-hidden rounded-3xl border px-5 py-5"
      style={{
        borderColor: "rgba(124,58,237,0.25)",
        background:
          "linear-gradient(135deg, rgba(46,26,91,0.6) 0%, rgba(26,18,48,0.4) 100%)",
      }}
    >
      <p
        className="uppercase"
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "1.4px",
          color: "#C4B5FD",
          marginBottom: 10,
        }}
      >
        What Acuity notices
      </p>
      <p
        style={{
          fontSize: 15,
          lineHeight: 1.55,
          color: "#E4E4E7",
        }}
      >
        {text}
      </p>
    </div>
  );
}
