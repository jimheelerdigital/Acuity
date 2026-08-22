// screen-entries.jsx — chronological list of past recordings with
// extracted summaries. Grouped by week, with a streak heatmap header.

const ENTRIES_DATA = {
  user: 'Jordan',
  monthLabel: 'October',
  // 28-day grid for the consistency strip (most recent right)
  heatmap: [1,1,0,1,1,1,1, 1,1,1,0,1,1,1, 1,1,1,1,0,1,1, 1,1,1,1,1,1,1],
  groups: [
    {
      label: 'This week',
      items: [
        {
          date: 'Tue', dateNum: 14, when: '11:18 pm', duration: '1m 47s', entryNo: 41,
          pull: 'The thing I keep avoiding is the conversation, not the work.',
          summary: 'Marcus 1:1, Mira about Dad, run that didn\u2019t happen.',
          themes: [{ label: 'Career', hue: 295 }, { label: 'Family', hue: 25 }, { label: 'Health', hue: 165 }],
          tasks: 3, isLatest: true,
        },
        {
          date: 'Mon', dateNum: 13, when: '10:42 pm', duration: '0m 58s', entryNo: 40,
          pull: 'Smaller than I made it out to be.',
          summary: 'Quick one. The launch readiness review went better than expected.',
          themes: [{ label: 'Career', hue: 295 }],
          tasks: 1,
        },
        {
          date: 'Sun', dateNum: 12, when: '11:02 pm', duration: '2m 16s', entryNo: 39,
          pull: 'I want to be less impressive and more available.',
          summary: 'Sunday reset. Family dinner. The question I keep circling.',
          themes: [{ label: 'Family', hue: 25 }, { label: 'Solitude', hue: 275 }],
          tasks: 2,
        },
      ],
    },
    {
      label: 'Last week',
      items: [
        {
          date: 'Sat', dateNum: 11, when: '11:38 pm', duration: '1m 12s', entryNo: 38,
          pull: 'Two coffees too many.',
          summary: 'Light entry. Long walk in the park.',
          themes: [{ label: 'Health', hue: 165 }],
          tasks: 0,
        },
        {
          date: 'Fri', dateNum: 10, when: '10:55 pm', duration: '2m 04s', entryNo: 37,
          pull: 'The meeting was the rehearsal for the conversation.',
          summary: 'Skip-level with Anya. Surprisingly clarifying.',
          themes: [{ label: 'Career', hue: 295 }, { label: 'Growth', hue: 195 }],
          tasks: 2,
        },
      ],
    },
  ],
};

