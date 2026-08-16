// screen-recording.jsx — v2. Ceremonial mid-record state, but vibrant.
// Center: arc gauge that fills with elapsed time (90s target), glowing
// orb at the gauge center, waveform band, big timer, ghost transcript.

function Waveform({ t, bars = 38 }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: 5, height: 80, width: '100%',
    }}>
      {Array.from({ length: bars }).map((_, i) => {
        const center = bars / 2;
        const dist = Math.abs(i - center) / center;
        const seed = (Math.sin(i * 1.7) + Math.cos(i * 0.9)) * 0.5 + 0.5;
        const h = Math.max(6, (1 - dist * 0.8) * (28 + seed * 44));
        const delay = (i * 0.08) % 1.2;
        return (
          <div key={i} style={{
            width: 3, height: h, borderRadius: 2,
            background: t.gradMix,
            transformOrigin: 'center',
            animation: `acuity-wave 1.${Math.floor(seed * 9)}s ease-in-out ${delay}s infinite alternate`,
            boxShadow: t.mode === 'dark'
              ? `0 0 6px oklch(${t._primary[0]} ${t._primary[1]} ${t._primary[2]} / 0.35)`
              : `0 0 4px oklch(${t._primary[0]} ${t._primary[1]} ${t._primary[2]} / 0.25)`,
          }} />
        );
      })}
    </div>
  );
}

