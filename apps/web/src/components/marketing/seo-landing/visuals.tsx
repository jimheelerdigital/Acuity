/**
 * Static versions of the homepage bento illustrations (home-v2). Server
 * components: the only motion is CSS from home-v2.module.css, which shows
 * the finished state under reduced motion.
 */
import s from "@/components/marketing/home-v2/home-v2.module.css";

import type { Tone, Visual } from "./types";

export const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(" ");

/** Card surfaces. Text colours on each pair are AA (checked 2026-10-21). */
export const TONES: Record<Tone, { card: string; body: string; dark: boolean }> = {
  white: { card: "border border-[#EEE7DE] bg-white text-[#1B1815]", body: "text-[#4A443E]", dark: false },
  ink: { card: "bg-[#1B1815] text-white", body: "text-[#CFC7BE]", dark: true },
  mint: { card: "bg-[#237A5C] text-white", body: "text-[#E3F6EE]", dark: true },
  violet: { card: "bg-[#6D5EF0] text-white", body: "text-white", dark: true },
  peach: { card: "bg-[#FFF4EF] text-[#1B1815]", body: "text-[#4A443E]", dark: false },
  lilac: { card: "bg-[#F2F0FF] text-[#1B1815]", body: "text-[#4A443E]", dark: false },
  sage: { card: "bg-[#EAF7F1] text-[#1B1815]", body: "text-[#4A443E]", dark: false },
  sand: { card: "bg-[#FCEFD2] text-[#1B1815]", body: "text-[#4A443E]", dark: false },
};

