// screen-lifematrix.jsx — v2. Vivid radar fill (primary→secondary), big
// score with ring, top movers as gradient bars with trend deltas.

const MATRIX_AREAS = [
  { name: 'Career',     short: 'Career',  score: 78, prev: 71, hue: 295,
    trend: [65, 68, 70, 71, 73, 75, 78] },
  { name: 'Health',     short: 'Health',  score: 54, prev: 58, hue: 165,
    trend: [62, 60, 60, 58, 56, 55, 54] },
  { name: 'Family',     short: 'Family',  score: 82, prev: 80, hue: 25,
    trend: [78, 79, 80, 80, 81, 82, 82] },
  { name: 'Friends',    short: 'Friends', score: 61, prev: 55, hue: 345,
    trend: [50, 52, 53, 55, 58, 60, 61] },
  { name: 'Romance',    short: 'Romance', score: 48, prev: 50, hue: 5,
    trend: [55, 53, 51, 50, 49, 49, 48] },
  { name: 'Money',      short: 'Money',   score: 66, prev: 62, hue: 115,
    trend: [60, 60, 61, 62, 63, 64, 66] },
  { name: 'Growth',     short: 'Growth',  score: 73, prev: 65, hue: 195,
    trend: [62, 63, 65, 65, 68, 70, 73] },
  { name: 'Creativity', short: 'Create',  score: 58, prev: 52, hue: 60,
    trend: [50, 51, 51, 52, 54, 56, 58] },
  { name: 'Body',       short: 'Body',    score: 44, prev: 52, hue: 145,
    trend: [55, 54, 53, 52, 50, 47, 44] },
  { name: 'Mind',       short: 'Mind',    score: 70, prev: 68, hue: 235,
    trend: [65, 66, 67, 68, 69, 69, 70] },
  { name: 'Joy',        short: 'Joy',     score: 64, prev: 60, hue: 80,
    trend: [58, 59, 59, 60, 61, 62, 64] },
  { name: 'Purpose',    short: 'Purpose', score: 76, prev: 70, hue: 275,
    trend: [68, 68, 69, 70, 72, 74, 76] },
];

function pt(cx, cy, r, angleDeg) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
}

