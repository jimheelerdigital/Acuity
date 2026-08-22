// screen-onboarding.jsx — Onboarding step 3 of 8: Life Matrix baseline.
// One axis at a time. Big slider with live label. Mini matrix preview
// shows axes already scored so the user sees the picture forming.

// local polar→cartesian (pt is defined elsewhere as a non-exported helper)
function _pt(cx, cy, r, angleDeg) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
}

const ONBOARD_DATA = {
  step: 3,
  totalSteps: 8,
  currentAxis: { name: 'Health',  hue: 165, idx: 3, total: 12 },
  value: 54, // 0-100
  // Already-scored axes (so far)
  scored: [
    { name: 'Career',  hue: 295, score: 72 },
    { name: 'Family',  hue: 25,  score: 84 },
    { name: 'Friends', hue: 345, score: 60 },
  ],
  remaining: ['Romance', 'Money', 'Growth', 'Create', 'Body', 'Mind', 'Joy', 'Purpose'],
};

function valueLabel(v) {
  if (v < 20) return { label: 'Struggling',  color: 25 };
  if (v < 40) return { label: 'Off',         color: 30 };
  if (v < 60) return { label: 'Steady',      color: 80 };
  if (v < 80) return { label: 'Strong',      color: 165 };
  return        { label: 'Vibrant',      color: 165 };
}

