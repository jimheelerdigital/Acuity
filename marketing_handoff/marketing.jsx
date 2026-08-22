// marketing.jsx — Acuity marketing home, rebuilt on the v2 app design system.
// Warm coral × violet, lifted-charcoal dark + clean light. Real app screens
// (Home / Theme Map / Life Matrix) mounted inside device frames so the site
// matches the actual product 1:1. Light default with a dark/light toggle.

const { useState, useEffect, useRef } = React;

// ── scroll reveal ────────────────────────────────────────────
function useReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const nodes = el.classList.contains('reveal')
      ? [el, ...el.querySelectorAll('.reveal')]
      : [...el.querySelectorAll('.reveal')];
    if (!('IntersectionObserver' in window)) {
      nodes.forEach((n) => n.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    nodes.forEach((n) => io.observe(n));
    // Safety net: promote anything already within the viewport on mount,
    // and guarantee everything resolves even if IO never fires.
    const promoteVisible = () => {
      nodes.forEach((n) => {
        const r = n.getBoundingClientRect();
        if (r.top < window.innerHeight * 0.96 && r.bottom > 0) n.classList.add('in');
      });
    };
    requestAnimationFrame(promoteVisible);
    const fallback = setTimeout(() => nodes.forEach((n) => n.classList.add('in')), 1600);
    return () => { io.disconnect(); clearTimeout(fallback); };
  }, []);
  return ref;
}

// ── device frame (scales a real 402×874 app screen) ──────────
function PhoneFrame({ children, scale = 0.72, t, halo = true }) {
  const w = 402, h = 874;
  return (
    <div style={{ position: 'relative', width: w * scale, height: h * scale }}>
      {halo && (
        <div style={{
          position: 'absolute', inset: '-12% -18%', zIndex: 0, pointerEvents: 'none',
          background: `radial-gradient(60% 50% at 50% 38%, ${t.primary}33 0%, transparent 70%),
                       radial-gradient(55% 45% at 70% 65%, ${t.secondary}2e 0%, transparent 70%)`,
          filter: 'blur(20px)',
        }} />
      )}
      <div style={{
        position: 'absolute', top: 0, left: 0, width: w, height: h,
        transform: `scale(${scale})`, transformOrigin: 'top left', zIndex: 1,
      }}>
        {children}
      </div>
    </div>
  );
}

// ── primitives ───────────────────────────────────────────────
function Btn({ children, t, kind = 'primary', href = '#start', style = {} }) {
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 9,
    fontFamily: t.sans, fontWeight: 700, fontSize: 16, letterSpacing: -0.2,
    padding: '15px 26px', borderRadius: t.radius.pill, cursor: 'pointer',
    transition: `transform .2s ${t.easeStandard}, box-shadow .2s`, border: '0.5px solid transparent',
    ...style,
  };
  const kinds = {
    primary: { background: t.gradPrimary, color: '#fff', boxShadow: t.glowPrimary, borderColor: 'oklch(1 0 0 / 0.25)' },
    ghost: { background: t.mode === 'dark' ? 'oklch(1 0 0 / 0.06)' : 'oklch(1 0 0 / 0.7)', color: t.text, borderColor: t.lineStrong, boxShadow: t.shadowSoft },
  };
  return (
    <a href={href} style={{ ...base, ...kinds[kind] }}
       onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
       onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; }}>
      {children}
    </a>
  );
}

function Eyebrow({ children, t, color }) {
  return (
    <div style={{
      fontFamily: t.mono, fontSize: 12, fontWeight: 600, letterSpacing: 2.4,
      textTransform: 'uppercase', color: color || t.primary, marginBottom: 18,
    }}>{children}</div>
  );
}

function Stars({ t, size = 14 }) {
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {[0,1,2,3,4].map((i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" fill={t.primary}>
          <path d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 23l-5.9 3.3 1.3-6.5L2.5 9.3l6.6-.8z" transform="scale(0.96) translate(0.5 -0.5)"/>
        </svg>
      ))}
    </span>
  );
}

// ── badge (from badge-system.js) ─────────────────────────────
function Badge({ slug, size = 96 }) {
  const cfg = (window.BADGES || []).find((b) => b.slug === slug);
  if (!cfg || !window.renderBadge) return null;
  const svg = window.renderBadge(cfg, 'earned', { colorway: 'tiered' });
  return <div style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg.replace('width="200" height="200"', `width="${size}" height="${size}"`) }} />;
}