function LifeMatrix({ t }) {
  const CX = 201, CY = 200, R = 130;
  const N = MATRIX_AREAS.length;
  const step = 360 / N;

  const curPts = MATRIX_AREAS.map((a, i) => pt(CX, CY, (a.score / 100) * R, i * step));
  const prevPts = MATRIX_AREAS.map((a, i) => pt(CX, CY, (a.prev / 100) * R, i * step));

  const overall = Math.round(MATRIX_AREAS.reduce((s, a) => s + a.score, 0) / N);
  const overallPrev = Math.round(MATRIX_AREAS.reduce((s, a) => s + a.prev, 0) / N);
  const delta = overall - overallPrev;

  const movers = MATRIX_AREAS
    .map((a) => ({ ...a, d: a.score - a.prev }))
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
    .slice(0, 4);

  return (
    <AcuityDevice t={t}>
      <AcuityStatus dark={t.mode === 'dark'} />

      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 540,
        background: t.heroGrad, pointerEvents: 'none',
      }} />

      <div className="acuity-scroll" style={{
        position: 'absolute', inset: 0, paddingTop: 56, paddingBottom: 130,
        overflowY: 'auto',
      }}>
        {/* Top bar */}
        <div style={{
          padding: '14px 16px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <button style={pillBtn(t)}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke={t.textSec} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9.5 2L4 7l5.5 5" />
            </svg>
          </button>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontFamily: t.mono, fontSize: 10, letterSpacing: 1.6,
              textTransform: 'uppercase', color: t.textTer,
            }}>Insights</div>
            <div style={{
              fontFamily: t.display, fontSize: 15, fontWeight: 700,
              color: t.text, letterSpacing: -0.2, marginTop: 2,
            }}>Life Matrix</div>
          </div>
          <button style={pillBtn(t)}>
            <AcuityIcons.more color={t.textSec} />
          </button>
        </div>

        {/* Segmented tabs */}
        <div style={{ padding: '14px 20px 0' }}>
          <SegmentedTabs t={t} options={['Theme Map', 'Matrix', 'Trends']} active="Matrix" />
        </div>

        {/* Big score block — ring + delta */}
        <div style={{ padding: '20px 20px 0', display: 'flex', alignItems: 'center', gap: 18 }}>
          <RingProgress value={overall / 100} size={108} stroke={9} t={t}>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                fontFamily: t.display, fontSize: 36, fontWeight: 800,
                color: t.text, letterSpacing: -1.5, lineHeight: 1,
                fontVariantNumeric: 'tabular-nums',
              }}>{overall}</div>
              <div style={{
                fontFamily: t.mono, fontSize: 9, letterSpacing: 1.2,
                color: t.textTer, textTransform: 'uppercase', marginTop: 2,
              }}>/ 100</div>
            </div>
          </RingProgress>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: t.mono, fontSize: 10, letterSpacing: 1.4,
              textTransform: 'uppercase', color: t.textTer,
            }}>Week of Oct 9 — 15</div>
            <div style={{
              fontFamily: t.display, fontSize: 18, fontWeight: 700,
              color: t.text, letterSpacing: -0.4, lineHeight: 1.2, marginTop: 4,
              textWrap: 'pretty',
            }}>You’re trending up across most axes.</div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              marginTop: 8, padding: '3px 10px', borderRadius: 999,
              background: delta >= 0 ? t.goodSoft : t.badSoft,
              fontFamily: t.mono, fontSize: 11, fontWeight: 700,
              color: delta >= 0 ? t.good : t.bad,
            }}>
              <span style={{ fontSize: 11 }}>{delta >= 0 ? '\u2197' : '\u2198'}</span>
              {delta >= 0 ? '+' : ''}{delta} vs last week
            </div>
          </div>
        </div>

        {/* Radar */}
        <div style={{ position: 'relative', height: 380, marginTop: 8 }}>
          <svg viewBox="0 0 402 400" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
            <defs>
              <radialGradient id="lm-fill" cx="50%" cy="50%" r="50%" fx="40%" fy="35%">
                <stop offset="0%"  stopColor={t.primary} stopOpacity="0.85" />
                <stop offset="60%" stopColor={t.secondary} stopOpacity="0.55" />
                <stop offset="100%" stopColor={t.secondary} stopOpacity="0.1" />
              </radialGradient>
              <linearGradient id="lm-stroke" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%"  stopColor={t.primary} />
                <stop offset="100%" stopColor={t.secondary} />
              </linearGradient>
              <filter id="lm-glow">
                <feGaussianBlur stdDeviation="4" />
              </filter>
            </defs>

            {/* Concentric rings */}
            {[0.2, 0.4, 0.6, 0.8, 1].map((p, i) => {
              const pts = MATRIX_AREAS.map((_, j) => pt(CX, CY, R * p, j * step));
              return <polygon key={i}
                points={pts.map(([x, y]) => `${x},${y}`).join(' ')}
                fill="none"
                stroke={t.mode === 'dark' ? 'oklch(1 0 0 / 0.05)' : 'oklch(0 0 0 / 0.06)'}
                strokeWidth={i === 4 ? 0.8 : 0.5} />;
            })}

            {/* Axes */}
            {MATRIX_AREAS.map((_, i) => {
              const [x, y] = pt(CX, CY, R, i * step);
              return <line key={`ax${i}`} x1={CX} y1={CY} x2={x} y2={y}
                stroke={t.mode === 'dark' ? 'oklch(1 0 0 / 0.04)' : 'oklch(0 0 0 / 0.05)'}
                strokeWidth={0.5} />;
            })}

            {/* Previous week (dashed) */}
            <polygon
              points={prevPts.map(([x, y]) => `${x},${y}`).join(' ')}
              fill="none"
              stroke={t.mode === 'dark' ? 'oklch(1 0 0 / 0.18)' : 'oklch(0 0 0 / 0.22)'}
              strokeWidth={1.2}
              strokeDasharray="3 3" />

            {/* Glow behind */}
            <polygon
              points={curPts.map(([x, y]) => `${x},${y}`).join(' ')}
              fill="url(#lm-fill)" opacity={0.55} filter="url(#lm-glow)" />

            {/* Current week filled */}
            <polygon
              points={curPts.map(([x, y]) => `${x},${y}`).join(' ')}
              fill="url(#lm-fill)"
              stroke="url(#lm-stroke)"
              strokeWidth={1.8}
              strokeLinejoin="round" />

            {/* Score dots — colored by delta */}
            {curPts.map(([x, y], i) => {
              const d = MATRIX_AREAS[i].score - MATRIX_AREAS[i].prev;
              const c = d > 0 ? t.good : d < 0 ? t.bad : t.primary;
              return <circle key={`d${i}`} cx={x} cy={y} r={3.4}
                fill={c} stroke={t.bg} strokeWidth={1.5} />;
            })}

            {/* Axis labels — score sits directly below the axis name */}
            {MATRIX_AREAS.map((a, i) => {
              const [lx, ly] = pt(CX, CY, R + 26, i * step);
              return (
                <g key={`lbl${i}`}>
                  <text x={lx} y={ly - 4} textAnchor="middle" dominantBaseline="middle"
                    style={{ fontFamily: t.sans, fontSize: 11, fontWeight: 700, fill: t.text, letterSpacing: -0.1 }}>
                    {a.short}
                  </text>
                  <text x={lx} y={ly + 10} textAnchor="middle" dominantBaseline="middle"
                    style={{ fontFamily: t.mono, fontSize: 10, letterSpacing: 0.4, fill: t.textTer, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                    {a.score}
                  </text>
                </g>
              );
            })}

            {/* Center pip */}
            <circle cx={CX} cy={CY} r={2.5} fill={t.textTer} />
          </svg>
        </div>

        {/* Legend */}
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 18, padding: '6px 0 0',
          fontFamily: t.mono, fontSize: 10, letterSpacing: 0.6,
          textTransform: 'uppercase', color: t.textTer, fontWeight: 600,
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 14, height: 3, background: t.gradMix, borderRadius: 2 }} />
            This week
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 14, height: 0, borderTop: `1.5px dashed ${t.textTer}`, opacity: 0.7 }} />
            Last week
          </span>
        </div>

        {/* Top movers */}
        <div style={{ padding: '24px 20px 0' }}>
          <SectionHead t={t} label="Biggest moves" count={4} />
        </div>
        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {movers.map((m) => {
            const up = m.d > 0;
            const max = Math.max(...m.trend);
            return (
              <div key={m.name} style={{
                padding: '14px 14px', borderRadius: 20,
                background: t.cardBg, border: `0.5px solid ${t.line}`,
                boxShadow: t.shadowSoft,
                display: 'flex', alignItems: 'center', gap: 14,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 18, flexShrink: 0,
                  background: `oklch(0.65 0.14 ${m.hue} / 0.18)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{
                    width: 14, height: 14, borderRadius: 7,
                    background: `linear-gradient(135deg, oklch(0.78 0.16 ${m.hue}), oklch(0.55 0.16 ${m.hue}))`,
                    boxShadow: `0 0 12px oklch(0.65 0.16 ${m.hue} / 0.6)`,
                  }} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8,
                  }}>
                    <span style={{
                      fontFamily: t.display, fontSize: 15, fontWeight: 700,
                      color: t.text, letterSpacing: -0.2,
                    }}>{m.name}</span>
                    <span style={{
                      fontFamily: t.mono, fontSize: 13, fontWeight: 700, letterSpacing: 0.2,
                      color: up ? t.good : t.bad,
                    }}>{up ? '+' : ''}{m.d}</span>
                  </div>
                  {/* trend mini-line */}
                  <svg viewBox="0 0 120 22" width="100%" height="22" style={{ marginTop: 4 }} preserveAspectRatio="none">
                    <defs>
                      <linearGradient id={`tr-${m.name}`} x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%"  stopColor={`oklch(0.65 0.14 ${m.hue})`} stopOpacity="0.0" />
                        <stop offset="100%" stopColor={`oklch(0.78 0.16 ${m.hue})`} stopOpacity="1" />
                      </linearGradient>
                    </defs>
                    <polyline
                      points={m.trend.map((v, i) => `${(i / (m.trend.length - 1)) * 120},${22 - (v / 100) * 22}`).join(' ')}
                      fill="none"
                      stroke={`url(#tr-${m.name})`}
                      strokeWidth={1.8}
                      strokeLinecap="round" strokeLinejoin="round" />
                    {/* end dot */}
                    <circle
                      cx={120} cy={22 - (m.trend[m.trend.length - 1] / 100) * 22}
                      r={3} fill={`oklch(0.78 0.16 ${m.hue})`} stroke={t.bg} strokeWidth={1.2} />
                  </svg>
                </div>

                <div style={{
                  fontFamily: t.display, fontSize: 22, fontWeight: 800,
                  color: t.text, letterSpacing: -0.6, lineHeight: 1,
                  fontVariantNumeric: 'tabular-nums', minWidth: 36, textAlign: 'right',
                }}>{m.score}</div>
              </div>
            );
          })}
        </div>

        {/* AI note */}
        <div style={{ padding: '20px 16px 0' }}>
          <div style={{
            padding: 16, borderRadius: 22,
            background: t.cardBgTint, border: `0.5px solid ${t.line}`,
            display: 'flex', gap: 12,
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: 14, flexShrink: 0,
              background: t.gradMix,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <AcuityIcons.sparkle color="#fff" size={15} />
            </div>
            <p style={{
              flex: 1, fontFamily: t.sans, fontSize: 13.5, lineHeight: 1.5,
              color: t.text, margin: 0, letterSpacing: -0.1, textWrap: 'pretty',
            }}>
              Body slipped while Career climbed. The pattern is familiar — you traded one for the other in week 32, too.
            </p>
          </div>
        </div>
      </div>

      <AcuityTabBar active="insights" t={t} />
    </AcuityDevice>
  );
}

Object.assign(window, { LifeMatrix, MATRIX_AREAS });
