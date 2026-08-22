// screen-thememap.jsx — v2. Cosmic orbital, glowing, with stat strip
// above. Same data; sleeker treatment, vivid planet gradients.

const THEME_MAP = [
  { label: 'Career',        count: 38, hue: 295, ring: 0, angle: 30,  size: 52 },
  { label: 'Family',        count: 27, hue: 25,  ring: 0, angle: 200, size: 46 },
  { label: 'Health',        count: 22, hue: 165, ring: 1, angle: 130, size: 40 },
  { label: 'Avoidance',     count: 18, hue: 60,  ring: 1, angle: 320, size: 34 },
  { label: 'Money',         count: 14, hue: 115, ring: 2, angle: 80,  size: 30 },
  { label: 'Relationships', count: 12, hue: 345, ring: 2, angle: 230, size: 28 },
  { label: 'Sleep',         count:  9, hue: 235, ring: 2, angle: 350, size: 26 },
  { label: 'Growth',        count:  7, hue: 195, ring: 3, angle: 200, size: 22 },
  { label: 'Solitude',      count:  6, hue: 275, ring: 3, angle: 310, size: 20 },
];

function ThemeMap({ t }) {
  const ringRadii = [78, 110, 140, 168];

  return (
    <AcuityDevice t={t}>
      <AcuityStatus dark={t.mode === 'dark'} />

      {/* Cosmos background */}
      <div style={{
        position: 'absolute', inset: 0, background: t.cosmosGrad,
      }} />

      {/* Stars */}
      <svg style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 1, pointerEvents: 'none',
      }} viewBox="0 0 402 874" preserveAspectRatio="none">
        {Array.from({ length: 70 }).map((_, i) => {
          const x = (i * 137) % 402;
          const y = (i * 89) % 874;
          const r = (i % 7) === 0 ? 1.4 : 0.7;
          const op = 0.2 + ((i * 7) % 60) / 100;
          return <circle key={i} cx={x} cy={y} r={r}
            fill={t.mode === 'dark' ? '#fff' : 'oklch(0.45 0.05 285)'} opacity={op} />;
        })}
      </svg>

      <div className="acuity-scroll" style={{
        position: 'absolute', inset: 0, paddingTop: 56, paddingBottom: 130,
        overflowY: 'auto', zIndex: 2,
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
            }}>Theme Map</div>
          </div>
          <button style={pillBtn(t)}>
            <AcuityIcons.more color={t.textSec} />
          </button>
        </div>

        {/* Segmented tabs */}
        <div style={{ padding: '14px 20px 0' }}>
          <SegmentedTabs t={t} options={['Theme Map', 'Matrix', 'Trends']} active="Theme Map" />
        </div>

        {/* Title */}
        <div style={{ padding: '20px 24px 0', textAlign: 'center' }}>
          <div style={{
            fontFamily: t.mono, fontSize: 10, letterSpacing: 1.4,
            textTransform: 'uppercase', color: t.textTer, marginBottom: 8,
          }}>What you think about</div>
          <h1 style={{
            fontFamily: t.display, fontSize: 28, fontWeight: 700,
            color: t.text, letterSpacing: -0.7, lineHeight: 1, margin: 0,
          }}>
            <span style={{
              background: t.gradMix,
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>{THEME_MAP.length}</span>
            <span> active themes</span>
          </h1>
          <p style={{
            fontFamily: t.sans, fontSize: 13, color: t.textSec,
            margin: '8px 0 0', letterSpacing: -0.1,
          }}>41 entries · last 60 days</p>
        </div>

        {/* Orbital — slightly inset and clipped so outer planets can't crash the title */}
        <div style={{
          position: 'relative', height: 380, marginTop: 32, marginBottom: 16,
        }}>
          <svg viewBox="0 0 402 360" style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible',
          }}>
            <defs>
              <radialGradient id="tm-center" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={t.primary} stopOpacity="0.55" />
                <stop offset="100%" stopColor={t.primary} stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle cx={201} cy={180} r={60} fill="url(#tm-center)" />
            {ringRadii.map((r, i) => (
              <circle key={i} cx={201} cy={180} r={r}
                fill="none"
                stroke={t.mode === 'dark' ? 'oklch(1 0 0 / 0.06)' : 'oklch(0 0 0 / 0.06)'}
                strokeWidth={0.6}
                strokeDasharray={i === 0 ? 'none' : '2 5'} />
            ))}
            {/* center "you" — substantial gradient avatar with initial */}
            <circle cx={201} cy={180} r={26} fill="none"
              stroke={t.mode === 'dark' ? 'oklch(1 0 0 / 0.10)' : 'oklch(0 0 0 / 0.08)'}
              strokeWidth={0.6} strokeDasharray="2 4" />
            <defs>
              <radialGradient id="tm-you-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%"  stopColor={t.primary} stopOpacity="0.45" />
                <stop offset="100%" stopColor={t.primary} stopOpacity="0" />
              </radialGradient>
              <linearGradient id="tm-you" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%"  stopColor={t.primary} />
                <stop offset="100%" stopColor={t.secondary} />
              </linearGradient>
            </defs>
            {/* you glow halo */}
            <circle cx={201} cy={180} r={40} fill="url(#tm-you-glow)" />
            {/* you body */}
            <circle cx={201} cy={180} r={20} fill="url(#tm-you)"
              stroke={t.mode === 'dark' ? 'oklch(1 0 0 / 0.25)' : 'oklch(1 0 0 / 0.85)'}
              strokeWidth={1.5} />
            {/* you initial */}
            <text x={201} y={180} textAnchor="middle" dominantBaseline="central"
              style={{
                fontFamily: t.display, fontSize: 17, fontWeight: 800,
                fill: '#fff', letterSpacing: -0.4,
              }}>J</text>
            <text x={201} y={216} textAnchor="middle"
              style={{
                fontFamily: t.mono, fontSize: 9, letterSpacing: 1.6, fontWeight: 700,
                fill: t.textSec, textTransform: 'uppercase',
              }}>YOU</text>

            {THEME_MAP.map((th, i) => {
              const r = ringRadii[th.ring];
              const a = (th.angle * Math.PI) / 180;
              const x = 201 + Math.cos(a) * r;
              const y = 180 + Math.sin(a) * r;
              return <line key={`l${i}`} x1={201} y1={180} x2={x} y2={y}
                stroke={t.mode === 'dark' ? `oklch(0.65 0.12 ${th.hue} / 0.18)` : `oklch(0.55 0.12 ${th.hue} / 0.22)`}
                strokeWidth={0.7} strokeDasharray="1.5 3" />;
            })}
          </svg>

          {/* Planets */}
          {THEME_MAP.map((th, i) => {
            const r = ringRadii[th.ring];
            const a = (th.angle * Math.PI) / 180;
            const x = ((201 + Math.cos(a) * r) / 402) * 100;
            const y = ((180 + Math.sin(a) * r) / 360) * 100;
            const isInner = th.ring <= 1;
            return (
              <div key={i} style={{
                position: 'absolute', left: `${x}%`, top: `${y}%`,
                transform: 'translate(-50%, -50%)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              }}>
                <div style={{
                  width: th.size, height: th.size, borderRadius: '50%',
                  background: `radial-gradient(circle at 32% 28%,
                    oklch(0.86 0.12 ${th.hue}) 0%,
                    oklch(0.66 0.16 ${th.hue}) 40%,
                    oklch(0.40 0.13 ${th.hue}) 95%)`,
                  boxShadow: t.mode === 'dark'
                    ? `0 0 ${th.size * 0.35}px oklch(0.62 0.16 ${th.hue} / 0.35),
                       inset 0 -${th.size * 0.12}px ${th.size * 0.2}px oklch(0 0 0 / 0.4),
                       inset 0 ${th.size * 0.06}px ${th.size * 0.12}px oklch(1 0 0 / 0.30)`
                    : `0 6px 18px oklch(0.55 0.14 ${th.hue} / 0.28),
                       inset 0 -${th.size * 0.12}px ${th.size * 0.2}px oklch(0 0 0 / 0.22),
                       inset 0 ${th.size * 0.06}px ${th.size * 0.12}px oklch(1 0 0 / 0.45)`,
                }} />
                <div style={{ textAlign: 'center', maxWidth: 90 }}>
                  <div style={{
                    fontFamily: t.sans, fontSize: isInner ? 13 : 11.5,
                    fontWeight: 700, color: t.text, letterSpacing: -0.1,
                  }}>{th.label}</div>
                  <div style={{
                    fontFamily: t.mono, fontSize: 10, color: t.textTer,
                    letterSpacing: 0.5, marginTop: 1, fontWeight: 600,
                  }}>{th.count}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Insight card */}
        <div style={{ padding: '20px 16px 0' }}>
          <div style={{
            padding: '14px 16px', borderRadius: 22,
            background: t.mode === 'dark' ? 'oklch(0.16 0.022 285 / 0.7)' : 'oklch(1 0 0 / 0.75)',
            backdropFilter: 'blur(20px) saturate(180%)',
            border: `0.5px solid ${t.lineStrong}`,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 16,
              background: t.gradMix,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <AcuityIcons.sparkle color="#fff" size={16} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: t.sans, fontSize: 13, fontWeight: 600, color: t.text,
                letterSpacing: -0.1, lineHeight: 1.3,
              }}>
                Career has stayed close 4 weeks running.
              </div>
              <div style={{ fontFamily: t.sans, fontSize: 12, color: t.textSec, marginTop: 1 }}>
                Sleep moved one ring closer this week.
              </div>
            </div>
            <AcuityIcons.chevron color={t.textTer} />
          </div>
        </div>
      </div>

      <AcuityTabBar active="insights" t={t} />
    </AcuityDevice>
  );
}

// Segmented pill tabs (like Calm/Stoic-style top tabs in the references)
function SegmentedTabs({ t, options, active }) {
  return (
    <div style={{
      display: 'flex', padding: 4, borderRadius: 999,
      background: t.mode === 'dark' ? 'oklch(0.16 0.018 285 / 0.65)' : 'oklch(0 0 0 / 0.05)',
      border: `0.5px solid ${t.line}`,
      backdropFilter: 'blur(20px)',
    }}>
      {options.map((opt) => {
        const isActive = opt === active;
        return (
          <div key={opt} style={{
            flex: 1, height: 32, borderRadius: 999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: isActive ? t.gradMix : 'transparent',
            fontFamily: t.sans, fontSize: 12.5, fontWeight: 700,
            color: isActive ? '#fff' : t.textSec, letterSpacing: -0.1,
          }}>{opt}</div>
        );
      })}
    </div>
  );
}

Object.assign(window, { ThemeMap, THEME_MAP, SegmentedTabs });