// ─────────────────────────────────────────────────────────────
// NAV
// ─────────────────────────────────────────────────────────────
function Nav({ t, dark, setDark }) {
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 100,
      borderBottom: `0.5px solid ${t.line}`,
      background: t.mode === 'dark' ? 'oklch(0.21 0.022 285 / 0.72)' : 'oklch(0.985 0.005 285 / 0.72)',
      backdropFilter: 'blur(20px) saturate(180%)', WebkitBackdropFilter: 'blur(20px) saturate(180%)',
    }}>
      <div style={{
        maxWidth: 1180, margin: '0 auto', padding: '15px 28px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <a href="#top" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 26, height: 26, borderRadius: 9, background: t.gradPrimary,
            boxShadow: t.glowSoft, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ width: 8, height: 8, borderRadius: 5, background: '#fff', opacity: 0.95 }} />
          </div>
          <span style={{ fontFamily: t.display, fontWeight: 800, fontSize: 20, letterSpacing: -0.4, color: t.text }}>Acuity</span>
        </a>

        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <div style={{ display: 'flex', gap: 26 }} className="nav-links">
            {[['Features', '#features'], ['How it works', '#how'], ['Pricing', '#pricing']].map(([l, h]) => (
              <a key={l} href={h} style={{ fontFamily: t.sans, fontSize: 14.5, fontWeight: 500, color: t.textSec }}>{l}</a>
            ))}
          </div>
          <button onClick={() => setDark(!dark)} aria-label="Toggle theme" style={{
            width: 38, height: 38, borderRadius: 999, cursor: 'pointer',
            border: `0.5px solid ${t.lineStrong}`, background: t.mode === 'dark' ? 'oklch(1 0 0 / 0.06)' : 'oklch(1 0 0 / 0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.text,
          }}>
            {dark ? (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8"/></svg>
            ) : (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>
            )}
          </button>
          <a href="#start" style={{
            fontFamily: t.sans, fontWeight: 700, fontSize: 14.5, color: '#fff',
            background: t.gradPrimary, padding: '10px 18px', borderRadius: 999, boxShadow: t.glowSoft,
          }}>Start free trial</a>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// HERO
