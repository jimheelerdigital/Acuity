// screen-entry.jsx — v2. Sleek, with quick stats at top + transcript.

const ENTRY_DATA = {
  title: 'Tuesday Night',
  date: 'Oct 14',
  when: '11:18 pm',
  duration: '1m 47s',
  entryNo: 41,
  themes: [
    { label: 'Career',     hue: 295 },
    { label: 'Family',     hue: 25 },
    { label: 'Health',     hue: 165 },
    { label: 'Avoidance',  hue: 60 },
  ],
  pull: 'The thing I keep avoiding is the conversation, not the work.',
  summary:
    'You opened with the Marcus 1:1, then realized the deferral pattern is the real story \u2014 you keep choosing tasks over the talk. Mira\u2019s message about Dad surfaced briefly. The morning run was named, again, as something missed.',
  mood: { score: 58, label: 'Tense' },
  transcript: [
    { ts: '00:04', text: 'Okay. Today was \u2014 it was long. The 1:1 with Marcus didn\u2019t happen again.' },
    { ts: '00:21', text: 'I keep putting it on the calendar and then moving it. That\u2019s twice this week.' },
    { ts: '00:38', text: 'I think the thing I keep avoiding is the conversation, not the work.', highlight: true },
    { ts: '00:54', text: 'Mira called about Dad\u2019s Thursday appointment. I\u2019ll text her back tomorrow.' },
    { ts: '01:14', text: 'And the run. I didn\u2019t run. I will tomorrow. 6am, I keep saying.' },
  ],
  tasksFound: [
    { text: 'Reply to Mira about Dad\u2019s appointment', theme: 'Family', hue: 25 },
    { text: 'Put Marcus 1:1 on the calendar before Friday', theme: 'Career', hue: 295 },
    { text: 'Move the morning run to 6:00 \u2014 try again', theme: 'Health', hue: 165 },
  ],
  goalTouched: { text: 'Be a more direct manager', theme: 'Career', hue: 295, pct: 0.46 },
};

