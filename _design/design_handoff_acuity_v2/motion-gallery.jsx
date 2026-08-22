// motion-gallery.jsx — Acuity animation demos with replay buttons.
// Each card is a small isolated demo. Press "Replay" to reset the
// animation. Designed to communicate motion intent to engineering.

const t = makeAcuityTokens({ dark: true, accent: 'coral' });

function App() {
  return (
    <div>
      <Header />
      <div className="grid">
        <Card title="1 · Voice-reactive orb" caption="Recording. Orb scales + glows with simulated mic amplitude. Replaces the static breath."
          spec="scale 1.0–1.18 · glow 0.4–0.85 · smoothed via easeStandard">
          <VoiceOrbDemo />
        </Card>

        <Card title="2 · Theme map solar-system entrance" caption="Planets drift in slowly, spiralling inward with one revolution before settling into orbit. Inner first, outer last."
          spec="6.0s · easeInOutCubic · staggered 300ms · 1.45× → 1.0 radius, −1 rev spin">
          <PlanetEntranceDemo />
        </Card>

        <Card title="3 · Life Matrix radar morph" caption="Polygon tweens from last-week shape to this-week shape on load."
          spec="650ms · easeEnter · pathTween (12-vertex interp)">
          <RadarMorphDemo />
        </Card>

        <Card title="4 · Stat count-up" caption="Hero numbers tick from 0 to value on focus. Ring fills in sync."
          spec="850ms · easeOut · monospace numerals to prevent jitter">
          <CountUpDemo />
        </Card>

        <Card title="5 · Achievement unlock" caption="New medallion gets a one-shot gold shimmer sweep + spring bounce-in. JUST NOW pulses 30s."
          spec="bounce 420ms · shimmer 1.4s sweep · single pass">
          <AchievementDemo />
        </Card>

        <Card title="6 · Task check + finish-day celebration" caption="Things-3 spring + strike sweep. When it's the LAST task of the day, confetti bursts as a quiet easter egg. Optional haptic in settings."
          spec="check 380ms spring · strike 280ms · confetti 18 particles · haptic light (opt-in)">
          <TaskCheckDemo />
        </Card>

        <Card title="7 · Streak tier fill" caption="When streak ticks up, progress bar fills with brief +1 floater above the number."
          spec="bar 520ms easeStandard · +1 lifts -16px, fades 700ms">
          <StreakFillDemo />
        </Card>

        <Card title="8 · Mic FAB breathe" caption="Idle gentle glow breath. Press scales 0.96 with haptic; releases with overshoot."
          spec="breath 4s · press 120ms · release spring(stiffness 320)">
          <MicFabDemo />
        </Card>

        <Card title="9 · Page transition" caption="All screen pushes use a soft cross-fade + 1.02 → 1.0 scale. Consistent across the app."
          spec="280ms · easeStandard · cross-fade + scale">
          <PageTransitionDemo />
        </Card>
      </div>
      <footer style={{
        textAlign: 'center', padding: '20px 0 60px',
        fontFamily: t.mono, fontSize: 10, letterSpacing: 1.6,
        color: t.textTer, textTransform: 'uppercase',
      }}>Acuity \u00b7 Motion Intent</footer>
    </div>
  );
}

function Header() {
  return (
    <div style={{
      maxWidth: 1200, margin: '0 auto', padding: '60px 32px 8px',
      borderBottom: `0.5px solid ${t.line}`,
    }}>
      <div style={{
        fontFamily: t.mono, fontSize: 10, letterSpacing: 1.6,
        textTransform: 'uppercase', color: t.textTer, marginBottom: 14,
      }}>Motion gallery \u00b7 v1</div>
      <h1 style={{
        fontFamily: t.display, fontSize: 36, fontWeight: 700,
        letterSpacing: -0.8, color: t.text, margin: '0 0 10px', lineHeight: 1.05,
      }}>How Acuity moves.</h1>
      <p style={{
        fontFamily: t.sans, fontSize: 15, lineHeight: 1.55,
        color: t.textSec, margin: '0 0 14px', maxWidth: 640,
      }}>
        Nine motion moments that turn the visual refresh into a feeling app. Press <em>Replay</em> on any card.
        Easing curves and durations are the engineering spec \u2014 every value listed should ship as-is.
      </p>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 12, padding: '14px 0 28px',
        fontFamily: t.mono, fontSize: 11, color: t.textTer,
      }}>
        <span><b style={{ color: t.text }}>easeStandard</b> cubic-bezier(.32,.72,0,1) \u00b7 280ms</span>
        <span><b style={{ color: t.text }}>easeEnter</b> cubic-bezier(.16,.9,.3,1) \u00b7 340ms</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Card chrome
