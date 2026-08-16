// screen-extract.jsx — post-record extraction review.
// AI extracted themes / tasks / goal-touches; user checks what to keep.
// Copy uses "Check" not "Tick" per brief. Default state: all unchecked.

const EXTRACT_DATA = {
  duration: '1m 47s',
  entryNo: 42,
  pull: 'The thing I keep avoiding is the conversation, not the work.',
  // Each section has items with an `on` state (initial: false per brief).
  themes: [
    { label: 'Career',     hue: 295, evidence: '\u201cMarcus 1:1 didn\u2019t happen\u2026\u201d', on: false },
    { label: 'Family',     hue: 25,  evidence: '\u201cMira called about Dad\u2026\u201d', on: false },
    { label: 'Health',     hue: 165, evidence: '\u201cThe run \u2014 I didn\u2019t run\u2026\u201d', on: false },
    { label: 'Avoidance',  hue: 60,  evidence: 'New theme suggested by Acuity', on: false, isNew: true },
  ],
  tasks: [
    { text: 'Reply to Mira about Dad\u2019s appointment',     theme: 'Family', hue: 25,  on: false },
    { text: 'Put Marcus 1:1 on the calendar before Friday',    theme: 'Career', hue: 295, on: false },
    { text: 'Move the morning run to 6:00 \u2014 try again',     theme: 'Health', hue: 165, on: false },
  ],
  goals: [
    { text: 'Be a more direct manager', theme: 'Career', hue: 295, on: false, kind: 'progress' },
  ],
};