function Check({ size = 12, color = "#FFFFFF" }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

const TAG_CLS = {
  date: "bg-[#FDE3D8] text-[#8F3519]",
  count: "bg-[#ECE9FE] text-[#4A3DC4]",
  done: "bg-[#D9F0E6] text-[#1D6B51]",
};

const REPORT_TAG = {
  MOVED: "bg-[#1F3A30] text-[#7FD6B4]",
  SLIPPED: "bg-[#3E2A22] text-[#F7A386]",
  PATTERN: "bg-[#2E2A4A] text-[#B9B0FF]",
  NEXT: "bg-[#3A3220] text-[#F2C46A]",
};

/** Smooth path through 0–100 values, for the mood line. */
function moodPath(points: number[], w = 300, h = 120, pad = 12) {
  const xs = points.map((_, i) => (points.length === 1 ? w / 2 : (i / (points.length - 1)) * w));
  const ys = points.map((v) => h - pad - (Math.max(0, Math.min(100, v)) / 100) * (h - pad * 2));
  let d = `M${xs[0].toFixed(1)} ${ys[0].toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const mx = (xs[i] + xs[i + 1]) / 2;
    d += ` C${mx.toFixed(1)} ${ys[i].toFixed(1)} ${mx.toFixed(1)} ${ys[i + 1].toFixed(1)} ${xs[i + 1].toFixed(1)} ${ys[i + 1].toFixed(1)}`;
  }
  return { line: d, area: `${d} L${w} ${h} L0 ${h} Z` };
}

const WEEK_LEVEL = ["", "bg-[#3A342E] text-white", "bg-[#F2B544] text-[#1B1815]", "bg-[#F3EEE8] text-[#1B1815]", "bg-[#D9F0E6] text-[#1D6B51]", "bg-[#2E9C78] text-white"];

export function VisualBlock({ v, dark }: { v: Visual; dark: boolean }) {
  switch (v.kind) {
    case "tasks":
      return (
        <div className="flex flex-col overflow-hidden rounded-[18px] border border-[#EEE7DE] bg-white text-[#1B1815]">
          {v.items.map((t, i) => (
            <div key={t.text} className={cx("flex items-center gap-3 px-4 py-3.5", i < v.items.length - 1 && "border-b border-[#EEE7DE]")}>
              {t.done ? (
                <span className={cx(s.dot, "flex h-5 w-5 shrink-0 items-center justify-center rounded-[7px] bg-[#2E9C78]")} style={{ animationDelay: `${i * 120}ms` }}>
                  <Check />
                </span>
              ) : (
                <span className="h-5 w-5 shrink-0 rounded-[7px] border-2 border-[#D8CDBF]" />
              )}
              <span className={cx("min-w-0 flex-1 text-[15px] font-semibold", t.done && "text-[#6B645D] line-through")}>{t.text}</span>
              {t.tag && (
                <span className={cx("whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-extrabold", TAG_CLS[t.tagKind ?? (t.done ? "done" : "date")])}>{t.tag}</span>
              )}
            </div>
          ))}
        </div>
      );

    case "habits": {
      const label = v.rows.map((r) => `${r.name}: ${r.on.filter(Boolean).length} of ${r.on.length} days`).join(", ");
      return (
        <div className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-3" role="img" aria-label={`Example habit week. ${label}`}>
            {v.rows.map((h, r) => (
              <div key={h.name} className="flex items-center justify-between gap-2">
                <span className="text-[15px] font-extrabold">{h.name}</span>
                <span className="flex gap-1.5">
                  {h.on.map((on, c) => (
                    <span key={c} className={cx("h-5 w-5 rounded-full", dark ? "bg-[rgba(0,0,0,0.22)]" : "bg-[#F3EEE8]")}>
                      <span
                        className={cx(s.dot, "h-5 w-5 rounded-full")}
                        style={{ background: on ? (dark ? "#FFFFFF" : "#2E9C78") : "transparent", animationDelay: `${(r * 7 + c) * 80}ms` }}
                      />
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
          {v.note && (
            <div className={cx("rounded-[14px] px-3.5 py-2.5 text-[14px] font-bold", dark ? "bg-white text-[#1B1815]" : "bg-[#FDE3D8] text-[#8F3519]")}>{v.note}</div>
          )}
        </div>
      );
    }

    case "mood": {
      const { line, area } = moodPath(v.points);
      return (
        <div className={cx("flex flex-col gap-2 rounded-[18px] p-3", dark ? "bg-white" : "bg-[#FBF8F4]")}>
          <svg role="img" aria-label={v.caption ?? "Example mood line over several weeks"} width="100%" height="120" viewBox="0 0 300 120" preserveAspectRatio="none">
            <line x1="0" y1="118" x2="300" y2="118" stroke="#EEE7DE" strokeWidth="2" />
            <path d={area} fill="#FDE3D8" fillOpacity="0.7" />
            <path className={s.draw} d={line} fill="none" stroke="#F27A55" strokeWidth="5" strokeLinecap="round" />
          </svg>
          {v.labels && (
            <div className="flex justify-between text-[12px] font-bold text-[#57514B]">
              {v.labels.map((l) => (
                <span key={l}>{l}</span>
              ))}
            </div>
          )}
        </div>
      );
    }

    case "chips":
      return (
        <div className="flex flex-wrap gap-2">
          {v.chips.map((c, i) => (
            <span
              key={c}
              className={cx(
                i % 2 ? s.floatB : s.floatA,
                "rounded-full px-4 py-2.5 text-[15px] font-extrabold text-[#1B1815]",
                ["bg-white", "bg-[#F2B544]", "bg-[#F27A55]", dark ? "bg-white" : "bg-[#ECE9FE]"][i % 4],
              )}
              style={{ animationDelay: `${-i * 1.3}s` }}
            >
              {c}
            </span>
          ))}
        </div>
      );

    case "bars":
      return (
        <div className={cx("flex flex-col gap-3", dark && "rounded-[18px] bg-white p-4 text-[#1B1815]")}>
          {v.rows.map((m, i) => (
            <div key={m.name} className="flex items-center gap-2.5">
              <span className="w-[72px] shrink-0 text-[13px] font-extrabold">{m.name}</span>
              <span className="h-3 flex-1 rounded-full bg-[#F3EEE8]" role="img" aria-label={`${m.name}: ${m.pct} out of 100`}>
                <span className={cx(s.grow, "h-3 rounded-full")} style={{ width: `${m.pct}%`, background: m.color, animationDelay: `${i * 150}ms` }} />
              </span>
              <span className="w-7 text-right text-[13px] font-extrabold">{m.pct}</span>
            </div>
          ))}
        </div>
      );

    case "report":
      return (
        <div className="flex flex-col gap-3 rounded-[18px] bg-[#26221E] p-4 text-white">
          {v.rows.map((r) => (
            <div key={r.tag + r.text} className="flex items-start gap-3">
              <span className={cx("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-extrabold", REPORT_TAG[r.tag])}>{r.tag}</span>
              <span className="text-[15px] leading-[1.45] text-[#E8E1D9]">{r.text}</span>
            </div>
          ))}
        </div>
      );

    case "quote":
      return (
        <figure className={cx("m-0 flex flex-col gap-2 rounded-[18px] p-4", dark ? "bg-white text-[#1B1815]" : "bg-[#FBF8F4]")}>
          <blockquote className="m-0 text-[16px] font-semibold leading-[1.5]">“{v.text}”</blockquote>
          {v.caption && <figcaption className="text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#B9472A]">{v.caption}</figcaption>}
        </figure>
      );

    case "week":
      return (
        <div className="grid grid-cols-7 gap-1.5" role="img" aria-label={`Example week of moods: ${v.days.map((d) => `${d.day} ${d.word}`).join(", ")}`}>
          {v.days.map((d, i) => (
            <div key={d.day} className="flex flex-col items-center gap-1.5">
              <span className={cx(s.dot, "flex h-10 w-full items-center justify-center rounded-[12px] text-[11px] font-extrabold", WEEK_LEVEL[d.level])} style={{ animationDelay: `${i * 90}ms` }}>
                {d.level}
              </span>
              <span className={cx("text-[11px] font-bold", dark ? "text-white" : "text-[#57514B]")}>{d.day}</span>
            </div>
          ))}
        </div>
      );

    case "sort":
      return (
        <div className="flex flex-col gap-3">
          <div className={cx("rounded-[16px] p-3.5 text-[14px] font-medium leading-[1.5]", dark ? "bg-white text-[#1B1815]" : "bg-[#FBF8F4]")}>“{v.said}”</div>
          <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
            {v.buckets.map((b, i) => (
              <div key={b.label} className={cx(s.pop, "flex flex-col gap-1.5 rounded-[14px] px-3.5 py-3", ["bg-[#FDE3D8]", "bg-[#D9F0E6]", "bg-[#ECE9FE]", "bg-[#FCEFD2]"][i % 4])} style={{ animationDelay: `${i * 140}ms` }}>
                <span className={cx("text-[11px] font-extrabold uppercase tracking-[0.08em]", ["text-[#8F3519]", "text-[#1D6B51]", "text-[#4A3DC4]", "text-[#8A5A00]"][i % 4])}>{b.label}</span>
                {b.items.map((it) => (
                  <span key={it} className="text-[14px] font-bold text-[#1B1815]">{it}</span>
                ))}
              </div>
            ))}
          </div>
        </div>
      );
  }
}
