// screen-goals.jsx — longer-term aspirations. Card per goal with
// progress ring, weeks elapsed, theme tag, and last-touched chip.

const GOALS_DATA = {
  active: 4, done: 7, dormant: 2,
  goals: [
    {
      title: 'Be a more direct manager',
      theme: 'Career', hue: 295,
      pct: 0.46, weeks: '6 of 13',
      lastTouched: 'Last night',
      touched: 18, total: 26,
      milestone: 'Hit the conversation about Marcus 1:1 cadence',
    },
    {
      title: 'Run the Oct half-marathon',
      theme: 'Health', hue: 165,
      pct: 0.72, weeks: '12 of 17',
      lastTouched: 'Fri \u00b7 4d ago',
      touched: 22, total: 26,
      milestone: 'Move long-run to Sat (16 mi)',
    },
    {
      title: 'Call Mom every Sunday',
      theme: 'Family', hue: 25,
      pct: 0.88, weeks: '15 of 17',
      lastTouched: 'Sun \u00b7 3d ago',
      touched: 15, total: 17,
      milestone: 'Streak: 15 weeks in a row',
    },
    {
      title: 'Write 3 essays this quarter',
      theme: 'Creativity', hue: 60,
      pct: 0.33, weeks: '4 of 13',
      lastTouched: 'Mon \u00b7 8d ago',
      touched: 4, total: 12,
      milestone: 'Outlined the second essay',
      dormant: true,
    },
  ],
};

function GoalsList({ t }) {
  const d = GOALS_DATA;
  return (
    <AcuityDevice t={t}>
      <AcuityStatus dark={t.mode === 'dark'} />

      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 360,
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
          <div>
            <div style={{
              fontFamily: t.mono, fontSize: 10, letterSpacing: 1.6,
              textTransform: 'uppercase', color: t.textTer,
            }}>{d.active} active · {d.done} done</div>
            <h1 style={{
              fontFamily: t.display, fontSize: 28, fontWeight: 700,
              color: t.text, letterSpacing: -0.7, lineHeight: 1.05, margin: '4px 0 0',
            }}>Goals</h1>
          </div>
          <button style={{
            width: 40, height: 40, borderRadius: 20, border: 'none', cursor: 'pointer',
            background: t.gradMix, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: t.display, fontSize: 22, fontWeight: 500, lineHeight: 0,
          }}>+</button>
        </div>

        {/* Segmented tabs */}
        <div style={{ padding: '18px 20px 0' }}>
          <SegmentedTabs t={t} options={['Active', 'Done', 'Dormant']} active="Active" />
        </div>

        {/* Goals stack */}
        <div style={{ padding: '20px 16px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {d.goals.map((g, i) => <GoalCard key={i} t={t} g={g} />)}
        </div>

        {/* AI nudge */}
        <div style={{ padding: '18px 16px 0' }}>
          <div style={{
            padding: 14, borderRadius: 22,
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
              Essays haven’t come up in 8 days. Want me to nudge tonight’s prompt toward creativity?
            </p>
          </div>
        </div>
      </div>

      <AcuityTabBar active="goals" t={t} />
    </AcuityDevice>
  );
}

function GoalCard({ t, g }) {
  return (
    <div style={{
      padding: 16, borderRadius: 24, position: 'relative', overflow: 'hidden',
      background: t.cardBg, border: `0.5px solid ${t.line}`,
      boxShadow: t.shadowSoft,
      opacity: g.dormant ? 0.78 : 1,
    }}>
      {/* corner hue glow */}
      <div style={{
        position: 'absolute', right: -30, top: -30, width: 100, height: 100, borderRadius: '50%',
        background: `radial-gradient(circle, oklch(0.65 0.16 ${g.hue}) 0%, transparent 70%)`,
        opacity: t.mode === 'dark' ? 0.16 : 0.22, filter: 'blur(22px)',
      }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <RingProgress
          value={g.pct} size={62} stroke={6} t={t}
          color={`oklch(0.78 0.16 ${g.hue})`}
          gradient={false}>
          <div style={{
            fontFamily: t.display, fontSize: 15, fontWeight: 800,
            color: t.text, letterSpacing: -0.4, lineHeight: 1,
          }}>{Math.round(g.pct * 100)}%</div>
        </RingProgress>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4,
          }}>
            <span style={{
              fontFamily: t.mono, fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
              padding: '2px 7px', borderRadius: 999,
              background: `oklch(0.65 0.14 ${g.hue} / 0.18)`,
              color: `oklch(${t.mode === 'dark' ? 0.78 : 0.55} 0.13 ${g.hue})`,
              textTransform: 'uppercase',
            }}>{g.theme}</span>
            {g.dormant && (
              <span style={{
                fontFamily: t.mono, fontSize: 9, fontWeight: 700, letterSpacing: 0.6,
                padding: '2px 7px', borderRadius: 999,
                background: t.mode === 'dark' ? 'oklch(1 0 0 / 0.05)' : 'oklch(0 0 0 / 0.05)',
                color: t.textTer, textTransform: 'uppercase',
              }}>Dormant</span>
            )}
          </div>
          <div style={{
            fontFamily: t.display, fontSize: 17, fontWeight: 700,
            color: t.text, letterSpacing: -0.3, lineHeight: 1.2,
            textWrap: 'pretty',
          }}>{g.title}</div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginTop: 6,
            fontFamily: t.sans, fontSize: 12, color: t.textTer,
          }}>
            <span>Week {g.weeks}</span>
            <span style={{ width: 3, height: 3, borderRadius: 2, background: t.textTer }} />
            <span>{g.touched} entries touched</span>
          </div>
        </div>
      </div>

      {/* Latest milestone */}
      <div style={{
        marginTop: 14, padding: '10px 12px', borderRadius: 14,
        background: t.mode === 'dark' ? 'oklch(1 0 0 / 0.03)' : 'oklch(0 0 0 / 0.03)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 6, height: 6, borderRadius: 3, flexShrink: 0,
          background: `oklch(0.78 0.16 ${g.hue})`,
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: t.sans, fontSize: 12.5, color: t.text, letterSpacing: -0.1, lineHeight: 1.3 }}>
            {g.milestone}
          </div>
        </div>
        <span style={{ fontFamily: t.mono, fontSize: 10, color: t.textTer, fontWeight: 600 }}>
          {g.lastTouched}
        </span>
      </div>
    </div>
  );
}

Object.assign(window, { GoalsList, GOALS_DATA, GoalCard });