function OnboardingMatrixBaseline({ t }) {
  const d = ONBOARD_DATA;
  const v = d.value;
  const mood = valueLabel(v);

  // Build a 12-axis radar preview with scored values
  const allAxes = [
    ...d.scored,
    { name: d.currentAxis.name, hue: d.currentAxis.hue, score: v, isCurrent: true },
    ...d.remaining.map((n) => ({ name: n, hue: 285, score: 0 })),
  ];
  const N = allAxes.length;
  const step = 360 / N;
  const R = 56;
  const pts = allAxes.map((a, i) => _pt(140, 130, (a.score / 100) * R, i * step));

  return (
    <AcuityDevice t={t}>
      <AcuityStatus dark={t.mode === 'dark'} />

      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        background: t.heroGrad, pointerEvents: 'none',
      }} />

      <div style={{
        position: 'absolute', inset: 0, paddingTop: 56, paddingBottom: 28,
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Top — back + progress + skip */}
        <div style={{
          padding: '14px 16px 0', display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <button style={pillBtn(t)}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke={t.textSec} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9.5 2L4 7l5.5 5" />
            </svg>
          </button>
          {/* progress dots */}
          <div style={{ flex: 1, display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
            {Array.from({ length: d.totalSteps }).map((_, i) => {
              const done = i < d.step - 1;
              const here = i === d.step - 1;
              return (
                <div key={i} style={{
                  height: 4, borderRadius: 2,
                  width: here ? 28 : 18,
                  background: done || here ? t.gradMix : t.mode === 'dark' ? 'oklch(1 0 0 / 0.10)' : 'oklch(0 0 0 / 0.08)',
                }} />
              );
            })}
          </div>
          <button style={{
            padding: '6px 12px', borderRadius: 999, border: 'none', cursor: 'pointer',
            background: 'transparent', color: t.textSec,
            fontFamily: t.sans, fontSize: 13, fontWeight: 600, letterSpacing: -0.1,
          }}>Skip</button>
        </div>

        {/* Step label */}
        <div style={{ padding: '28px 24px 0', textAlign: 'center' }}>
          <div style={{
            fontFamily: t.mono, fontSize: 10, letterSpacing: 1.6,
            textTransform: 'uppercase', color: t.textTer,
          }}>
            Life Matrix · {d.currentAxis.idx} of {d.currentAxis.total}
          </div>
          <h1 style={{
            fontFamily: t.display, fontSize: 30, fontWeight: 700,
            color: t.text, letterSpacing: -0.8, lineHeight: 1.1, margin: '12px 0 8px',
            textWrap: 'pretty',
          }}>
            Where’s your <span style={{
              background: `linear-gradient(135deg, oklch(0.78 0.16 ${d.currentAxis.hue}), oklch(0.55 0.16 ${d.currentAxis.hue}))`,
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            }}>{d.currentAxis.name.toLowerCase()}</span> right now?
          </h1>
          <p style={{
            fontFamily: t.sans, fontSize: 14, lineHeight: 1.45,
            color: t.textSec, margin: 0, textWrap: 'pretty',
          }}>
            Sleep, energy, exercise, body. No right answer — just a starting point.
          </p>
        </div>

        {/* Big number + mood pill */}
        <div style={{
          padding: '28px 24px 0', textAlign: 'center',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            fontFamily: t.display, fontWeight: 800, fontSize: 88,
            color: t.text, letterSpacing: -3, lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
            background: `linear-gradient(135deg, oklch(0.85 0.14 ${d.currentAxis.hue}), oklch(0.55 0.16 ${d.currentAxis.hue}))`,
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}>{v}</div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '6px 12px 6px 10px', borderRadius: 999,
            background: t.mode === 'dark' ? 'oklch(0.22 0.020 280 / 0.6)' : 'oklch(1 0 0 / 0.85)',
            backdropFilter: 'blur(20px)',
            border: `0.5px solid ${t.line}`,
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: 4,
              background: `oklch(0.66 0.14 ${mood.color})`,
              boxShadow: `0 0 8px oklch(0.66 0.14 ${mood.color} / 0.5)`,
            }} />
            <span style={{
              fontFamily: t.sans, fontSize: 13, fontWeight: 600,
              color: t.text, letterSpacing: -0.1,
            }}>Feels {mood.label.toLowerCase()}</span>
          </div>
        </div>

        {/* Slider */}
        <div style={{ padding: '32px 28px 0' }}>
          <div style={{ position: 'relative', height: 36 }}>
            {/* track */}
            <div style={{
              position: 'absolute', left: 0, right: 0, top: 16, height: 6, borderRadius: 3,
              background: t.mode === 'dark' ? 'oklch(1 0 0 / 0.08)' : 'oklch(0 0 0 / 0.06)',
            }} />
            {/* filled */}
            <div style={{
              position: 'absolute', left: 0, top: 16, height: 6, borderRadius: 3,
              width: `${v}%`,
              background: `linear-gradient(90deg, oklch(0.78 0.16 ${d.currentAxis.hue}), oklch(0.55 0.16 ${d.currentAxis.hue}))`,
            }} />
            {/* thumb */}
            <div style={{
              position: 'absolute', left: `${v}%`, top: 0, width: 36, height: 36, borderRadius: 18,
              transform: 'translateX(-50%)',
              background: t.cardBg, border: `2px solid oklch(0.62 0.16 ${d.currentAxis.hue})`,
              boxShadow: t.shadowSoft,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{
                width: 12, height: 12, borderRadius: 6,
                background: `linear-gradient(135deg, oklch(0.78 0.16 ${d.currentAxis.hue}), oklch(0.55 0.16 ${d.currentAxis.hue}))`,
              }} />
            </div>
          </div>
          {/* tick labels */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', marginTop: 8,
            fontFamily: t.mono, fontSize: 10, letterSpacing: 1.0,
            color: t.textTer, textTransform: 'uppercase',
          }}>
            <span>0 · Empty</span>
            <span>50</span>
            <span>100 · Full</span>
          </div>
        </div>

        {/* Mini radar preview */}
        <div style={{
          flex: 1, marginTop: 28, padding: '0 16px',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '14px 16px', borderRadius: 22,
            background: t.cardBg, border: `0.5px solid ${t.line}`,
            boxShadow: t.shadowSoft,
            width: '100%',
          }}>
            <svg viewBox="0 0 280 260" width="130" height="120" style={{ flexShrink: 0 }}>
              <defs>
                <radialGradient id="onb-fill" cx="50%" cy="50%" r="50%">
                  <stop offset="0%"  stopColor={t.primary} stopOpacity="0.6"/>
                  <stop offset="100%" stopColor={t.secondary} stopOpacity="0.15"/>
                </radialGradient>
              </defs>
              {/* Outer ring */}
              <polygon
                points={allAxes.map((_, i) => _pt(140, 130, R, i * step).join(',')).join(' ')}
                fill="none" stroke={t.mode === 'dark' ? 'oklch(1 0 0 / 0.06)' : 'oklch(0 0 0 / 0.07)'}
                strokeWidth={0.8} />
              {/* Axes */}
              {allAxes.map((_, i) => {
                const [x, y] = _pt(140, 130, R, i * step);
                return <line key={i} x1={140} y1={130} x2={x} y2={y}
                  stroke={t.mode === 'dark' ? 'oklch(1 0 0 / 0.05)' : 'oklch(0 0 0 / 0.05)'} strokeWidth={0.5} />;
              })}
              {/* Filled polygon */}
              <polygon
                points={pts.map(([x, y]) => `${x},${y}`).join(' ')}
                fill="url(#onb-fill)"
                stroke="url(#onb-fill)"
                strokeWidth={1.4} strokeLinejoin="round" />
              {/* Dots — current axis pulses */}
              {pts.map(([x, y], i) => {
                const a = allAxes[i];
                if (a.score === 0) return null;
                return <circle key={i} cx={x} cy={y} r={a.isCurrent ? 4 : 2.6}
                  fill={a.isCurrent ? `oklch(0.78 0.16 ${a.hue})` : `oklch(0.66 0.14 ${a.hue})`}
                  stroke={t.bg} strokeWidth={1.5}
                  style={a.isCurrent ? { filter: `drop-shadow(0 0 6px oklch(0.78 0.16 ${a.hue}))` } : {}}
                />;
              })}
            </svg>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: t.mono, fontSize: 10, letterSpacing: 1.2,
                color: t.textTer, textTransform: 'uppercase',
              }}>Your matrix, so far</div>
              <div style={{
                fontFamily: t.display, fontSize: 16, fontWeight: 700,
                color: t.text, letterSpacing: -0.3, lineHeight: 1.2, marginTop: 4,
              }}>{d.scored.length + 1} of {d.currentAxis.total} axes scored</div>
              <div style={{ fontFamily: t.sans, fontSize: 12, color: t.textSec, marginTop: 4, lineHeight: 1.4 }}>
                You can re-score anytime from Insights.
              </div>
            </div>
          </div>
        </div>

        {/* Bottom button */}
        <div style={{ padding: '16px 16px 0' }}>
          <button style={{
            width: '100%', padding: '16px 20px', borderRadius: 22, border: 'none',
            background: t.gradPrimary,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            cursor: 'pointer', boxShadow: t.glowPrimary,
            fontFamily: t.display, fontSize: 16, fontWeight: 700,
            color: '#fff', letterSpacing: -0.2,
          }}>
            Next axis · Romance
            <AcuityIcons.arrow color="#fff" size={16} weight={2.2} />
          </button>
        </div>
      </div>
    </AcuityDevice>
  );
}

Object.assign(window, { OnboardingMatrixBaseline, ONBOARD_DATA });