function RecordingScreen({ t }) {
  // Top-arc gauge that fills from left to right as elapsed time grows.
  // 0:23 of 1:30 target = 25.5%. Arc is the TOP half-circle so it cups
  // over the center orb like a speedometer hood.
  const elapsed = 23;
  const target = 90;
  const pct = elapsed / target;

  const arcRadius = 108;
  const cx = 156, cy = 132;
  // For a top arc, parameterize angle θ ∈ [0, π] where θ=0 → left endpoint,
  // θ=π → right endpoint. Point: (cx - r·cos(θ), cy - r·sin(θ)).
  const ptOnArc = (theta) => [cx - Math.cos(theta) * arcRadius, cy - Math.sin(theta) * arcRadius];
  const [x1, y1] = ptOnArc(0);            // left
  const [x2, y2] = ptOnArc(Math.PI * pct); // progress head

  return (
    <AcuityDevice t={t}>
      <AcuityStatus dark={t.mode === 'dark'} />

      {/* Background */}
      <div style={{
        position: 'absolute', inset: 0,
        background: t.recordGrad,
      }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{
            position: 'absolute', left: '50%', top: '36%',
            transform: 'translate(-50%, -50%)',
            width: 260 + i * 130, height: 260 + i * 130,
            borderRadius: '50%',
            border: `1px solid oklch(${t._primary[0]} ${t._primary[1]} ${t._primary[2]} / ${t.mode === 'dark' ? 0.18 - i * 0.04 : 0.14 - i * 0.03})`,
            animation: `acuity-pulse-soft ${4 + i}s ease-in-out ${i * 0.6}s infinite`,
            pointerEvents: 'none',
          }} />
        ))}
      </div>

      {/* Top bar */}
      <div style={{
        position: 'absolute', top: 56, left: 0, right: 0, zIndex: 5,
        display: 'flex', justifyContent: 'space-between', padding: '0 18px',
      }}>
        <button style={{
          padding: '9px 14px', borderRadius: 999, border: 'none', cursor: 'pointer',
          background: t.mode === 'dark' ? 'oklch(1 0 0 / 0.10)' : 'oklch(0 0 0 / 0.06)',
          backdropFilter: 'blur(20px)',
          color: t.text, fontFamily: t.sans, fontSize: 13, fontWeight: 600, letterSpacing: -0.1,
        }}>Cancel</button>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 14px 8px 11px', borderRadius: 999,
          background: t.mode === 'dark' ? 'oklch(1 0 0 / 0.10)' : 'oklch(0 0 0 / 0.06)',
          backdropFilter: 'blur(20px)',
        }}>
          <span style={{
            width: 7, height: 7, borderRadius: 4,
            background: 'oklch(0.66 0.20 25)',
            boxShadow: '0 0 12px oklch(0.66 0.20 25 / 0.8)',
            animation: 'acuity-pulse-soft 1.4s ease-in-out infinite',
          }} />
          <span style={{ fontFamily: t.mono, fontSize: 12, fontWeight: 700, color: t.text, letterSpacing: 0.6 }}>
            REC
          </span>
        </div>
      </div>

      {/* Prompt */}
      <div style={{
        position: 'absolute', top: 120, left: 0, right: 0, textAlign: 'center', padding: '0 32px',
      }}>
        <div style={{
          fontFamily: t.mono, fontSize: 10, letterSpacing: 1.6,
          textTransform: 'uppercase', color: t.textTer, marginBottom: 10,
        }}>Tonight’s prompt</div>
        <p style={{
          fontFamily: t.display, fontSize: 22, fontWeight: 600, lineHeight: 1.2,
          letterSpacing: -0.5, color: t.text, margin: 0, textWrap: 'pretty',
        }}>
          What did the day ask of you?
        </p>
      </div>

      {/* Gauge — arc + center orb + timer */}
      <div style={{
        position: 'absolute', top: 210, left: '50%', transform: 'translateX(-50%)',
        width: 312, height: 220,
      }}>
        <svg viewBox="0 0 312 220" width="312" height="220" style={{ overflow: 'visible' }}>
          <defs>
            <linearGradient id="rec-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%"  stopColor={t.primary} />
              <stop offset="100%" stopColor={t.secondary} />
            </linearGradient>
            <filter id="rec-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" />
            </filter>
          </defs>
          {/* track — top arc */}
          <path
            d={`M ${cx - arcRadius} ${cy} A ${arcRadius} ${arcRadius} 0 0 1 ${cx + arcRadius} ${cy}`}
            stroke={t.mode === 'dark' ? 'oklch(1 0 0 / 0.08)' : 'oklch(0 0 0 / 0.07)'}
            strokeWidth={10} fill="none" strokeLinecap="round"
          />
          {/* tick marks — radiating outward from top arc */}
          {Array.from({ length: 19 }).map((_, i) => {
            const theta = (Math.PI * i) / 18;
            const r1 = arcRadius + 12, r2 = arcRadius + (i % 3 === 0 ? 22 : 18);
            const ti = (i / 18);
            const active = ti <= pct;
            const c = Math.cos(theta), s = Math.sin(theta);
            return <line key={i}
              x1={cx - c * r1} y1={cy - s * r1}
              x2={cx - c * r2} y2={cy - s * r2}
              stroke={active ? t.primary : t.mode === 'dark' ? 'oklch(1 0 0 / 0.16)' : 'oklch(0 0 0 / 0.16)'}
              strokeWidth={i % 3 === 0 ? 1.8 : 1}
              strokeLinecap="round"
              opacity={active ? 1 : 0.7}
            />;
          })}
          {/* glow fill arc */}
          <path
            d={`M ${x1} ${y1} A ${arcRadius} ${arcRadius} 0 0 1 ${x2} ${y2}`}
            stroke="url(#rec-grad)" strokeWidth={10} fill="none" strokeLinecap="round"
            filter="url(#rec-glow)"
          />
          {/* crisp fill arc */}
          <path
            d={`M ${x1} ${y1} A ${arcRadius} ${arcRadius} 0 0 1 ${x2} ${y2}`}
            stroke="url(#rec-grad)" strokeWidth={10} fill="none" strokeLinecap="round"
          />
          {/* progress head */}
          <circle cx={x2} cy={y2} r={9}
            fill="#fff" stroke="url(#rec-grad)" strokeWidth={3} />
          {/* gauge labels under the endpoints */}
          <text x={cx - arcRadius} y={cy + 22} fill={t.textTer}
            style={{ fontFamily: t.mono, fontSize: 10, letterSpacing: 0.6, fontWeight: 600 }} textAnchor="middle">0:00</text>
          <text x={cx + arcRadius} y={cy + 22} fill={t.textTer}
            style={{ fontFamily: t.mono, fontSize: 10, letterSpacing: 0.6, fontWeight: 600 }} textAnchor="middle">1:30</text>
        </svg>

        {/* Center orb + timer — sits inside the arc cup */}
        <div style={{
          position: 'absolute', left: '50%', top: 56,
          transform: 'translateX(-50%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
        }}>
          {/* orb */}
          <div style={{ position: 'relative', width: 76, height: 76 }}>
            <div style={{
              position: 'absolute', inset: -10, borderRadius: '50%',
              background: `radial-gradient(circle, ${t.primary} 0%, transparent 65%)`,
              opacity: 0.55, filter: 'blur(14px)',
              animation: 'acuity-pulse-soft 2.6s ease-in-out infinite',
            }} />
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: `radial-gradient(circle at 35% 30%, ${t.primaryHi} 0%, ${t.primary} 50%, ${t.secondary} 100%)`,
              boxShadow: `0 8px 24px oklch(${t._primary[0]} ${t._primary[1]} ${t._primary[2]} / 0.55),
                inset 0 -4px 10px oklch(0 0 0 / 0.25), inset 0 2px 8px oklch(1 0 0 / 0.4)`,
            }} />
          </div>
          {/* timer */}
          <div style={{
            fontFamily: t.display, fontWeight: 700, fontSize: 44,
            letterSpacing: -1.6, color: t.text, fontVariantNumeric: 'tabular-nums',
            lineHeight: 1, marginTop: 4,
          }}>0:23</div>
        </div>
      </div>

      {/* Ghost transcript */}
      <div style={{
        position: 'absolute', bottom: 250, left: 28, right: 28,
        height: 78, overflow: 'hidden',
        maskImage: 'linear-gradient(180deg, transparent 0%, #000 70%)',
        WebkitMaskImage: 'linear-gradient(180deg, transparent 0%, #000 70%)',
      }}>
        <p style={{
          fontFamily: t.sans, fontWeight: 500, fontSize: 15, lineHeight: 1.45,
          letterSpacing: -0.2, color: t.textSec, margin: 0, textAlign: 'center', textWrap: 'pretty',
        }}>
          <span style={{ opacity: 0.4 }}>…the 1:1 with Marcus didn’t happen again. </span>
          <span style={{ opacity: 0.7 }}>I keep putting it on the calendar and then </span>
          <span style={{ color: t.text, opacity: 1 }}>moving it. That’s twice this week</span>
          <span style={{ color: t.primary, animation: 'acuity-pulse-soft 0.9s ease-in-out infinite', fontWeight: 700 }}>|</span>
        </p>
      </div>

      {/* Waveform */}
      <div style={{
        position: 'absolute', bottom: 158, left: 28, right: 28, padding: '8px 0',
      }}>
        <Waveform t={t} />
      </div>

      {/* Controls */}
      <div style={{
        position: 'absolute', bottom: 36, left: 0, right: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 26,
      }}>
        <button style={{
          width: 60, height: 60, borderRadius: 30, border: 'none', cursor: 'pointer',
          background: t.mode === 'dark' ? 'oklch(1 0 0 / 0.10)' : 'oklch(0 0 0 / 0.06)',
          backdropFilter: 'blur(20px) saturate(180%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <AcuityIcons.pause color={t.text} size={20} />
        </button>
        <button style={{
          width: 86, height: 86, borderRadius: 43, border: 'none', cursor: 'pointer',
          background: `radial-gradient(circle at 35% 30%, oklch(0.72 0.18 25), oklch(0.55 0.20 25))`,
          boxShadow: `0 16px 40px oklch(0.55 0.20 25 / 0.5),
            inset 0 -4px 12px oklch(0 0 0 / 0.2), inset 0 2px 8px oklch(1 0 0 / 0.3)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ width: 26, height: 26, borderRadius: 6, background: '#fff' }} />
        </button>
        <button style={{
          width: 60, height: 60, borderRadius: 30, border: 'none', cursor: 'pointer',
          background: t.gradPrimary,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: t.sans, fontSize: 13, fontWeight: 700,
          color: '#fff', letterSpacing: -0.1,
          boxShadow: t.glowPrimary,
        }}>
          Done
        </button>
      </div>
    </AcuityDevice>
  );
}

Object.assign(window, { RecordingScreen, Waveform });