function EntriesList({ t }) {
  const d = ENTRIES_DATA;
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
            }}>{d.monthLabel} · 41 entries</div>
            <h1 style={{
              fontFamily: t.display, fontSize: 28, fontWeight: 700,
              color: t.text, letterSpacing: -0.7, lineHeight: 1.05, margin: '4px 0 0',
            }}>Entries</h1>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={pillBtn(t)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t.textSec} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.5-4.5" />
              </svg>
            </button>
            <button style={pillBtn(t)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t.textSec} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 6h16M7 12h10M10 18h4" />
              </svg>
            </button>
          </div>
        </div>

        {/* Heatmap strip */}
        <div style={{ padding: '18px 16px 0' }}>
          <div style={{
            padding: '14px 16px', borderRadius: 22,
            background: t.cardBg, border: `0.5px solid ${t.line}`,
            boxShadow: t.shadowSoft,
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
              marginBottom: 12,
            }}>
              <div>
                <div style={{
                  fontFamily: t.mono, fontSize: 10, letterSpacing: 1.4,
                  color: t.textTer, textTransform: 'uppercase',
                }}>Last 28 nights</div>
                <div style={{
                  display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4,
                }}>
                  <span style={{
                    fontFamily: t.display, fontSize: 24, fontWeight: 800,
                    color: t.text, letterSpacing: -0.7, fontVariantNumeric: 'tabular-nums', lineHeight: 1,
                  }}>{d.heatmap.filter(Boolean).length}</span>
                  <span style={{ fontFamily: t.sans, fontSize: 12, color: t.textTer }}>recorded</span>
                </div>
              </div>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '4px 9px', borderRadius: 999,
                background: t.goodSoft,
                fontFamily: t.mono, fontSize: 11, fontWeight: 700, color: t.good,
              }}>
                <AcuityIcons.flame color={t.good} size={11} />
                14 streak
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {d.heatmap.map((on, i) => (
                <div key={i} style={{
                  flex: 1, height: 22, borderRadius: 5,
                  background: on
                    ? i === d.heatmap.length - 1 ? t.gradMix : t.gradPrimary
                    : t.mode === 'dark' ? 'oklch(1 0 0 / 0.06)' : 'oklch(0 0 0 / 0.05)',
                  opacity: on ? (i === d.heatmap.length - 1 ? 1 : 0.45 + (i / 100)) : 1,
                }} />
              ))}
            </div>
          </div>
        </div>

        {/* Groups */}
        {d.groups.map((g) => (
          <div key={g.label}>
            <div style={{
              padding: '24px 24px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            }}>
              <h2 style={{
                fontFamily: t.display, fontSize: 13, fontWeight: 700,
                color: t.textSec, letterSpacing: 0.4, textTransform: 'uppercase', margin: 0,
              }}>{g.label}</h2>
              <span style={{ fontFamily: t.mono, fontSize: 11, color: t.textTer }}>{g.items.length}</span>
            </div>
            <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {g.items.map((item) => (
                <EntryCard key={item.entryNo} t={t} item={item} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <AcuityTabBar active="entries" t={t} />
    </AcuityDevice>
  );
}

function EntryCard({ t, item }) {
  return (
    <div style={{
      padding: 16, borderRadius: 22, position: 'relative', overflow: 'hidden',
      background: item.isLatest
        ? t.mode === 'dark'
          ? `linear-gradient(135deg, oklch(0.28 0.10 ${t._primary[2]} / 0.35) 0%, ${t.cardBg} 65%)`
          : `linear-gradient(135deg, oklch(0.985 0.025 ${t._primary[2]}) 0%, ${t.cardBg} 70%)`
        : t.cardBg,
      border: `0.5px solid ${item.isLatest ? t.lineStrong : t.line}`,
      boxShadow: t.shadowSoft,
    }}>
      {item.isLatest && (
        <div style={{
          position: 'absolute', top: 14, right: 14,
          padding: '3px 9px', borderRadius: 999,
          background: t.mode === 'dark' ? 'oklch(1 0 0 / 0.12)' : t.text,
          color: t.mode === 'dark' ? t.text : t.bg,
          fontFamily: t.mono, fontSize: 9, fontWeight: 700,
          letterSpacing: 0.6, textTransform: 'uppercase',
        }}>Latest</div>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {/* Date tile */}
        <div style={{
          width: 48, flexShrink: 0, textAlign: 'center',
          padding: '8px 0', borderRadius: 14,
          background: t.mode === 'dark' ? 'oklch(1 0 0 / 0.04)' : 'oklch(0 0 0 / 0.04)',
          border: `0.5px solid ${t.line}`,
        }}>
          <div style={{
            fontFamily: t.mono, fontSize: 10, fontWeight: 700,
            color: t.textTer, letterSpacing: 0.6, textTransform: 'uppercase',
          }}>{item.date}</div>
          <div style={{
            fontFamily: t.display, fontSize: 22, fontWeight: 800,
            color: t.text, letterSpacing: -0.6, lineHeight: 1, marginTop: 2,
            fontVariantNumeric: 'tabular-nums',
          }}>{item.dateNum}</div>
        </div>

        <div style={{ flex: 1, minWidth: 0, paddingRight: item.isLatest ? 56 : 0 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            fontFamily: t.mono, fontSize: 11, color: t.textTer, marginBottom: 6,
          }}>
            <span>{item.when}</span>
            <span style={{ width: 3, height: 3, borderRadius: 2, background: t.textTer }} />
            <span>{item.duration}</span>
            <span style={{ width: 3, height: 3, borderRadius: 2, background: t.textTer }} />
            <span>#{item.entryNo}</span>
          </div>
          <p style={{
            fontFamily: t.display, fontSize: 15, fontWeight: 600, lineHeight: 1.3,
            letterSpacing: -0.2, color: t.text, margin: '0 0 6px',
            textWrap: 'pretty',
          }}>“{item.pull}”</p>
          <p style={{
            fontFamily: t.sans, fontSize: 12.5, lineHeight: 1.4,
            color: t.textSec, margin: '0 0 10px', textWrap: 'pretty',
          }}>{item.summary}</p>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
            {item.themes.map((th) => <AcuityThemePill key={th.label} {...th} t={t} size="s" />)}
            {item.tasks > 0 && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '5px 9px 5px 7px', borderRadius: 999,
                background: t.mode === 'dark' ? 'oklch(1 0 0 / 0.04)' : 'oklch(0 0 0 / 0.04)',
                fontFamily: t.mono, fontSize: 11, fontWeight: 600, color: t.textSec,
                letterSpacing: 0.2,
              }}>
                <AcuityIcons.check color={t.textTer} size={11} weight={2.4} />
                {item.tasks}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { EntriesList, ENTRIES_DATA, EntryCard });