function ExtractReview({ t }) {
  const d = EXTRACT_DATA;
  // Computed counts (treating all `on:false` as default)
  const counts = {
    themes: d.themes.filter((x) => x.on).length,
    tasks: d.tasks.filter((x) => x.on).length,
    goals: d.goals.filter((x) => x.on).length,
  };

  return (
    <AcuityDevice t={t}>
      <AcuityStatus dark={t.mode === 'dark'} />

      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 360,
        background: t.heroGrad, pointerEvents: 'none',
      }} />

      <div className="acuity-scroll" style={{
        position: 'absolute', inset: 0, paddingTop: 56, paddingBottom: 132,
        overflowY: 'auto',
      }}>
        {/* Top — entry meta */}
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
              fontFamily: t.mono, fontSize: 10, letterSpacing: 1.4,
              color: t.textTer, textTransform: 'uppercase',
            }}>Entry {d.entryNo} · {d.duration}</div>
            <div style={{
              fontFamily: t.display, fontSize: 15, fontWeight: 700,
              color: t.text, letterSpacing: -0.2, marginTop: 2,
            }}>Review what to keep</div>
          </div>
          <button style={{
            padding: '6px 12px', borderRadius: 999, border: 'none', cursor: 'pointer',
            background: 'transparent', color: t.textSec,
            fontFamily: t.sans, fontSize: 13, fontWeight: 600, letterSpacing: -0.1,
          }}>Skip</button>
        </div>

        {/* Pull quote summary */}
        <div style={{ padding: '20px 16px 0' }}>
          <div style={{
            padding: 18, borderRadius: 24, position: 'relative', overflow: 'hidden',
            background: t.mode === 'dark'
              ? `linear-gradient(135deg, oklch(0.24 0.10 ${t._primary[2]} / 0.4) 0%, oklch(0.22 0.10 ${t._secondary[2]} / 0.4) 100%), ${t.cardBg}`
              : `linear-gradient(135deg, oklch(0.96 0.06 ${t._primary[2]}) 0%, oklch(0.96 0.05 ${t._secondary[2]}) 100%)`,
            border: `0.5px solid ${t.lineStrong}`,
            boxShadow: t.shadowLift,
          }}>
            <div style={{
              fontFamily: t.mono, fontSize: 10, letterSpacing: 1.4,
              textTransform: 'uppercase', color: t.textTer, marginBottom: 6,
            }}>Acuity heard</div>
            <p style={{
              fontFamily: t.display, fontSize: 19, fontWeight: 500, lineHeight: 1.3,
              letterSpacing: -0.4, color: t.text, margin: 0, textWrap: 'pretty',
            }}>“{d.pull}”</p>
          </div>
        </div>

        {/* Instruction */}
        <div style={{ padding: '20px 24px 0' }}>
          <p style={{
            fontFamily: t.sans, fontSize: 14, lineHeight: 1.5,
            color: t.textSec, margin: 0, textWrap: 'pretty',
          }}>
            Check what feels right. Everything is off by default — keep only what you want to follow.
          </p>
        </div>

        {/* Themes section */}
        <ExtractSection
          t={t} label="Themes" count={d.themes.length} sub="What this was about">
          {d.themes.map((th, i) => (
            <ExtractRow key={i} t={t} on={th.on}
              kind="theme"
              hue={th.hue}
              primary={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    width: 9, height: 9, borderRadius: 5,
                    background: `linear-gradient(135deg, oklch(0.78 0.16 ${th.hue}), oklch(0.55 0.16 ${th.hue}))`,
                  }} />
                  <span>{th.label}</span>
                  {th.isNew && (
                    <span style={{
                      padding: '2px 6px', borderRadius: 999,
                      background: t.gradMix, color: '#fff',
                      fontFamily: t.mono, fontSize: 8, fontWeight: 700,
                      letterSpacing: 0.6, textTransform: 'uppercase',
                    }}>New</span>
                  )}
                </span>
              }
              sub={th.evidence}
              first={i === 0}
            />
          ))}
        </ExtractSection>

        {/* Tasks section */}
        <ExtractSection
          t={t} label="Tasks" count={d.tasks.length} sub="Todos surfaced from your words">
          {d.tasks.map((task, i) => (
            <ExtractRow key={i} t={t} on={task.on}
              kind="task" hue={task.hue}
              primary={task.text}
              tag={{ label: task.theme, hue: task.hue }}
              first={i === 0}
            />
          ))}
        </ExtractSection>

        {/* Goals section */}
        <ExtractSection
          t={t} label="Goal progress" count={d.goals.length} sub="Long-term aspirations you touched on">
          {d.goals.map((g, i) => (
            <ExtractRow key={i} t={t} on={g.on}
              kind="goal" hue={g.hue}
              primary={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <AcuityIcons.goals color={`oklch(0.65 0.14 ${g.hue})`} weight={1.8} size={16} />
                  {g.text}
                </span>
              }
              sub="Mark as touched"
              first={i === 0}
            />
          ))}
        </ExtractSection>
      </div>

      {/* Footer CTA — sticky */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        padding: '14px 16px 30px',
        background: t.mode === 'dark'
          ? `linear-gradient(180deg, transparent 0%, ${t.bg}E6 50%, ${t.bg} 100%)`
          : `linear-gradient(180deg, transparent 0%, ${t.bg}E6 50%, ${t.bg} 100%)`,
        zIndex: 50,
      }}>
        <div style={{
          padding: 6, borderRadius: 999,
          background: t.mode === 'dark' ? 'oklch(0.22 0.020 280 / 0.7)' : 'oklch(1 0 0 / 0.85)',
          backdropFilter: 'blur(20px) saturate(180%)',
          border: `0.5px solid ${t.lineStrong}`,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <button style={{
            padding: '12px 18px', borderRadius: 999, border: 'none', cursor: 'pointer',
            background: 'transparent', color: t.textSec,
            fontFamily: t.sans, fontSize: 14, fontWeight: 600, letterSpacing: -0.1,
          }}>Save entry only</button>
          <button style={{
            flex: 1, padding: '12px 18px', borderRadius: 999, border: 'none', cursor: 'pointer',
            background: t.gradPrimary, boxShadow: t.glowPrimary,
            color: '#fff', fontFamily: t.display, fontSize: 14, fontWeight: 700,
            letterSpacing: -0.1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            Keep {counts.themes + counts.tasks + counts.goals}
            <AcuityIcons.check color="#fff" size={14} weight={2.6} />
          </button>
        </div>
      </div>
    </AcuityDevice>
  );
}

function ExtractSection({ t, label, count, sub, children }) {
  return (
    <div>
      <div style={{
        padding: '24px 24px 10px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      }}>
        <div>
          <h2 style={{
            fontFamily: t.display, fontSize: 13, fontWeight: 700,
            color: t.textSec, letterSpacing: 0.4, textTransform: 'uppercase', margin: 0,
          }}>{label}</h2>
          {sub && (
            <div style={{ fontFamily: t.sans, fontSize: 12, color: t.textTer, marginTop: 2 }}>
              {sub}
            </div>
          )}
        </div>
        <span style={{ fontFamily: t.mono, fontSize: 11, color: t.textTer }}>{count}</span>
      </div>
      <div style={{ padding: '0 16px' }}>
        <div style={{
          borderRadius: 22, background: t.cardBg,
          border: `0.5px solid ${t.line}`, overflow: 'hidden',
          boxShadow: t.shadowSoft,
        }}>{children}</div>
      </div>
    </div>
  );
}

function ExtractRow({ t, on, primary, sub, tag, hue, first }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px',
      borderTop: first ? 'none' : `0.5px solid ${t.line}`,
    }}>
      {/* Checkbox — unchecked by default per brief */}
      <div style={{
        width: 24, height: 24, borderRadius: 8, flexShrink: 0, marginTop: 1,
        background: on ? t.gradMix : 'transparent',
        border: on
          ? 'none'
          : `1.5px solid ${t.mode === 'dark' ? 'oklch(1 0 0 / 0.24)' : 'oklch(0 0 0 / 0.24)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {on && <AcuityIcons.check color="#fff" size={14} weight={2.8} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: t.sans, fontSize: 15, color: t.text,
          letterSpacing: -0.2, lineHeight: 1.35, fontWeight: 500,
        }}>{primary}</div>
        {sub && (
          <div style={{
            fontFamily: t.sans, fontSize: 12, color: t.textTer,
            marginTop: 4, fontStyle: typeof sub === 'string' && sub.includes('\u201c') ? 'italic' : 'normal',
            lineHeight: 1.35, textWrap: 'pretty',
          }}>{sub}</div>
        )}
        {tag && (
          <div style={{ marginTop: 6 }}>
            <span style={{
              fontFamily: t.mono, fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
              padding: '2px 7px', borderRadius: 999,
              background: `oklch(0.65 0.14 ${tag.hue} / 0.18)`,
              color: `oklch(${t.mode === 'dark' ? 0.78 : 0.55} 0.13 ${tag.hue})`,
              textTransform: 'uppercase',
            }}>{tag.label}</span>
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { ExtractReview, EXTRACT_DATA, ExtractSection, ExtractRow });