function EntryDetail({ t }) {
  const d = ENTRY_DATA;
  return (
    <AcuityDevice t={t}>
      <AcuityStatus dark={t.mode === 'dark'} />

      {/* hero glow band */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 320,
        background: t.heroGrad, pointerEvents: 'none',
      }} />

      <div className="acuity-scroll" style={{
        position: 'absolute', inset: 0, paddingTop: 56, paddingBottom: 130,
        overflowY: 'auto',
      }}>
        {/* nav chrome */}
        <div style={{
          padding: '14px 16px 0', display: 'flex', justifyContent: 'space-between',
        }}>
          <button style={pillBtn(t)}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke={t.textSec} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9.5 2L4 7l5.5 5" />
            </svg>
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={pillBtn(t)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t.textSec} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
                <path d="M16 6l-4-4-4 4M12 2v13" />
              </svg>
            </button>
            <button style={pillBtn(t)}>
              <AcuityIcons.more color={t.textSec} />
            </button>
          </div>
        </div>

        {/* Entry header */}
        <div style={{ padding: '14px 20px 0' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 10px 4px 8px', borderRadius: 999,
            background: t.gradMixSoft,
            marginBottom: 14,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: t.primary }} />
            <span style={{
              fontFamily: t.mono, fontSize: 10, letterSpacing: 1.0,
              fontWeight: 600, color: t.text, textTransform: 'uppercase',
            }}>Entry {d.entryNo}</span>
          </div>
          <h1 style={{
            fontFamily: t.display, fontSize: 32, fontWeight: 700,
            color: t.text, letterSpacing: -0.8, lineHeight: 1.05, margin: 0,
          }}>{d.title}</h1>
          <div style={{
            display: 'flex', gap: 8, alignItems: 'center',
            fontFamily: t.sans, fontSize: 13, color: t.textSec, marginTop: 8,
          }}>
            <span>{d.date}</span>
            <span style={{ width: 3, height: 3, borderRadius: 2, background: t.textTer }} />
            <span>{d.when}</span>
            <span style={{ width: 3, height: 3, borderRadius: 2, background: t.textTer }} />
            <span>{d.duration}</span>
          </div>
        </div>

        {/* Quick stats row */}
        <div style={{ padding: '20px 16px 0', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <QuickStat t={t} value={d.themes.length} label="Themes" tone="primary" />
          <QuickStat t={t} value={d.tasksFound.length} label="Tasks found" tone="secondary" />
          <QuickStat t={t} value={d.mood.score} suffix="/100" label={d.mood.label} tone="warm" />
        </div>

        {/* Pull quote — hero */}
        <div style={{ padding: '22px 16px 0' }}>
          <div style={{
            padding: 22, borderRadius: 26, position: 'relative', overflow: 'hidden',
            background: t.mode === 'dark'
              ? `linear-gradient(135deg, oklch(0.24 0.10 ${t._primary[2]} / 0.4) 0%, oklch(0.22 0.10 ${t._secondary[2]} / 0.4) 100%), ${t.cardBg}`
              : `linear-gradient(135deg, oklch(0.96 0.06 ${t._primary[2]}) 0%, oklch(0.96 0.05 ${t._secondary[2]}) 100%)`,
            border: `0.5px solid ${t.lineStrong}`,
            boxShadow: t.shadowLift,
          }}>
            <div style={{
              position: 'absolute', top: 16, right: 18,
              fontFamily: t.display, fontSize: 80, lineHeight: 0.8,
              color: t.primary, opacity: 0.45, fontWeight: 800,
              pointerEvents: 'none',
            }}>"</div>
            <div style={{
              fontFamily: t.mono, fontSize: 10, letterSpacing: 1.4,
              textTransform: 'uppercase', color: t.textTer, marginBottom: 8,
            }}>Pull quote · 00:38</div>
            <p style={{
              fontFamily: t.display, fontSize: 22, lineHeight: 1.25,
              fontWeight: 500, letterSpacing: -0.5, color: t.text,
              margin: 0, textWrap: 'pretty', position: 'relative',
            }}>
              {d.pull}
            </p>
          </div>
        </div>

        {/* Themes */}
        <div style={{ padding: '20px 20px 0' }}>
          <SectionHead t={t} label="Themes" count={d.themes.length} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {d.themes.map((th) => <AcuityThemePill key={th.label} {...th} t={t} />)}
          </div>
        </div>

        {/* Summary */}
        <div style={{ padding: '20px 16px 0' }}>
          <div style={{
            padding: '14px 16px', borderRadius: 20,
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
            <div style={{ flex: 1 }}>
              <div style={{
                fontFamily: t.mono, fontSize: 10, letterSpacing: 1.0,
                fontWeight: 600, color: t.textTer, textTransform: 'uppercase', marginBottom: 4,
              }}>AI summary</div>
              <p style={{
                fontFamily: t.sans, fontSize: 14, lineHeight: 1.55,
                color: t.text, margin: 0, letterSpacing: -0.1, textWrap: 'pretty',
              }}>{d.summary}</p>
            </div>
          </div>
        </div>

        {/* Tasks found */}
        <div style={{ padding: '22px 20px 0' }}>
          <SectionHead t={t} label="Tasks found" count={d.tasksFound.length} action="Edit" />
        </div>
        <div style={{ padding: '0 16px' }}>
          <div style={{
            borderRadius: 22, background: t.cardBg,
            border: `0.5px solid ${t.line}`, overflow: 'hidden',
          }}>
            {d.tasksFound.map((task, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px',
                borderTop: i === 0 ? 'none' : `0.5px solid ${t.line}`,
              }}>
                <div style={{
                  width: 24, height: 24, borderRadius: 12, flexShrink: 0,
                  background: t.gradPrimary,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <AcuityIcons.check color="#fff" size={13} weight={2.6} />
                </div>
                <div style={{
                  flex: 1, fontFamily: t.sans, fontSize: 15, color: t.text,
                  letterSpacing: -0.2, lineHeight: 1.3,
                }}>{task.text}</div>
                <span style={{
                  fontFamily: t.mono, fontSize: 10, fontWeight: 700, letterSpacing: 0.6,
                  padding: '3px 8px', borderRadius: 999,
                  background: `oklch(0.65 0.14 ${task.hue} / 0.16)`,
                  color: `oklch(${t.mode === 'dark' ? 0.78 : 0.55} 0.13 ${task.hue})`,
                  textTransform: 'uppercase',
                }}>{task.theme}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Goal touched */}
        <div style={{ padding: '20px 20px 0' }}>
          <SectionHead t={t} label="Goal touched" />
        </div>
        <div style={{ padding: '0 16px' }}>
          <div style={{
            padding: 14, borderRadius: 22, background: t.cardBg,
            border: `0.5px solid ${t.line}`,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: 19,
              background: `oklch(0.65 0.14 ${d.goalTouched.hue} / 0.18)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <AcuityIcons.goals color={`oklch(${t.mode === 'dark' ? 0.78 : 0.55} 0.14 ${d.goalTouched.hue})`} weight={1.8} size={20} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{
                fontFamily: t.sans, fontSize: 14.5, fontWeight: 600,
                color: t.text, letterSpacing: -0.2,
              }}>{d.goalTouched.text}</div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginTop: 6,
              }}>
                <div style={{
                  flex: 1, height: 4, borderRadius: 2,
                  background: t.mode === 'dark' ? 'oklch(1 0 0 / 0.08)' : 'oklch(0 0 0 / 0.06)',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%', width: `${d.goalTouched.pct * 100}%`,
                    background: t.gradPrimary, borderRadius: 2,
                  }} />
                </div>
                <span style={{
                  fontFamily: t.mono, fontSize: 11, fontWeight: 600,
                  color: t.textSec, letterSpacing: 0.4,
                }}>{Math.round(d.goalTouched.pct * 100)}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Transcript */}
        <div style={{ padding: '24px 20px 0' }}>
          <SectionHead t={t} label="Transcript" sub="5 beats" />
        </div>
        <div style={{ padding: '0 16px' }}>
          <div style={{
            borderRadius: 22, background: t.cardBg,
            border: `0.5px solid ${t.line}`, padding: '6px 0',
          }}>
            {d.transcript.map((line, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 14,
                padding: '12px 14px',
                background: line.highlight
                  ? t.mode === 'dark'
                    ? `linear-gradient(90deg, oklch(0.30 0.12 ${t._primary[2]} / 0.18) 0%, transparent 80%)`
                    : `linear-gradient(90deg, oklch(0.95 0.08 ${t._primary[2]}) 0%, transparent 80%)`
                  : 'transparent',
              }}>
                <span style={{
                  fontFamily: t.mono, fontSize: 10, letterSpacing: 0.4,
                  color: line.highlight ? t.primary : t.textTer,
                  flexShrink: 0, marginTop: 3, minWidth: 32, fontWeight: 600,
                }}>{line.ts}</span>
                <p style={{
                  flex: 1, fontFamily: t.sans,
                  fontWeight: line.highlight ? 600 : 400,
                  fontSize: 14.5, lineHeight: 1.45, color: t.text, margin: 0,
                  letterSpacing: -0.1, textWrap: 'pretty',
                }}>
                  {line.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <AcuityTabBar active="entries" t={t} />
    </AcuityDevice>
  );
}

function pillBtn(t) {
  return {
    width: 36, height: 36, borderRadius: 18, border: 'none', cursor: 'pointer',
    background: t.mode === 'dark' ? 'oklch(1 0 0 / 0.10)' : 'oklch(0 0 0 / 0.05)',
    backdropFilter: 'blur(20px) saturate(180%)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
}

function SectionHead({ t, label, count, sub, action }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      marginBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <h2 style={{
          fontFamily: t.display, fontSize: 15, fontWeight: 700,
          color: t.text, letterSpacing: -0.2, margin: 0,
        }}>{label}</h2>
        {(count !== undefined || sub) && (
          <span style={{ fontFamily: t.mono, fontSize: 11, color: t.textTer }}>
            {count !== undefined ? count : sub}
          </span>
        )}
      </div>
      {action && (
        <span style={{
          fontFamily: t.sans, fontSize: 13, fontWeight: 600, color: t.primary, cursor: 'pointer',
        }}>{action}</span>
      )}
    </div>
  );
}

function QuickStat({ t, value, label, suffix, tone = 'primary' }) {
  const grad = tone === 'primary' ? t.gradPrimary : tone === 'secondary' ? t.gradSecondary : t.gradMix;
  return (
    <div style={{
      padding: '12px 14px', borderRadius: 18,
      background: t.cardBg, border: `0.5px solid ${t.line}`,
      boxShadow: t.shadowSoft,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
        <span style={{
          fontFamily: t.display, fontSize: 22, fontWeight: 800,
          background: grad, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          letterSpacing: -0.7, lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
        }}>{value}</span>
        {suffix && <span style={{ fontFamily: t.sans, fontSize: 11, color: t.textTer, fontWeight: 600 }}>{suffix}</span>}
      </div>
      <div style={{ fontFamily: t.sans, fontSize: 11.5, color: t.textTer, marginTop: 4, letterSpacing: 0.1 }}>
        {label}
      </div>
    </div>
  );
}

Object.assign(window, { EntryDetail, ENTRY_DATA, SectionHead, QuickStat, pillBtn });