// ─────────────────────────────────────────────────────────────
function Hero({ t, tDark }) {
  const ref = useReveal();
  const chip = (label, hue, top, left, delay) => (
    <div style={{
      position: 'absolute', top, left, zIndex: 3,
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '9px 14px', borderRadius: 999, fontFamily: t.sans, fontWeight: 600, fontSize: 13,
      color: t.text, background: t.mode === 'dark' ? 'oklch(0.26 0.02 285 / 0.9)' : 'oklch(1 0 0 / 0.95)',
      border: `0.5px solid ${t.lineStrong}`, boxShadow: t.shadowLift,
      backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
      animation: `float-chip ${5 + delay}s ease-in-out ${delay}s infinite`,
    }}>
      <span style={{ width: 8, height: 8, borderRadius: 5, background: `linear-gradient(135deg, oklch(0.78 0.16 ${hue}), oklch(0.55 0.16 ${hue}))` }} />
      {label}
    </div>
  );

  return (
    <div ref={ref} id="top" style={{ position: 'relative', overflow: 'hidden', background: t.heroGrad }}>
      <div style={{
        maxWidth: 1180, margin: '0 auto', padding: '72px 28px 90px',
        display: 'grid', gridTemplateColumns: '1.06fr 0.94fr', gap: 40, alignItems: 'center',
      }} className="hero-grid">
        {/* copy */}
        <div className="reveal">
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 9, marginBottom: 22,
            padding: '7px 14px 7px 8px', borderRadius: 999,
            background: t.mode === 'dark' ? 'oklch(1 0 0 / 0.06)' : 'oklch(1 0 0 / 0.7)',
            border: `0.5px solid ${t.lineStrong}`, boxShadow: t.shadowSoft,
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: t.gradMixSoft, padding: '3px 9px', borderRadius: 999 }}>
              <Stars t={t} size={12} />
            </span>
            <span style={{ fontFamily: t.sans, fontSize: 13, fontWeight: 600, color: t.textSec }}>4.9 · The AI voice journal</span>
          </div>

          <h1 style={{
            fontFamily: t.display, fontWeight: 800, fontSize: 60, lineHeight: 1.02,
            letterSpacing: -2, margin: '0 0 22px', color: t.text, textWrap: 'balance',
          }}>
            One minute a day.<br/>
            <span style={{
              background: t.gradMix, WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>A life of clarity.</span>
          </h1>

          <p style={{
            fontFamily: t.sans, fontSize: 19, lineHeight: 1.55, color: t.textSec,
            margin: '0 0 32px', maxWidth: 480, textWrap: 'pretty',
          }}>
            Acuity is the voice journal that listens. Talk through your day — it catches your
            tasks, tracks your goals, and surfaces the patterns you can’t see on your own.
          </p>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <Btn t={t} kind="primary">
              Start free trial
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            </Btn>
            <Btn t={t} kind="ghost" href="#how">See how it works</Btn>
          </div>
          <div style={{ fontFamily: t.sans, fontSize: 14, color: t.textTer, marginTop: 18 }}>
            No credit card · 14-day free trial · iPhone
          </div>
        </div>

        {/* phone */}
        <div className="reveal" style={{ display: 'flex', justifyContent: 'center', position: 'relative', transitionDelay: '.12s' }}>
          <PhoneFrame t={tDark} scale={0.66}>
            <HomeDashboard t={tDark} />
          </PhoneFrame>
          {chip('Task → Career', 295, '14%', '-4%', 0.4)}
          {chip('Mood +5', 165, '62%', '-8%', 1.1)}
          {chip('14-night streak', 25, '40%', '86%', 0.8)}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// HOW IT WORKS
// ─────────────────────────────────────────────────────────────
function HowItWorks({ t }) {
  const ref = useReveal();
  const steps = [
    { n: '01', icon: 'mic', title: 'Record your day', body: 'Tap once and talk for 60 seconds — any time, no prompts, no typing. Just your voice.', hue: 38 },
    { n: '02', icon: 'sparkle', title: 'AI does the sorting', body: 'Acuity transcribes and pulls out your tasks, goals, themes, and mood automatically.', hue: 295 },
    { n: '03', icon: 'insights', title: 'See yourself clearly', body: 'Every Sunday, a weekly report reveals the patterns quietly forming across your life.', hue: 165 },
  ];
  return (
    <div ref={ref} id="how" style={{ background: t.bg, padding: '96px 28px' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <div className="reveal" style={{ textAlign: 'center', marginBottom: 56 }}>
          <Eyebrow t={t}>How Acuity works</Eyebrow>
          <h2 style={{ fontFamily: t.display, fontWeight: 800, fontSize: 42, letterSpacing: -1.2, margin: 0, color: t.text }}>
            Three steps. Then it’s automatic.
          </h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }} className="steps-grid">
          {steps.map((s, i) => {
            const Icon = AcuityIcons[s.icon];
            return (
              <div key={s.n} className="reveal" style={{
                transitionDelay: `${i * 0.1}s`,
                background: t.cardBg, border: `0.5px solid ${t.cardBorder}`, borderRadius: t.radius.xl,
                padding: '32px 28px', boxShadow: t.shadowSoft, position: 'relative', overflow: 'hidden',
              }}>
                <div style={{
                  position: 'absolute', top: -40, right: -30, width: 150, height: 150, borderRadius: '50%',
                  background: `radial-gradient(circle, oklch(0.7 0.14 ${s.hue} / 0.16) 0%, transparent 70%)`,
                }} />
                <div style={{
                  width: 52, height: 52, borderRadius: 16, marginBottom: 22,
                  background: `linear-gradient(135deg, oklch(0.74 0.15 ${s.hue}), oklch(0.6 0.16 ${s.hue}))`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: `0 6px 18px oklch(0.62 0.16 ${s.hue} / 0.3)`,
                }}>
                  <Icon color="#fff" size={26} weight={1.9} />
                </div>
                <div style={{ fontFamily: t.mono, fontSize: 13, fontWeight: 600, color: t.textTer, letterSpacing: 1, marginBottom: 8 }}>{s.n}</div>
                <h3 style={{ fontFamily: t.display, fontWeight: 700, fontSize: 22, letterSpacing: -0.5, margin: '0 0 10px', color: t.text }}>{s.title}</h3>
                <p style={{ fontFamily: t.sans, fontSize: 15.5, lineHeight: 1.55, color: t.textSec, margin: 0, textWrap: 'pretty' }}>{s.body}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// FEATURE ROW (alternating)
// ─────────────────────────────────────────────────────────────
function FeatureRow({ t, phoneTokens, Screen, eyebrow, title, body, points, flip, hue }) {
  const ref = useReveal();
  const copy = (
    <div className="reveal" style={{ maxWidth: 460 }}>
      <Eyebrow t={t} color={`oklch(0.7 0.16 ${hue})`}>{eyebrow}</Eyebrow>
      <h2 style={{ fontFamily: t.display, fontWeight: 800, fontSize: 38, letterSpacing: -1, lineHeight: 1.08, margin: '0 0 18px', color: t.text, textWrap: 'balance' }}>{title}</h2>
      <p style={{ fontFamily: t.sans, fontSize: 18, lineHeight: 1.55, color: t.textSec, margin: '0 0 24px', textWrap: 'pretty' }}>{body}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
        {points.map((p) => (
          <div key={p} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{
              width: 24, height: 24, borderRadius: 8, flexShrink: 0, marginTop: 1,
              background: `linear-gradient(135deg, oklch(0.74 0.15 ${hue}), oklch(0.6 0.16 ${hue}))`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5 10 17l9-10"/></svg>
            </div>
            <span style={{ fontFamily: t.sans, fontSize: 16, lineHeight: 1.45, color: t.text, fontWeight: 500 }}>{p}</span>
          </div>
        ))}
      </div>
    </div>
  );
  const phone = (
    <div className="reveal" style={{ display: 'flex', justifyContent: 'center', transitionDelay: '.1s' }}>
      <PhoneFrame t={phoneTokens} scale={0.62}>
        <Screen t={phoneTokens} />
      </PhoneFrame>
    </div>
  );
  return (
    <div ref={ref} style={{ background: t.bg, padding: '64px 28px' }}>
      <div style={{
        maxWidth: 1080, margin: '0 auto', display: 'grid',
        gridTemplateColumns: '1fr 1fr', gap: 56, alignItems: 'center',
      }} className="feature-grid">
        {flip ? <React.Fragment>{phone}{copy}</React.Fragment> : <React.Fragment>{copy}{phone}</React.Fragment>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CONSISTENCY / BADGES
// ─────────────────────────────────────────────────────────────
function Consistency({ t }) {
  const ref = useReveal();
  const badges = ['first_night', 'week_one', 'month', 'hundred', 'goal_crusher'];
  return (
    <div ref={ref} style={{ background: t.bgSub, padding: '92px 28px', borderTop: `0.5px solid ${t.line}`, borderBottom: `0.5px solid ${t.line}` }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', textAlign: 'center' }}>
        <div className="reveal">
          <Eyebrow t={t}>Showing up, rewarded</Eyebrow>
          <h2 style={{ fontFamily: t.display, fontWeight: 800, fontSize: 40, letterSpacing: -1.2, margin: '0 0 16px', color: t.text, textWrap: 'balance' }}>
            Consistency you can feel.
          </h2>
          <p style={{ fontFamily: t.sans, fontSize: 18, lineHeight: 1.55, color: t.textSec, maxWidth: 540, margin: '0 auto 48px', textWrap: 'pretty' }}>
            Earn warm, hand-crafted milestones as your streak grows — bronze to diamond. No noisy badges, no kitsch. Just a quiet nudge to keep your nightly minute.
          </p>
        </div>
        <div className="reveal" style={{ display: 'flex', justifyContent: 'center', gap: 28, flexWrap: 'wrap', transitionDelay: '.1s' }}>
          {badges.map((slug, i) => (
            <div key={slug} style={{ animation: `float-chip ${5 + i * 0.4}s ease-in-out ${i * 0.3}s infinite` }}>
              <Badge slug={slug} size={104} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PRICING
// ─────────────────────────────────────────────────────────────
function Pricing({ t }) {
  const ref = useReveal();
  const feats = ['Unlimited voice entries', 'AI tasks, goals & themes', 'Weekly insight report', 'Cosmic Theme Map', '12-axis Life Matrix', 'Every achievement badge'];
  return (
    <div ref={ref} id="pricing" style={{ background: t.bg, padding: '96px 28px' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        <div className="reveal" style={{ textAlign: 'center', marginBottom: 50 }}>
          <Eyebrow t={t}>Pricing</Eyebrow>
          <h2 style={{ fontFamily: t.display, fontWeight: 800, fontSize: 42, letterSpacing: -1.2, margin: 0, color: t.text }}>
            One plan. Everything in.
          </h2>
        </div>
        <div className="reveal" style={{
          maxWidth: 460, margin: '0 auto', position: 'relative', overflow: 'hidden',
          background: t.cardBg, border: `0.5px solid ${t.cardBorder}`, borderRadius: t.radius.xl,
          padding: '40px 38px', boxShadow: t.shadowLift,
        }}>
          <div style={{ position: 'absolute', top: -60, right: -40, width: 220, height: 220, borderRadius: '50%', background: t.gradMixSoft, filter: 'blur(10px)' }} />
          <div style={{ position: 'relative' }}>
            <div style={{ fontFamily: t.display, fontWeight: 700, fontSize: 20, color: t.text, marginBottom: 6 }}>Acuity Pro</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
              <span style={{ fontFamily: t.display, fontWeight: 800, fontSize: 56, letterSpacing: -2, color: t.text }}>$4.99</span>
              <span style={{ fontFamily: t.sans, fontSize: 17, color: t.textSec }}>/ month</span>
            </div>
            <div style={{ fontFamily: t.sans, fontSize: 15, color: t.textTer, marginBottom: 28 }}>14-day free trial · cancel anytime</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 13, marginBottom: 30 }}>
              {feats.map((f) => (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                  <div style={{ width: 22, height: 22, borderRadius: 7, background: t.gradPrimary, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5 10 17l9-10"/></svg>
                  </div>
                  <span style={{ fontFamily: t.sans, fontSize: 16, color: t.text, fontWeight: 500 }}>{f}</span>
                </div>
              ))}
            </div>
            <Btn t={t} kind="primary" style={{ width: '100%', justifyContent: 'center' }}>Start free trial</Btn>
            <div style={{ fontFamily: t.sans, fontSize: 13.5, color: t.textTer, textAlign: 'center', marginTop: 14 }}>No credit card required</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// FINAL CTA + FOOTER
// ─────────────────────────────────────────────────────────────
function FinalCTA({ t }) {
  const ref = useReveal();
  return (
    <div ref={ref} id="start" style={{ background: t.bg, padding: '40px 28px 96px' }}>
      <div className="reveal" style={{
        maxWidth: 1080, margin: '0 auto', borderRadius: t.radius.xl, position: 'relative', overflow: 'hidden',
        padding: '72px 40px', textAlign: 'center',
        background: `radial-gradient(120% 120% at 0% 0%, ${t.primary} 0%, transparent 60%),
                     radial-gradient(120% 120% at 100% 100%, ${t.secondary} 0%, transparent 60%),
                     linear-gradient(135deg, ${t.primaryLo}, ${t.secondaryLo})`,
        boxShadow: t.glowPrimary,
      }}>
        <h2 style={{ fontFamily: t.display, fontWeight: 800, fontSize: 46, letterSpacing: -1.4, margin: '0 0 16px', color: '#fff', textWrap: 'balance' }}>
          Clarity starts tonight.
        </h2>
        <p style={{ fontFamily: t.sans, fontSize: 19, lineHeight: 1.5, color: 'oklch(1 0 0 / 0.88)', maxWidth: 480, margin: '0 auto 32px' }}>
          Your first entry takes one minute. Your first pattern shows up by Sunday.
        </p>
        <a href="#" style={{
          display: 'inline-flex', alignItems: 'center', gap: 9, fontFamily: t.sans, fontWeight: 700, fontSize: 17,
          padding: '16px 32px', borderRadius: 999, background: '#fff', color: t.primaryLo, boxShadow: '0 12px 30px oklch(0 0 0 / 0.2)',
        }}>
          Start your free trial
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        </a>
      </div>
    </div>
  );
}

function Footer({ t }) {
  const cols = [
    ['Product', ['Features', 'How it works', 'Pricing', 'Download']],
    ['Company', ['About', 'Privacy', 'Terms', 'Support']],
  ];
  return (
    <div style={{ background: t.bgInset, borderTop: `0.5px solid ${t.line}`, padding: '56px 28px 40px' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 32 }} className="footer-grid">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 24, height: 24, borderRadius: 8, background: t.gradPrimary }} />
            <span style={{ fontFamily: t.display, fontWeight: 800, fontSize: 19, color: t.text }}>Acuity</span>
          </div>
          <p style={{ fontFamily: t.sans, fontSize: 14.5, lineHeight: 1.55, color: t.textTer, maxWidth: 260, margin: 0 }}>
            The AI voice journal for your daily debrief. One minute a day, a life of clarity.
          </p>
        </div>
        {cols.map(([head, links]) => (
          <div key={head}>
            <div style={{ fontFamily: t.mono, fontSize: 12, fontWeight: 600, letterSpacing: 1.4, textTransform: 'uppercase', color: t.textTer, marginBottom: 16 }}>{head}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {links.map((l) => <a key={l} href="#" style={{ fontFamily: t.sans, fontSize: 14.5, color: t.textSec }}>{l}</a>)}
            </div>
          </div>
        ))}
      </div>
      <div style={{ maxWidth: 1180, margin: '40px auto 0', paddingTop: 24, borderTop: `0.5px solid ${t.line}`, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <span style={{ fontFamily: t.sans, fontSize: 13.5, color: t.textTer }}>© 2026 Acuity. All rights reserved.</span>
        <span style={{ fontFamily: t.sans, fontSize: 13.5, color: t.textTer }}>Made for quiet, consistent reflection.</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────
function Marketing() {
  const [dark, setDark] = useState(false);
  const t = makeAcuityTokens({ dark, accent: 'coral' });
  const tDark = makeAcuityTokens({ dark: true, accent: 'coral' });
  const tLight = makeAcuityTokens({ dark: false, accent: 'coral' });

  useEffect(() => { document.body.style.background = t.bg; }, [t.bg]);

  return (
    <div style={{ background: t.bg, minHeight: '100vh', transition: 'background .4s ease' }}>
      <style>{`
        @media (max-width: 900px) {
          .hero-grid, .feature-grid { grid-template-columns: 1fr !important; }
          .steps-grid { grid-template-columns: 1fr !important; }
          .nav-links { display: none !important; }
          .footer-grid { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>
      <Nav t={t} dark={dark} setDark={setDark} />
      <Hero t={t} tDark={tDark} />
      <HowItWorks t={t} />

      <div id="features" />
      <FeatureRow t={t} phoneTokens={tDark} Screen={HomeDashboard}
        eyebrow="Your home" hue={38}
        title="Your day, sorted into action."
        body="Open Acuity and everything from last night is already organized — your streak, your tasks, the themes you keep circling, and your next gentle nudge to record."
        points={['Tasks surface themselves from your voice', 'Streaks and tiers that reward the habit', 'Last night’s entry, summarized in a line']} />

      <FeatureRow t={t} phoneTokens={tDark} Screen={ThemeMap} flip
        eyebrow="Theme Map" hue={295}
        title="See what you actually think about."
        body="Every theme you mention becomes a planet, sized by how often it’s on your mind. Watch your inner world take shape — career, family, health — orbiting quietly over time."
        points={['Planets scale with what you dwell on', 'A cosmic, personal view of your months', 'Unlocks after your first ten entries']} />

      <FeatureRow t={t} phoneTokens={tLight} Screen={LifeMatrix}
        eyebrow="Life Matrix" hue={165}
        title="Every life area, measured."
        body="Twelve dimensions of your life, scored 0–100 and tracked week over week. The radar shows where you’re thriving and where you’ve gone quiet — with the deltas that matter."
        points={['12-axis radar of your whole life', 'Week-over-week movement, not vanity', 'Top movers surfaced automatically']} />

      <Consistency t={t} />
      <Pricing t={t} />
      <FinalCTA t={t} />
      <Footer t={t} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Marketing />);