// ─────────────────────────────────────────────────────────────
function Card({ title, caption, spec, children }) {
  const [key, setKey] = React.useState(0);
  return (
    <div style={{
      borderRadius: 24, background: t.cardBg, border: `0.5px solid ${t.line}`,
      boxShadow: t.shadowSoft, overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      <div key={key} style={{
        height: 220, position: 'relative', overflow: 'hidden',
        background: `radial-gradient(circle at 50% 35%, ${t.bgSub} 0%, ${t.bg} 100%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{children}</div>
      <div style={{ padding: '16px 18px 16px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8,
        }}>
          <h3 style={{
            fontFamily: t.display, fontSize: 15, fontWeight: 700,
            color: t.text, letterSpacing: -0.2, margin: 0,
          }}>{title}</h3>
          <button onClick={() => setKey((k) => k + 1)} style={{
            padding: '6px 12px', borderRadius: 999, border: `0.5px solid ${t.lineStrong}`,
            background: 'oklch(1 0 0 / 0.04)', color: t.text,
            fontFamily: t.sans, fontSize: 11, fontWeight: 600, cursor: 'pointer',
            letterSpacing: -0.1,
          }}>Replay \u21bb</button>
        </div>
        <p style={{
          fontFamily: t.sans, fontSize: 12.5, lineHeight: 1.45,
          color: t.textSec, margin: '0 0 8px', textWrap: 'pretty',
        }}>{caption}</p>
        <div style={{
          fontFamily: t.mono, fontSize: 10, color: t.textTer, letterSpacing: 0.3,
        }}>{spec}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Demo 1 — Voice-reactive orb
// ─────────────────────────────────────────────────────────────
function VoiceOrbDemo() {
  const [amp, setAmp] = React.useState(0.4);
  React.useEffect(() => {
    let raf, start = performance.now();
    const tick = (now) => {
      const tSec = (now - start) / 1000;
      // Simulated speech: layered sine + noise pulses
      const base = 0.45 + 0.25 * Math.sin(tSec * 1.7);
      const burst = 0.2 * Math.max(0, Math.sin(tSec * 5.3));
      const noise = (Math.random() - 0.5) * 0.08;
      setAmp(Math.max(0.25, Math.min(1, base + burst + noise)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const scale = 1 + amp * 0.18;
  return (
    <div style={{ position: 'relative', width: 120, height: 120 }}>
      <div style={{
        position: 'absolute', inset: -16, borderRadius: '50%',
        background: `radial-gradient(circle, ${t.primary} 0%, transparent 65%)`,
        opacity: 0.3 + amp * 0.55, filter: 'blur(18px)',
        transform: `scale(${1 + amp * 0.3})`,
        transition: 'opacity 80ms linear, transform 80ms linear',
      }} />
      <div style={{
        position: 'absolute', inset: 0, borderRadius: '50%',
        background: `radial-gradient(circle at 35% 30%, ${t.primaryHi}, ${t.primary} 50%, ${t.secondary})`,
        boxShadow: `0 12px 30px oklch(${t._primary[0]} ${t._primary[1]} ${t._primary[2]} / 0.5),
          inset 0 -4px 12px oklch(0 0 0 / 0.25), inset 0 2px 10px oklch(1 0 0 / 0.4)`,
        transform: `scale(${scale})`,
        transition: 'transform 60ms linear',
      }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Demo 2 — Planet entrance sweep
// ─────────────────────────────────────────────────────────────
// Solar-system entrance: planets spiral in from far out, doing ~1.5
// revolutions around the center while their radius shrinks to final.
// Stagger so they arrive in waves — inner first, outer last.
function PlanetEntranceDemo() {
  const planets = [
    { hue: 295, size: 36, finalAngle: 30,  finalR: 48,  delay: 0    },
    { hue: 25,  size: 30, finalAngle: 200, finalR: 66,  delay: 0.30 },
    { hue: 165, size: 24, finalAngle: 130, finalR: 84,  delay: 0.60 },
    { hue: 60,  size: 18, finalAngle: 320, finalR: 96,  delay: 0.90 },
  ];
  const dur = 6000;
  const [now, setNow] = React.useState(0);
  React.useEffect(() => {
    let raf, start = performance.now();
    const tick = (ts) => { setNow(ts - start); if (ts - start < dur + 1500) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  // Quicker accel after fade-in, long quiet settle (easeOutCubic).
  const ease = (k) => 1 - Math.pow(1 - k, 3);
  return (
    <svg viewBox="-150 -150 300 300" style={{ width: 220, height: 220 }}>
      <defs>
        <radialGradient id="pe-c" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={t.primary} stopOpacity="0.45"/>
          <stop offset="100%" stopColor={t.primary} stopOpacity="0"/>
        </radialGradient>
        <linearGradient id="pe-you" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={t.primary}/>
          <stop offset="100%" stopColor={t.secondary}/>
        </linearGradient>
      </defs>
      <circle cx="0" cy="0" r="38" fill="url(#pe-c)" />
      <circle cx="0" cy="0" r="16" fill="url(#pe-you)" />
      <text x="0" y="0" textAnchor="middle" dominantBaseline="central"
        style={{ fontFamily: t.display, fontSize: 13, fontWeight: 800, fill: '#fff' }}>J</text>
      {planets.map((p, i) => {
        const localT = Math.max(0, Math.min(1, (now - p.delay * 1000) / dur));
        const e = ease(localT);
        // 1 revolution of spin (-360°), radius drifts from 1.45× final → final
        const angle = p.finalAngle + (-360) * (1 - e);
        const r = p.finalR * (1 + 0.45 * (1 - e));
        const rad = (angle * Math.PI) / 180;
        const x = Math.cos(rad) * r;
        const y = Math.sin(rad) * r;
        return (
          <circle key={i} cx={x} cy={y} r={p.size / 2}
            fill={`oklch(0.66 0.16 ${p.hue})`}
            opacity={Math.min(1, localT * 3.2)} />
        );
      })}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Demo 3 — Radar morph
// ─────────────────────────────────────────────────────────────
function RadarMorphDemo() {
  const last = [60, 55, 78, 50, 48, 60, 62, 50, 52, 65, 58, 70];
  const cur  = [78, 54, 82, 61, 48, 66, 73, 58, 44, 70, 64, 76];
  const R = 80;
  const toPts = (arr) => arr.map((v, i) => {
    const a = (i / arr.length) * Math.PI * 2 - Math.PI / 2;
    const r = (v / 100) * R;
    return [Math.cos(a) * r, Math.sin(a) * r];
  }).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [points, setPoints] = React.useState(toPts(last));
  React.useEffect(() => {
    setPoints(toPts(last));
    const id = setTimeout(() => setPoints(toPts(cur)), 80);
    return () => clearTimeout(id);
  }, []);
  return (
    <svg viewBox="-100 -100 200 200" style={{ width: 200, height: 200 }}>
      <defs>
        <radialGradient id="rm-fill" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={t.primary} stopOpacity="0.65"/>
          <stop offset="100%" stopColor={t.secondary} stopOpacity="0.15"/>
        </radialGradient>
        <linearGradient id="rm-stroke">
          <stop offset="0%" stopColor={t.primary}/>
          <stop offset="100%" stopColor={t.secondary}/>
        </linearGradient>
      </defs>
      {/* ring guides */}
      {[0.25, 0.5, 0.75, 1].map((p, i) => (
        <circle key={i} cx={0} cy={0} r={R * p} fill="none" stroke={t.line} strokeWidth={0.5} />
      ))}
      <polygon points={points}
        fill="url(#rm-fill)" stroke="url(#rm-stroke)" strokeWidth={1.5}
        style={{ transition: 'all 650ms cubic-bezier(.16,.9,.3,1)' }} />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Demo 4 — Count-up
// ─────────────────────────────────────────────────────────────
function CountUpDemo() {
  const target = 67;
  const [v, setV] = React.useState(0);
  React.useEffect(() => {
    setV(0);
    const start = performance.now(), dur = 850;
    let raf;
    const tick = (now) => {
      const k = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      setV(target * eased);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const r = 50, c = 2 * Math.PI * r, off = c * (1 - v / 100);
  return (
    <div style={{ position: 'relative', width: 120, height: 120 }}>
      <svg width="120" height="120" style={{ transform: 'rotate(-90deg)' }}>
        <defs>
          <linearGradient id="cu-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={t.primary} />
            <stop offset="100%" stopColor={t.secondary} />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r={r} fill="none" stroke={t.line} strokeWidth={8} />
        <circle cx="60" cy="60" r={r} fill="none" stroke="url(#cu-g)" strokeWidth={8}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: t.display, fontSize: 34, fontWeight: 800,
        color: t.text, letterSpacing: -1.3, fontVariantNumeric: 'tabular-nums',
      }}>{Math.round(v)}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Demo 5 — Achievement unlock
// ─────────────────────────────────────────────────────────────
function AchievementDemo() {
  return (
    <div style={{
      width: 150, padding: 14, borderRadius: 20,
      background: t.cardBg, border: `0.5px solid ${t.line}`,
      position: 'relative', overflow: 'hidden',
      animation: 'mg-bounce-in 420ms cubic-bezier(.16,.9,.3,1) both',
    }}>
      {/* shimmer sweep overlay */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 20,
        background: `linear-gradient(110deg, transparent 30%, oklch(1 0 0 / 0.35) 50%, transparent 70%)`,
        backgroundSize: '200% 100%',
        animation: 'mg-shimmer 1.4s ease-in-out 0.25s 1 both',
        pointerEvents: 'none',
      }} />
      <div style={{
        width: 40, height: 40, borderRadius: 20,
        background: `linear-gradient(135deg, oklch(0.84 0.155 38), oklch(0.66 0.155 38))`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff">
          <path d="M12 2.5c.5 3 3 4.3 3 7.4 0 1.8-1 3.2-2.4 3.2-1 0-1.7-.6-1.7-1.5 0-1.2.9-1.4.9-2.6 0-1-.8-1.4-1.5-.5-1.8 2-2.8 3.7-2.8 5.9C7.5 17.6 9.6 20 12 20s4.5-2.4 4.5-5.6c0-4.8-4.5-6.6-4.5-11.9z"/>
        </svg>
      </div>
      <div style={{
        fontFamily: t.display, fontSize: 14, fontWeight: 700,
        color: t.text, marginTop: 12, lineHeight: 1.2, letterSpacing: -0.2,
      }}>14 nights</div>
      <div style={{
        fontFamily: t.mono, fontSize: 10, color: t.primary, marginTop: 4,
        letterSpacing: 0.6, fontWeight: 700,
        animation: 'mg-pulse-soft 1.4s ease-in-out infinite',
      }}>JUST NOW</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Demo 6 — Task check + finish-day confetti celebration
// ─────────────────────────────────────────────────────
function TaskCheckDemo() {
  const [done, setDone] = React.useState(false);
  const [particles, setParticles] = React.useState([]);

  React.useEffect(() => {
    setDone(false);
    setParticles([]);
    const id = setTimeout(() => {
      setDone(true);
      const colors = [t.primary, t.secondary, t.good, 'oklch(0.74 0.16 60)', 'oklch(0.72 0.16 25)'];
      const next = Array.from({ length: 18 }).map((_, i) => {
        const angle = -Math.PI * (0.15 + Math.random() * 0.7); // fan upward
        const speed = 90 + Math.random() * 80;
        return {
          id: i,
          color: colors[i % colors.length],
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          rot: Math.random() * 720 - 360,
          size: 5 + Math.random() * 4,
          shape: i % 3 === 0 ? 'round' : 'square',
        };
      });
      setParticles(next);
    }, 400);
    return () => clearTimeout(id);
  }, []);

  return (
    <div style={{
      width: 280, padding: '14px 16px', borderRadius: 18,
      background: t.cardBg, border: `0.5px solid ${t.line}`,
      display: 'flex', alignItems: 'center', gap: 12,
      position: 'relative',
    }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{
          width: 24, height: 24, borderRadius: 12,
          background: done ? t.gradMix : 'transparent',
          border: done ? 'none' : '1.5px solid oklch(1 0 0 / 0.22)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 380ms cubic-bezier(.16,.9,.3,1), border 100ms ease',
        }}>
          {done && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"
              style={{ animation: 'mg-check-spring 380ms cubic-bezier(.16,.9,.3,1) both' }}>
              <path d="M5 12.5 10 17l9-10" />
            </svg>
          )}
        </div>
        {particles.map((p) => (
          <div key={p.id} style={{
            position: 'absolute', left: 12, top: 12,
            width: p.size, height: p.size,
            background: p.color,
            borderRadius: p.shape === 'round' ? '50%' : 2,
            animation: `mg-confetti-${p.id} 1400ms cubic-bezier(.2,.6,.4,1) both`,
            pointerEvents: 'none',
          }} />
        ))}
        {particles.length > 0 && (
          <style>{particles.map((p) => `
            @keyframes mg-confetti-${p.id} {
              0%   { transform: translate(-50%, -50%) translate(0px, 0px) rotate(0deg); opacity: 1; }
              60%  { opacity: 1; }
              100% { transform: translate(-50%, -50%) translate(${p.vx}px, ${p.vy + 220}px) rotate(${p.rot}deg); opacity: 0; }
            }`).join('\n')}</style>
        )}
      </div>
      <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: t.sans, fontSize: 15, color: done ? t.textTer : t.text,
          letterSpacing: -0.2, lineHeight: 1.3,
          transition: 'color 280ms ease',
        }}>Reply to Mira about Dad’s appointment</div>
        {done && (
          <div style={{
            position: 'absolute', top: '50%', left: 0,
            height: 1.5, background: t.textTer, opacity: 0.7,
            transform: 'translateY(-50%)',
            animation: 'mg-strike 280ms cubic-bezier(.32,.72,0,1) 100ms both',
          }} />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Demo 7 — Streak tier fill + plus-one floater
// ─────────────────────────────────────────────────────────────
function StreakFillDemo() {
  const [pct, setPct] = React.useState(13 / 21);
  const [showPlus, setShowPlus] = React.useState(false);
  React.useEffect(() => {
    setPct(13 / 21);
    setShowPlus(false);
    const a = setTimeout(() => { setPct(14 / 21); setShowPlus(true); }, 300);
    const b = setTimeout(() => setShowPlus(false), 1200);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);
  return (
    <div style={{
      width: 240, padding: 16, borderRadius: 20,
      background: t.cardBg, border: `0.5px solid ${t.line}`,
      position: 'relative',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, position: 'relative' }}>
        <div style={{
          fontFamily: t.display, fontSize: 38, fontWeight: 800,
          color: t.text, letterSpacing: -1.4, lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
        }}>14</div>
        <span style={{ fontFamily: t.sans, fontSize: 13, color: t.textTer }}>nights</span>
        {showPlus && (
          <span style={{
            position: 'absolute', left: 36, top: -4,
            fontFamily: t.mono, fontSize: 13, fontWeight: 700, color: t.good,
            animation: 'mg-fade-in-up 700ms ease both',
          }}>+1</span>
        )}
      </div>
      <div style={{
        fontFamily: t.mono, fontSize: 10, color: t.textTer,
        textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 12, fontWeight: 700,
      }}>Lv 4 · Reflective</div>
      <div style={{
        height: 6, borderRadius: 3, marginTop: 6, overflow: 'hidden',
        background: 'oklch(1 0 0 / 0.08)',
      }}>
        <div style={{
          height: '100%', width: `${pct * 100}%`,
          background: t.gradMix, borderRadius: 3,
          transition: 'width 520ms cubic-bezier(.32,.72,0,1)',
        }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Demo 8 — Mic FAB breathe + press
// ─────────────────────────────────────────────────────────────
function MicFabDemo() {
  const [pressed, setPressed] = React.useState(false);
  return (
    <button
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      style={{
        width: 76, height: 76, borderRadius: 38, border: 'none', cursor: 'pointer',
        background: t.gradPrimary,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transform: pressed ? 'scale(0.94)' : 'scale(1)',
        transition: pressed
          ? 'transform 120ms cubic-bezier(.32,.72,0,1)'
          : 'transform 340ms cubic-bezier(.16,.9,.3,1)',
        animation: 'mg-fab-breathe 4s ease-in-out infinite',
        border: `1px solid oklch(1 0 0 / 0.25)`,
      }}>
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="3" width="6" height="12" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      </svg>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Demo 9 — Page transition
// ─────────────────────────────────────────────────────────────
function PageTransitionDemo() {
  const [page, setPage] = React.useState('a');
  React.useEffect(() => {
    setPage('a');
    const id = setTimeout(() => setPage('b'), 500);
    return () => clearTimeout(id);
  }, []);
  const card = (label, hue, visible) => (
    <div style={{
      position: 'absolute', inset: 0, padding: 18, borderRadius: 14,
      background: `linear-gradient(135deg, oklch(0.30 0.10 ${hue} / 0.4), ${t.cardBg})`,
      border: `0.5px solid ${t.line}`,
      display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      opacity: visible ? 1 : 0,
      transform: visible ? 'scale(1)' : 'scale(1.02)',
      transition: 'opacity 280ms cubic-bezier(.32,.72,0,1), transform 280ms cubic-bezier(.32,.72,0,1)',
    }}>
      <div style={{ fontFamily: t.mono, fontSize: 10, color: t.textTer, letterSpacing: 1.0, textTransform: 'uppercase' }}>
        Screen {label.toUpperCase()}
      </div>
      <div style={{
        fontFamily: t.display, fontSize: 18, fontWeight: 700, color: t.text,
        letterSpacing: -0.3, marginTop: 4,
      }}>{label === 'a' ? 'Home' : 'Insights'}</div>
    </div>
  );
  return (
    <div style={{ position: 'relative', width: 160, height: 150 }}>
      {card('a', 38,  page === 'a')}
      {card('b', 285, page === 'b')}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
